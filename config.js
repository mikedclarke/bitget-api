module.exports = {
    webhookSecret: process.env.WEBHOOK_SECRET || 'YOUR_WEBHOOK_SECRET',  // Add this to TradingView webhook URL
    port: process.env.PORT || 3000,
    publicUrl: process.env.PUBLIC_URL || 'http://localhost:3000',
    sessionSecret: process.env.SESSION_SECRET || 'your-session-secret-key'  // For express-session
};
