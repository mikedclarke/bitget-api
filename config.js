module.exports = {
    apiKey: process.env.BITGET_API_KEY || '**',
    apiSecret: process.env.BITGET_API_SECRET || '**',
    apiPass: process.env.BITGET_API_PASS || '**',
    webhookSecret: process.env.WEBHOOK_SECRET || 'YOUR_WEBHOOK_SECRET'  // Add this to TradingView webhook URL
};
