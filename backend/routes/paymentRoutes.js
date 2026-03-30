const express = require('express');
const protect = require('../middleware/authMiddleware');
const paymentController = require('../controllers/paymentController');

const router = express.Router();

router.post('/create-order', protect, paymentController.createOrder);
router.post('/verify-payment', protect, paymentController.verifyPayment);
router.post('/save-payment', protect, paymentController.savePayment);
router.get('/status/:userId/:eventId', protect, paymentController.getPaymentStatus);
router.get('/admin/event-payments/:eventId', protect, paymentController.getAdminEventPayments);
router.get('/receipt/:paymentId', protect, paymentController.downloadReceipt);

module.exports = router;
