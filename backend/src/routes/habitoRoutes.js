const express = require('express');
const router = express.Router();
const habitoController = require('../controllers/habitoController');
const authMiddleware = require('../middleware/authMiddleware');

// Todas as rotas requerem autenticação
router.use(authMiddleware);

// Obter todos os meses com hábitos cadastrados
router.get('/months', habitoController.getAllMonths);

// Buscar hábitos de um mês específico
router.get('/:year/:month', habitoController.getHabitsByMonth);

// Salvar hábitos do mês (cria ou atualiza)
router.post('/', habitoController.saveHabits);

// Atualizar hábitos do mês por ID
router.put('/:id', habitoController.updateHabits);

// Deletar hábitos de um mês específico
router.delete('/:year/:month', habitoController.deleteHabits);

module.exports = router;
