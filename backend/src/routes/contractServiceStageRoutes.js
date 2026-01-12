const express = require('express');
const router = express.Router();
const contractServiceStageController = require('../controllers/contractServiceStageController');
const { requireAuth } = require('../middleware/auth');

// Aplicar middleware de autenticação para todas as rotas
router.use(requireAuth);

// ========================================
// ROTAS DE ETAPAS DE SERVIÇOS DE CONTRATOS
// ========================================

/**
 * @route   GET /api/contract-services/:contractServiceId/stages
 * @desc    Listar etapas de um serviço de contrato específico
 * @access  Private
 */
router.get('/contract-services/:contractServiceId/stages', contractServiceStageController.getByContractServiceId);

/**
 * @route   GET /api/contract-services/:contractServiceId/stages/progress
 * @desc    Obter progresso das etapas de um serviço de contrato
 * @access  Private
 */
router.get('/contract-services/:contractServiceId/stages/progress', contractServiceStageController.getProgress);

/**
 * @route   PATCH /api/contract-service-stages/:id/status
 * @desc    Atualizar status de uma etapa de serviço de contrato
 * @access  Private
 */
router.patch('/contract-service-stages/:id/status', contractServiceStageController.updateStatus);

/**
 * @route   PATCH /api/contract-service-stages/:id/not-applicable
 * @desc    Atualizar is_not_applicable de uma etapa
 * @access  Private
 */
router.patch('/contract-service-stages/:id/not-applicable', contractServiceStageController.updateNotApplicable);

/**
 * @route   PATCH /api/contract-service-stages/status/bulk
 * @desc    Atualizar status de múltiplas etapas
 * @access  Private
 */
router.patch('/contract-service-stages/status/bulk', contractServiceStageController.updateMultipleStatuses);

module.exports = router;
