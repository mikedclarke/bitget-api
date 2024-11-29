const { RestClientV2 } = require('bitget-api');
const config = require('./config');

const client = new RestClientV2({
    apiKey: config.apiKey,
    apiSecret: config.apiSecret,
    apiPass: config.apiPass,
});

// Parameters for opening a BTC USDT-M futures long position
const params = {
    symbol: 'BTCUSDT',    // Trading pair
    marginCoin: 'USDT',   // Margin coin
    size: '0.001',        // Position size in BTC (adjust according to your needs)
    side: 'buy',          // 'buy' for long
    orderType: 'market',  // Market order
    productType: 'USDT-FUTURES',  // Product type
    marginMode: 'isolated'  // Margin mode (isolated or cross)
};

async function openLongPosition() {
    try {
        // Submit the order
        const response = await client.futuresSubmitOrder(params);
        console.log('Order submitted successfully:', response);
    } catch (error) {
        console.error('Error submitting order:', error);
    }
}

openLongPosition();
