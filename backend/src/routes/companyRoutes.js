const express = require('express');
const router = express.Router();
const companyController = require('../controllers/companyController');
const authMiddleware = require('../middleware/authMiddleware');
const { roleMiddleware, permissionMiddleware } = require('../middleware/roleMiddleware');

// Todas as rotas precisam autenticação
router.use(authMiddleware);

// Listar empresas - qualquer usuário autenticado pode ver
router.get('/', companyController.list);

// Buscar empresa por ID - qualquer usuário autenticado pode ver
router.get('/:id', companyController.getById);

// Obter setores de mercado - qualquer usuário autenticado pode ver
router.get('/meta/sectors', companyController.getMarketSectors);

// Obter estatísticas - qualquer usuário autenticado pode ver
router.get('/meta/stats', companyController.getStats);

// Criar empresa - REMOVER RESTRIÇÃO DE PERMISSÃO
// Agora qualquer usuário autenticado pode criar empresas
router.post('/', companyController.create);

// Atualizar empresa - qualquer usuário autenticado pode atualizar
router.put('/:id', companyController.update);

// Alternar status da empresa - qualquer usuário autenticado pode alternar
router.patch('/:id/toggle-status', companyController.toggleStatus);

// Excluir empresa (soft delete) - qualquer usuário autenticado pode excluir
router.delete('/:id', companyController.softDelete);

// Excluir empresa permanentemente - apenas admin
router.delete('/:id/permanent', roleMiddleware(['admin']), companyController.hardDelete);

module.exports = router;