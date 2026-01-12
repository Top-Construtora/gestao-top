const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');

// Rotas públicas
router.post('/login', authController.login);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);
router.post('/validate-reset-token', authController.validateResetToken);

// Rotas protegidas
router.get('/me', authMiddleware, authController.me);
router.post('/change-password', authMiddleware, authController.changePassword);
router.post('/change-password-first-login', authMiddleware, authController.changePasswordFirstLogin);
router.post('/logout', authMiddleware, authController.logout);

module.exports = router;