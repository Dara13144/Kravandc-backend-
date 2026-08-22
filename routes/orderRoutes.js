const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { authenticateToken } = require('../middlewares/auth');

router.post('/', authenticateToken, orderController.createOrder);
router.post('/purchase', authenticateToken, orderController.purchaseMovie);
router.post('/vip-all-access', authenticateToken, orderController.purchaseAllAccessPass);
router.post('/vip-payment-order', authenticateToken, orderController.createVipPaymentOrder);
router.get('/my-orders', authenticateToken, orderController.getUserOrders);
router.get('/my-purchases', authenticateToken, orderController.getUserOrders);
router.get('/:id', authenticateToken, orderController.getOrderById);

module.exports = router;
