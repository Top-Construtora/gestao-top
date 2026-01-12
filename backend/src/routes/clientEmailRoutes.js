const express = require('express');
const router = express.Router();
const ClientEmailController = require('../controllers/clientEmailController');
const { authenticateToken } = require('../middleware/auth');

// Middleware de autenticação para todas as rotas
//router.use(authenticateToken); // Remover isso, pois já é aplicado no app.js

// Rotas para emails de clientes
router.get('/clients/:clientId/emails', ClientEmailController.getClientEmails);
router.post('/clients/:clientId/emails', ClientEmailController.addEmail);
router.put('/clients/:clientId/emails/replace', ClientEmailController.replaceAllEmails);
router.put('/emails/:emailId', ClientEmailController.updateEmail);
router.put('/emails/:emailId/primary', ClientEmailController.setPrimaryEmail);
router.delete('/emails/:emailId', ClientEmailController.deleteEmail);

module.exports = router;