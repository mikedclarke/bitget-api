const express = require('express');
const { RestClientV2 } = require('bitget-api');
const config = require('./config');

const app = express();
app.use(express.json());

// Initialize BitGet client
const client = new RestClientV2({
    apiKey: config.apiKey,
    apiSecret: config.apiSecret,
    apiPass: config.apiPass,
});

// Trading parameters
const TRADING_CONFIG = {
    symbol: 'BTCUSDT',
    marginCoin: 'USDT',
    productType: 'USDT-FUTURES',
    marginMode: 'isolated',
    size: '0.001',  // Default position size
};

// Trading functions
async function enterLong() {
    const params = {
        ...TRADING_CONFIG,
        side: 'buy',
        orderType: 'market'
    };
    
    try {
        const response = await client.futuresSubmitOrder(params);
        console.log('Long position opened:', response);
        return response;
    } catch (error) {
        console.error('Error opening long position:', error);
        throw error;
    }
}

async function closeLong() {
    const params = {
        ...TRADING_CONFIG,
        side: 'sell',
        orderType: 'market'
    };
    
    try {
        const response = await client.futuresSubmitOrder(params);
        console.log('Long position closed:', response);
        return response;
    } catch (error) {
        console.error('Error closing long position:', error);
        throw error;
    }
}

// Webhook endpoint
app.post('/webhook', async (req, res) => {
    try {
        const { signal, secret } = req.body;

        // Verify webhook secret (you should set this in TradingView)
        if (secret !== config.webhookSecret) {
            console.error('Invalid webhook secret');
            return res.status(401).json({ error: 'Invalid webhook secret' });
        }

        console.log('Received signal:', signal);

        switch (signal) {
            case 'ENTER-LONG':
                await enterLong();
                break;
            case 'BUY-CLOSE':
                await closeLong();
                break;
            // Add more cases as needed
            default:
                console.log('Unknown signal:', signal);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error processing webhook:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Error handling
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Trading bot server running on port ${PORT}`);
    console.log('Waiting for TradingView webhooks...');
});
