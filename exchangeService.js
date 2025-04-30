// exchangeService.js
const axios = require('axios');
const config = require('./config'); // Import shared configuration

/**
 * Parses a commission string (e.g., "+1.0%", "-0.8%") into a calculation factor.
 * Handles both '.' and ',' as decimal separators.
 * @param {string|null|undefined} commissionString - The commission string from command or null/undefined.
 * @returns {number} - The factor to multiply the base amount by. Defaults to 1.
 */
function parseCommission(commissionString) {
    // Default to 1 (no commission) if input is not a string or is empty
    if (typeof commissionString !== 'string' || commissionString.trim() === '') return 1;
    try {
        // Replace comma with period for float parsing
        const cleanedString = commissionString.replace(',', '.').replace('%', '');
        const percentage = parseFloat(cleanedString);
        if (isNaN(percentage)) return 1; // Return 1 if parsing fails

        // +X% means user gets X% more (bonus), factor = 1 + (X/100)
        // -X% means user gets X% less (fee), factor = 1 - (X/100)
        return 1 + (percentage / 100);

    } catch (e) {
        console.error(`[ExchangeService] Error parsing commission string "${commissionString}":`, e);
        return 1; // Default to no commission adjustment on error
    }
}

/**
 * Fetches detailed direction info from SafeExchange API.
 * @param {number} directionId - The ID of the exchange direction.
 * @returns {Promise<object|null>} - The direction data or null on error.
 */
async function fetchDirectionDetails(directionId) {
    console.log(`[ExchangeService] Fetching details for direction ID: ${directionId}`);
    const apiUrl = `${config.EXCHANGE_API_URL}/get_direction`;
    // Prepare data for form-urlencoded format
    const requestData = new URLSearchParams();
    requestData.append('direction_id', directionId);

    const headers = {
        'API-LOGIN': config.EXCHANGE_API_LOGIN,
        'API-KEY': config.EXCHANGE_API_KEY,
        // Change Content-Type for form data
        'Content-Type': 'application/x-www-form-urlencoded'
    };

    // Construct and log the curl command for form data
    const headersString = Object.entries(headers)
        .map(([key, value]) => `-H '${key}: ${value}'`)
        .join(' ');
    // Use -d for form data
    const dataString = requestData.toString();
    const curlCommand = `curl -X POST ${apiUrl} ${headersString} -k -d '${dataString}'`;
    console.log(`[ExchangeService] Equivalent curl command: ${curlCommand}`);

    try {
        // Send data as URLSearchParams, axios will handle encoding
        const response = await axios.post(apiUrl, requestData, { headers });

        console.log(`[ExchangeService] /get_direction ID ${directionId}  status: ${response.status} `);
        if (response.status === 200 && response.data && response.data.data) { // Ensure inner data object exists
            // Log the raw value before parsing
            let rawCourseGive;
            // Check if course_give is 1, if so, use course_get instead
            if (response.data.data.course_give == 1) { // Using == for potential type coercion if needed, though === is safer if types are guaranteed
                rawCourseGive = response.data.data.course_get;
                console.log(`[ExchangeService] course_give was 1 for ID ${directionId}, using course_get instead.`);
            } else {
                rawCourseGive = response.data.data.course_give;
            }

            console.log(`[ExchangeService] Raw course value used for ID ${directionId}: ${rawCourseGive} (Type: ${typeof rawCourseGive}) URL: ${response.data.data.url}`);

            const parsedRate = parseFloat(rawCourseGive);
            console.log(`[ExchangeService] Parsed rate for ID ${directionId}: ${parsedRate}`);

            // Validate the parsed rate strictly
            if (isNaN(parsedRate) || parsedRate <= 0) {
                console.error(`[ExchangeService] Fetched invalid rate (NaN or <=0) for ID ${directionId}: ${parsedRate}. Raw value was: ${rawCourseGive}.`);
                return null; // Return null if rate is invalid
            }

            // Return the necessary data including the parsed rate
            return {
                rate: parsedRate,
                rawData: response.data.data // Return the inner data object
            };
        } else {
            console.error(`[ExchangeService] Failed to get valid details for direction ${directionId}: Status ${response.status}, Data: ${JSON.stringify(response.data)}`);
            return null;
        }
    } catch (error) {
        console.error(`[ExchangeService] Error fetching details for direction ${directionId}:`, error.message);
        if (error.response) {
            console.error('API Error Status:', error.response.status);
            console.error('API Error Data:', JSON.stringify(error.response.data));
        }
        return null;
    }
}

/**
 * Fetches available currencies from SafeExchange API.
 * @returns {Promise<object|null>} - The currencies data or null on error.
 */
async function getDirectionCurrencies() {
    try {
        const response = await axios.post(`${config.EXCHANGE_API_URL}/get_directions`,
            {},
            {
                headers: {
                    'API-LOGIN': config.EXCHANGE_API_LOGIN,
                    'API-KEY': config.EXCHANGE_API_KEY,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        console.log(`[ExchangeService] /get_directions status: ${response.status}`);
        if (response.status === 200 && response.data) {
            console.log('[ExchangeService] Available currencies:', response.data);
            return response.data;
        }
        return null;
    } catch (error) {
        console.error('[ExchangeService] Error fetching currencies:', error.message);
        return null;
    }
}

/**
 * Handles the /USDT_RUB command logic.
 * @param {object} bot - The Telegram bot instance.
 * @param {number} chatId - The chat ID.
 * @param {number|null} amount - The amount provided by the user, or null.
 * @param {string|null} commissionString - Optional commission string (e.g., "+1%", "-0.5%").
 */
async function handleUsdtRubCommand(bot, chatId, amount, commissionString = null) {
    try {
        let responseText;
        const rateDetails = await fetchDirectionDetails(config.USDT_RUB_DIRECTION_ID);

        if (!rateDetails || !(rateDetails.rate > 0)) {
            console.error('[ExchangeService] handleUsdtRubCommand: Failed to fetch or invalid live USDT_RUB rate.');
            bot.sendMessage(chatId, 'Не удалось получить актуальный курс USDT/RUB. Пожалуйста, проверьте позже.');
            return;
        }

        const liveRate = rateDetails.rate; // RUB per USDT
        const commissionFactor = parseCommission(commissionString);
        const adjustedRate = liveRate * commissionFactor;
        const commissionPercent = (commissionFactor - 1) * 100;
        const commissionSign = commissionPercent >= 0 ? '+' : '';
        const commissionDisplay = commissionString ? ` ${commissionSign}${commissionPercent.toFixed(2)}%` : '';

        console.log(`[ExchangeService] USDT_RUB: LiveRate=${liveRate}, CommissionFactor=${commissionFactor}, AdjustedRate=${adjustedRate}, Amount=${amount}`);

        if (amount === null) {
            // Just show the current rate, including commission adjustment if provided
            responseText = `*USDT → RUB*\n\n` +
                          ``;
            if (commissionDisplay) {
                 responseText += `Курс с учетом ${commissionDisplay}: *1 USDT ≈ ${adjustedRate.toFixed(2)} RUB*`;
            } else {
                 responseText += `Текущий курс: *1 USDT ≈ ${liveRate.toFixed(2)} RUB*`;
            }
        } else {
             // Validate amount
            if (amount <= 0) {
                bot.sendMessage(chatId, 'Пожалуйста, укажите положительную сумму. Пример: `/USDT_RUB 100` или `/USDT_RUB 100 +1%`');
                return;
            }

            // Calculate final amount: amount * adjustedRate
            const finalAmount = amount * adjustedRate;
            console.log(`[ExchangeService] USDT_RUB Calculation: ${amount} USDT * ${adjustedRate.toFixed(4)} (Adjusted Rate) = ${finalAmount.toFixed(2)} RUB`);

            responseText = `*Конвертация USDT → RUB*\n\n` +
                           `Отдаете: ${amount.toFixed(2)} USDT\n` +
                           `Курс: 1 USDT ≈ ${liveRate.toFixed(2)} RUB${commissionDisplay ? ` (${commissionSign}${commissionPercent.toFixed(2)}%) ≈ *${adjustedRate.toFixed(2)} RUB*` : ''}\n` +
                           `Получаете: *${finalAmount.toFixed(2)} RUB*\n\n` +
                           `_Расчет актуален на момент запроса._`;
        }
        bot.sendMessage(chatId, responseText, { parse_mode: 'Markdown' });

    } catch (error) {
        console.error('[ExchangeService] Error in handleUsdtRubCommand:', error);
        bot.sendMessage(chatId, 'Произошла внутренняя ошибка при обработке команды USDT_RUB. Попробуйте позже.');
    }
}

/**
 * Handles the /RUB_USDT command logic.
 * @param {object} bot - The Telegram bot instance.
 * @param {number} chatId - The chat ID.
 * @param {number|null} amount - The amount provided by the user, or null.
 * @param {string|null} commissionString - Optional commission string (e.g., "+1%", "-0.5%").
 */
async function handleRubUsdtCommand(bot, chatId, amount, commissionString = null) {
     try {
        let responseText;
        const rateDetails = await fetchDirectionDetails(config.RUB_USDT_DIRECTION_ID);

        if (!rateDetails || !(rateDetails.rate > 0)) {
            console.error('[ExchangeService] handleRubUsdtCommand: Failed to fetch or invalid live RUB_USDT rate.');
            bot.sendMessage(chatId, 'Не удалось получить актуальный курс обмена. Попробуйте позже.');
            return;
        }

        const liveRate = rateDetails.rate; // RUB per USDT
        const commissionFactor = parseCommission(commissionString);
        const adjustedRate = liveRate * commissionFactor; // Adjusted RUB per USDT
        const commissionPercent = (commissionFactor - 1) * 100;
        const commissionSign = commissionPercent >= 0 ? '+' : '';
        const commissionDisplay = commissionString ? ` ${commissionSign}${commissionPercent.toFixed(2)}%` : '';

        console.log(`[ExchangeService] RUB_USDT: LiveRate=${liveRate}, CommissionFactor=${commissionFactor}, AdjustedRate=${adjustedRate}, Amount=${amount}`);

        if (amount === null) {
             // Just show the current rate, including commission adjustment if provided
            responseText = `*RUB → USDT*\n\n` +
                          ``;
            if (commissionDisplay) {
                 responseText += `Курс с учетом ${commissionDisplay}: *1 USDT ≈ ${adjustedRate.toFixed(2)} RUB*`;
            } else {
                 responseText += `Текущий курс: *1 USDT ≈ ${liveRate.toFixed(2)} RUB*`;
            }
        } else {
            // Validate amount
            if (amount <= 0) {
                bot.sendMessage(chatId, 'Пожалуйста, укажите положительную сумму. Пример: `/RUB_USDT 10000` или `/RUB_USDT 10000 -0.5%`');
                return;
            }

            // Calculate final amount: amount / adjustedRate
            if (adjustedRate <= 0) {
                 console.error(`[ExchangeService] RUB_USDT Calculation Error: Adjusted rate is zero or negative (${adjustedRate}). Cannot divide.`);
                 bot.sendMessage(chatId, 'Не удалось рассчитать обмен из-за некорректного курса. Попробуйте позже.');
                 return;
            }
            const finalAmount = amount / adjustedRate;
            console.log(`[ExchangeService] RUB_USDT Calculation: ${amount} RUB / ${adjustedRate.toFixed(4)} (Adjusted Rate) = ${finalAmount.toFixed(6)} USDT`);


            responseText = `*Конвертация RUB → USDT*\n\n` +
                           `Отдаете: ${amount.toFixed(2)} RUB\n` +
                           `Курс: 1 USDT ≈ ${liveRate.toFixed(2)} RUB${commissionDisplay ? ` (${commissionSign}${commissionPercent.toFixed(2)}%) ≈ *${adjustedRate.toFixed(2)} RUB*` : ''}\n` +
                           `Получаете: *${finalAmount.toFixed(2)} USDT*\n\n` + // Show final USDT with 2 decimal places
                           `_Расчет актуален на момент запроса._`;
        }

        bot.sendMessage(chatId, responseText, { parse_mode: 'Markdown' });

    } catch (error) {
        console.error('[ExchangeService] Error in handleRubUsdtCommand:', error);
        bot.sendMessage(chatId, 'Произошла внутренняя ошибка при обработке команды RUB_USDT. Попробуйте позже.');
    }
}

module.exports = {
    handleUsdtRubCommand,
    handleRubUsdtCommand,
    getDirectionCurrencies // Keep this export
};