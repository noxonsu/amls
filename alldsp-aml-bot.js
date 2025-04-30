try {
    require('dotenv-vault').config();

    // Добавьте этот блок для проверки среды
    if (process.env.DOTENV_KEY) {
        console.log(`Using environment key: ${process.env.DOTENV_KEY}`);
        // Ключ обычно содержит имя среды, например: dotenv://:key_.../vault/.env.vault?environment=development
        // Вы можете попытаться извлечь имя среды из ключа, если это необходимо
        const match = process.env.DOTENV_KEY.match(/environment=([^&]+)/);
        if (match && match[1]) {
            console.log(`Detected environment: ${match[1]}`);
        } else {
            console.log('Could not automatically detect environment name from DOTENV_KEY.');
        }
    } else {
        console.log('DOTENV_KEY is not set. Loading default .env file (likely development environment).');
    }
} catch (error) {
    console.error('Failed to load dotenv-vault:', error.message);
    console.log('Continuing without environment variables from dotenv-vault...');
    
    // Try fallback to regular dotenv if available
    try {
        require('dotenv').config();
        console.log('Successfully loaded environment variables using dotenv.');
    } catch (e) {
        console.log('dotenv also not available. Running with system environment variables only.');
    }
}

const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs'); // Import the file system module
const path = require('path'); // Import path module
const config = require('./config');
const exchangeService = require('./exchangeService');
const amlService = require('./amlService');

console.log('Bot starting...');

// --- Load Allowed Users (Usernames) ---
const allowedUsersFilePath = path.join(__dirname, 'allowedusers.txt');
let allowedUsernames = new Set(); // Changed variable name

try {
    const fileContent = fs.readFileSync(allowedUsersFilePath, 'utf8');
    allowedUsernames = new Set(
        fileContent
            .split('\n') // Split by newline
            .map(username => username.trim().replace(/^@/, '')) // Trim and remove leading @
            .filter(username => username) // Remove empty lines
    );
    if (allowedUsernames.size > 0) {
        console.log(`Loaded ${allowedUsernames.size} allowed usernames from ${allowedUsersFilePath}`);
    } else {
        console.warn(`WARN: ${allowedUsersFilePath} is empty or contains no valid usernames. No user restrictions applied.`);
    }
} catch (error) {
    if (error.code === 'ENOENT') {
        console.warn(`WARN: ${allowedUsersFilePath} not found. No user restrictions applied.`);
    } else {
        console.error(`FATAL ERROR: Could not read ${allowedUsersFilePath}:`, error);
        process.exit(1); // Exit on other read errors
    }
}

// Helper function to check if user is allowed by username
const isUserAllowed = (username) => {
    // If the set is empty (file not found or empty), allow everyone who has a username
    if (allowedUsernames.size === 0) {
        return !!username; // Allow only if username exists when file is empty/missing
    }
    // If username is missing, deny access when restrictions are active
    if (!username) {
        return false;
    }
    // Check against the set (case-insensitive comparison is safer for usernames)
    return allowedUsernames.has(username.toLowerCase());
};

// Helper function to get clean username and log unauthorized access
const checkAuthorization = (msg) => {
    const userId = msg.from.id; // Keep ID for logging
    const username = msg.from.username;
    const cleanUsername = username ? username.replace(/^@/, '').toLowerCase() : null; // Clean and lowercase

    if (!isUserAllowed(cleanUsername)) {
        console.log(`Ignoring command from unauthorized user: ID=${userId}, Username=${username || 'N/A'}`);
        return false; // Indicate user is not authorized
    }
    // Return the clean username for logging authorized requests if needed
    return cleanUsername || 'authorized_no_username';
};

// --- Bot Initialization ---
const bot = new TelegramBot(config.BOT_TOKEN, { polling: true });

// Check available currencies at startup
exchangeService.getDirectionCurrencies()
    .then(currencies => {
        console.log('Available currencies:', currencies);
    })
    .catch(error => {
        console.error('Error fetching currencies:', error);
    });

// --- Clear and Set Bot Commands (Optional but good practice) ---
const botCommands = [
    { command: 'start', description: 'Показать приветственное сообщение и помощь' },
    { command: 'usdt_rub', description: '[сумма] - Курс и конвертация USDT → RUB' },
    { command: 'rub_usdt', description: '[сумма] - Курс и конвертация RUB → USDT' },
    { command: 'aml', description: '[адрес] - Проверить кошелек (TRON/BTC) по AML' },
    { command: 'amls', description: 'Показать последние AML отчеты' },
];

bot.setMyCommands(botCommands)
    .then(() => console.log('Bot commands updated successfully.'))
    .catch(err => console.error('Error setting bot commands:', err));

// --- Command Handlers ---

// Handle /start command
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const authorizedUsername = checkAuthorization(msg);
    if (!authorizedUsername) return; // Check authorization

    // Escaped characters for MarkdownV2: '.', '-', '(', ')', '!', '+', '%'
    // Updated help text based on commission logic clarification
    const helpText = `*🤖 Добро пожаловать в Crypto Exchange Bot\\!*

*Доступные команды:*

*Обмен USDT на RUB:*
• \`/usdt_rub\` \\- Текущий курс USDT → RUB
• \`/usdt_rub \\-0\\.5%\` \\- Курс USDT → RUB со скидкой 0\\.5% 
• \`/usdt_rub \\+1%\` \\- Курс USDT → RUB с наценкой 1% 
• \`/usdt_rub 100\` \\- Рассчитать 100 USDT в RUB по базовому курсу
• \`/usdt_rub 100 \\-0\\.5%\` \\- Рассчитать 100 USDT в RUB со скидкой 0\\.5%
• \`/usdt_rub 100 \\+1%\` \\- Рассчитать 100 USDT в RUB с наценкой 1%

*Обмен RUB на USDT:*
• \`/rub_usdt\` \\- Текущий курс RUB → USDT
• \`/rub_usdt \\+1%\` \\- Курс RUB → USDT с наценкой 1% \\(клиенту потребуется больше RUB за USDT\\)
• \`/rub_usdt \\-1%\` \\- Курс RUB → USDT со скидкой 1% \\(клиенту потребуется меньше RUB за USDT\\)
• \`/rub_usdt 10000\` \\- Рассчитать 10000 RUB в USDT по базовому курсу
• \`/rub_usdt 10000 \\+1%\` \\- Рассчитать 10000 RUB в USDT с наценкой 1%
• \`/rub_usdt 10000 \\-1%\` \\- Рассчитать 10000 RUB в USDT со скидкой 1%

*AML Проверка:*
• \`/aml T\\.\\.\\. \` \\- Проверить TRON адрес
• \`/aml 1\\.\\.\\.\` или \`/aml 3\\.\\.\\.\` или \`/aml bc1\\.\\.\\.\` \\- Проверить Bitcoin адрес
• \`/amls\` \\- Показать историю проверок

_Курсы обмена обновляются примерно раз в ${config.RATES_CACHE_TTL_SECONDS} секунд\\._
_Результаты AML проверки кэшируются на стороне сервиса\\._`;

    // Use MarkdownV2 for better formatting control
    bot.sendMessage(chatId, helpText, { parse_mode: 'MarkdownV2' });
});

// Handle /USDT_RUB command
// Updated regex to handle three cases and allow comma or period in commission
// 1. /USDT_RUB (no params)
// 2. /USDT_RUB +1% or +1,5% (commission only)
// 3. /USDT_RUB 100 +1% or 100 +1,5% (amount and commission)
bot.onText(/\/USDT_RUB(?:\s+(\d+\.?\d*))?(?:\s*([+-]?\d*[.,]?\d+%))?|\/USDT_RUB\s+([+-]?\d*[.,]?\d+%)/i, (msg, match) => {
    const chatId = msg.chat.id;
    const authorizedUsername = checkAuthorization(msg);
    if (!authorizedUsername) return; // Check authorization

    // If third group matches, it's the "commission only" format
    if (match[3]) {
        const amount = null; // No amount specified
        const commissionString = match[3].trim();
        console.log(`[/USDT_RUB command] User: ${msg.from.id} (${authorizedUsername}), Amount: ${amount}, Commission: ${commissionString}`);
        exchangeService.handleUsdtRubCommand(bot, chatId, amount, commissionString);
        return;
    }

    // Regular format with optional amount and commission
    const amount = match[1] ? parseFloat(match[1]) : null;
    const commissionString = match[2] ? match[2].trim() : null;
    console.log(`[/USDT_RUB command] User: ${msg.from.id} (${authorizedUsername}), Amount: ${amount}, Commission: ${commissionString}`);
    exchangeService.handleUsdtRubCommand(bot, chatId, amount, commissionString);
});

// Handle /RUB_USDT command
// Updated regex similarly to /USDT_RUB to allow comma or period in commission
bot.onText(/\/RUB_USDT(?:\s+(\d+\.?\d*))?(?:\s*([+-]?\d*[.,]?\d+%))?|\/RUB_USDT\s+([+-]?\d*[.,]?\d+%)/i, (msg, match) => {
    const chatId = msg.chat.id;
    const authorizedUsername = checkAuthorization(msg);
    if (!authorizedUsername) return; // Check authorization

    // If third group matches, it's the "commission only" format
    if (match[3]) {
        const amount = null; // No amount specified
        const commissionString = match[3].trim();
        console.log(`[/RUB_USDT command] User: ${msg.from.id} (${authorizedUsername}), Amount: ${amount}, Commission: ${commissionString}`);
        exchangeService.handleRubUsdtCommand(bot, chatId, amount, commissionString);
        return;
    }

    // Regular format with optional amount and commission
    const amount = match[1] ? parseFloat(match[1]) : null;
    const commissionString = match[2] ? match[2].trim() : null;
    console.log(`[/RUB_USDT command] User: ${msg.from.id} (${authorizedUsername}), Amount: ${amount}, Commission: ${commissionString}`);
    exchangeService.handleRubUsdtCommand(bot, chatId, amount, commissionString);
});

// Handle /aml command
bot.onText(/\/aml(?:\s+(.+))?/, (msg, match) => {
    const chatId = msg.chat.id;
    const authorizedUsername = checkAuthorization(msg);
    if (!authorizedUsername) return; // Check authorization

    // match[1] contains the address or could be undefined
    const walletAddress = match?.[1]?.trim();
    console.log(`[/aml command] User: ${msg.from.id} (${authorizedUsername}), Address: ${walletAddress}`);
    amlService.handleAmlCommand(bot, chatId, walletAddress);
});

// Handle /amls command
bot.onText(/\/amls/, (msg) => {
    const chatId = msg.chat.id;
    const authorizedUsername = checkAuthorization(msg);
    if (!authorizedUsername) return; // Check authorization

    console.log(`[/amls command] User: ${msg.from.id} (${authorizedUsername})`);
    amlService.handleAmlsCommand(bot, chatId);
});

// --- Basic Error Handling & Logging ---
bot.on('polling_error', (error) => {
    console.error('Polling error:', error.code, '-', error.message);
    // Consider adding logic here - e.g., exponential backoff or notification
});

bot.on('webhook_error', (error) => {
    console.error('Webhook error:', error.code, '-', error.message);
});

bot.on('error', (error) => {
    console.error('General Bot Error:', error);
});

console.log('Bot is running and listening for commands...');

// Optional: Graceful shutdown
process.once('SIGINT', () => {
    console.log('SIGINT received, stopping bot...');
    bot.stopPolling().then(() => {
        console.log('Bot polling stopped.');
        process.exit(0);
    });
});
process.once('SIGTERM', () => {
    console.log('SIGTERM received, stopping bot...');
    bot.stopPolling().then(() => {
        console.log('Bot polling stopped.');
        process.exit(0);
    });
});