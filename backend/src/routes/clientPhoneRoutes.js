const express = require('express');
const router = express.Router();
const ClientPhoneController = require('../controllers/clientPhoneController');
const { authenticateToken } = require('../middleware/auth');

// Middleware de autenticação para todas as rotas
//router.use(authenticateToken); // Remover isso, pois já é aplicado no app.js

// Rotas para telefones de clientes
router.get('/clients/:clientId/phones', ClientPhoneController.getClientPhones);
router.post('/clients/:clientId/phones', ClientPhoneController.addPhone);
router.put('/clients/:clientId/phones/replace', ClientPhoneController.replaceAllPhones);
router.put('/phones/:phoneId', ClientPhoneController.updatePhone);
router.put('/phones/:phoneId/primary', ClientPhoneController.setPrimaryPhone);
router.delete('/phones/:phoneId', ClientPhoneController.deletePhone);

module.exports = router;