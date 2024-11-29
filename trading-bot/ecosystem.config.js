module.exports = {
  apps: [{
    name: 'bitget-tradingbot',
    script: 'tradingbot.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      BITGET_API_KEY: 'YOUR_API_KEY',
      BITGET_API_SECRET: 'YOUR_API_SECRET',
      BITGET_API_PASS: 'YOUR_API_PASSPHRASE',
      WEBHOOK_SECRET: 'YOUR_WEBHOOK_SECRET'
    }
  }]
};
