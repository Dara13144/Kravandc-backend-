const express = require('express');
const router = express.Router();
const walletController = require('../controllers/walletController');
const { authenticateToken } = require('../middlewares/auth');

router.get('/', authenticateToken, walletController.getWallet);
router.get('/balance', authenticateToken, walletController.getWallet);
router.post('/withdraw', authenticateToken, walletController.requestWithdraw);
router.post('/add-balance', authenticateToken, walletController.addBalance);

module.exports = router;
