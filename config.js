// config.js
const dotenv = require('dotenv-vault'); // Use dotenv-vault
const path = require('path');

// Load environment variables using dotenv-vault
// It will automatically look for .env, .env.vault, etc.
// Ensure you have a .env file or a .env.vault file with a corresponding DOTENV_KEY.
dotenv.config(); // Use config() for dotenv-vault

// --- Environment Variable Validation ---

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN || BOT_TOKEN === 'YOUR_BOT_TOKEN') {
    console.error('FATAL ERROR: BOT_TOKEN environment variable is not set correctly.');
    // Updated error message for dotenv-vault troubleshooting
    console.error('Please ensure BOT_TOKEN is defined in your .env file or accessible via your .env.vault setup (check .env.vault and ensure DOTENV_KEY is set correctly in the environment if using a vault).');
    process.exit(1);
}

const EXCHANGE_API_LOGIN = process.env.EXCHANGE_API_LOGIN;
const EXCHANGE_API_KEY = process.env.EXCHANGE_API_KEY;
if (!EXCHANGE_API_LOGIN || !EXCHANGE_API_KEY) {
    console.error('FATAL ERROR: EXCHANGE_API_LOGIN or EXCHANGE_API_KEY environment variables are not set.');
    // Updated error message for dotenv-vault troubleshooting
    console.error('Please ensure these are defined in your .env file or accessible via your .env.vault setup (check .env.vault and DOTENV_KEY if applicable).');
    console.error('Exchange rate functionality will not work properly.');
    process.exit(1);
}

const AML_API_KEY = process.env.AML_API_KEY;
if (!AML_API_KEY) {
    // Make this a fatal error as AML commands will fail
    console.error('FATAL ERROR: AML_API_KEY environment variable is not set.');
    // Updated error message for dotenv-vault troubleshooting
    console.error('Please ensure AML_API_KEY is defined in your .env file or accessible via your .env.vault setup (check .env.vault and DOTENV_KEY if applicable).');
    console.error('AML check functionality requires an API key.');
    process.exit(1);
}

// --- API Configuration ---
const EXCHANGE_API_URL = 'https://safexchange.pro/api/userapi/v1';
const AML_BASE_URL = 'https://core.tr.energy/api/aml'; // Base URL for AML
const AML_CHECK_URL = `${AML_BASE_URL}/check`;         // Specific endpoint for checks

// --- Exchange Directions ---
// !! IMPORTANT !! These IDs MUST match the actual IDs on your SafeExchange platform.
const USDT_RUB_DIRECTION_ID = 1377; // Replace with your actual direction ID for USDT->RUB
const RUB_USDT_DIRECTION_ID = 1331; // Replace with your actual direction ID for RUB->USDT

// --- Hardcoded Commissions (Only for Rate Display) ---
// Note: Actual calculation uses the commission returned by the exchange API.
// These are only shown when displaying the rate without a specific amount.
// Load display commissions from environment variables
// Provide warnings if not set, as they are for display purposes only.
const USDT_RUB_DISPLAY_COMMISSION = process.env.USDT_RUB_DISPLAY_COMMISSION;
if (!USDT_RUB_DISPLAY_COMMISSION) {
    console.warn('WARN: USDT_RUB_DISPLAY_COMMISSION environment variable not set. Display commission might not show correctly.');
}

const RUB_USDT_DISPLAY_COMMISSION = process.env.RUB_USDT_DISPLAY_COMMISSION;
if (!RUB_USDT_DISPLAY_COMMISSION) {
    console.warn('WARN: RUB_USDT_DISPLAY_COMMISSION environment variable not set. Display commission might not show correctly.');
}

// --- Caching ---
const RATES_CACHE_TTL_SECONDS = 60; // Time-to-live for exchange rate cache

// --- AML Configuration ---
const AML_PENDING_CHECK_DELAY_MS = 5000; // Wait 5 seconds before re-checking pending status
const AML_LIST_LIMIT = 10; // Max number of reports to show with /amls

// --- Wallet Validation Patterns ---
const WALLET_VALIDATION = {
    TRON: {
        pattern: /^T[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{33}$/,
        length: 34,
        example: 'T...', // Example for help message
        blockchainType: 'tron'
    },
    BTC: {
        // Legacy (1...), P2SH (3...), Bech32 (bc1...)
        pattern: /^(bc1[02-9ac-hj-np-z]{39}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/,
        minLength: 26,
        maxLength: 42,
        example: '1... или 3... или bc1...', // Example for help message
        blockchainType: 'btc'
    }
};

// --- Exports ---
module.exports = {
    BOT_TOKEN,
    EXCHANGE_API_URL,
    EXCHANGE_API_LOGIN,
    EXCHANGE_API_KEY,
    AML_API_KEY,
    AML_BASE_URL,
    AML_CHECK_URL,
    USDT_RUB_DIRECTION_ID,
    RUB_USDT_DIRECTION_ID,
    USDT_RUB_DISPLAY_COMMISSION,
    RUB_USDT_DISPLAY_COMMISSION,
    RATES_CACHE_TTL_SECONDS,
    AML_PENDING_CHECK_DELAY_MS,
    AML_LIST_LIMIT,
    WALLET_VALIDATION,
};