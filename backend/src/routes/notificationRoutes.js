const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const authMiddleware = require('../middleware/authMiddleware');

// Proteger todas as rotas de notificação
router.use(authMiddleware);

// GET /api/notifications -> Listar notificações do usuário logado (com paginação)
router.get('/', notificationController.listForUser);

// POST /api/notifications/test -> Criar notificação de teste
router.post('/test', notificationController.testNotification);

// GET /api/notifications/unread-count -> Contar notificações não lidas
router.get('/unread-count', notificationController.getUnreadCount);

// PATCH /api/notifications/:id/read -> Marcar uma notificação como lida
router.patch('/:id/read', notificationController.markAsRead);

// PATCH /api/notifications/read-all -> Marcar todas as notificações como lidas
router.patch('/read-all', notificationController.markAllAsRead);

// DELETE /api/notifications/delete-all -> Deletar todas as notificações
router.delete('/delete-all', notificationController.deleteAll);

// DELETE /api/notifications/delete-old -> Deletar notificações antigas
router.delete('/delete-old', notificationController.deleteOld);

module.exports = router;