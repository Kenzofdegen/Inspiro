const { Telegraf } = require('telegraf');
const axios = require('axios');
const config = require('./config.js');

// Initialize bot
const bot = new Telegraf(config.BOT_TOKEN);

// Store data
let cryptoData = {};
let priceAlerts = new Map();

// Function to fetch detailed crypto data
async function fetchCryptoData() {
    try {
        const response = await axios.get(
            'https://api.coingecko.com/api/v3/coins/markets',
            {
                params: {
                    vs_currency: 'usd',
                    order: 'market_cap_desc',
                    per_page: 20,
                    page: 1,
                    sparkline: false,
                    price_change_percentage: '1h,24h,7d'
                }
            }
        );
        return response.data;
    } catch (error) {
        console.error('Error fetching data:', error.message);
        return null;
    }
}

// Function to fetch trending coins
async function fetchTrendingCoins() {
    try {
        const response = await axios.get('https://api.coingecko.com/api/v3/search/trending');
        return response.data.coins;
    } catch (error) {
        console.error('Error fetching trending:', error.message);
        return null;
    }
}

// Function to format price changes
function formatPriceChange(change) {
    if (!change) return 'N/A';
    const symbol = change >= 0 ? '🟢' : '🔴';
    return `${symbol} ${change.toFixed(2)}%`;
}

// Start command
bot.command('start', (ctx) => {
    ctx.reply(
        '🚀 Welcome to Enhanced CryptoBot!\n\n' +
        'Available commands:\n' +
        '/price <crypto> - Get detailed price info\n' +
        '/trending - Show trending cryptocurrencies\n' +
        '/alert <crypto> <price> - Set price alert\n' +
        '/myalerts - View your active alerts\n' +
        '/market - Overall market stats\n' +
        '/help - Show all commands'
    );
});

// Detailed price command
bot.command('price', async (ctx) => {
    const coin = ctx.message.text.split(' ')[1]?.toLowerCase();
    if (!coin) {
        return ctx.reply('Please specify a cryptocurrency. Example: /price bitcoin');
    }

    const data = await fetchCryptoData();
    const coinData = data?.find(c => c.id === coin || c.symbol === coin);

    if (!coinData) {
        return ctx.reply('Cryptocurrency not found. Please check the name and try again.');
    }

    const message = 
        `💰 ${coinData.name} (${coinData.symbol.toUpperCase()})\n\n` +
        `Current Price: $${coinData.current_price.toLocaleString()}\n` +
        `Market Cap: $${(coinData.market_cap / 1e9).toFixed(2)}B\n` +
        `24h Volume: $${(coinData.total_volume / 1e6).toFixed(2)}M\n\n` +
        `Price Changes:\n` +
        `1h: ${formatPriceChange(coinData.price_change_percentage_1h_in_currency)}\n` +
        `24h: ${formatPriceChange(coinData.price_change_percentage_24h)}\n` +
        `7d: ${formatPriceChange(coinData.price_change_percentage_7d_in_currency)}\n\n` +
        `All Time High: $${coinData.ath.toLocaleString()}\n` +
        `ATH Change: ${formatPriceChange(coinData.ath_change_percentage)}`;

    ctx.reply(message);
});

// Trending command
bot.command('trending', async (ctx) => {
    ctx.reply('Fetching trending cryptocurrencies... 🔄');
    const trending = await fetchTrendingCoins();

    if (!trending) {
        return ctx.reply('Unable to fetch trending coins. Please try again later.');
    }

    let message = '🔥 Trending Cryptocurrencies:\n\n';
    trending.slice(0, 7).forEach((coin, index) => {
        message += `${index + 1}. ${coin.item.name} (${coin.item.symbol.toUpperCase()})\n` +
                  `   Market Cap Rank: #${coin.item.market_cap_rank}\n\n`;
    });

    ctx.reply(message);
});

// Set price alert
bot.command('alert', (ctx) => {
    const [_, coin, price] = ctx.message.text.split(' ');
    if (!coin || !price) {
        return ctx.reply('Please use format: /alert bitcoin 50000');
    }

    const alertPrice = parseFloat(price);
    if (isNaN(alertPrice)) {
        return ctx.reply('Please enter a valid price');
    }

    const userId = ctx.from.id;
    const alertKey = `${userId}-${coin}`;
    priceAlerts.set(alertKey, {
        coin: coin.toLowerCase(),
        price: alertPrice,
        userId: userId
    });

    ctx.reply(`✅ Alert set for ${coin.toUpperCase()} at $${alertPrice}`);
});

// View active alerts
bot.command('myalerts', (ctx) => {
    const userId = ctx.from.id;
    let message = '🔔 Your Active Alerts:\n\n';
    let found = false;

    priceAlerts.forEach((alert, key) => {
        if (alert.userId === userId) {
            found = true;
            message += `${alert.coin.toUpperCase()}: $${alert.price}\n`;
        }
    });

    ctx.reply(found ? message : 'You have no active alerts');
});

// Market overview command
bot.command('market', async (ctx) => {
    const data = await fetchCryptoData();
    if (!data) {
        return ctx.reply('Unable to fetch market data. Please try again later.');
    }

    const totalMarketCap = data.reduce((sum, coin) => sum + coin.market_cap, 0);
    const total24hVolume = data.reduce((sum, coin) => sum + coin.total_volume, 0);

    const message = 
        '📊 Crypto Market Overview\n\n' +
        `Total Market Cap: $${(totalMarketCap / 1e9).toFixed(2)}B\n` +
        `24h Volume: $${(total24hVolume / 1e9).toFixed(2)}B\n\n` +
        'Top Gainers (24h):\n' +
        data.sort((a, b) => b.price_change_percentage_24h - a.price_change_percentage_24h)
            .slice(0, 3)
            .map(coin => `${coin.symbol.toUpperCase()}: ${formatPriceChange(coin.price_change_percentage_24h)}`)
            .join('\n');

    ctx.reply(message);
});

// Help command
bot.command('help', (ctx) => {
    ctx.reply(
        '🤖 Available Commands:\n\n' +
        '/price <crypto> - Get detailed price info\n' +
        '/trending - Show trending cryptocurrencies\n' +
        '/alert <crypto> <price> - Set price alert\n' +
        '/myalerts - View your active alerts\n' +
        '/market - Overall market stats\n' +
        '/help - Show this help message\n\n' +
        '💡 Example: /price bitcoin'
    );
});

// Launch bot
bot.launch()
    .then(() => {
        console.log('✅ Enhanced CryptoBot is running!');
        
        // Check price alerts every minute
        setInterval(async () => {
            if (priceAlerts.size > 0) {
                const data = await fetchCryptoData();
                if (!data) return;

                priceAlerts.forEach((alert, key) => {
                    const coinData = data.find(c => c.id === alert.coin || c.symbol === alert.coin);
                    if (coinData && coinData.current_price >= alert.price) {
                        bot.telegram.sendMessage(
                            alert.userId,
                            `🚨 Alert: ${coinData.name} has reached $${coinData.current_price.toLocaleString()}`
                        );
                        priceAlerts.delete(key);
                    }
                });
            }
        }, 60000);
    })
    .catch(error => {
        console.error('Error starting bot:', error);
    });

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));