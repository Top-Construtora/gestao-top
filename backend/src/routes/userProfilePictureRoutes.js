const express = require('express');
const router = express.Router();
const UserProfilePictureController = require('../controllers/userProfilePictureController');
const authMiddleware = require('../middleware/authMiddleware');

// Todas as rotas precisam de autenticação
router.use(authMiddleware);

// Upload de foto de perfil
router.post('/:userId/profile-picture', 
  UserProfilePictureController.uploadMiddleware,
  UserProfilePictureController.uploadProfilePicture
);

// Obter foto de perfil
router.get('/:userId/profile-picture', UserProfilePictureController.getProfilePicture);

// Deletar foto de perfil
router.delete('/:userId/profile-picture', UserProfilePictureController.deleteProfilePicture);

module.exports = router;