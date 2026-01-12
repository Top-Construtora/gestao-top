const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const authMiddleware = require('../middleware/authMiddleware');

// Middleware de autenticação para todas as rotas
router.use(authMiddleware);

/**
 * @route GET /api/analytics
 * @desc Obter dados de analytics gerais
 * @access Privado
 * @query {string} period - Período (week, month, quarter, year)
 */
router.get('/', analyticsController.getGeneralAnalytics);

/**
 * @route GET /api/analytics/export
 * @desc Exportar dados de analytics
 * @access Privado
 * @query {string} format - Formato (json, csv, excel)
 */
router.get('/export', analyticsController.exportAnalytics);

module.exports = router;