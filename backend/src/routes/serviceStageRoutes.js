const express = require('express');
const router = express.Router();
const serviceStageController = require('../controllers/serviceStageController');
const { requireAuth } = require('../middleware/auth');

// Aplicar middleware de autenticação para todas as rotas
router.use(requireAuth);

// ========================================
// ROTAS DE ETAPAS DE SERVIÇOS
// ========================================

/**
 * @route   GET /api/services/:serviceId/stages
 * @desc    Listar etapas de um serviço
 * @access  Private
 */
router.get('/services/:serviceId/stages', serviceStageController.getByServiceId);

/**
 * @route   GET /api/services/:serviceId/stages/progress
 * @desc    Obter progresso das etapas de um serviço
 * @access  Private
 */
router.get('/services/:serviceId/stages/progress', serviceStageController.getProgress);

/**
 * @route   POST /api/services/:serviceId/stages/default
 * @desc    Criar etapas padrão para um serviço
 * @access  Private
 */
router.post('/services/:serviceId/stages/default', serviceStageController.createDefault);

/**
 * @route   POST /api/services/:serviceId/stages/sync
 * @desc    Sincronizar manualmente etapas do serviço para todos os contract_services
 * @access  Private
 */
router.post('/services/:serviceId/stages/sync', serviceStageController.syncToContractServices);

/**
 * @route   PUT /api/services/:serviceId/stages/reorder
 * @desc    Reordenar etapas de um serviço
 * @access  Private
 */
router.put('/services/:serviceId/stages/reorder', serviceStageController.reorder);

/**
 * @route   POST /api/stages
 * @desc    Criar nova etapa
 * @access  Private
 */
router.post('/stages', serviceStageController.create);

/**
 * @route   GET /api/stages/:id
 * @desc    Buscar etapa por ID
 * @access  Private
 */
router.get('/stages/:id', serviceStageController.getById);

/**
 * @route   PUT /api/stages/:id
 * @desc    Atualizar etapa
 * @access  Private
 */
router.put('/stages/:id', serviceStageController.update);

/**
 * @route   PATCH /api/stages/:id/status
 * @desc    Atualizar status de uma etapa
 * @access  Private
 */
router.patch('/stages/:id/status', serviceStageController.updateStatus);

/**
 * @route   PATCH /api/stages/:id/not-applicable
 * @desc    Atualizar is_not_applicable de uma etapa
 * @access  Private
 */
router.patch('/stages/:id/not-applicable', serviceStageController.updateNotApplicable);

/**
 * @route   PATCH /api/stages/status/bulk
 * @desc    Atualizar status de múltiplas etapas
 * @access  Private
 */
router.patch('/stages/status/bulk', serviceStageController.updateMultipleStatuses);

/**
 * @route   DELETE /api/stages/:id
 * @desc    Excluir etapa (soft delete)
 * @access  Private
 */
router.delete('/stages/:id', serviceStageController.softDelete);

/**
 * @route   DELETE /api/stages/:id/permanent
 * @desc    Excluir etapa permanentemente (apenas admin)
 * @access  Private (Admin only)
 */
router.delete('/stages/:id/permanent', serviceStageController.hardDelete);

module.exports = router;