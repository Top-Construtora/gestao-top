const express = require('express');
const router = express.Router();
const clientController = require('../controllers/clientController');
const authMiddleware = require('../middleware/authMiddleware');
const { roleMiddleware } = require('../middleware/roleMiddleware');

// Aplicar middleware de autenticação em todas as rotas
router.use(authMiddleware);

// Rotas de metadados (devem vir antes das rotas com parâmetros)
router.get('/meta/stats', clientController.getStats);
router.get('/meta/cities', clientController.getCities);
router.get('/meta/states', clientController.getStates);

// Rotas principais
router.get('/', clientController.list);
router.get('/:id', clientController.getById);
router.post('/', clientController.create);
router.put('/:id', clientController.update);
router.delete('/:id', clientController.delete);
router.delete('/:id/permanent', roleMiddleware(['admin']), clientController.deletePermanent);

module.exports = router;