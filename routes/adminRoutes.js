const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authenticateToken } = require('../middlewares/auth');
const { authorizeRoles } = require('../middlewares/role');

// Admin Auth Guard: SUPER_ADMIN, ADMIN, MODERATOR
router.use(authenticateToken, authorizeRoles('SUPER_ADMIN', 'ADMIN', 'MODERATOR'));

router.get('/stats', adminController.getAdminStats);
router.post('/movies', adminController.createMovie);
router.put('/movies/:id', adminController.updateMovie);
router.delete('/movies/:id', adminController.deleteMovie);
router.post('/podcasts', adminController.createPodcast);
router.put('/podcasts/:id', adminController.updatePodcast);
router.delete('/podcasts/:id', adminController.deletePodcast);
router.get('/users', adminController.getUsers);
router.post('/users/balance', adminController.adjustUserBalance);
router.get('/users/transactions/:userId', adminController.getUserTransactions);
router.post('/users/role', adminController.updateUserRole);
router.get('/payments', adminController.getPayments);
router.put('/payments/status', adminController.updatePaymentStatus);

module.exports = router;
