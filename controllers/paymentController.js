const crypto = require('crypto');
const prisma = require('../utils/prisma');
const abaPaywayService = require('../services/abaPaywayService');
const khqrCcService = require('../services/khqrCcService');
const cutluyService = require('../services/cutluyService');
const { verifyBakongTransaction, calculateKHQRMD5, generateBakongKHQRString, generateQRCodeImage } = require('../utils/bakongKhqr');
const { sendSuccess, sendError } = require('../utils/response');

/**
 * Task 8: POST /api/payments/aba/create
 * Create ABA PayWay Gateway Payment Request
 */
const createABAPayment = async (req, res, next) => {
  try {
    const { amount, currency = 'USD', orderId } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return sendError(res, 'User authentication required', null, 401);
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return sendError(res, 'User account not found. Please log in again.', null, 401);
    }

    const firstname = user.name ? user.name.split(' ')[0] : 'Customer';
    const lastname = user.name && user.name.split(' ').length > 1 ? user.name.split(' ').slice(1).join(' ') : 'User';
    const email = user.email || 'customer@kvcinema.com';

    // Call ABA PayWay Service
    const paymentData = await abaPaywayService.createPayment({
      userId,
      orderId: orderId || null,
      amount,
      currency,
      firstname,
      lastname,
      email,
      phone: '012345678'
    });

    return sendSuccess(res, 'ABA PayWay payment initialized', paymentData);
  } catch (err) {
    if (err.message && err.message.includes('Invalid transaction amount')) {
      console.warn('[PAYMENT VALIDATION NOTICE]', err.message);
      return sendError(res, 'ចំនួនទឹកប្រាក់មិនត្រឹមត្រូវ។ សូមព្យាយាមម្តងទៀត (Invalid transaction amount).', null, 400);
    }
    next(err);
  }
};

/**
 * Create CutLuy KHQR Payment (Official CutLuy Gateway)
 * POST /api/v1/payments/cutluy/create & POST /api/v1/payments/aba/khqr
 */
const createCutLuyPayment = async (req, res, next) => {
  try {
    const { amount, currency = 'USD', orderId, description } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return sendError(res, 'User authentication required', null, 401);
    }

    const result = await cutluyService.createPayment({
      userId,
      orderId: orderId || null,
      amount,
      currency,
      description
    });

    return sendSuccess(res, 'CutLuy KHQR payment generated successfully', result);
  } catch (err) {
    console.error('[CutLuy Create Error]', err.message);
    next(err);
  }
};

/**
 * Backward compatibility: Dynamic ABA KHQR / CutLuy
 */
const createABAKHQR = async (req, res, next) => {
  return createCutLuyPayment(req, res, next);
};

/**
 * Backward compatibility: POST /api/payments/khqr-cc/qr -> CutLuy
 */
const createKhqrCcQR = async (req, res, next) => {
  return createCutLuyPayment(req, res, next);
};

/**
 * Generate Checkout URL for KHQR CC / CutLuy
 */
const createKhqrCcCheckout = async (req, res, next) => {
  try {
    const { amount, currency = 'USD', orderId, remark, successUrl } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return sendError(res, 'User authentication required', null, 401);
    }

    const result = await cutluyService.createPayment({
      userId,
      orderId: orderId || null,
      amount,
      currency,
      description: remark
    });

    return sendSuccess(res, 'CutLuy Checkout initialized', result);
  } catch (err) {
    next(err);
  }
};

/**
 * Webhook: CutLuy Webhook Callback Handler
 * POST /webhooks/cutluy & POST /api/v1/payments/cutluy/webhook
 */
const handleCutLuyWebhook = async (req, res, next) => {
  try {
    const sigHeader = req.get('X-CutLuy-Signature') || req.headers['x-cutluy-signature'] || '';
    const rawBody = req.rawBody || (Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body));
    const event = typeof req.body === 'object' && !Buffer.isBuffer(req.body) ? req.body : JSON.parse(rawBody || '{}');

    console.log('[CutLuy Webhook Received]', event);

    // Verify signature
    const isValid = cutluyService.verifyWebhookSignature(sigHeader, rawBody);
    if (!isValid) {
      console.warn('[CutLuy Webhook Warning] Signature validation failed');
      return res.status(400).send('Invalid signature');
    }

    // Fulfill payment on payment.completed
    if (event.type === 'payment.completed' || event.data?.payment?.status === 'paid' || event.status === 'paid') {
      const paymentData = event.data?.payment || event;
      const refId = paymentData.reference_id || paymentData.id;

      if (refId) {
        await cutluyService.fulfillPayment(refId, paymentData);
      }
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('[CutLuy Webhook Error]', err.message);
    return res.status(400).send(err.message);
  }
};

/**
 * Backward compatibility: KHQR CC Webhook
 */
const handleKhqrCcWebhook = async (req, res, next) => {
  try {
    const result = await khqrCcService.handleCallback(req.body);
    return res.status(200).json(result);
  } catch (err) {
    console.error('[KHQR CC WEBHOOK ERROR]', err.message);
    return res.status(403).send(err.message);
  }
};

/**
 * Unified Payment Status Checker (CutLuy, MD5, Bakong OpenAPI, PayWay)
 * GET /api/v1/payments/status/:transactionId
 */
const checkABAStatus = async (req, res, next) => {
  try {
    const transactionId = 
      req.params.transactionId || 
      req.params.tranId || 
      req.body?.transactionId || 
      req.body?.transaction_id || 
      req.body?.tran_id || 
      req.query?.transactionId || 
      req.query?.tran_id ||
      req.query?.tranId;

    if (!transactionId) {
      return res.status(400).json({ success: false, status: 'ERROR', message: 'Transaction ID required' });
    }

    const payment = await prisma.payment.findFirst({
      where: {
        OR: [
          { transactionId },
          { merchantTransactionId: transactionId }
        ]
      },
      include: {
        user: { include: { wallet: true } },
        order: { include: { orderItems: { include: { product: true } } } }
      }
    });

    if (!payment) {
      return res.status(404).json({ success: false, status: 'NOT_FOUND', message: 'Payment record not found' });
    }

    const now = new Date();

    // 1. If already verified and PAID in DB
    if (payment.status === 'PAID') {
      return res.status(200).json({
        success: true,
        status: 'PAID',
        transactionId: payment.transactionId,
        amount: payment.amount,
        currency: payment.currency,
        orderId: payment.orderId || null,
        paidAt: payment.paidAt,
        message: 'Payment completed successfully'
      });
    }

    // 2. If expired according to DB expiresAt
    if (payment.expiresAt && now > new Date(payment.expiresAt)) {
      if (payment.status === 'PENDING') {
        await prisma.payment.update({
          where: { id: payment.id },
          data: { status: 'EXPIRED' }
        });
      }
      return res.status(200).json({
        success: true,
        status: 'EXPIRED',
        transactionId: payment.transactionId,
        amount: payment.amount,
        currency: payment.currency,
        orderId: payment.orderId || null,
        expiresAt: payment.expiresAt,
        message: 'Payment session has expired'
      });
    }

    if (payment.status === 'FAILED' || payment.status === 'CANCELLED') {
      return res.status(200).json({
        success: true,
        status: payment.status,
        transactionId: payment.transactionId,
        amount: payment.amount,
        currency: payment.currency,
        orderId: payment.orderId || null,
        message: `Payment status: ${payment.status}`
      });
    }

    let isVerifiedPaid = false;
    let providerPayload = null;

    // 3. Check CutLuy Live Payment Status (Priority 1)
    if (payment.paymentMethod === 'CUTLUY_KHQR' || payment.paymentMethod === 'KHQR') {
      const cutluyCheck = await cutluyService.checkPaymentStatus(payment.transactionId);
      if (cutluyCheck) {
        const st = (cutluyCheck.status || '').toLowerCase();
        if (st === 'paid' || st === 'success' || st === 'completed' || cutluyCheck.approved_at) {
          isVerifiedPaid = true;
          providerPayload = cutluyCheck;
          console.log(`[CutLuy Live Checked] Payment ${payment.transactionId} confirmed paid!`);
        }
      }
    }

    // 4. Provider Check: NBC Bakong Open API by MD5 (Priority 2)
    if (!isVerifiedPaid) {
      let md5ToCheck = payment.md5Sig;
      if (!md5ToCheck && payment.qrData) {
        md5ToCheck = calculateKHQRMD5(payment.qrData);
      }

      if (md5ToCheck) {
        const bakongCheck = await verifyBakongTransaction(md5ToCheck);
        if (bakongCheck && (bakongCheck.responseCode === 0 || bakongCheck.errorCode === 0) && bakongCheck.data) {
          const reportedAmount = parseFloat(bakongCheck.data.amount);
          const reportedCurrency = String(bakongCheck.data.currency || 'USD').toUpperCase();
          const expectedCurrency = String(payment.currency || 'USD').toUpperCase();

          if (Math.abs(reportedAmount - payment.amount) <= 0.01 && reportedCurrency === expectedCurrency) {
            isVerifiedPaid = true;
            providerPayload = bakongCheck.data;
            console.log(`[PAYMENT VERIFIED] Real NBC Bakong confirmation for ${transactionId}`);
          }
        }
      }
    }

    // 5. If verified, execute atomic fulfillment
    if (isVerifiedPaid) {
      await cutluyService.fulfillPayment(payment.transactionId, providerPayload);

      return res.status(200).json({
        success: true,
        status: 'PAID',
        transactionId: payment.transactionId,
        amount: payment.amount,
        currency: payment.currency,
        orderId: payment.orderId || null,
        paidAt: new Date(),
        message: 'Payment verified and completed successfully'
      });
    }

    // Still pending: record attempt
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        verificationAttempts: { increment: 1 },
        lastCheckedAt: now
      }
    });

    return res.status(200).json({
      success: true,
      status: 'PENDING',
      transactionId: payment.transactionId,
      amount: payment.amount,
      currency: payment.currency,
      orderId: payment.orderId || null,
      expiresAt: payment.expiresAt,
      message: 'Waiting for payment confirmation'
    });
  } catch (err) {
    console.error('[PAYMENT STATUS CHECK ERROR]', err.message);
    next(err);
  }
};

/**
 * Generate Bakong Dynamic KHQR Code
 * POST /api/v1/payments/bakong/khqr
 */
const createBakongKHQR = async (req, res, next) => {
  return createCutLuyPayment(req, res, next);
};

/**
 * Task 8 & Task 5: POST /api/payments/aba/callback (and /webhook)
 * Idempotent Callback Receiver
 */
const handleABAWebhook = async (req, res, next) => {
  try {
    const payload = req.body;
    console.log('[ABA CALLBACK RECEIVED]', payload);

    const result = await abaPaywayService.handleCallback(payload);

    if (result.alreadyProcessed) {
      return res.status(200).send('Already processed');
    }

    if (result.status === 'PAID') {
      return res.status(200).send('OK');
    } else {
      return res.status(200).send('Payment Failed Recorded');
    }
  } catch (err) {
    console.error('[ABA CALLBACK ERROR]', err.message);
    return res.status(400).send(err.message);
  }
};

/**
 * Admin Transactions Fetch
 */
const getAdminTransactions = async (req, res, next) => {
  try {
    const { status, search } = req.query;

    const where = {};
    if (status && status !== 'ALL') {
      where.status = status;
    }
    if (search) {
      where.OR = [
        { transactionId: { contains: search } },
        { user: { email: { contains: search } } },
        { user: { name: { contains: search } } }
      ];
    }

    const payments = await prisma.payment.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
        order: true
      },
      orderBy: { createdAt: 'desc' }
    });

    return sendSuccess(res, 'Transactions fetched successfully', payments);
  } catch (err) {
    next(err);
  }
};

/**
 * List Transactions via PayWayClient
 */
const listABATransactions = async (req, res, next) => {
  try {
    const { status = 'ALL', search = '', limit = 50, offset = 0 } = req.query;
    const result = await abaPaywayService.listTransactions({ status, search, limit, offset });
    return sendSuccess(res, 'Transactions retrieved successfully', result);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createABAPayment,
  createCutLuyPayment,
  createABAKHQR,
  createBakongKHQR,
  checkABAStatus,
  handleABAWebhook,
  handleCutLuyWebhook,
  createKhqrCcQR,
  createKhqrCcCheckout,
  handleKhqrCcWebhook,
  getAdminTransactions,
  listABATransactions
};
