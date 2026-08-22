const { createHmac } = require('crypto');
const axios = require('axios');
const { PrismaClient } = require('@prisma/client');

let prisma;
try {
  prisma = new PrismaClient();
} catch (e) {
  prisma = null;
}

/**
 * Trim helper for string inputs
 */
function trim(value) {
  if (typeof value === 'string') return value.trim();
  return value;
}

/**
 * Helper to format Date to YYYYMMDDHHmmss string
 */
function formatReqTime(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const min = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}${hh}${min}${ss}`;
}

/**
 * Official PayWayClient class for ABA PayWay Gateway Integration
 */
class PayWayClient {
  /**
   * @param {string} [base_url] 
   * @param {string} [merchant_id] 
   * @param {string} [api_key] 
   * @param {Function} [client_factory] 
   */
  constructor(base_url, merchant_id, api_key, client_factory) {
    let rawUrl = base_url || process.env.ABA_PAYWAY_API_URL || 'https://checkout-sandbox.payway.com.kh';
    if (rawUrl && rawUrl.includes('/api/')) {
      rawUrl = rawUrl.split('/api/')[0];
    }
    this.base_url = rawUrl.replace(/\/+$/, '');
    this.merchant_id = merchant_id || process.env.ABA_PAYWAY_MERCHANT_ID || 'ec477410';
    this.api_key = api_key || process.env.ABA_PAYWAY_API_KEY || '80cb36f0ebc28ba5f33eef0f030404bdf13e0ac2';

    // Aliases for camelCase compatibility
    this.baseUrl = this.base_url;
    this.merchantId = this.merchant_id;
    this.apiKey = this.api_key;
    this.returnUrl = process.env.ABA_PAYWAY_RETURN_URL || 'http://localhost:5173/wallet/topup/success';
    this.cancelUrl = process.env.ABA_PAYWAY_CANCEL_URL || 'http://localhost:5173/wallet/topup/cancel';

    if (typeof client_factory === 'function') {
      this._client = client_factory(this);
    } else {
      this._client = axios.create({
        baseURL: this.base_url,
        timeout: 10000
      });
    }
  }

  /**
   * Create HMAC SHA-512 Base64 signature hash from string values array
   * @param {string[]} values 
   * @returns {string}
   */
  create_hash(values) {
    const data = values.map(v => (v !== undefined && v !== null ? String(v) : '')).join('');
    return createHmac('sha512', this.api_key)
      .update(data, 'utf8')
      .digest('base64');
  }

  /**
   * Create payload with req_time, merchant_id, body entries and HMAC hash
   */
  create_payload(body = {}, date = new Date()) {
    const cleanBody = Object.fromEntries(
      Object.entries(body).filter(([_, v]) => v != null && v !== '')
    );

    const req_time = formatReqTime(date);
    const merchant_id = this.merchant_id;

    const hashValues = [
      req_time,
      merchant_id,
      ...Object.values(cleanBody)
    ];

    const hash = this.create_hash(hashValues);

    const payloadObj = {
      req_time,
      merchant_id,
      ...cleanBody,
      hash
    };

    const formData = new URLSearchParams();
    for (const [key, value] of Object.entries(payloadObj)) {
      formData.append(key, value);
    }

    return { payloadObj, formData, hash, req_time };
  }

  /**
   * Helper amount validator
   */
  validateAmount(amount, currency = 'USD') {
    if (amount === undefined || amount === null || amount === '') {
      throw new Error('Amount is required');
    }
    const cleanStr = String(amount).replace(/[\$,\s]/g, '');
    const parsedNum = parseFloat(cleanStr);
    if (isNaN(parsedNum) || !isFinite(parsedNum) || parsedNum <= 0) {
      throw new Error('Invalid transaction amount');
    }
    const normCurrency = String(currency).toUpperCase();
    if (!['USD', 'KHR'].includes(normCurrency)) {
      throw new Error('Unsupported currency. Must be USD or KHR');
    }
    const cents = Math.round(parsedNum * 100);
    return {
      formattedAmount: (cents / 100).toFixed(2),
      numericAmount: cents / 100,
      currency: normCurrency
    };
  }

  getReqTime() {
    return formatReqTime(new Date());
  }

  generateTransactionId() {
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `TX${Date.now()}${rand}`;
  }

  generateSignature(params) {
    const {
      req_time = this.getReqTime(),
      merchant_id = this.merchant_id,
      tran_id,
      amount,
      firstname = '',
      lastname = '',
      email = '',
      phone = '',
      type = 'purchase',
      payment_option = '',
      return_url = '',
      cancel_url = '',
      continue_success_url = '',
      return_params = ''
    } = params;

    const hashString = [
      req_time,
      merchant_id,
      tran_id,
      amount,
      firstname,
      lastname,
      email,
      phone,
      type,
      payment_option,
      return_url,
      cancel_url,
      continue_success_url,
      return_params
    ];

    return this.create_hash(hashString);
  }

  /**
   * Helper to format UTC timestamp YYYYMMDDHHmmss for Check Transaction API
   */
  utcTimestamp() {
    return new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  }

  /**
   * Build complete Purchase API payload with HMAC-SHA512 hash over all fields
   */
  create_purchase_payload({
    tran_id,
    amount,
    currency = 'USD',
    firstname = 'Customer',
    lastname = 'User',
    email = '',
    phone = '012345678',
    payment_option = '',
    return_url,
    cancel_url,
    continue_success_url,
    return_deeplink,
    items = '',
    shipping = '0',
    type = '',
    custom_fields = '',
    return_params = '',
    payout = '',
    lifetime = '30',
    additional_params = '',
    google_pay_token = '',
    skip_success_page = '0'
  }) {
    const req_time = Math.floor(Date.now() / 1000).toString();
    const fields = {
      req_time,
      merchant_id: this.merchant_id,
      tran_id,
      amount,
      items: typeof items === 'object' ? Buffer.from(JSON.stringify(items)).toString('base64') : (items || ''),
      shipping: String(shipping),
      firstname: trim(firstname) || 'Customer',
      lastname: trim(lastname) || 'User',
      email: trim(email) || '',
      phone: trim(phone) || '012345678',
      type: type || '',
      payment_option: payment_option || '',
      return_url: return_url || this.returnUrl,
      cancel_url: cancel_url || this.cancelUrl,
      continue_success_url: continue_success_url || '',
      return_deeplink: return_deeplink || '',
      currency: currency || 'USD',
      custom_fields: custom_fields || '',
      return_params: return_params || '',
      payout: payout || '',
      lifetime: lifetime || '30',
      additional_params: additional_params || '',
      google_pay_token: google_pay_token || '',
      skip_success_page: String(skip_success_page)
    };

    const stringToHash = Object.values(fields).join('');
    const hash = createHmac('sha512', this.api_key)
      .update(stringToHash, 'utf8')
      .digest('base64');

    const formData = new URLSearchParams({ ...fields, hash });
    return { fields, hash, formData, req_time };
  }

  /**
   * Create Transaction
   */
  async create_transaction({
    tran_id,
    payment_option = 'abapay_deeplink',
    amount,
    currency = 'USD',
    return_url,
    return_deeplink,
    continue_success_url,
    pwt,
    firstname = 'Customer',
    lastname = 'User',
    email = '',
    phone = '012345678',
    userId = null,
    orderId = null
  } = {}) {
    const finalTranId = tran_id || this.generateTransactionId();
    const { formattedAmount, numericAmount, currency: validCurrency } = this.validateAmount(amount, currency);

    const { fields, formData, hash, req_time } = this.create_purchase_payload({
      tran_id: finalTranId,
      amount: formattedAmount,
      currency: validCurrency,
      firstname,
      lastname,
      email,
      phone,
      payment_option,
      return_url,
      continue_success_url: continue_success_url || `${this.returnUrl}?tran_id=${finalTranId}`,
      return_deeplink
    });

    let paymentRecord = null;
    if (prisma && userId) {
      paymentRecord = await prisma.payment.create({
        data: {
          userId,
          orderId: orderId || null,
          amount: numericAmount,
          currency: validCurrency,
          paymentMethod: 'ABA_PAYWAY',
          transactionId: finalTranId,
          merchantTransactionId: finalTranId,
          md5Sig: hash,
          status: 'PENDING',
          paymentUrl: `${this.base_url}/api/payment-gateway/v1/payments/purchase`,
          expiresAt: new Date(Date.now() + 15 * 60 * 1000)
        }
      });
    }

    let apiResponse = null;
    try {
      const response = await this._client.post(
        '/api/payment-gateway/v1/payments/purchase',
        formData,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );
      apiResponse = response.data;
    } catch (err) {
      console.warn('[PayWayClient create_transaction API Notice]:', err.response?.data || err.message);
    }

    return {
      success: true,
      paymentId: paymentRecord?.id || null,
      tran_id: finalTranId,
      transactionId: finalTranId,
      amount: formattedAmount,
      numericAmount,
      currency: validCurrency,
      merchant_id: this.merchant_id,
      merchantId: this.merchant_id,
      req_time,
      reqTime: req_time,
      hash,
      fields,
      payment_option,
      firstname: fields.firstname,
      lastname: fields.lastname,
      email: fields.email,
      phone: fields.phone,
      return_url: fields.return_url,
      continue_success_url: fields.continue_success_url,
      paymentUrl: `${this.base_url}/api/payment-gateway/v1/payments/purchase`,
      directPayLink: process.env.ABA_PAYWAY_DIRECT_LINK || 'https://link.payway.com.kh/ABAPAY3z4941814',
      apiResponse
    };
  }

  /**
   * Check Transaction Status
   */
  async check_transaction(tran_id) {
    if (!tran_id) throw new Error('Transaction ID (tran_id) is required');

    const req_time = this.utcTimestamp();
    const stringToHash = `${req_time}${this.merchant_id}${tran_id}`;
    const hash = createHmac('sha512', this.api_key)
      .update(stringToHash, 'utf8')
      .digest('base64');

    const formData = new URLSearchParams({
      req_time,
      merchant_id: this.merchant_id,
      tran_id,
      hash
    });

    try {
      const response = await this._client.post(
        '/api/payment-gateway/v1/payments/check-transaction-2',
        formData,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );
      return response.data;
    } catch (err) {
      try {
        const fallbackRes = await this._client.post(
          '/api/payment-gateway/v1/payments/check-transaction',
          formData,
          { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );
        return fallbackRes.data;
      } catch (err2) {
        console.error('[PayWayClient check_transaction Error]:', err2.response?.data || err2.message);
        return {
          status: {
            code: 500,
            message: err2.message,
            tran_id
          }
        };
      }
    }
  }

  /**
   * Request Dynamic ABA KHQR Code via PayWay API
   */
  async generate_khqr({
    tran_id,
    amount,
    currency = 'USD',
    firstname = 'Customer',
    lastname = 'User',
    email = '',
    phone = '012345678'
  } = {}) {
    const finalTranId = tran_id || this.generateTransactionId();
    const { formattedAmount } = this.validateAmount(amount, currency);
    const req_time = this.getReqTime();

    const hashString = req_time + this.merchant_id + finalTranId + formattedAmount;
    const hash = createHmac('sha512', this.api_key).update(hashString, 'utf8').digest('base64');

    const payload = {
      req_time,
      merchant_id: this.merchant_id,
      tran_id: finalTranId,
      amount: formattedAmount,
      firstname: trim(firstname),
      lastname: trim(lastname),
      email: trim(email),
      phone: trim(phone),
      currency,
      hash
    };

    const formData = new URLSearchParams();
    for (const [key, value] of Object.entries(payload)) {
      formData.append(key, value);
    }

    const qrEndpoint = `${this.base_url}/api/payment-gateway/v1/payments/generate-qr`;

    try {
      const response = await this._client.post(qrEndpoint, formData, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });

      if (response.data && (response.data.status === 0 || response.data.status?.code === 0)) {
        const qrString = response.data.qr_string || response.data.qr_data || response.data.qr;
        let qrImage = response.data.qr_image;
        if (qrImage && !qrImage.startsWith('data:image')) {
          qrImage = `data:image/png;base64,${qrImage}`;
        }
        return {
          success: true,
          tran_id: finalTranId,
          transactionId: finalTranId,
          qrData: qrString,
          qrImage: qrImage,
          deeplink: `abapay://khqr?qr=${encodeURIComponent(qrString)}`,
          pw_tran_id: response.data.pw_tran_id,
          amount: formattedAmount,
          currency
        };
      }
    } catch (err) {
      console.warn('[PayWayClient generate_khqr API Notice]:', err.response?.data || err.message);
    }

    const { generateBakongKHQRString, generateQRCodeImage } = require('../utils/bakongKhqr');
    const merchantIdVal = this.merchant_id || '10364036';
    const accountIdVal = process.env.BAKONG_ACCOUNT_ID || 'dara_mao1@bkrt';
    const qrData = generateBakongKHQRString({
      merchantId: merchantIdVal,
      accountId: accountIdVal,
      merchantName: process.env.BAKONG_MERCHANT_NAME || 'ABA PayWay Cinema',
      merchantCity: process.env.BAKONG_MERCHANT_CITY || 'Phnom Penh',
      amount: formattedAmount,
      currency: currency,
      transactionId: finalTranId
    });
    const qrImage = await generateQRCodeImage(qrData);

    return {
      success: true,
      tran_id: finalTranId,
      transactionId: finalTranId,
      qrData,
      qrImage,
      pw_tran_id: `PW_${finalTranId}`,
      amount: formattedAmount,
      currency
    };
  }

  /**
   * Transaction List
   */
  async transaction_list({
    from_date,
    to_date,
    from_amount,
    to_amount,
    status = 'ALL',
    search = '',
    limit = 50,
    offset = 0
  } = {}) {
    let apiData = null;
    try {
      const { formData } = this.create_payload({
        from_date,
        to_date,
        from_amount,
        to_amount,
        status: status !== 'ALL' ? status : undefined
      });

      const response = await this._client.post(
        '/api/payment-gateway/v1/payments/transaction-list',
        formData,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );
      apiData = response.data;
    } catch (err) {
      console.warn('[PayWayClient transaction_list API notice]:', err.response?.data || err.message);
    }

    if (!prisma) {
      return apiData || { success: false, data: [] };
    }

    const where = {};
    if (status && status !== 'ALL') {
      where.status = status;
    }
    if (search) {
      where.OR = [
        { transactionId: { contains: search } },
        { merchantTransactionId: { contains: search } },
        { user: { email: { contains: search } } },
        { user: { name: { contains: search } } }
      ];
    }

    const [transactions, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true } },
          order: true
        },
        orderBy: { createdAt: 'desc' },
        take: Number(limit),
        skip: Number(offset)
      }),
      prisma.payment.count({ where })
    ]);

    return {
      success: true,
      data: transactions,
      total,
      apiData,
      filter: { status, search, limit, offset, from_date, to_date }
    };
  }

  /**
   * Alias method list_transaction for compatibility
   */
  async list_transaction(options) {
    return this.transaction_list(options);
  }
}

exports.trim = trim;
exports.PayWayClient = PayWayClient;
exports.paywayClient = new PayWayClient();
