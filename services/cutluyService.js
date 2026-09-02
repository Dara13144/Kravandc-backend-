const axios = require('axios');
const crypto = require('crypto');
const prisma = require('../utils/prisma');
const { calculateKHQRMD5, generateQRCodeImage } = require('../utils/bakongKhqr');

/**
 * CutLuy Payment Service (KHQR & Bakong Gateway)
 * API Base: https://cutluy.com/v1/payments
 * Live Key: ck_live_R4T5n4RvJg2FziFWKy1RdjfY_dJCbBAD
 */
class CutLuyService {
  constructor() {
    this.apiKey = process.env.CUTLUY_API_KEY || 'ck_live_R4T5n4RvJg2FziFWKy1RdjfY_dJCbBAD';
    this.apiUrl = process.env.CUTLUY_API_URL || 'https://cutluy.com/v1/payments';
    this.webhookSecret = process.env.CUTLUY_WEBHOOK_SECRET || '';
  }

  /**
   * Helper headers with Bearer Authentication
   */
  getHeaders() {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Create KHQR Payment via CutLuy
   * POST https://cutluy.com/v1/payments
   * Body: { amount: 1.5, reference_id: "order_1024" }
   */
  async createPayment({ userId, orderId = null, amount, currency = 'USD', description = '' }) {
    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      throw new Error('Invalid transaction amount. Amount must be greater than 0.');
    }

    const formattedAmount = Number(numericAmount.toFixed(2));
    const referenceId = orderId
      ? `ORD_${orderId}_${Date.now()}`
      : `TOPUP_${userId || 'GUEST'}_${Date.now()}`;

    console.log(`[CutLuy] Creating payment - Ref: ${referenceId}, Amount: $${formattedAmount} ${currency}`);

    try {
      const response = await axios.post(
        this.apiUrl,
        {
          amount: formattedAmount,
          reference_id: referenceId
        },
        {
          headers: this.getHeaders(),
          timeout: 10000
        }
      );

      const payData = response.data;
      if (!payData || !payData.id) {
        throw new Error('Invalid response received from CutLuy payment gateway');
      }

      // Compute MD5 hash and QR visual render assets
      const qrString = payData.qr_string || '';
      const md5Sig = qrString ? calculateKHQRMD5(qrString) : null;
      const qrSvgUrl = qrString ? `https://cutluy.com/api/render/khqr/${encodeURIComponent(qrString)}.svg` : null;
      let qrImage = null;
      if (qrString) {
        try {
          qrImage = await generateQRCodeImage(qrString);
        } catch (imgErr) {
          console.warn('[CutLuy QR Render Notice]', imgErr.message);
        }
      }

      const expiresAt = payData.expires_at ? new Date(payData.expires_at) : new Date(Date.now() + 5 * 60 * 1000);

      // Create Payment Record in Database
      const payment = await prisma.payment.create({
        data: {
          userId: userId || 'system',
          orderId: orderId || null,
          amount: formattedAmount,
          currency: payData.currency || currency || 'USD',
          paymentMethod: 'CUTLUY_KHQR',
          transactionId: payData.id,
          merchantTransactionId: referenceId,
          qrData: qrString,
          qrCode: qrImage,
          paymentUrl: payData.checkout_url || null,
          md5Sig: md5Sig,
          status: 'PENDING',
          rawResponse: JSON.stringify(payData),
          expiresAt: expiresAt
        }
      });

      return {
        success: true,
        paymentId: payment.id,
        id: payData.id,
        transactionId: payData.id,
        referenceId: referenceId,
        reference_id: referenceId,
        amount: formattedAmount,
        currency: payData.currency || 'USD',
        qr_string: qrString,
        qrString: qrString,
        checkout_url: payData.checkout_url,
        checkoutUrl: payData.checkout_url,
        qr_svg_url: qrSvgUrl,
        qrSvgUrl: qrSvgUrl,
        qrImage: qrImage,
        md5Sig: md5Sig,
        status: payData.status || 'pending',
        expiresAt: expiresAt,
        expiresInSeconds: Math.max(30, Math.floor((expiresAt.getTime() - Date.now()) / 1000)),
        merchantName: process.env.CUTLUY_MERCHANT_NAME || 'Kravandc.com'
      };
    } catch (err) {
      console.error('[CutLuy Create Payment Error]', err.response?.data || err.message);
      throw new Error(err.response?.data?.message || err.message || 'Failed to create CutLuy KHQR payment');
    }
  }

  /**
   * Check Status via CutLuy API
   * GET https://cutluy.com/v1/payments/:id
   */
  async checkPaymentStatus(cutluyPaymentId) {
    try {
      const response = await axios.get(`${this.apiUrl}/${cutluyPaymentId}`, {
        headers: this.getHeaders(),
        timeout: 8000
      });
      return response.data;
    } catch (err) {
      if (err.response?.status === 404) {
        return null;
      }
      console.warn(`[CutLuy Check Status Notice] ${cutluyPaymentId}:`, err.response?.data || err.message);
      return null;
    }
  }

  /**
   * Verify Webhook Signature (X-CutLuy-Signature: t=...,v1=...)
   */
  verifyWebhookSignature(header, rawBody) {
    if (!this.webhookSecret) return true; // If no secret configured, accept webhook
    if (!header) return false;

    try {
      const parts = Object.fromEntries(header.split(',').map((p) => p.trim().split('=')));
      if (!parts.t || !parts.v1) return false;

      const expected = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(`${parts.t}.${rawBody}`)
        .digest('hex');

      const fresh = Math.abs(Date.now() / 1000 - Number(parts.t)) < 300; // within 5 mins
      const valid =
        fresh &&
        crypto.timingSafeEqual(Buffer.from(parts.v1), Buffer.from(expected));

      return valid;
    } catch {
      return false;
    }
  }

  /**
   * Atomic Payment & Order Fulfillment Engine
   */
  async fulfillPayment(identifier, providerPayload = null) {
    if (!identifier) {
      throw new Error('Identifier (transactionId or reference_id) required for fulfillment');
    }

    const payment = await prisma.payment.findFirst({
      where: {
        OR: [
          { transactionId: identifier },
          { merchantTransactionId: identifier }
        ]
      },
      include: {
        user: { include: { wallet: true } },
        order: { include: { orderItems: { include: { product: true } } } }
      }
    });

    if (!payment) {
      throw new Error(`Payment record not found for identifier: ${identifier}`);
    }

    // Idempotent: If already paid, return existing state
    if (payment.status === 'PAID') {
      return { success: true, alreadyProcessed: true, payment };
    }

    const paymentAmount = payment.amount;

    const result = await prisma.$transaction(async (tx) => {
      // 1. Mark payment as PAID
      const updatedPayment = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: 'PAID',
          paidAt: new Date(),
          rawResponse: providerPayload ? JSON.stringify(providerPayload) : payment.rawResponse
        },
        include: { user: true, order: true }
      });

      let wallet = await tx.wallet.findUnique({
        where: { userId: payment.userId }
      });

      if (!wallet) {
        wallet = await tx.wallet.create({
          data: { userId: payment.userId, balance: 0.0, currency: 'USD' }
        });
      }

      // 2. Fulfill linked Order (E-Commerce, Movies, Pass)
      if (payment.orderId) {
        const order = await tx.order.findUnique({
          where: { id: payment.orderId },
          include: { orderItems: true }
        });

        if (order) {
          await tx.order.update({
            where: { id: payment.orderId },
            data: { status: 'COMPLETED' }
          });

          // Decrement stock for e-commerce products
          if (order.orderItems?.length > 0) {
            for (const item of order.orderItems) {
              await tx.product.update({
                where: { id: item.productId },
                data: { stock: { decrement: item.quantity } }
              });
            }
          }

          // Create ledger entry
          await tx.transaction.create({
            data: {
              walletId: wallet.id,
              userId: payment.userId,
              amount: paymentAmount,
              balanceBefore: wallet.balance,
              balanceAfter: wallet.balance,
              type: order.type || 'ECOMMERCE',
              status: 'COMPLETED',
              reference: payment.transactionId,
              description: `Direct Payment for Order #${payment.orderId} (${order.type || 'ECOMMERCE'})`
            }
          });
        }
      } else {
        // 3. Fulfill Wallet Deposit
        const balanceBefore = wallet.balance;
        const balanceAfter = balanceBefore + paymentAmount;

        await tx.wallet.update({
          where: { id: wallet.id },
          data: { balance: balanceAfter }
        });

        await tx.transaction.create({
          data: {
            walletId: wallet.id,
            userId: payment.userId,
            amount: paymentAmount,
            balanceBefore,
            balanceAfter,
            type: 'DEPOSIT',
            status: 'COMPLETED',
            reference: payment.transactionId,
            description: `Wallet Deposit via CutLuy KHQR (+$${paymentAmount.toFixed(2)} USD)`
          }
        });
      }

      return updatedPayment;
    });

    // Real-time socket notification to client
    if (global.io && payment.userId) {
      global.io.to(`user_${payment.userId}`).emit('payment_success', {
        transactionId: payment.transactionId,
        orderId: payment.orderId,
        amount: payment.amount,
        currency: payment.currency
      });
    }

    console.log(`[CutLuy Fulfill] Payment completed successfully for Tx: ${payment.transactionId}, User: ${payment.userId}`);
    return { success: true, alreadyProcessed: false, payment: result };
  }
}

const cutluyInstance = new CutLuyService();
module.exports = cutluyInstance;
