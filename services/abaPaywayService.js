const crypto = require('crypto');
const axios = require('axios');
const prisma = require('../utils/prisma');
const { PayWayClient, paywayClient } = require('./paywayClient');

/**
 * ABA PayWay v3 Official Service Class
 * Strictly conforms to ABA PayWay v3 Gateway & QR Specifications
 * Powered by PayWayClient
 */
class ABAPayWayService {
  constructor() {
    this.client = paywayClient;
    this.merchantId = this.client.merchantId;
    this.apiKey = this.client.apiKey;
    this.apiUrl = this.client.baseUrl;
    this.returnUrl = this.client.returnUrl;
    this.cancelUrl = this.client.cancelUrl;
  }

  validateAmount(amount, currency = 'USD') {
    return this.client.validateAmount(amount, currency);
  }

  getReqTime() {
    return this.client.getReqTime();
  }

  generateTransactionId() {
    return this.client.generateTransactionId();
  }

  generateSignature(params) {
    return this.client.generateSignature(params);
  }

  /**
   * Create Payment Request Object for ABA PayWay Gateway
   */
  async createPayment({ userId, orderId, amount, currency = 'USD', firstname = 'Customer', lastname = 'User', email = '', phone = '012345678' }) {
    const tx = await this.client.create_transaction({
      userId,
      orderId,
      amount,
      currency,
      firstname,
      lastname,
      email,
      phone
    });

    console.log('==========================================');
    console.log('[ABA PAYWAY SANITIZED REQUEST LOG]');
    console.log('Merchant ID:', tx.merchantId);
    console.log('Transaction ID:', tx.transactionId);
    console.log('Formatted Amount:', tx.amount);
    console.log('Currency:', tx.currency);
    console.log('Request Time:', tx.reqTime);
    console.log('Customer Email:', email);
    console.log('==========================================');

    return tx;
  }

  /**
   * Request Official ABA Dynamic KHQR from ABA PayWay API
   */
  async generateDynamicKHQR({ tran_id, amount, currency = 'USD', firstname = 'Customer', lastname = 'User', email = '', phone = '012345678' }) {
    return this.client.generate_khqr({
      tran_id,
      amount,
      currency,
      firstname,
      lastname,
      email,
      phone
    });
  }

  /**
   * Verify Transaction Status via check-transaction-2 API
   */
  async verifyPayment(tran_id) {
    const resData = await this.client.check_transaction(tran_id);

    if (resData?.status) {
      console.log('[ABA VERIFY LOG]', {
        tran_id: resData.status.tran_id || tran_id,
        pw_tran_id: resData.status.pw_tran_id || null,
        trace_id: resData.status.trace_id || null,
        code: resData.status.code,
        message: resData.status.message
      });
    }

    return resData;
  }

  /**
   * List Transactions Filtered by Status
   */
  async listTransactions(options) {
    return this.client.list_transaction(options);
  }

  /**
   * Handle Callback/Webhook with Idempotency Guard
   */
  async handleCallback(body) {
    const { tran_id, status, pw_tran_id, trace_id } = body;

    if (!tran_id) {
      throw new Error('Missing transaction ID in callback');
    }

    const payment = await prisma.payment.findFirst({
      where: {
        OR: [
          { transactionId: tran_id },
          { merchantTransactionId: tran_id }
        ]
      },
      include: { user: { include: { wallet: true } }, order: true }
    });

    if (!payment) {
      throw new Error(`Payment record not found for transaction: ${tran_id}`);
    }

    if (payment.status === 'PAID') {
      console.log(`[IDEMPOTENCY GUARD] Payment ${tran_id} already marked PAID. Ignoring duplicate callback.`);
      return {
        alreadyProcessed: true,
        payment
      };
    }

    const isSuccess = status === 0 || status === '0' || status === 'SUCCESS';

    if (isSuccess) {
      let wallet = payment.user?.wallet;
      if (!wallet) {
        wallet = await prisma.wallet.create({
          data: { userId: payment.userId, balance: 0, currency: 'USD' }
        });
      }

      const balanceBefore = Number(wallet.balance) || 0;
      const balanceAfter = !payment.orderId ? balanceBefore + payment.amount : balanceBefore;

      const txs = [
        prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: 'PAID',
            pwTranId: pw_tran_id ? String(pw_tran_id) : null,
            traceId: trace_id ? String(trace_id) : null,
            rawResponse: JSON.stringify(body),
            paidAt: new Date()
          }
        })
      ];

      if (!payment.orderId) {
        // Wallet Top-Up Flow
        txs.push(
          prisma.wallet.update({
            where: { id: wallet.id },
            data: { balance: balanceAfter }
          }),
          prisma.transaction.create({
            data: {
              walletId: wallet.id,
              userId: payment.userId,
              amount: payment.amount,
              balanceBefore,
              balanceAfter,
              type: 'DEPOSIT',
              status: 'COMPLETED',
              reference: payment.transactionId,
              description: `Wallet Deposit via ABA PayWay (+$${payment.amount.toFixed(2)} USD)`
            }
          })
        );
      } else {
        // Direct Order Checkout Flow
        txs.push(
          prisma.order.update({
            where: { id: payment.orderId },
            data: { status: 'COMPLETED' }
          }),
          prisma.transaction.create({
            data: {
              walletId: wallet.id,
              userId: payment.userId,
              amount: payment.amount,
              balanceBefore,
              balanceAfter,
              type: 'ECOMMERCE',
              status: 'COMPLETED',
              reference: payment.transactionId,
              description: `Order #${payment.orderId} Payment via ${payment.paymentMethod || 'ABA PayWay'}`
            }
          })
        );
      }

      await prisma.$transaction(txs);

      if (global.io) {
        // Broadcast payment success
        global.io.to(`user_${payment.userId}`).emit('payment_success', {
          message: `Payment of $${payment.amount.toFixed(2)} completed successfully!`,
          amount: payment.amount,
          transactionId: payment.transactionId,
          orderId: payment.orderId || null
        });

        // Broadcast wallet update for immediate navbar & context sync
        global.io.to(`user_${payment.userId}`).emit('wallet_updated', {
          balance: balanceAfter,
          newBalance: balanceAfter,
          change: payment.amount,
          action: 'ADD'
        });

        global.io.to(`user_${payment.userId}`).emit('balance_adjusted', {
          balance: balanceAfter,
          newBalance: balanceAfter,
          change: payment.amount,
          action: 'ADD'
        });
      }

      return {
        alreadyProcessed: false,
        status: 'PAID',
        payment
      };
    } else {
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'FAILED',
          pwTranId: pw_tran_id ? String(pw_tran_id) : null,
          traceId: trace_id ? String(trace_id) : null,
          rawResponse: JSON.stringify(body)
        }
      });

      if (payment.orderId) {
        await prisma.order.update({
          where: { id: payment.orderId },
          data: { status: 'FAILED' }
        });
      }

      return {
        alreadyProcessed: false,
        status: 'FAILED',
        payment
      };
    }
  }
}

const serviceInstance = new ABAPayWayService();
serviceInstance.PayWayClient = PayWayClient;

module.exports = serviceInstance;
