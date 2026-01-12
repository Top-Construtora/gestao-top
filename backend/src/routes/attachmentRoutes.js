const express = require('express');
const { AttachmentController, upload } = require('../controllers/attachmentController');

const router = express.Router();

// Upload de arquivo
router.post('/upload', upload.single('file'), AttachmentController.uploadFile);

// Listar anexos de um comentário
router.get('/comment/:commentId', AttachmentController.getCommentAttachments);

// Download de arquivo
router.get('/download/:attachmentId', AttachmentController.downloadAttachment);

// Preview de imagem
router.get('/preview/:attachmentId', AttachmentController.getImagePreview);

// Obter informações de um anexo específico
router.get('/:attachmentId', async (req, res) => {
  try {
    const { attachmentId } = req.params;
    const userId = req.user.id;

    const attachment = await AttachmentController.getAttachmentFromDatabase(attachmentId);
    if (!attachment) {
      return res.status(404).json({
        success: false,
        error: 'Anexo não encontrado'
      });
    }

    // Verificar permissão para ver o anexo
    const hasPermission = await AttachmentController.checkCommentViewPermission(attachment.comment_id, userId);
    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        error: 'Sem permissão para ver este anexo'
      });
    }

    res.json({
      success: true,
      attachment: attachment
    });

  } catch (error) {
    console.error('Erro ao buscar anexo:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

// Excluir anexo
router.delete('/:attachmentId', AttachmentController.deleteAttachment);

module.exports = router;