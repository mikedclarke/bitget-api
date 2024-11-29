const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
}

// Create a write stream for logging
const logStream = fs.createWriteStream(path.join(logsDir, 'webhooks.log'), { flags: 'a' });

// Middleware to log all requests
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.url}`);
    next();
});

// Webhook endpoint
app.post('/webhook', (req, res) => {
    const timestamp = new Date().toISOString();
    
    // Log to console
    console.log('\n=== Webhook Received ===');
    console.log('Time:', timestamp);
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    console.log('Body:', JSON.stringify(req.body, null, 2));
    console.log('=====================\n');

    // Log to file
    const logEntry = {
        timestamp,
        headers: req.headers,
        body: req.body
    };
    logStream.write(JSON.stringify(logEntry, null, 2) + '\n---\n');

    // Always respond with success to TradingView
    res.json({ success: true });
});

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
    console.log('\nTo test locally with ngrok:');
    console.log('1. Install ngrok: npm install -g ngrok');
    console.log(`2. Run: ngrok http ${PORT}`);
    console.log('3. Use the ngrok URL in your TradingView webhook\n');
});
