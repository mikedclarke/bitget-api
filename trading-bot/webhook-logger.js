const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
// Accept both JSON and raw text
app.use(express.json());
app.use(express.text());
app.use(express.urlencoded({ extended: true }));

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
}

// Create a write stream for logging
const logStream = fs.createWriteStream(path.join(logsDir, 'webhooks.log'), { flags: 'a' });

// Helper function to parse the TradingView message
function parseTradingViewMessage(message) {
    try {
        // Try to parse as JSON first
        return JSON.parse(message);
    } catch (e) {
        // If not JSON, parse the text format
        // Example: "Buy TP - BELUSDT.P, Price = 0.6852"
        const parts = message.split(',');
        const signalPart = parts[0].trim();
        const pricePart = parts[1] ? parts[1].trim() : '';
        
        return {
            raw_message: message,
            signal: signalPart,
            price: pricePart.replace('Price = ', '')
        };
    }
}

// Handle both root path and /webhook
function handleWebhook(req, res) {
    const timestamp = new Date().toISOString();
    let body = req.body;
    
    // If body is a string, parse it
    if (typeof body === 'string') {
        body = parseTradingViewMessage(body);
    }
    
    // Log to console
    console.log('\n=== Webhook Received ===');
    console.log('Time:', timestamp);
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    console.log('Body:', JSON.stringify(body, null, 2));
    console.log('Raw Body:', req.body);
    console.log('=====================\n');

    // Log to file
    const logEntry = {
        timestamp,
        headers: req.headers,
        body: body,
        raw_body: req.body
    };
    logStream.write(JSON.stringify(logEntry, null, 2) + '\n---\n');

    // Always respond with success to TradingView
    res.json({ success: true });
}

// Handle both root path and /webhook
app.post('/', handleWebhook);
app.post('/webhook', handleWebhook);

// Simple status endpoint
app.get('/status', (req, res) => {
    res.json({ status: 'Webhook logger running' });
});

// Error handling
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    const timestamp = new Date().toISOString();
    logStream.write(`[${timestamp}] ERROR: ${err.stack}\n---\n`);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    const startTime = new Date().toISOString();
    console.log(`Webhook logger started at ${startTime}`);
    console.log(`Server running on port ${PORT}`);
    console.log(`Logs will be saved to: ${path.join(logsDir, 'webhooks.log')}`);
    console.log('\nListening for webhooks on:');
    console.log(`- POST /`);
    console.log(`- POST /webhook`);
    console.log('\nExpected TradingView format examples:');
    console.log('1. Text format: "Buy TP - BELUSDT.P, Price = 0.6852"');
    console.log('2. JSON format: {"signal": "BUY", "price": "0.6852"}');
});
