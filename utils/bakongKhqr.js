const crypto = require('crypto');
const QRCode = require('qrcode');
const axios = require('axios');
const { BakongKHQR, khqrData, IndividualInfo } = require('bakong-khqr');

/**
 * Calculate standard 32-character MD5 hash of raw EMVCo KHQR string
 * Used by NBC Bakong OpenAPI /check_transaction_by_md5
 */
function calculateKHQRMD5(qrString) {
  if (!qrString) return '';
  return crypto.createHash('md5').update(String(qrString), 'utf8').digest('hex');
}

/**
 * CRC16/CCITT-FALSE Calculation for EMVCo KHQR standard string format
 * Polynomial: 0x1021, Initial: 0xFFFF
 */
function calculateCRC16(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Helper to encode standard EMVCo Tag-Length-Value (TLV)
 */
function formatTag(tag, value) {
  const strVal = String(value);
  const len = String(strVal.length).padStart(2, '0');
  return `${tag}${len}${strVal}`;
}

/**
 * Decode and safely inspect an EMVCo KHQR String (for Debug & Audit)
 */
function decodeKHQR(qrString) {
  const result = {};
  try {
    let idx = 0;
    while (idx < qrString.length - 4) {
      const tag = qrString.substr(idx, 2);
      const len = parseInt(qrString.substr(idx + 2, 2), 10);
      if (isNaN(len) || len <= 0) break;
      const val = qrString.substr(idx + 4, len);
      result[tag] = val;
      idx += 4 + len;
    }
  } catch (err) {
    console.warn('[KHQR DECODER ERROR]', err.message);
  }
  return result;
}

/**
 * Generate NBC Bakong Standard Dynamic KHQR String
 * Conforms 100% to National Bank of Cambodia (NBC) KHQR EMVCo Specifications.
 */
function generateBakongKHQRString({
  accountId = process.env.BAKONG_ACCOUNT_ID || process.env.KHQR_ACCOUNT_ID || process.env.KHQR_CC_ACCOUNT_ID || 'dara_mao1@bkrt',
  merchantName = process.env.BAKONG_MERCHANT_NAME || process.env.KHQR_MERCHANT_NAME || 'KV Digital Cinema',
  merchantCity = process.env.BAKONG_MERCHANT_CITY || process.env.KHQR_MERCHANT_CITY || 'Phnom Penh',
  amount = 0.01,
  currency = process.env.BAKONG_CURRENCY || 'USD',
  transactionId = ''
}) {
  const cleanAccountId = String(accountId).trim();
  const cleanMerchantName = String(merchantName).trim().substring(0, 25);
  const cleanMerchantCity = String(merchantCity).trim().substring(0, 15);
  const isUSD = String(currency).toUpperCase() === 'USD';
  const numAmount = parseFloat(amount) || 0.01;
  const expirationTimestamp = Date.now() + (15 * 60 * 1000); // 15-minute validity

  try {
    const optionalData = {
      currency: isUSD ? khqrData.currency.usd : khqrData.currency.khr,
      amount: numAmount,
      mobileNumber: '85512345678',
      storeLabel: cleanMerchantName,
      terminalLabel: 'Online 01',
      purposeOfTransaction: 'Cinema Payment',
      billNumber: transactionId ? String(transactionId).substring(0, 25) : `TX${Date.now()}`,
      expirationTimestamp
    };

    const individualInfo = new IndividualInfo(
      cleanAccountId,
      cleanMerchantName,
      cleanMerchantCity,
      optionalData
    );

    const khqr = new BakongKHQR();
    const result = khqr.generateIndividual(individualInfo);

    if (result && result.status && result.status.code === 0 && result.data?.qr) {
      console.log(`[PAYMENT CREATED] Generated Official NBC Bakong KHQR for Tx: ${transactionId}, Amount: $${numAmount.toFixed(2)} ${isUSD ? 'USD' : 'KHR'}`);
      return result.data.qr;
    }
  } catch (err) {
    console.warn('[BAKONG SDK ERROR] Fallback to TLV encoder:', err.message);
  }

  // Fallback manual TLV encoding with Tag 99
  const currencyCode = isUSD ? '840' : '116';
  const formattedAmount = isUSD ? Number(amount).toFixed(2) : String(Math.round(amount));
  let tag29Sub = formatTag('00', cleanAccountId);

  let payload = 
    formatTag('00', '01') +
    formatTag('01', '12') +
    formatTag('29', tag29Sub) +
    formatTag('52', '5999') +
    formatTag('53', currencyCode) +
    formatTag('54', formattedAmount) +
    formatTag('58', 'KH') +
    formatTag('59', cleanMerchantName) +
    formatTag('60', cleanMerchantCity);

  if (transactionId) {
    const cleanRef = String(transactionId).substring(0, 25);
    payload += formatTag('62', formatTag('05', cleanRef));
  }

  // Tag 99: Dynamic timestamps (Creation + Expiration)
  const nowTs = String(Date.now());
  const expTs = String(expirationTimestamp);
  const tag99Sub = formatTag('00', nowTs) + formatTag('01', expTs);
  payload += formatTag('99', tag99Sub);

  payload += '6304';
  payload += calculateCRC16(payload);
  return payload;
}

/**
 * Generate High-Resolution QR Image Data URL (Base64 PNG)
 */
async function generateQRCodeImage(qrString) {
  try {
    return await QRCode.toDataURL(qrString, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 400,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
  } catch (err) {
    console.error('[QR GENERATION ERROR]', err.message);
    return null;
  }
}

/**
 * Check NBC Bakong Open API Transaction Status
 * Primary: POST /check_transaction_by_md5 with 32-char MD5 hash
 * Fallback: POST /check_transaction_by_external_ref with transaction/order reference
 */
async function verifyBakongTransaction(md5Hash, externalRef = null) {
  const token = process.env.BAKONG_BEARER_TOKEN || process.env.BAKONG_API_TOKEN;
  const baseUrl = (process.env.BAKONG_API_URL || 'https://api-bakong.nbc.gov.kh/v1').replace(/\/+$/, '');

  if (!token) {
    console.error('[Bakong Config Error] BAKONG_BEARER_TOKEN is not configured in .env');
    return null;
  }

  const cleanToken = token.trim();
  const cleanMd5 = md5Hash ? String(md5Hash).trim().toLowerCase() : null;
  const cleanRef = externalRef ? String(externalRef).trim() : null;

  // 1. Primary Strategy: Check by MD5 hash
  if (cleanMd5 && cleanMd5.length === 32) {
    try {
      console.log(`[Bakong] Checking transaction status by MD5 (${cleanMd5.substring(0, 8)}...)...`);
      const response = await axios.post(
        `${baseUrl}/check_transaction_by_md5`,
        { md5: cleanMd5 },
        {
          headers: {
            Authorization: `Bearer ${cleanToken}`,
            'Content-Type': 'application/json'
          },
          timeout: 8000
        }
      );

      const resData = response.data;
      const code = resData?.responseCode !== undefined ? resData.responseCode : resData?.errorCode;
      console.log(`[Bakong] API response code: ${code} (${resData?.responseMessage || 'OK'})`);

      if ((code === 0 || code === '0') && resData?.data) {
        console.log(`[Bakong] Confirmed payment! Amount: ${resData.data.amount} ${resData.data.currency || 'USD'}`);
        return {
          verified: true,
          responseCode: 0,
          data: resData.data,
          rawResponse: resData
        };
      }

      if (code === 1 || resData?.responseMessage?.toLowerCase().includes('not found')) {
        // Normal pending state - customer has not completed payment in app yet
        return {
          verified: false,
          responseCode: 1,
          pending: true,
          message: resData?.responseMessage || 'Transaction not found or pending'
        };
      }

      return resData;
    } catch (err) {
      const status = err.response?.status;
      const msg = err.response?.data?.responseMessage || err.message;
      if (status === 401 || status === 403) {
        console.error(`[Bakong Auth Error] HTTP ${status}: Invalid or expired BAKONG_BEARER_TOKEN`);
      } else if (status === 429) {
        console.warn('[Bakong Rate Limit] HTTP 429: Rate limit reached. Backing off.');
      } else {
        console.warn(`[Bakong Check Warning] Status ${status || 'ERR'}: ${msg}`);
      }
    }
  }

  // 2. Secondary Strategy: Check by External Ref / Bill Number
  if (cleanRef) {
    try {
      console.log(`[Bakong] Checking transaction status by externalRef (${cleanRef})...`);
      const response = await axios.post(
        `${baseUrl}/check_transaction_by_external_ref`,
        { externalRef: cleanRef },
        {
          headers: {
            Authorization: `Bearer ${cleanToken}`,
            'Content-Type': 'application/json'
          },
          timeout: 8000
        }
      );

      const resData = response.data;
      const code = resData?.responseCode !== undefined ? resData.responseCode : resData?.errorCode;

      if ((code === 0 || code === '0') && resData?.data) {
        console.log(`[Bakong] Confirmed payment via externalRef! Amount: ${resData.data.amount} ${resData.data.currency || 'USD'}`);
        return {
          verified: true,
          responseCode: 0,
          data: resData.data,
          rawResponse: resData
        };
      }
    } catch (err) {
      // ignore fallback error
    }
  }

  return null;
}

module.exports = {
  generateBakongKHQRString,
  generateQRCodeImage,
  calculateKHQRMD5,
  calculateCRC16,
  decodeKHQR,
  verifyBakongTransaction
};
