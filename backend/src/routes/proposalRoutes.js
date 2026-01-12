const express = require('express');
const router = express.Router();
const proposalController = require('../controllers/proposalController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');

// Aplicar middleware de autenticação para todas as rotas
router.use(authMiddleware);

/**
 * @route GET /api/proposals
 * @desc Listar propostas
 * @access Private
 * @query {boolean} is_active - Filtrar por status ativo
 * @query {string} status - Filtrar por status (draft, sent, accepted, rejected, expired)
 * @query {number} client_id - Filtrar por cliente
 * @query {string} search - Buscar por título ou descrição
 * @query {boolean} expired_only - Mostrar apenas propostas expiradas
 */
router.get('/', proposalController.index);

/**
 * @route GET /api/proposals/stats
 * @desc Estatísticas das propostas
 * @access Private
 */
router.get('/stats', proposalController.stats);

/**
 * @route GET /api/proposals/:id
 * @desc Buscar proposta por ID
 * @access Private
 */
router.get('/:id', proposalController.show);

/**
 * @route POST /api/proposals
 * @desc Criar nova proposta
 * @access Private
 * @body {number} client_id - ID do cliente
 * @body {string} title - Título da proposta
 * @body {string} description - Descrição (opcional)
 * @body {array} services - Array de serviços [{service_id, quantity, custom_value}]
 * @body {date} valid_until - Data de validade (opcional)
 * @body {string} observations - Observações (opcional)
 */
router.post('/', proposalController.store);

/**
 * @route PUT /api/proposals/:id
 * @desc Atualizar proposta
 * @access Private
 */
router.put('/:id', proposalController.update);

/**
 * @route PATCH /api/proposals/:id/status
 * @desc Alterar status da proposta
 * @access Private
 * @body {string} status - Novo status (draft, sent, accepted, rejected, expired)
 */
router.patch('/:id/status', proposalController.updateStatus);

/**
 * @route POST /api/proposals/:id/duplicate
 * @desc Duplicar proposta
 * @access Private
 */
router.post('/:id/duplicate', proposalController.duplicate);

/**
 * @route POST /api/proposals/:id/send
 * @desc Enviar proposta por email
 * @access Private
 * @body {string} email - Email de destino
 * @body {string} subject - Assunto do email (opcional)
 * @body {string} message - Mensagem personalizada (opcional)
 */
router.post('/:id/send', proposalController.sendProposal);

/**
 * @route GET /api/proposals/:id/pdf
 * @desc Gerar PDF da proposta
 * @access Private
 */
router.get('/:id/pdf', proposalController.generatePDF);

/**
 * @route POST /api/proposals/:id/prepare-sending
 * @desc Preparar proposta para envio (adicionar dados do cliente e gerar token)
 * @access Private
 * @body {string} client_name - Nome do cliente
 * @body {string} client_email - Email do cliente
 * @body {string} client_phone - Telefone do cliente (opcional)
 * @body {string} client_document - CPF/CNPJ do cliente (opcional)
 */
router.post('/:id/prepare-sending', proposalController.prepareForSending);

/**
 * @route POST /api/proposals/fix-links
 * @desc Corrigir propostas sem link único (endpoint temporário)
 * @access Private
 */
router.post('/fix-links', proposalController.fixProposalsWithoutLinks);

/**
 * @route POST /api/proposals/:id/regenerate-token
 * @desc Gerar novo token público para a proposta
 * @access Private
 */
router.post('/:id/regenerate-token', proposalController.regeneratePublicToken);

/**
 * @route PATCH /api/proposals/:id/mark-converted
 * @desc Marcar proposta como convertida
 * @access Private
 */
router.patch('/:id/mark-converted', proposalController.markConverted);

/**
 * @route DELETE /api/proposals/:id
 * @desc Excluir proposta (soft delete)
 * @access Private
 */
router.delete('/:id', proposalController.destroy);

module.exports = router;