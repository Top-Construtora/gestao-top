const express = require('express');
const ClientAttachmentController = require('../controllers/clientAttachmentController');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Middleware de autenticação para todas as rotas
router.use(requireAuth);

// Upload de arquivo para cliente
router.post('/upload', 
  ClientAttachmentController.uploadMiddleware,
  ClientAttachmentController.uploadFile
);

// Listar anexos de um cliente
router.get('/client/:clientId', 
  ClientAttachmentController.getClientAttachments
);

// Estatísticas dos anexos de um cliente
router.get('/client/:clientId/stats', 
  ClientAttachmentController.getClientAttachmentStats
);

// Download de arquivo
router.get('/download/:attachmentId', 
  ClientAttachmentController.downloadFile
);

// Visualizar arquivo (para imagens e PDFs)
router.get('/view/:attachmentId', 
  ClientAttachmentController.viewFile
);

// Deletar anexo
router.delete('/:attachmentId', 
  ClientAttachmentController.deleteAttachment
);

module.exports = router;