const express = require('express');
const session = require('express-session');
const crypto = require('crypto');
const flash = require('connect-flash');
const { RestClientV2 } = require('bitget-api');
const fs = require('fs');
const path = require('path');

const config = require('../config');

// Trading configuration
const TRADING_CONFIG = {
    positionSize: 10, // USD
    leverage: 5,
    marginMode: 'isolated'
};

// Store last webhook data
let lastWebhook = {
    timestamp: null,
    data: null
};

// Store active positions
let activePositions = new Map(); // ticker -> position details

// Credentials management
const CREDENTIALS_FILE = path.join(__dirname, 'credentials.json');
let credentials = require('./credentials.json');

// BitGet client instance
let client = null;

function initBitGetClient() {
    if (credentials.bitget.apiKey && credentials.bitget.apiSecret && credentials.bitget.apiPass) {
        client = new RestClientV2({
            apiKey: credentials.bitget.apiKey,
            apiSecret: credentials.bitget.apiSecret,
            apiPass: credentials.bitget.apiPass,
        });
        return true;
    }
    return false;
}

function updateCredentials(newCreds) {
    credentials = { ...credentials, ...newCreds };
    fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(credentials, null, 2));
    if (newCreds.bitget) {
        initBitGetClient();
    }
}

function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
}
const logStream = fs.createWriteStream(path.join(logsDir, 'trades.log'), { flags: 'a' });

function logTrade(action, details) {
    const logEntry = {
        timestamp: new Date().toISOString(),
        action,
        details
    };
    console.log('Trade:', logEntry);
    logStream.write(JSON.stringify(logEntry, null, 2) + '\n---\n');
}

// Parse TradingView signal
function parseSignal(message) {
    // Example: "Buy TP - BELUSDT.P, Price = 0.6852"
    const parts = message.split(',');
    const signalPart = parts[0].trim();
    const pricePart = parts[1] ? parts[1].trim() : '';
    
    // Extract ticker (assuming format "ACTION - TICKER")
    const tickerMatch = signalPart.match(/- ([A-Z0-9]+)\.?P?/);
    let ticker = tickerMatch ? tickerMatch[1] : null;
    
    // If ticker already ends with USDT, don't add it again
    if (ticker && !ticker.endsWith('USDT')) {
        ticker += 'USDT';
    }
    
    // Determine action
    const action = signalPart.toLowerCase().includes('buy') ? 'buy' :
                  signalPart.toLowerCase().includes('sell') ? 'sell' : 'unknown';
    
    // Determine if it's an exit signal
    const isExit = signalPart.toLowerCase().includes('tp') || 
                  signalPart.toLowerCase().includes('sl') ||
                  signalPart.toLowerCase().includes('exit');

    const parsed = {
        ticker,
        action,
        isExit,
        price: pricePart.replace('Price = ', ''),
        rawSignal: message
    };

    console.log('Parsed signal:', parsed);
    return parsed;
}

async function setLeverage(ticker, leverage) {
    try {
        const response = await client.setFuturesLeverage({
            symbol: ticker,
            marginCoin: 'USDT',
            leverage: leverage.toString(),
            holdSide: 'long'
        });
        console.log('Leverage set response:', response);
        return response;
    } catch (error) {
        console.error('Error setting leverage:', error.response ? error.response.body : error);
        throw error;
    }
}

async function openPosition(ticker, side) {
    try {
        console.log(`Opening ${side} position for ${ticker}`);
        
        // Set leverage first
        await setLeverage(ticker, TRADING_CONFIG.leverage);

        const params = {
            symbol: ticker,
            marginCoin: 'USDT',
            size: (TRADING_CONFIG.positionSize * TRADING_CONFIG.leverage).toString(), // Total position size in USD
            side: side,
            orderType: 'market',
            productType: 'USDT-FUTURES',
            marginMode: TRADING_CONFIG.marginMode
        };

        console.log('Submitting order with params:', params);
        const response = await client.futuresSubmitOrder(params);
        console.log('Order response:', response);
        
        if (response.code === '00000') {
            activePositions.set(ticker, {
                side: side,
                orderId: response.data.orderId,
                entryTime: new Date().toISOString()
            });
            
            logTrade('OPEN', {
                ticker,
                side,
                size: TRADING_CONFIG.positionSize,
                leverage: TRADING_CONFIG.leverage,
                response
            });
        }
        
        return response;
    } catch (error) {
        console.error('Error opening position:', error.response ? error.response.body : error);
        logTrade('ERROR', { 
            ticker, 
            side, 
            error: error.response ? error.response.body : error.message,
            params: {
                size: TRADING_CONFIG.positionSize,
                leverage: TRADING_CONFIG.leverage
            }
        });
        throw error;
    }
}

async function closePosition(ticker) {
    try {
        const position = activePositions.get(ticker);
        if (!position) {
            console.log('No active position to close for', ticker);
            return null;
        }

        const closeSide = position.side === 'buy' ? 'sell' : 'buy';
        
        const params = {
            symbol: ticker,
            marginCoin: 'USDT',
            size: (TRADING_CONFIG.positionSize * TRADING_CONFIG.leverage).toString(),
            side: closeSide,
            orderType: 'market',
            productType: 'USDT-FUTURES',
            marginMode: TRADING_CONFIG.marginMode
        };

        console.log('Closing position with params:', params);
        const response = await client.futuresSubmitOrder(params);
        console.log('Close position response:', response);
        
        if (response.code === '00000') {
            activePositions.delete(ticker);
            logTrade('CLOSE', {
                ticker,
                originalSide: position.side,
                response
            });
        }
        
        return response;
    } catch (error) {
        console.error('Error closing position:', error.response ? error.response.body : error);
        logTrade('ERROR', { 
            ticker, 
            action: 'CLOSE', 
            error: error.response ? error.response.body : error.message 
        });
        throw error;
    }
}

// Express server setup
const app = express();
app.use(express.json());
app.use(express.text());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false
}));
app.use(flash());

// Authentication middleware
function requireAuth(req, res, next) {
    if (req.session.authenticated) {
        next();
    } else {
        res.redirect('/login');
    }
}

// Login page
app.get('/login', (req, res) => {
    const messages = req.flash();
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Login - BitGet Trading Bot</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    margin: 0;
                    background-color: #f5f5f5;
                }
                .login-container {
                    background: white;
                    padding: 2rem;
                    border-radius: 8px;
                    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
                    width: 300px;
                }
                .form-group {
                    margin-bottom: 1rem;
                }
                input {
                    width: 100%;
                    padding: 8px;
                    margin-top: 4px;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                }
                button {
                    width: 100%;
                    padding: 10px;
                    background-color: #007bff;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                }
                .error {
                    color: red;
                    margin-bottom: 1rem;
                }
            </style>
        </head>
        <body>
            <div class="login-container">
                <h2>Login</h2>
                ${messages.error ? `<div class="error">${messages.error}</div>` : ''}
                <form action="/login" method="POST">
                    <div class="form-group">
                        <label>Password</label>
                        <input type="password" name="password" required>
                    </div>
                    <button type="submit">Login</button>
                </form>
            </div>
        </body>
        </html>
    `);
});

app.post('/login', (req, res) => {
    const { password } = req.body;
    if (hashPassword(password) === credentials.adminPassword) {
        req.session.authenticated = true;
        res.redirect('/');
    } else {
        req.flash('error', 'Invalid password');
        res.redirect('/login');
    }
});

app.post('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// API key management
app.post('/api-keys', requireAuth, (req, res) => {
    const { apiKey, apiSecret, apiPass } = req.body;
    updateCredentials({
        bitget: { apiKey, apiSecret, apiPass }
    });
    res.redirect('/');
});

// Password change
app.post('/change-password', requireAuth, (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (hashPassword(currentPassword) === credentials.adminPassword) {
        updateCredentials({
            adminPassword: hashPassword(newPassword)
        });
        res.redirect('/');
    } else {
        req.flash('error', 'Invalid current password');
        res.redirect('/');
    }
});

// Dashboard HTML template
const getDashboardHTML = (req) => `
<!DOCTYPE html>
<html>
<head>
    <title>BitGet Trading Bot Status</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 800px;
            margin: 20px auto;
            padding: 0 20px;
            line-height: 1.6;
            color: #333;
        }
        .section {
            padding: 15px;
            border-radius: 5px;
            background-color: #f8f9fa;
            border: 1px solid #dee2e6;
            margin: 20px 0;
        }
        .error { color: red; }
        .success { color: green; }
        pre {
            white-space: pre-wrap;
            word-wrap: break-word;
        }
        form {
            margin-top: 10px;
        }
        input {
            margin: 5px 0;
            padding: 5px;
        }
        button {
            padding: 8px 15px;
            background-color: #007bff;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
        }
        .logout {
            float: right;
            background-color: #dc3545;
        }
    </style>
    <script>
        function refreshPage() {
            location.reload();
        }
    </script>
</head>
<body>
    <h1>BitGet Trading Bot Status</h1>
    <form action="/logout" method="POST" style="text-align: right;">
        <button type="submit" class="logout">Logout</button>
    </form>
    
    <div class="section">
        <h2>Bot Status</h2>
        <p>✅ Bot is running</p>
        <p>Started at: ${new Date().toISOString()}</p>
        <button onclick="refreshPage()">Refresh Status</button>
    </div>

    <div class="section">
        <h2>API Configuration</h2>
        ${client ? '<p class="success">✅ API configured and connected</p>' : '<p class="error">❌ API not configured</p>'}
        <form action="/api-keys" method="POST">
            <input type="text" name="apiKey" placeholder="API Key" value="${credentials.bitget.apiKey || ''}" required><br>
            <input type="password" name="apiSecret" placeholder="API Secret" value="${credentials.bitget.apiSecret || ''}" required><br>
            <input type="password" name="apiPass" placeholder="API Passphrase" value="${credentials.bitget.apiPass || ''}" required><br>
            <button type="submit">Update API Keys</button>
        </form>
    </div>

    <div class="section">
        <h2>Change Password</h2>
        ${req.flash('error') ? `<p class="error">${req.flash('error')}</p>` : ''}
        <form action="/change-password" method="POST">
            <input type="password" name="currentPassword" placeholder="Current Password" required><br>
            <input type="password" name="newPassword" placeholder="New Password" required><br>
            <button type="submit">Change Password</button>
        </form>
    </div>

    <div class="section">
        <h2>Trading Configuration</h2>
        <pre>${JSON.stringify(TRADING_CONFIG, null, 2)}</pre>
    </div>

    <div class="section">
        <h2>Webhook URL</h2>
        <p>Send TradingView webhooks to:</p>
        <code>${config.publicUrl}/webhook</code>
    </div>

    <div class="section">
        <h2>Last Webhook Received</h2>
        ${lastWebhook.timestamp ? `
            <p>Time: ${lastWebhook.timestamp}</p>
            <pre>${JSON.stringify(lastWebhook.data, null, 2)}</pre>
        ` : '<p>No webhooks received yet</p>'}
    </div>

    <div class="section">
        <h2>Active Positions</h2>
        <pre>${JSON.stringify(Object.fromEntries(activePositions), null, 2) || 'No active positions'}</pre>
    </div>
</body>
</html>
`;

// Homepage route (protected)
app.get('/', requireAuth, (req, res) => {
    res.send(getDashboardHTML(req));
});

async function handleSignal(signal) {
    const parsedSignal = parseSignal(signal);
    console.log('Handling signal:', parsedSignal);
    
    if (!parsedSignal.ticker) {
        console.log('No ticker found in signal');
        return;
    }

    try {
        if (parsedSignal.isExit) {
            // Close position if we have one
            if (activePositions.has(parsedSignal.ticker)) {
                await closePosition(parsedSignal.ticker);
            }
        } else {
            // For new positions
            if (parsedSignal.action === 'buy' || parsedSignal.action === 'sell') {
                // Close existing position if it exists and is opposite side
                const existingPosition = activePositions.get(parsedSignal.ticker);
                if (existingPosition && existingPosition.side !== parsedSignal.action) {
                    await closePosition(parsedSignal.ticker);
                }
                
                // Open new position if we don't have one
                if (!activePositions.has(parsedSignal.ticker)) {
                    await openPosition(parsedSignal.ticker, parsedSignal.action);
                }
            }
        }
    } catch (error) {
        console.error('Error handling signal:', error.response ? error.response.body : error);
    }
}

// Webhook endpoint
app.post('/webhook', async (req, res) => {
    // Verify webhook secret if provided
    const providedSecret = req.query.secret || req.headers['x-webhook-secret'];
    if (config.webhookSecret !== 'YOUR_WEBHOOK_SECRET' && providedSecret !== config.webhookSecret) {
        console.log('Invalid webhook secret');
        return res.status(401).json({ error: 'Invalid webhook secret' });
    }

    const signal = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    console.log('Received webhook:', signal);
    
    // Update last webhook data
    lastWebhook = {
        timestamp: new Date().toISOString(),
        data: {
            raw: signal,
            parsed: parseSignal(signal)
        }
    };
    
    try {
        await handleSignal(signal);
        res.json({ success: true });
    } catch (error) {
        console.error('Error processing webhook:', error.response ? error.response.body : error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Start server
const PORT = config.port;
app.listen(PORT, () => {
    console.log(`Trading bot started on port ${PORT}`);
    console.log('Trading config:', TRADING_CONFIG);
    console.log(`Homepage: ${config.publicUrl}`);
    console.log(`Webhook URL: ${config.publicUrl}/webhook`);
    
    // Initialize BitGet client if credentials exist
    if (initBitGetClient()) {
        console.log('BitGet client initialized');
    } else {
        console.log('Waiting for API credentials');
    }
});
