const prisma = require('../utils/prisma');
const abaPaywayService = require('./abaPaywayService');
const khqrCcService = require('./khqrCcService');
const cutluyService = require('./cutluyService');
const { verifyBakongTransaction, calculateKHQRMD5 } = require('../utils/bakongKhqr');

/**
 * Automatic Background Payment Check Worker
 * Periodically checks active, non-expired PENDING transactions against CutLuy, Bakong OpenAPI, and PayWay every 5 seconds.
 */
class PaymentCheckWorker {
  constructor() {
    this.intervalId = null;
    this.isChecking = false;
    this.checkIntervalMs = 5000; // Check every 5 seconds (5s)
    this.quotaBlockedUntil = 0; // Backoff timestamp if daily quota or rate limit is reached
  }

  /**
   * Start background payment status checker
   */
  start() {
    if (this.intervalId) return;

    console.log('[Payment Worker] Started Automatic 5s Status Checker (CutLuy, MD5 & Bakong)');
    
    // Initial check after 2 seconds
    setTimeout(() => this.checkPendingPayments(), 2000);

    // Set recurring interval
    this.intervalId = setInterval(() => {
      this.checkPendingPayments();
    }, this.checkIntervalMs);
  }

  /**
   * Stop worker
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[Payment Worker] Stopped worker.');
    }
  }

  /**
   * Check pending database transactions against official Payment APIs
   */
  async checkPendingPayments() {
    if (this.isChecking) return;
    this.isChecking = true;

    try {
      const now = new Date();
      const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);
      const minCheckGap = new Date(Date.now() - 4000); // Check every ~5s

      // Fetch pending payments created within 15 minutes that haven't been checked in last 4s
      const pendingPayments = await prisma.payment.findMany({
        where: {
          status: 'PENDING',
          createdAt: { gt: fifteenMinsAgo },
          OR: [
            { lastCheckedAt: null },
            { lastCheckedAt: { lt: minCheckGap } }
          ]
        },
        take: 5,
        orderBy: { createdAt: 'desc' }
      });

      for (const payment of pendingPayments) {
        // 1. Expiration check
        if (payment.expiresAt && now > new Date(payment.expiresAt)) {
          await prisma.payment.update({
            where: { id: payment.id },
            data: { status: 'EXPIRED', lastCheckedAt: now }
          });
          console.log(`[Payment Worker] Payment session expired: ${payment.transactionId}`);
          continue;
        }

        let isVerified = false;
        let providerPayload = null;

        // 2. CutLuy API Verification (Priority 1)
        if (payment.paymentMethod === 'CUTLUY_KHQR' || payment.paymentMethod === 'KHQR') {
          const cutluyStatus = await cutluyService.checkPaymentStatus(payment.transactionId);
          if (cutluyStatus) {
            const st = (cutluyStatus.status || '').toLowerCase();
            if (st === 'paid' || st === 'success' || st === 'completed' || cutluyStatus.approved_at) {
              isVerified = true;
              providerPayload = cutluyStatus;
              console.log(`[Payment Worker] 💰 CutLuy Payment VERIFIED for ${payment.transactionId}! Amount: $${cutluyStatus.amount}`);
            } else if (st === 'expired') {
              await prisma.payment.update({
                where: { id: payment.id },
                data: { status: 'EXPIRED', lastCheckedAt: now }
              });
              continue;
            } else if (st === 'failed') {
              await prisma.payment.update({
                where: { id: payment.id },
                data: { status: 'FAILED', lastCheckedAt: now }
              });
              continue;
            }
          }
        }

        // 3. Bakong Open API verification by MD5 (Priority 2)
        if (!isVerified && ['CUTLUY_KHQR', 'BAKONG_KHQR', 'KHQR', 'KHQR_CC', 'KHQR_CC_PLUGIN'].includes(payment.paymentMethod)) {
          let md5ToCheck = payment.md5Sig;
          if (!md5ToCheck && payment.qrData) {
            md5ToCheck = calculateKHQRMD5(payment.qrData);
          }

          if (md5ToCheck && Date.now() >= this.quotaBlockedUntil) {
            const bakongRes = await verifyBakongTransaction(md5ToCheck, payment.transactionId);
            if (bakongRes && (bakongRes.responseCode === 0 || bakongRes.verified) && bakongRes.data) {
              const reportedAmount = parseFloat(bakongRes.data.amount);
              const reportedCurrency = String(bakongRes.data.currency || 'USD').toUpperCase();
              const expectedCurrency = String(payment.currency || 'USD').toUpperCase();

              if (
                !isNaN(reportedAmount) &&
                Math.abs(reportedAmount - payment.amount) <= 0.01 &&
                reportedCurrency === expectedCurrency
              ) {
                isVerified = true;
                providerPayload = bakongRes.data;
                console.log(`[Payment Worker] 💰 Bakong MD5 VERIFIED for ${payment.transactionId}!`);
              }
            } else if (bakongRes?.message && bakongRes.message.includes('limit')) {
              this.quotaBlockedUntil = Date.now() + 30000;
            }
          }

          // Also check khqr.cc gateway if configured and still unverified
          if (!isVerified && ['KHQR_CC', 'KHQR_CC_PLUGIN'].includes(payment.paymentMethod)) {
            const khqrCcRes = await khqrCcService.checkTransactionStatus(payment.transactionId);
            if (khqrCcRes && khqrCcRes.responseCode === 0 && (khqrCcRes.data?.status === 'success' || khqrCcRes.data?.status === 'SUCCESS')) {
              isVerified = true;
              providerPayload = khqrCcRes.data;
            }
          }
        }

        // 4. ABA PayWay Verification
        if (!isVerified && payment.paymentMethod === 'ABA_PAYWAY') {
          const verifyRes = await abaPaywayService.verifyPayment(payment.transactionId);
          if (verifyRes && verifyRes.status) {
            const code = verifyRes.status.code;
            const statusStr = verifyRes.status.status;

            if (code === 0 || code === '0' || code === '00' || statusStr === 'SUCCESS' || statusStr === 'APPROVED') {
              isVerified = true;
              providerPayload = verifyRes.status;
            }
          }
        }

        // 5. Atomic fulfillment or record check attempt
        if (isVerified) {
          await cutluyService.fulfillPayment(payment.transactionId, providerPayload);
        } else {
          await prisma.payment.update({
            where: { id: payment.id },
            data: {
              verificationAttempts: { increment: 1 },
              lastCheckedAt: now
            }
          });
        }
      }
    } catch (err) {
      console.warn('[Payment Worker Notice]:', err.message);
    } finally {
      this.isChecking = false;
    }
  }
}

const workerInstance = new PaymentCheckWorker();

module.exports = workerInstance;
