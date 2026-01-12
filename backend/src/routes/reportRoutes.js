const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const rateLimiters = require('../config/rateLimiter');
const { roleMiddleware } = require('../middleware/roleMiddleware');

// Auth middleware já aplicado no app.js, não precisa duplicar aqui

// Rate limiting específico para geração de relatórios
const reportRateLimiter = rateLimiters.create || rateLimiters.general;

// Rotas de relatórios gerais (todos os usuários autenticados)
router.post('/monthly', reportRateLimiter, reportController.generateMonthlyReport);
router.post('/by-client', reportRateLimiter, reportController.generateClientReport);
router.post('/services', reportRateLimiter, reportController.generateServicesReport);
router.post('/financial', reportRateLimiter, reportController.generateFinancialReport);
router.post('/service-routines', reportRateLimiter, reportController.generateServiceRoutinesReport);
router.post('/commercial', reportRateLimiter, reportController.generateCommercialReport);
router.post('/active-clients', reportRateLimiter, reportController.generateActiveClientsReport);

// Rotas de relatórios R&S (apenas admin, admin_gerencial e consultor_rs)
const rsRoleMiddleware = roleMiddleware(['admin', 'admin_gerencial', 'consultor_rs']);
router.post('/rs/general', reportRateLimiter, rsRoleMiddleware, reportController.generateRsGeneralReport);
router.post('/rs/by-client', reportRateLimiter, rsRoleMiddleware, reportController.generateRsClientReport);
router.post('/rs/by-consultora', reportRateLimiter, rsRoleMiddleware, reportController.generateRsConsultoraReport);
router.post('/rs/open-vacancies', reportRateLimiter, rsRoleMiddleware, reportController.generateRsOpenVacanciesReport);
router.post('/rs/individual', reportRateLimiter, rsRoleMiddleware, reportController.generateRsIndividualReport);

module.exports = router;