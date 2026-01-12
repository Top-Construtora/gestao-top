const express = require('express');
const router = express.Router();
const ClientLogoController = require('../controllers/clientLogoController');
const { requireAuth } = require('../middleware/auth');

// Upload de logo do cliente
router.post(
  '/clients/:clientId/logo',
  requireAuth,
  ClientLogoController.uploadMiddleware,
  ClientLogoController.uploadLogo
);

// Obter logo do cliente (público para exibição)
router.get(
  '/clients/:clientId/logo',
  ClientLogoController.getLogo
);

// Deletar logo do cliente
router.delete(
  '/clients/:clientId/logo',
  requireAuth,
  ClientLogoController.deleteLogo
);

module.exports = router;