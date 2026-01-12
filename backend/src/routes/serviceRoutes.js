const express = require('express');
const router = express.Router();
const serviceController = require('../controllers/serviceController');
const authMiddleware = require('../middleware/authMiddleware');
const { roleMiddleware } = require('../middleware/roleMiddleware');

// Todas as rotas precisam autenticação
router.use(authMiddleware);

// Listar serviços - qualquer usuário autenticado pode ver
router.get('/', serviceController.list);

// Buscar serviço por ID - qualquer usuário autenticado pode ver
router.get('/:id', serviceController.getById);

// Obter categorias de serviços - qualquer usuário autenticado pode ver
router.get('/meta/categories', serviceController.getCategories);

// Obter estatísticas - qualquer usuário autenticado pode ver
router.get('/meta/stats', serviceController.getStats);

// Criar serviço - qualquer usuário autenticado pode criar
router.post('/', serviceController.create);

// Atualizar serviço - qualquer usuário autenticado pode atualizar
router.put('/:id', serviceController.update);

// Alternar status do serviço - qualquer usuário autenticado pode alternar
router.patch('/:id/toggle-status', serviceController.toggleStatus);

// Duplicar serviço - qualquer usuário autenticado pode duplicar
router.post('/:id/duplicate', serviceController.duplicate);

// Excluir serviço (soft delete) - qualquer usuário autenticado pode excluir
router.delete('/:id', serviceController.softDelete);

// Excluir serviço permanentemente - apenas admin
router.delete('/:id/permanent', roleMiddleware(['admin']), serviceController.hardDelete);

module.exports = router;