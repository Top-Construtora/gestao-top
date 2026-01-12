const express = require('express');
const router = express.Router();
const PaymentMethodController = require('../controllers/paymentMethodController');

/**
 * @route   GET /api/contracts/:contractId/payment-methods
 * @desc    Listar formas de pagamento de um contrato
 * @access  Private
 */
router.get('/contracts/:contractId/payment-methods', PaymentMethodController.listContractPaymentMethods);

/**
 * @route   POST /api/contracts/:contractId/payment-methods
 * @desc    Criar nova forma de pagamento para contrato
 * @access  Private
 */
router.post('/contracts/:contractId/payment-methods', PaymentMethodController.createContractPaymentMethod);

/**
 * @route   PUT /api/payment-methods/:id
 * @desc    Atualizar forma de pagamento
 * @access  Private
 */
router.put('/payment-methods/:id', PaymentMethodController.updateContractPaymentMethod);

/**
 * @route   DELETE /api/payment-methods/:id
 * @desc    Deletar forma de pagamento
 * @access  Private
 */
router.delete('/payment-methods/:id', PaymentMethodController.deleteContractPaymentMethod);

/**
 * @route   POST /api/contracts/:contractId/payment-methods/reorder
 * @desc    Reordenar formas de pagamento
 * @access  Private
 */
router.post('/contracts/:contractId/payment-methods/reorder', PaymentMethodController.reorderContractPaymentMethods);

/**
 * @route   GET /api/contracts/:contractId/payment-methods/validate
 * @desc    Validar percentuais de pagamento
 * @access  Private
 */
router.get('/contracts/:contractId/payment-methods/validate', PaymentMethodController.validateContractPercentages);

// Proposals use single payment method only - no multiple payment methods routes needed

module.exports = router;