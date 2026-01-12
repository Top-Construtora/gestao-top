const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const UserProfilePictureController = require('../controllers/userProfilePictureController');
const authMiddleware = require('../middleware/authMiddleware');
const { roleMiddleware, permissionMiddleware } = require('../middleware/roleMiddleware');

// Rotas públicas (sem autenticação)
router.get('/team-members', userController.getTeamMembers);
router.get('/:userId/team-profile-picture', UserProfilePictureController.getPublicTeamProfilePicture);

// Todas as outras rotas precisam autenticação
router.use(authMiddleware);

// Rotas de admin
router.post('/', roleMiddleware(['admin']), userController.create);
router.get('/', roleMiddleware(['admin', 'admin_gerencial', 'consultor_rs']), userController.list);
router.put('/:id', roleMiddleware(['admin']), userController.update);
router.delete('/:id/soft-delete', roleMiddleware(['admin']), userController.softDelete);
router.delete('/:id/hard-delete', roleMiddleware(['admin']), userController.hardDelete);
router.patch('/:id/toggle-status', roleMiddleware(['admin']), userController.toggleStatus);
router.post('/:id/reset-password', roleMiddleware(['admin']), userController.resetPassword);
router.patch('/:id/team-visibility', roleMiddleware(['admin']), userController.updateTeamVisibility);

// Rotas de usuário
router.get('/list-for-assignment', userController.listForAssignment);


module.exports = router;