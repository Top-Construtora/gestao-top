const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { supabase } = require('../config/database');
const ClientAttachmentService = require('../services/clientAttachmentService');

// Configuração do multer para upload em memória (Supabase Storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB para documentos de clientes
  },
  fileFilter: function (req, file, cb) {
    const allowedTypes = [
      // Imagens
      'image/jpeg',
      'image/jpg', 
      'image/png',
      'image/gif',
      'image/webp',
      // Documentos
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      // Texto
      'text/plain',
      'text/csv',
      // Comprimidos
      'application/zip',
      'application/x-rar-compressed'
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de arquivo não permitido'), false);
    }
  }
});

class ClientAttachmentController {
  
  // Middleware do multer
  static uploadMiddleware = upload.single('file');

  // Upload de arquivo para cliente
  static async uploadFile(req, res) {
    try {
      const { client_id } = req.body;
      const userId = req.user.id;
      
      if (!client_id) {
        return res.status(400).json({
          success: false,
          error: 'ID do cliente é obrigatório'
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'Nenhum arquivo foi enviado'
        });
      }

      // Verificar se o cliente existe
      const { data: clientExists, error: clientError } = await supabase
        .from('clients')
        .select('id')
        .eq('id', client_id)
        .single();

      if (clientError || !clientExists) {
        return res.status(404).json({
          success: false,
          error: 'Cliente não encontrado'
        });
      }

      // Gerar nome único para o arquivo
      const fileExtension = path.extname(req.file.originalname);
      const fileName = `${uuidv4()}${fileExtension}`;
      const filePath = `client-attachments/${client_id}/${fileName}`;

      // Upload para Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('attachments')
        .upload(filePath, req.file.buffer, {
          contentType: req.file.mimetype,
          duplex: false
        });

      if (uploadError) {
        console.error('Erro no upload para Supabase:', uploadError);
        return res.status(500).json({
          success: false,
          error: 'Erro ao fazer upload do arquivo'
        });
      }

      // Salvar informações do arquivo no banco
      const { data: attachmentResult, error: insertError } = await supabase
        .from('client_attachments')
        .insert({
          client_id,
          file_name: fileName,
          original_name: req.file.originalname,
          file_path: filePath,
          file_size: req.file.size,
          mime_type: req.file.mimetype,
          uploaded_by: userId
        })
        .select()
        .single();

      if (insertError) {
        console.error('Erro ao salvar no banco:', insertError);
        return res.status(500).json({
          success: false,
          error: 'Erro ao salvar informações do arquivo'
        });
      }

      // Buscar dados completos do anexo criado com informações do usuário
      const { data: userInfo } = await supabase
        .from('users')
        .select('name')
        .eq('id', userId)
        .single();

      const completeAttachment = {
        ...attachmentResult,
        uploader_name: userInfo?.name || 'Usuário'
      };

      res.json({
        success: true,
        attachment: completeAttachment
      });

    } catch (error) {
      console.error('Erro no upload de anexo:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  }

  // Listar anexos de um cliente
  static async getClientAttachments(req, res) {
    try {
      const { clientId } = req.params;

      if (!clientId) {
        return res.status(400).json({
          success: false,
          error: 'ID do cliente é obrigatório'
        });
      }

      // Buscar anexos do cliente
      const { data: attachments, error: attachmentsError } = await supabase
        .from('client_attachments')
        .select(`
          *,
          users!uploaded_by (
            name
          )
        `)
        .eq('client_id', clientId)
        .eq('is_active', true)
        .order('uploaded_at', { ascending: false });

      if (attachmentsError) {
        console.error('Erro ao buscar anexos:', attachmentsError);
        return res.status(500).json({
          success: false,
          error: 'Erro ao buscar anexos'
        });
      }

      // Formatar dados para compatibilidade
      const formattedAttachments = (attachments || []).map(attachment => ({
        ...attachment,
        uploader_name: attachment.users?.name || 'Usuário',
        uploader_id: attachment.uploaded_by
      }));

      res.json({
        success: true,
        attachments: formattedAttachments
      });

    } catch (error) {
      console.error('Erro ao buscar anexos:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  }

  // Download de arquivo
  static async downloadFile(req, res) {
    try {
      const { attachmentId } = req.params;

      // Buscar informações do anexo
      const { data: attachment, error: attachmentError } = await supabase
        .from('client_attachments')
        .select('*')
        .eq('id', attachmentId)
        .eq('is_active', true)
        .single();

      if (attachmentError || !attachment) {
        return res.status(404).json({
          success: false,
          error: 'Anexo não encontrado'
        });
      }

      // Buscar arquivo do Supabase Storage
      const { data, error } = await supabase.storage
        .from('attachments')
        .download(attachment.file_path);

      if (error) {
        console.error('Erro ao baixar arquivo:', error);
        return res.status(404).json({
          success: false,
          error: 'Arquivo não encontrado no storage'
        });
      }

      // Configurar headers para download
      res.setHeader('Content-Type', attachment.mime_type);
      res.setHeader('Content-Disposition', `attachment; filename="${attachment.original_name}"`);
      res.setHeader('Content-Length', attachment.file_size);

      // Converter ArrayBuffer para Buffer e enviar
      const buffer = Buffer.from(await data.arrayBuffer());
      res.send(buffer);

    } catch (error) {
      console.error('Erro no download:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  }

  // Visualizar arquivo (para imagens)
  static async viewFile(req, res) {
    try {
      const { attachmentId } = req.params;

      // Buscar informações do anexo
      const { data: attachment, error: attachmentError } = await supabase
        .from('client_attachments')
        .select('*')
        .eq('id', attachmentId)
        .eq('is_active', true)
        .single();

      if (attachmentError || !attachment) {
        return res.status(404).json({
          success: false,
          error: 'Anexo não encontrado'
        });
      }

      // Buscar arquivo do Supabase Storage
      const { data, error } = await supabase.storage
        .from('attachments')
        .download(attachment.file_path);

      if (error) {
        console.error('Erro ao visualizar arquivo:', error);
        return res.status(404).json({
          success: false,
          error: 'Arquivo não encontrado no storage'
        });
      }

      // Configurar headers para visualização
      res.setHeader('Content-Type', attachment.mime_type);
      res.setHeader('Content-Length', attachment.file_size);
      res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache por 1 ano

      // Converter ArrayBuffer para Buffer e enviar
      const buffer = Buffer.from(await data.arrayBuffer());
      res.send(buffer);

    } catch (error) {
      console.error('Erro na visualização:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  }

  // Deletar anexo
  static async deleteAttachment(req, res) {
    try {
      const { attachmentId } = req.params;
      const userId = req.user.id;

      // Buscar informações do anexo
      const { data: attachment, error: attachmentError } = await supabase
        .from('client_attachments')
        .select('*')
        .eq('id', attachmentId)
        .eq('is_active', true)
        .single();

      if (attachmentError || !attachment) {
        return res.status(404).json({
          success: false,
          error: 'Anexo não encontrado'
        });
      }

      // Verificar permissão (admin ou quem fez upload)
      if (req.user.role_id !== 1 && attachment.uploaded_by !== userId) {
        return res.status(403).json({
          success: false,
          error: 'Sem permissão para deletar este anexo'
        });
      }

      // Deletar do Supabase Storage
      const { error: deleteError } = await supabase.storage
        .from('attachments')
        .remove([attachment.file_path]);

      if (deleteError) {
        console.error('Erro ao deletar do storage:', deleteError);
      }

      // Marcar como inativo no banco (soft delete)
      const { error: updateError } = await supabase
        .from('client_attachments')
        .update({ 
          is_active: false, 
          updated_at: new Date().toISOString() 
        })
        .eq('id', attachmentId);

      if (updateError) {
        console.error('Erro ao marcar anexo como inativo:', updateError);
        return res.status(500).json({
          success: false,
          error: 'Erro ao excluir anexo'
        });
      }

      res.json({
        success: true,
        message: 'Anexo deletado com sucesso'
      });

    } catch (error) {
      console.error('Erro ao deletar anexo:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  }

  // Método de atualização removido (não há mais campos para editar)

  // Estatísticas dos anexos do cliente
  static async getClientAttachmentStats(req, res) {
    try {
      const { clientId } = req.params;

      if (!clientId) {
        return res.status(400).json({
          success: false,
          error: 'ID do cliente é obrigatório'
        });
      }

      const stats = await ClientAttachmentService.getAttachmentStats(clientId);
      const grouped = await ClientAttachmentService.getAttachmentsByCategory(clientId);

      res.json({
        success: true,
        stats: {
          ...stats,
          total_size_formatted: ClientAttachmentService.formatFileSize(parseInt(stats.total_size || 0)),
          by_category: grouped
        }
      });

    } catch (error) {
      console.error('Erro ao buscar estatísticas:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  }
}

module.exports = ClientAttachmentController;