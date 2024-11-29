# BitGet Trading Bot

A Node.js trading bot that executes trades on BitGet based on TradingView webhook signals.

## Features

- Listens for TradingView webhook signals
- Executes trades on BitGet futures
- Supports multiple signal types (ENTER-LONG, BUY-CLOSE, etc.)
- Secure webhook authentication
- Process management with PM2

## Setup

1. Install dependencies:
```bash
npm install express bitget-api pm2
```

2. Configure environment variables in ecosystem.config.js:
```javascript
{
  BITGET_API_KEY: 'your_api_key',
  BITGET_API_SECRET: 'your_api_secret',
  BITGET_API_PASS: 'your_api_passphrase',
  WEBHOOK_SECRET: 'your_webhook_secret'
}
```

3. Deploy to your server:
```bash
# Install PM2 globally if you haven't
npm install -g pm2

# Start the bot
pm2 start ecosystem.config.js

# Save PM2 configuration (so it starts on server reboot)
pm2 save

# Monitor the bot
pm2 monit
```

## TradingView Setup

1. In your TradingView alert, set the webhook URL to:
```
http://your-server:3000/webhook
```

2. Set the webhook message format to JSON:
```json
{
  "signal": "{{strategy.order.action}}",
  "secret": "your_webhook_secret"
}
```

## Supported Signals

- `ENTER-LONG`: Opens a long position
- `BUY-CLOSE`: Closes a long position

## Configuration

Trading parameters can be modified in `tradingbot.js`:
```javascript
const TRADING_CONFIG = {
    symbol: 'BTCUSDT',
    marginCoin: 'USDT',
    productType: 'USDT-FUTURES',
    marginMode: 'isolated',
    size: '0.001',  // Position size
};
```

## Monitoring

- View logs: `pm2 logs bitget-tradingbot`
- Monitor process: `pm2 monit`
- Check status: `pm2 status`

## Security Notes

1. Always use HTTPS in production
2. Keep your API keys and webhook secret secure
3. Consider implementing IP whitelisting for TradingView IPs
4. Monitor your positions and implement proper risk management
