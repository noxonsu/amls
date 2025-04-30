// amlService.js
const axios = require('axios');
const config = require('./config'); // Import shared configuration

/**
 * Validates a cryptocurrency wallet address (TRON or BTC).
 * @param {string|undefined} address - The address string to validate.
 * @returns {{isValid: boolean, type: string|null, error: string|null, blockchain: string|null, address: string|null}} Validation result.
 */
function validateWalletAddress(address) {
    if (!address || typeof address !== 'string') {
        return { isValid: false, type: null, error: 'Адрес не указан или имеет неверный формат.', blockchain: null, address: null };
    }

    const trimmedAddress = address.trim();

    // Check TRON
    const tronValidation = config.WALLET_VALIDATION.TRON;
    if (trimmedAddress.startsWith('T')) {
        if (trimmedAddress.length !== tronValidation.length) {
            return { isValid: false, type: null, error: `TRON адрес должен содержать ${tronValidation.length} символов.`, blockchain: null, address: trimmedAddress };
        }
        if (tronValidation.pattern.test(trimmedAddress)) {
            return { isValid: true, type: 'tron', error: null, blockchain: tronValidation.blockchainType, address: trimmedAddress };
        }
    }

    // Check Bitcoin
    const btcValidation = config.WALLET_VALIDATION.BTC;
    if (trimmedAddress.startsWith('1') || trimmedAddress.startsWith('3') || trimmedAddress.startsWith('bc1')) {
         if (trimmedAddress.length < btcValidation.minLength || trimmedAddress.length > btcValidation.maxLength) {
             return { isValid: false, type: null, error: `Bitcoin адрес должен содержать от ${btcValidation.minLength} до ${btcValidation.maxLength} символов.`, blockchain: null, address: trimmedAddress };
         }
        if (btcValidation.pattern.test(trimmedAddress)) {
            return { isValid: true, type: 'btc', error: null, blockchain: btcValidation.blockchainType, address: trimmedAddress };
        }
    }

    // If none matched
    return {
        isValid: false,
        type: null,
        error: 'Неверный формат адреса. Поддерживаются:\n' +
               `• TRON адреса (начинаются с T, ${tronValidation.length} символов)\n` +
               `• Bitcoin адреса (начинаются с 1, 3 или bc1, ${btcValidation.minLength}-${btcValidation.maxLength} символов)`,
        blockchain: null,
        address: trimmedAddress
    };
}

/**
 * Fetches the list of existing AML reports and finds one matching the address.
 * @param {string} walletAddress - The wallet address to search for.
 * @returns {Promise<object|null>} - The found report object or null if not found/error.
 */
async function getExistingReport(walletAddress) {
    console.log(`[AMLService] Checking existing reports for address: ${walletAddress}`);
    try {
        const headers = {
            'Accept': 'application/json',
            'Authorization': `Bearer ${config.AML_API_KEY.trim()}`
        };
        const response = await axios.get(config.AML_BASE_URL, { headers }); // Use base URL for listing

        if (response.status === 200) {
            const reports = response.data?.data || [];
            const foundReport = reports.find(report => report.address === walletAddress);
            if (foundReport) {
                console.log(`[AMLService] Found existing report for ${walletAddress}`);
                return foundReport;
            }
        } else {
            console.error(`[AMLService] Failed to fetch AML reports list during check: Status ${response.status}`);
        }
    } catch (error) {
        console.error(`[AMLService] Error fetching AML reports list during check for ${walletAddress}:`, error.message);
        // Don't throw, allow the check process to continue (it might create a new one)
    }
    console.log(`[AMLService] No existing report found for ${walletAddress} in the list.`);
    return null;
}

/**
 * Creates a new AML check request.
 * @param {string} walletAddress - The valid wallet address.
 * @param {string} blockchainType - The blockchain type ('tron' or 'btc').
 * @returns {Promise<object|null>} - The API response data or null on error.
 */
async function createAmlCheck(walletAddress, blockchainType) {
    console.log(`[AMLService] Creating NEW AML check request for address: ${walletAddress}, blockchain: ${blockchainType}`);
    try {
        const requestData = {
            address: walletAddress,
            blockchain: blockchainType
        };
        const headers = {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.AML_API_KEY.trim()}`
        };
        const response = await axios.post(config.AML_CHECK_URL, requestData, { headers });

        if (response.status === 200 || response.status === 201) {
            console.log(`[AMLService] AML check creation successful (Status: ${response.status})`);
            return response.data?.data || response.data; // Return the core data part if nested
        } else {
            // This part might not be reached if axios throws for non-2xx, but good practice
            console.error(`[AMLService] AML check POST unexpected status: ${response.status} for address ${walletAddress}`);
            return null; // Indicate failure
        }

    } catch (error) {
         console.error(`[AMLService] Error creating AML check for ${walletAddress}:`, error.message);
         // Re-throw or return specific error info if needed by the caller
         // For now, just return null to indicate failure
        if (error.response) {
            console.error('API Error Status:', error.response.status);
            console.error('API Error Data:', JSON.stringify(error.response.data));
        }
        return null;
    }
}

/**
 * Formats the AML report data into a user-friendly HTML message.
 * @param {object|null} reportData - The report data from the API or cache.
 * @param {string} walletAddress - The wallet address being checked.
 * @returns {{text: string, options: object}} - Message text and parse options.
 */
function formatReportMessage(reportData, walletAddress) {
    if (!reportData) {
        // This case should ideally be handled before calling formatReportMessage
        return {
            text: `Не удалось получить/обработать данные для адреса <code>${walletAddress}</code>.`,
            options: { parse_mode: 'HTML' }
        };
    }

    // Normalize access, assuming data might be nested under 'data' or be direct
    const data = reportData.data || reportData;
    const context = data.context || {};
    const riskScore = context.riskScore ?? 'N/A'; // Use nullish coalescing
    const entities = context.entities || [];

    let entityDetails = '';
    if (entities.length > 0) {
        entityDetails = '\n\n<b>Обнаруженные риски:</b>\n';
        entities.forEach(entity => {
            const score = typeof entity.riskScore === 'number' ? entity.riskScore.toFixed(3) : 'N/A';
            const level = entity.level || 'N/A'; // Level might indicate severity
             // Ensure entity name exists, provide fallback
            const entityName = entity.entity || 'Неизвестный источник';
            entityDetails += `• ${entityName}: ${score} (${level})\n`;
        });
    } else if (riskScore !== 'N/A') {
        // Only add this if we have a score but no specific entities
        entityDetails = '\n\nДетали по источникам риска не предоставлены.';
    } else {
        // Case where riskScore is N/A and no entities
         entityDetails = '\n\nДанные по риску отсутствуют.';
    }

    const status = data.status ? `Статус: ${data.status}\n` : '';

    return {
        text: `<b>AML Проверка кошелька</b>\n` +
              `Адрес: <code>${walletAddress}</code>\n` +
               status + // Include status if available
              `Итоговый риск: <b>${riskScore}</b>${entityDetails}`,
        options: { parse_mode: 'HTML' }
    };
}

/**
 * Fetches the list of AML reports from the API.
 * @returns {Promise<Array|null>} An array of reports or null on error.
 */
async function fetchAmlReportsList() {
    console.log('[AMLService] Fetching AML reports list...');
     try {
        const headers = {
            'Accept': 'application/json',
            'Authorization': `Bearer ${config.AML_API_KEY.trim()}`
        };
        const response = await axios.get(config.AML_BASE_URL, { headers }); // List endpoint

        if (response.status === 200) {
            const reports = response.data?.data || [];
            console.log(`[AMLService] Successfully fetched ${reports.length} reports.`);
            return reports;
        } else {
            console.error(`[AMLService] Failed to fetch AML reports list: Status ${response.status}`);
            return null;
        }
    } catch (error) {
        console.error('[AMLService] Error fetching AML reports list:', error.message);
         if (error.response) {
             console.error('API Error Status:', error.response.status);
             console.error('API Error Data:', JSON.stringify(error.response.data));
         }
        return null;
    }
}

/**
 * Handles the /aml command logic.
 * @param {object} bot - The Telegram bot instance.
 * @param {number} chatId - The chat ID.
 * @param {string|undefined} walletAddressArg - The raw address argument from the user.
 */
async function handleAmlCommand(bot, chatId, walletAddressArg) {
     // 1. Validate Address
     const validation = validateWalletAddress(walletAddressArg);
     const { isValid, error, address: validatedAddress, blockchain } = validation;

     if (!walletAddressArg) {
        // Send usage instructions if no address provided
        const tronExample = config.WALLET_VALIDATION.TRON.example;
        const btcExample = config.WALLET_VALIDATION.BTC.example;

        // Use a single template literal for the whole message
        const messageText = `Пожалуйста, укажите адрес кошелька (TRON или Bitcoin) после команды /aml.

Примеры:
• \`/aml ${tronExample}\`
• \`/aml ${btcExample}\``;

        bot.sendMessage(chatId, messageText, { parse_mode: 'Markdown' });
        return;
     }

     if (!isValid) {
         bot.sendMessage(chatId, `❌ ${error || 'Неверный формат адреса.'}`);
         return;
     }

     let processingMsg = null; // To store the "processing" message object
     try {
         // 2. Check for Existing Report
         const existingReport = await getExistingReport(validatedAddress);
         if (existingReport) {
             console.log(`[AMLService] Found existing report for ${validatedAddress}. Formatting and sending.`);
             const { text, options } = formatReportMessage(existingReport, validatedAddress);
             bot.sendMessage(chatId, text, options);
             return; // Done
         }

         // 3. Create New Report if not found
         console.log(`[AMLService] No existing report for ${validatedAddress}. Creating a new check.`);
          processingMsg = await bot.sendMessage(
             chatId,
             `🔍 Запрашиваю новый AML отчет для адреса <code>${validatedAddress}</code>...`,
             { parse_mode: 'HTML' }
         );

         const newReportData = await createAmlCheck(validatedAddress, blockchain);

         if (!newReportData) {
            // Error occurred during creation (already logged in createAmlCheck)
            throw new Error('Failed to create AML check request.'); // Throw to be caught by generic handler
         }

         let status = newReportData.status;
         console.log(`[AMLService] New check request status: ${status}`);

         // 4. Handle Pending Status
         if (status === 'pending') {
             await bot.editMessageText(
                 `⏳ Статус проверки AML: ${status}. Ожидаю результат (${config.AML_PENDING_CHECK_DELAY_MS / 1000} сек)...`,
                 {
                     chat_id: chatId,
                     message_id: processingMsg.message_id,
                     parse_mode: 'HTML'
                 }
             );

             await new Promise(resolve => setTimeout(resolve, config.AML_PENDING_CHECK_DELAY_MS));

             await bot.editMessageText(
                 `🔄 Проверяю обновленный статус для <code>${validatedAddress}</code>...`,
                 {
                     chat_id: chatId,
                     message_id: processingMsg.message_id,
                     parse_mode: 'HTML'
                 }
             );

             // Check the list *again* after waiting
             const updatedReport = await getExistingReport(validatedAddress);

             if (updatedReport) {
                 console.log(`[AMLService] Found updated report for ${validatedAddress} after delay.`);
                 const { text, options } = formatReportMessage(updatedReport, validatedAddress);
                  // Delete the processing message before sending the final result
                 await bot.deleteMessage(chatId, processingMsg.message_id).catch(err => console.error('Error deleting message:', err));
                 processingMsg = null; // Avoid deleting again in finally block
                 bot.sendMessage(chatId, text, options);
             } else {
                 console.log(`[AMLService] Report for ${validatedAddress} still not found after delay.`);
                 // Report might still be processing or failed silently on the backend
                 await bot.editMessageText(
                    `🕒 Отчет для <code>${validatedAddress}</code> все еще обрабатывается или не найден. ` +
                    `Пожалуйста, попробуйте команду \`/aml ${validatedAddress}\` через несколько минут для получения результатов.`,
                     {
                         chat_id: chatId,
                         message_id: processingMsg.message_id,
                         parse_mode: 'HTML'
                     }
                 );
                  // Don't delete the message here, leave the instruction for the user
                 processingMsg = null;
             }
         } else {
             // 5. Handle Completed Status (or other non-pending)
             console.log(`[AMLService] Check completed immediately (status: ${status}). Formatting report.`);
             const { text, options } = formatReportMessage(newReportData, validatedAddress);
             await bot.deleteMessage(chatId, processingMsg.message_id).catch(err => console.error('Error deleting message:', err));
             processingMsg = null;
             bot.sendMessage(chatId, text, options);
         }

     } catch (error) {
         console.error(`[AMLService] Error in handleAmlCommand for address ${validatedAddress}:`, error);
         // Attempt to delete processing message if it exists and an error occurred
         if (processingMsg) {
             await bot.deleteMessage(chatId, processingMsg.message_id).catch(err => console.error('Error deleting processing message on error:', err));
         }
         // Send a generic error message (specific API errors logged internally)
         bot.sendMessage(chatId, '🚫 Произошла ошибка при проверке кошелька. Пожалуйста, попробуйте позже или проверьте правильность адреса.');
     }
}

/**
 * Handles the /amls command logic.
 * @param {object} bot - The Telegram bot instance.
 * @param {number} chatId - The chat ID.
 */
async function handleAmlsCommand(bot, chatId) {
    try {
        const reports = await fetchAmlReportsList();

        if (reports === null) {
            // Error occurred during fetch (already logged)
            bot.sendMessage(chatId, '🚫 Не удалось получить список AML отчетов. Попробуйте позже.');
            return;
        }

        if (reports.length === 0) {
            bot.sendMessage(chatId, 'ℹ️ Нет доступных AML отчетов в истории.');
            return;
        }

        let responseText = '<b>📋 Список последних AML Отчетов:</b>\n\n';
        // Slice before iterating
        reports.slice(0, config.AML_LIST_LIMIT).forEach((report, index) => {
             // Normalize data access
            const data = report.data || report;
            const address = data.address || 'N/A';
            const riskScore = data.context?.riskScore ?? 'N/A';
            const status = data.status ? ` (${data.status})` : ''; // Add status info
             // Sanitize address for HTML display if needed, though <code> usually handles it
            responseText += `${index + 1}. Адрес: <code>${address}</code> - Риск: ${riskScore}${status}\n`;
        });

        if (reports.length > config.AML_LIST_LIMIT) {
            responseText += `\n<i>(Показаны первые ${config.AML_LIST_LIMIT} из ${reports.length} отчетов)</i>`;
        }

        bot.sendMessage(chatId, responseText, { parse_mode: 'HTML' });

    } catch (error) {
        console.error('[AMLService] Error in handleAmlsCommand:', error);
        bot.sendMessage(chatId, '🚫 Произошла ошибка при получении списка AML отчетов.');
    }
}


module.exports = {
    validateWalletAddress, // May not be needed externally, but keep for now
    handleAmlCommand,
    handleAmlsCommand,
};