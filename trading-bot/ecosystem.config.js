module.exports = {
  apps: [{
    name: 'bitget-tradingbot',
    script: 'trading-bot.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      PUBLIC_URL: 'https://bot.gdlife.co.uk',
      SESSION_SECRET: process.env.SESSION_SECRET,
      WEBHOOK_SECRET: process.env.WEBHOOK_SECRET
    }
  }]
};
