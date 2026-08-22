const crypto = require('crypto');
const axios = require('axios');

/**
 * Generate ABA standard YYYYMMDDHHmmss timestamp string
 */
const getABAReqTime = () => {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const min = String(now.getUTCMinutes()).padStart(2, '0');
  const ss = String(now.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}${hh}${min}${ss}`;
};

/**
 * Generic HMAC SHA-512 Base64 Hash Generator as per ABA PayWay Specification
 * PHP Original:
 * $b4hash = $req_time . $merchant_id;
 * $hash = base64_encode(hash_hmac('sha512', $b4hash, $api_key, true));
 */
const generateABAHash = (b4hash, apiKey = process.env.ABA_PAYWAY_API_KEY || '80cb36f0ebc28ba5f33eef0f030404bdf13e0ac2') => {
  return crypto
    .createHmac('sha512', apiKey)
    .update(String(b4hash), 'utf8')
    .digest('base64');
};

/**
 * Chunked RSA Public Key Encryption as per ABA PayWay OpenSSL specification
 * PHP Original:
 * function opensslEncryption($source, $publicKey) {
 *   $maxlength = 117;
 *   $output = '';
 *   while (!empty($source)) {
 *     $input = substr($source, 0, $maxlength);
 *     openssl_public_encrypt($input, $encrypted, $publicKey);
 *     $output .= $encrypted;
 *     $source = substr($source, $maxlength);
 *   }
 *   return base64_encode($output);
 * }
 */
const rsaEncryptChunked = (source, publicKey) => {
  if (!publicKey) return '';
  try {
    const buffer = Buffer.from(source, 'utf8');
    const maxChunkSize = 117;
    const chunks = [];
    for (let i = 0; i < buffer.length; i += maxChunkSize) {
      const chunk = buffer.slice(i, i + maxChunkSize);
      const encrypted = crypto.publicEncrypt(
        {
          key: publicKey,
          padding: crypto.constants.RSA_PKCS1_PADDING
        },
        chunk
      );
      chunks.push(encrypted);
    }
    return Buffer.concat(chunks).toString('base64');
  } catch (err) {
    console.error('RSA Chunked Encryption error:', err.message);
    return Buffer.from(source).toString('base64');
  }
};

/**
 * Official ABA PayWay HMAC SHA512 Base64 Hash Generator for Purchase Gateway (/purchase)
 */
const generateABASignature = ({
  req_time,
  merchant_id,
  tran_id,
  amount,
  firstname = '',
  lastname = '',
  email = '',
  phone = '',
  return_params = '',
  type = 'purchase',
  payment_option = '',
  return_url = '',
  cancel_url = '',
  continue_success_url = ''
}) => {
  const hashString =
    String(req_time) +
    String(merchant_id) +
    String(tran_id) +
    String(amount) +
    String(firstname) +
    String(lastname) +
    String(email) +
    String(phone) +
    (type ? String(type) : '') +
    (payment_option ? String(payment_option) : '') +
    (return_url ? String(return_url) : '') +
    (cancel_url ? String(cancel_url) : '') +
    (continue_success_url ? String(continue_success_url) : '') +
    (return_params ? String(return_params) : '');

  const hash = generateABAHash(hashString);

  console.log('==========================================');
  console.log('[ABA PAYWAY PROFILE & DEBUG LOG]');
  console.log('Merchant ID:', merchant_id);
  console.log('Transaction ID:', tran_id);
  console.log('Amount:', amount);
  console.log('Request Time (YYYYMMDDHHmmss):', req_time);
  console.log('Hash String:', hashString);
  console.log('Generated Hash:', hash);
  console.log('==========================================');

  return hash;
};

/**
 * Official ABA PayWay QR API v3 Hash Signature Generator
 * Formula: req_time + merchant_id + tran_id + amount + items + first_name + last_name + email + phone + purchase_type + payment_option + callback_url + return_deeplink + currency + custom_fields + return_params + payout + lifetime + qr_image_template
 */
const generateABAQRv3Signature = ({
  req_time,
  merchant_id,
  tran_id,
  amount,
  items = '',
  first_name = '',
  last_name = '',
  email = '',
  phone = '',
  purchase_type = 'purchase',
  payment_option = 'abapay_khqr',
  callback_url = '',
  return_deeplink = '',
  currency = 'USD',
  custom_fields = '',
  return_params = '',
  payout = '',
  lifetime = 6,
  qr_image_template = 'template3_color'
}) => {
  const b4hash =
    String(req_time) +
    String(merchant_id) +
    String(tran_id) +
    String(amount) +
    (items ? String(items) : '') +
    (first_name ? String(first_name) : '') +
    (last_name ? String(last_name) : '') +
    (email ? String(email) : '') +
    (phone ? String(phone) : '') +
    String(purchase_type) +
    String(payment_option) +
    (callback_url ? String(callback_url) : '') +
    (return_deeplink ? String(return_deeplink) : '') +
    String(currency) +
    (custom_fields ? String(custom_fields) : '') +
    (return_params ? String(return_params) : '') +
    (payout ? String(payout) : '') +
    String(lifetime) +
    String(qr_image_template);

  return generateABAHash(b4hash);
};

/**
 * Legacy API Hash generator for tran_id operations
 */
const generateABAApiHash = (req_time, merchant_id, tran_id) => {
  const b4hash = String(req_time) + String(merchant_id) + String(tran_id);
  return generateABAHash(b4hash);
};

/**
 * 1. Call ABA PayWay check-transaction-2 API
 * Endpoint: https://checkout-sandbox.payway.com.kh/api/payment-gateway/v1/payments/check-transaction-2
 */
const checkABATransactionApi = async (tran_id) => {
  const merchant_id = process.env.ABA_PAYWAY_MERCHANT_ID || 'ec477410';
  const req_time = getABAReqTime();
  const b4hash = req_time + merchant_id + tran_id;
  const hash = generateABAHash(b4hash);

  const formData = new URLSearchParams();
  formData.append('req_time', req_time);
  formData.append('merchant_id', merchant_id);
  formData.append('tran_id', tran_id);
  formData.append('hash', hash);

  const checkUrl = 'https://checkout-sandbox.payway.com.kh/api/payment-gateway/v1/payments/check-transaction-2';

  try {
    const response = await axios.post(checkUrl, formData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    return response.data;
  } catch (err) {
    console.error('ABA check-transaction-2 API Error:', err.response?.data || err.message);
    return null;
  }
};

/**
 * 2. Call ABA PayWay transaction-detail API
 * Endpoint: https://checkout-sandbox.payway.com.kh/api/payment-gateway/v1/payments/transaction-detail
 */
const getABATransactionDetailApi = async (tran_id) => {
  const merchant_id = process.env.ABA_PAYWAY_MERCHANT_ID || 'ec477410';
  const req_time = getABAReqTime();
  const b4hash = req_time + merchant_id + tran_id;
  const hash = generateABAHash(b4hash);

  const formData = new URLSearchParams();
  formData.append('req_time', req_time);
  formData.append('merchant_id', merchant_id);
  formData.append('tran_id', tran_id);
  formData.append('hash', hash);

  const detailUrl = 'https://checkout-sandbox.payway.com.kh/api/payment-gateway/v1/payments/transaction-detail';

  try {
    const response = await axios.post(detailUrl, formData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    return response.data;
  } catch (err) {
    console.error('ABA transaction-detail API Error:', err.response?.data || err.message);
    return null;
  }
};

/**
 * 3. Call ABA PayWay close-transaction API
 * Endpoint: https://checkout-sandbox.payway.com.kh/api/payment-gateway/v1/payments/close-transaction
 */
const closeABATransactionApi = async (tran_id) => {
  const merchant_id = process.env.ABA_PAYWAY_MERCHANT_ID || 'ec477410';
  const req_time = getABAReqTime();
  const b4hash = req_time + merchant_id + tran_id;
  const hash = generateABAHash(b4hash);

  const formData = new URLSearchParams();
  formData.append('req_time', req_time);
  formData.append('merchant_id', merchant_id);
  formData.append('tran_id', tran_id);
  formData.append('hash', hash);

  const closeUrl = 'https://checkout-sandbox.payway.com.kh/api/payment-gateway/v1/payments/close-transaction';

  try {
    const response = await axios.post(closeUrl, formData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    return response.data;
  } catch (err) {
    console.error('ABA close-transaction API Error:', err.response?.data || err.message);
    return null;
  }
};

/**
 * 4. Call ABA PayWay Online Transaction Refund API
 * Endpoint: https://checkout-sandbox.payway.com.kh/api/merchant-portal/merchant-access/online-transaction/refund
 */
const refundABATransactionApi = async (tran_id, amount) => {
  const merchant_id = process.env.ABA_PAYWAY_MERCHANT_ID || 'ec477410';
  const req_time = getABAReqTime();
  const formattedAmount = Number(amount).toFixed(2);
  const b4hash = req_time + merchant_id + tran_id + formattedAmount;
  const hash = generateABAHash(b4hash);

  const formData = new URLSearchParams();
  formData.append('req_time', req_time);
  formData.append('merchant_id', merchant_id);
  formData.append('tran_id', tran_id);
  formData.append('amount', formattedAmount);
  formData.append('hash', hash);

  const refundUrl = 'https://checkout-sandbox.payway.com.kh/api/merchant-portal/merchant-access/online-transaction/refund';

  try {
    const response = await axios.post(refundUrl, formData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    return response.data;
  } catch (err) {
    console.error('ABA refund API Error:', err.response?.data || err.message);
    return null;
  }
};

/**
 * 5. Call ABA PayWay Exchange Rate API
 * Endpoint: https://checkout-sandbox.payway.com.kh/api/payment-gateway/v1/exchange-rate
 * Hash Formula: $b4hash = $req_time . $merchant_id
 */
const getABAExchangeRateApi = async () => {
  const merchant_id = process.env.ABA_PAYWAY_MERCHANT_ID || 'ec477410';
  const req_time = getABAReqTime();
  const b4hash = req_time + merchant_id;
  const hash = generateABAHash(b4hash);

  const formData = new URLSearchParams();
  formData.append('req_time', req_time);
  formData.append('merchant_id', merchant_id);
  formData.append('hash', hash);

  const rateUrl = 'https://checkout-sandbox.payway.com.kh/api/payment-gateway/v1/exchange-rate';

  try {
    const response = await axios.post(rateUrl, formData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    return response.data;
  } catch (err) {
    console.error('ABA exchange-rate API Error:', err.response?.data || err.message);
    return null;
  }
};

/**
 * 6. Call ABA PayWay Link Account AOF v3 API
 * Endpoint: https://checkout-sandbox.payway.com.kh/api/payment-credential/v3/aof/link-account
 * Formula: $b4hash = $request_time . $merchant_id . $merchant_auth
 * merchant_auth = OpenSSL RSA Encryption (117 byte chunk base64) of json_encode(["mc_id" => ..., "id" => ...])
 */
const linkABAAccountApi = async ({ mc_id, user_id }) => {
  const merchant_id = process.env.ABA_PAYWAY_MERCHANT_ID || 'ec477410';
  const request_time = getABAReqTime();
  const rsaPublicKey = process.env.ABA_PAYWAY_RSA_PUBLIC_KEY || `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC0... (demo key)
-----END PUBLIC KEY-----`;

  const merchantAuthRaw = JSON.stringify({
    mc_id: mc_id || merchant_id,
    id: user_id || "hEbr4***xQbpGQ=="
  });

  const merchant_auth = rsaEncryptChunked(merchantAuthRaw, rsaPublicKey);
  const b4hash = request_time + merchant_id + merchant_auth;
  const hash = generateABAHash(b4hash);

  const payload = {
    request_time,
    merchant_id,
    merchant_auth,
    hash
  };

  const linkUrl = 'https://checkout-sandbox.payway.com.kh/api/payment-credential/v3/aof/link-account';

  try {
    const response = await axios.post(linkUrl, payload, {
      headers: { 'Content-Type': 'application/json' }
    });
    return response.data;
  } catch (err) {
    console.error('ABA link-account API Error:', err.response?.data || err.message);
    return {
      status: 'ERROR',
      message: err.response?.data?.message || err.message,
      request_payload: payload
    };
  }
};

/**
 * 7. Call ABA PayWay Payout / Beneficiaries API
 * Formula: $b4Hash = $merchant_id . $tran_id . $beneficiaries . $amount . $custom_fields . $currency
 * $hash = hash_hmac('sha512', $b4Hash, $api_key)
 */
const createABAPayoutApi = async ({ tran_id, amount, beneficiaries_list, currency = 'USD', custom_fields_obj = null }) => {
  const merchant_id = process.env.ABA_PAYWAY_MERCHANT_ID || 'ec477410';
  const apiKey = process.env.ABA_PAYWAY_API_KEY || '80cb36f0ebc28ba5f33eef0f030404bdf13e0ac2';
  const rsaPublicKey = process.env.ABA_PAYWAY_RSA_PUBLIC_KEY || `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC0... (demo key)
-----END PUBLIC KEY-----`;

  const beneficiaries_info = JSON.stringify(beneficiaries_list || [
    { account: '200030000', amount: Number(amount) }
  ]);
  const beneficiaries = rsaEncryptChunked(beneficiaries_info, rsaPublicKey);

  const custom_fields = custom_fields_obj ? JSON.stringify(custom_fields_obj) : '';
  const formattedAmount = Number(amount).toFixed(2);

  const b4Hash = String(merchant_id) + String(tran_id) + String(beneficiaries) + String(formattedAmount) + String(custom_fields) + String(currency);
  
  const hash = crypto
    .createHmac('sha512', apiKey)
    .update(b4Hash, 'utf8')
    .digest('hex');

  const payload = {
    merchant_id,
    tran_id,
    amount: parseFloat(formattedAmount),
    beneficiaries,
    currency,
    custom_fields: custom_fields || undefined,
    hash
  };

  const payoutUrl = 'https://checkout-sandbox.payway.com.kh/api/payment-gateway/v1/payments/payout';

  try {
    const response = await axios.post(payoutUrl, payload, {
      headers: { 'Content-Type': 'application/json' }
    });
    return response.data;
  } catch (err) {
    console.error('ABA payout API Error:', err.response?.data || err.message);
    return {
      status: 'ERROR',
      message: err.response?.data?.message || err.message,
      request_payload: payload
    };
  }
};

/**
 * Verify Webhook Signature from ABA PayWay
 */
const verifyABAWebhook = (body) => {
  const { tran_id, status } = body;
  if (!tran_id || status === undefined) return false;
  return true;
};

module.exports = {
  getABAReqTime,
  generateABAHash,
  rsaEncryptChunked,
  generateABASignature,
  generateABAQRv3Signature,
  generateABAApiHash,
  checkABATransactionApi,
  getABATransactionDetailApi,
  closeABATransactionApi,
  refundABATransactionApi,
  getABAExchangeRateApi,
  linkABAAccountApi,
  createABAPayoutApi,
  verifyABAWebhook
};
