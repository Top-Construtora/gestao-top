const express = require('express');
const router = express.Router();
const publicProposalController = require('../controllers/publicProposalController');
const rateLimiters = require('../config/rateLimiter');

// Rota de teste para verificar se o endpoint está funcionando
router.get('/test', (req, res) => {
  console.log('🔍 Rota de teste atingida!');
  res.json({
    success: true,
    message: 'Public proposals endpoint funcionando!',
    timestamp: new Date().toISOString()
  });
});

/**
 * Rotas públicas para propostas
 * Não requerem autenticação JWT - acessadas pelos clientes
 */

// Aplicar rate limiting mais restritivo para endpoints públicos
const publicRateLimiter = rateLimiters.createCustom({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 30, // Limite de 30 requisições por IP
  message: 'Muitas requisições. Tente novamente mais tarde.'
});

/**
 * @route GET /api/public/proposals/:token
 * @desc Visualizar proposta por token público (acesso do cliente)
 * @access Public
 * @param {string} token - Token público da proposta
 */
router.get('/:token', (req, res, next) => {
  console.log('🔍 Rota pública atingida:', req.originalUrl);
  console.log('🔍 Params:', req.params);
  next();
}, publicRateLimiter, publicProposalController.viewByToken);

/**
 * @route POST /api/public/proposals/:token/services
 * @desc Atualizar seleção de serviços pelo cliente
 * @access Public
 * @param {string} token - Token público da proposta
 * @body {array} selected_services - Array de serviços selecionados
 * @body {object} client_info - Informações do cliente (opcional)
 */
router.post('/:token/services', publicRateLimiter, publicProposalController.selectServices);

/**
 * @route POST /api/public/proposals/:token/sign
 * @desc Assinar proposta digitalmente e marcar como aceita
 * @access Public
 * @param {string} token - Token público da proposta
 * @body {string} signature_data - Dados da assinatura digital
 * @body {string} client_name - Nome completo do cliente
 * @body {string} client_email - Email do cliente
 * @body {number} accepted_value - Valor final aceito pelo cliente
 */
router.post('/:token/sign', publicRateLimiter, publicProposalController.signProposal);

/**
 * @route POST /api/public/proposals/:token/confirm
 * @desc Confirmar e finalizar proposta
 * @access Public
 * @param {string} token - Token público da proposta
 * @body {string} client_observations - Observações do cliente (opcional)
 */
router.post('/:token/confirm', publicRateLimiter, publicProposalController.confirmProposal);

/**
 * @route POST /api/public/proposals/:token/reject
 * @desc Rejeitar proposta
 * @access Public
 * @param {string} token - Token público da proposta
 * @body {string} rejection_reason - Motivo da rejeição (opcional)
 */
router.post('/:token/reject', publicRateLimiter, publicProposalController.rejectProposal);

module.exports = router;