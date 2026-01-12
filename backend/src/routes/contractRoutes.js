// src/routes/contractRoutes.js
const express = require('express');
const router = express.Router();
const contractController = require('../controllers/contractController');
const authMiddleware = require('../middleware/authMiddleware');
const { roleMiddleware } = require('../middleware/roleMiddleware');

// Todas as rotas precisam autenticação
router.use(authMiddleware);

// ===== ROTAS DE METADADOS =====
// Obter tipos de contratos - qualquer usuário autenticado pode ver
router.get('/meta/types', contractController.getTypes);

// Obter status de contratos - qualquer usuário autenticado pode ver
router.get('/meta/statuses', contractController.getStatuses);

// Obter estatísticas - retorna apenas dos contratos que o usuário tem acesso
router.get('/meta/stats', contractController.getStats);

// Gerar próximo número de contrato
router.get('/meta/generate-number', contractController.generateNumber);

// Obter atividades recentes dos serviços
router.get('/meta/recent-activities', contractController.getRecentServiceActivities);

// ===== ROTAS DE LISTAGEM E BUSCA =====
// Listar contratos - retorna apenas contratos que o usuário tem acesso
router.get('/', contractController.list);

// Endpoint otimizado para página de rotinas
router.get('/routines', contractController.getRoutines);

// Buscar contratos por cliente
router.get('/client/:clientId', contractController.getByClient);

// Buscar contrato por ID - verifica permissão internamente
router.get('/:id', contractController.getById);

// Listar usuários atribuídos ao contrato
router.get('/:id/users', contractController.getAssignedUsers);

// ===== ROTAS DE CRIAÇÃO =====
// Criar contrato - qualquer usuário autenticado pode criar
router.post('/', contractController.create);

// ===== ROTAS DE ATRIBUIÇÃO DE USUÁRIOS =====
// Atribuir usuários ao contrato - apenas owner ou admin
router.post('/:id/assign', contractController.assignUsers);

// Remover atribuição de usuário - apenas owner ou admin
router.delete('/:id/assign/:userId', contractController.unassignUser);

// Atualizar role de um usuário atribuído - apenas owner ou admin
router.patch('/:id/assign/:userId', contractController.updateUserRole);

// ===== ROTAS DE EDIÇÃO =====
// Atualizar contrato - verifica permissão internamente (owner/editor/admin)
router.put('/:id', contractController.update);

// Alterar status do contrato - verifica permissão internamente (owner/editor/admin)
router.patch('/:id/status', contractController.updateStatus);

// ===== ROTAS DE EXCLUSÃO =====
// Excluir contrato (soft delete) - verifica permissão internamente (owner/admin)
router.delete('/:id', contractController.softDelete);

// Excluir contrato permanentemente - apenas admin global
router.delete('/:id/permanent', roleMiddleware(['admin']), contractController.hardDelete);

// ===== ROTAS DE SERVIÇOS DO CONTRATO =====
// Buscar um serviço específico por ID
router.get('/services/:serviceId', contractController.getContractServiceById);

// Atualizar status e agendamento de um serviço
router.patch('/services/:serviceId', contractController.updateContractService);

// Obter comentários de um serviço
router.get('/services/:serviceId/comments', contractController.getServiceComments);

// Adicionar comentário a um serviço
router.post('/services/:serviceId/comments', contractController.addServiceComment);

// Atualizar comentário
router.put('/comments/:commentId', contractController.updateServiceComment);

// Deletar comentário
router.delete('/comments/:commentId', contractController.deleteServiceComment);

module.exports = router;