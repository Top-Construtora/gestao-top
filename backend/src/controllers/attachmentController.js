const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const { query, supabase } = require('../config/database');

// Configuração do multer para upload em memória (Supabase Storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
  },
  fileFilter: function (req, file, cb) {
    const allowedTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'text/csv'
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de arquivo não permitido'), false);
    }
  }
});

class AttachmentController {
  
  // Upload de arquivo
  static async uploadFile(req, res) {
    try {
      const { comment_id } = req.body;
      const userId = req.user.id;
      
      if (!comment_id) {
        return res.status(400).json({
          success: false,
          error: 'ID do comentário é obrigatório'
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'Nenhum arquivo enviado'
        });
      }

      // Verificar se o comentário existe e se o usuário tem permissão
      const commentExists = await AttachmentController.checkCommentPermission(comment_id, userId);
      if (!commentExists) {
        return res.status(403).json({
          success: false,
          error: 'Sem permissão para anexar arquivo neste comentário'
        });
      }

      // Gerar nome único para o arquivo
      const fileExtension = path.extname(req.file.originalname);
      const fileName = `${uuidv4()}${fileExtension}`;
      const filePath = `service-attachments/${comment_id}/${fileName}`;

      // Upload para Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('attachments')
        .upload(filePath, req.file.buffer, {
          contentType: req.file.mimetype,
          duplex: 'half'
        });

      if (uploadError) {
        console.error('Erro no upload para Supabase:', uploadError);
        return res.status(500).json({
          success: false,
          error: 'Erro ao fazer upload do arquivo'
        });
      }

      // Obter URL pública do arquivo
      const { data: urlData } = supabase.storage
        .from('attachments')
        .getPublicUrl(filePath);

      // Salvar informações do arquivo no banco de dados
      const attachment = await AttachmentController.saveAttachmentToDatabase({
        comment_id: parseInt(comment_id),
        file_name: fileName,
        original_name: req.file.originalname,
        file_path: filePath,
        file_size: req.file.size,
        mime_type: req.file.mimetype,
        uploaded_by: userId,
        public_url: urlData.publicUrl
      });

      res.json({
        success: true,
        attachment: attachment
      });

    } catch (error) {
      console.error('Erro no upload:', error);
      
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  }

  // Listar anexos de um comentário
  static async getCommentAttachments(req, res) {
    try {
      const { commentId } = req.params;
      const userId = req.user.id;

      // Verificar permissão para ver o comentário
      const hasPermission = await AttachmentController.checkCommentViewPermission(commentId, userId);
      if (!hasPermission) {
        return res.status(403).json({
          success: false,
          error: 'Sem permissão para ver os anexos deste comentário'
        });
      }

      const attachments = await AttachmentController.getAttachmentsFromDatabase(commentId);

      res.json({
        success: true,
        attachments: attachments
      });

    } catch (error) {
      console.error('Erro ao listar anexos:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  }

  // Download de arquivo
  static async downloadAttachment(req, res) {
    try {
      const { attachmentId } = req.params;
      const userId = req.user.id;

      // Buscar informações do anexo
      const attachment = await AttachmentController.getAttachmentFromDatabase(attachmentId);
      if (!attachment) {
        return res.status(404).json({
          success: false,
          error: 'Anexo não encontrado'
        });
      }

      // Verificar permissão
      const hasPermission = await AttachmentController.checkCommentViewPermission(attachment.comment_id, userId);
      if (!hasPermission) {
        return res.status(403).json({
          success: false,
          error: 'Sem permissão para baixar este arquivo'
        });
      }

      // Baixar arquivo do Supabase Storage
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('attachments')
        .download(attachment.file_path);

      if (downloadError) {
        console.error('Erro ao baixar do Supabase:', downloadError);
        return res.status(404).json({
          success: false,
          error: 'Arquivo não encontrado no servidor'
        });
      }

      // Converter Blob para Buffer
      const buffer = Buffer.from(await fileData.arrayBuffer());

      // Definir headers para download
      res.setHeader('Content-Disposition', `attachment; filename="${attachment.original_name}"`);
      res.setHeader('Content-Type', attachment.mime_type);
      res.setHeader('Content-Length', buffer.length);

      // Enviar arquivo
      res.end(buffer);

    } catch (error) {
      console.error('Erro no download:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  }

  // Preview de imagem
  static async getImagePreview(req, res) {
    try {
      const { attachmentId } = req.params;
      const userId = req.user.id;

      const attachment = await AttachmentController.getAttachmentFromDatabase(attachmentId);
      if (!attachment) {
        return res.status(404).json({ error: 'Anexo não encontrado' });
      }

      // Verificar se é uma imagem
      if (!attachment.mime_type.startsWith('image/')) {
        return res.status(400).json({ error: 'Arquivo não é uma imagem' });
      }

      const hasPermission = await AttachmentController.checkCommentViewPermission(attachment.comment_id, userId);
      if (!hasPermission) {
        return res.status(403).json({ error: 'Sem permissão' });
      }

      // Baixar imagem do Supabase Storage
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('attachments')
        .download(attachment.file_path);

      if (downloadError) {
        console.error('Erro ao baixar imagem do Supabase:', downloadError);
        return res.status(404).json({ error: 'Arquivo não encontrado' });
      }

      // Converter Blob para Buffer
      const buffer = Buffer.from(await fileData.arrayBuffer());

      res.setHeader('Content-Type', attachment.mime_type);
      res.setHeader('Content-Length', buffer.length);
      res.end(buffer);

    } catch (error) {
      console.error('Erro no preview:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  // Excluir anexo
  static async deleteAttachment(req, res) {
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

      // Verificar se o usuário é o dono do anexo ou admin
      const isAdmin = req.user.role_name === 'admin';
      if (attachment.uploaded_by !== userId && !isAdmin) {
        return res.status(403).json({
          success: false,
          error: 'Sem permissão para excluir este anexo'
        });
      }

      // Remover arquivo do Supabase Storage
      const { error: deleteError } = await supabase.storage
        .from('attachments')
        .remove([attachment.file_path]);

      if (deleteError) {
        console.warn('Erro ao remover arquivo do Supabase:', deleteError.message);
        // Continuar mesmo se houver erro na remoção do storage
      }

      // Marcar como inativo no banco (soft delete)
      await AttachmentController.softDeleteAttachment(attachmentId);

      // Atualizar has_attachments no comentário
      await AttachmentController.updateCommentAttachmentsFlag(attachment.comment_id);

      res.json({
        success: true,
        message: 'Anexo excluído com sucesso'
      });

    } catch (error) {
      console.error('Erro ao excluir anexo:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  }

  // Métodos auxiliares
  static async checkCommentPermission(commentId, userId) {
    try {
      // Verificar se o comentário existe e se o usuário pode anexar arquivos
      const result = await query(`
        SELECT csc.id, csc.user_id, cs.contract_id, ca.user_id as assigned_user
        FROM contract_service_comments csc
        JOIN contract_services cs ON csc.contract_service_id = cs.id
        LEFT JOIN contract_assignments ca ON cs.contract_id = ca.contract_id AND ca.user_id = $1 AND ca.is_active = true
        WHERE csc.id = $2 AND (csc.user_id = $1 OR ca.user_id IS NOT NULL OR EXISTS (
          SELECT 1 FROM users WHERE id = $1 AND role_id IN (SELECT id FROM roles WHERE name = 'admin')
        ))
      `, [userId, commentId]);

      return result.rows.length > 0;
    } catch (error) {
      console.error('Erro ao verificar permissão do comentário:', error);
      return false;
    }
  }

  static async checkCommentViewPermission(commentId, userId) {
    try {
      // Verificar se o usuário pode ver o comentário
      const result = await query(`
        SELECT csc.id
        FROM contract_service_comments csc
        JOIN contract_services cs ON csc.contract_service_id = cs.id
        LEFT JOIN contract_assignments ca ON cs.contract_id = ca.contract_id AND ca.user_id = $1 AND ca.is_active = true
        WHERE csc.id = $2 AND (ca.user_id IS NOT NULL OR EXISTS (
          SELECT 1 FROM users WHERE id = $1 AND role_id IN (SELECT id FROM roles WHERE name = 'admin')
        ))
      `, [userId, commentId]);

      return result.rows.length > 0;
    } catch (error) {
      console.error('Erro ao verificar permissão de visualização:', error);
      return false;
    }
  }

  static async saveAttachmentToDatabase(attachmentData) {
    try {
      const result = await query(`
        INSERT INTO service_comment_attachments 
        (comment_id, file_name, original_name, file_path, file_size, mime_type, uploaded_by, public_url)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, comment_id, file_name, original_name, file_path, file_size, mime_type, uploaded_by, uploaded_at, is_active, public_url
      `, [
        attachmentData.comment_id,
        attachmentData.file_name,
        attachmentData.original_name,
        attachmentData.file_path,
        attachmentData.file_size,
        attachmentData.mime_type,
        attachmentData.uploaded_by,
        attachmentData.public_url
      ]);

      const attachment = result.rows[0];

      // Atualizar has_attachments no comentário
      await AttachmentController.updateCommentAttachmentsFlag(attachmentData.comment_id);

      // Buscar dados do uploader
      const userResult = await query(`
        SELECT id, name FROM users WHERE id = $1
      `, [attachmentData.uploaded_by]);

      if (userResult.rows.length > 0) {
        attachment.uploader = userResult.rows[0];
      }

      return attachment;
    } catch (error) {
      console.error('Erro ao salvar anexo:', error);
      throw error;
    }
  }

  static async getAttachmentsFromDatabase(commentId) {
    try {
      const result = await query(`
        SELECT 
          sca.*,
          u.name as uploader_name
        FROM service_comment_attachments sca
        LEFT JOIN users u ON sca.uploaded_by = u.id
        WHERE sca.comment_id = $1 AND sca.is_active = true
        ORDER BY sca.uploaded_at DESC
      `, [commentId]);

      return result.rows.map(row => ({
        ...row,
        uploader: {
          id: row.uploaded_by,
          name: row.uploader_name
        }
      }));
    } catch (error) {
      console.error('Erro ao buscar anexos:', error);
      return [];
    }
  }

  static async getAttachmentFromDatabase(attachmentId) {
    try {
      const result = await query(`
        SELECT * FROM service_comment_attachments 
        WHERE id = $1 AND is_active = true
      `, [attachmentId]);

      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      console.error('Erro ao buscar anexo:', error);
      return null;
    }
  }

  static async softDeleteAttachment(attachmentId) {
    try {
      await query(`
        UPDATE service_comment_attachments 
        SET is_active = false 
        WHERE id = $1
      `, [attachmentId]);
      
      return true;
    } catch (error) {
      console.error('Erro ao marcar anexo como inativo:', error);
      return false;
    }
  }

  static async updateCommentAttachmentsFlag(commentId) {
    try {
      // Verificar se ainda existem anexos ativos
      const countResult = await query(`
        SELECT COUNT(*) as count 
        FROM service_comment_attachments 
        WHERE comment_id = $1 AND is_active = true
      `, [commentId]);

      const hasAttachments = countResult.rows[0]?.count > 0;

      // Atualizar flag no comentário
      await query(`
        UPDATE contract_service_comments 
        SET has_attachments = $1 
        WHERE id = $2
      `, [hasAttachments, commentId]);

      return true;
    } catch (error) {
      console.error('Erro ao atualizar flag de anexos:', error);
      return false;
    }
  }
}

module.exports = {
  AttachmentController,
  upload
};