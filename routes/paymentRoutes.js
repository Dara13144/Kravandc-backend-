const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const paymentController = require('../controllers/paymentController');
const { authenticateToken } = require('../middlewares/auth');

// Rate limiter for payment creation: 60 requests per minute per IP
const paymentCreateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: 'Too many payment creation requests. Please wait a moment before trying again.'
    });
  }
});

// CutLuy Official Payment Routes
router.post('/cutluy/create', authenticateToken, paymentCreateLimiter, paymentController.createCutLuyPayment);
router.post('/cutluy/webhook', paymentController.handleCutLuyWebhook);
router.get('/cutluy/status/:transactionId', paymentController.checkABAStatus);
router.get('/cutluy/check-status/:transactionId', paymentController.checkABAStatus);

// Official ABA PayWay routes
router.post('/aba/create', authenticateToken, paymentCreateLimiter, paymentController.createABAPayment);
router.post('/aba/khqr', authenticateToken, paymentCreateLimiter, paymentController.createCutLuyPayment);
router.post('/aba/callback', paymentController.handleABAWebhook);
router.post('/aba/webhook', paymentController.handleABAWebhook);
router.get('/aba/status/:transactionId', paymentController.checkABAStatus);
router.get('/aba/check-status/:transactionId', paymentController.checkABAStatus);
router.get('/aba/list', paymentController.listABATransactions);

// Bakong Open API routes (routes to CutLuy)
router.post('/bakong/create', authenticateToken, paymentCreateLimiter, paymentController.createCutLuyPayment);
router.post('/bakong/khqr', authenticateToken, paymentCreateLimiter, paymentController.createCutLuyPayment);
router.get('/bakong/status/:transactionId', paymentController.checkABAStatus);
router.post('/bakong/verify', paymentController.checkABAStatus);
router.post('/bakong/callback', paymentController.handleCutLuyWebhook);

// Standardized KHQR payment routes
router.post('/create', authenticateToken, paymentCreateLimiter, paymentController.createCutLuyPayment);
router.get('/status/:transactionId', paymentController.checkABAStatus);
router.get('/:transactionId/status', paymentController.checkABAStatus);
router.post('/webhook/khqr', paymentController.handleCutLuyWebhook);
router.post('/callback', paymentController.handleCutLuyWebhook);

// KHQR CC API & Plugin Routes
router.post('/khqr-cc/qr', authenticateToken, paymentCreateLimiter, paymentController.createCutLuyPayment);
router.post('/khqr-cc/checkout', authenticateToken, paymentCreateLimiter, paymentController.createKhqrCcCheckout);
router.get('/khqr-cc/status/:transactionId', paymentController.checkABAStatus);
router.post('/khqr-cc/check-status', paymentController.checkABAStatus);
router.post('/khqr-cc/callback', paymentController.handleCutLuyWebhook);
router.post('/payment/callback', paymentController.handleCutLuyWebhook);

module.exports = router;
