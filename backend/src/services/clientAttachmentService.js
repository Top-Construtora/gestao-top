const { ClientAttachment } = require('../models');
const { supabase } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

class ClientAttachmentService {
  
  static async uploadFile(fileData, clientId, userId, options = {}) {
    try {
      
      // Validações
      if (!ClientAttachment.isValidFileType(fileData.mimetype)) {
        throw new Error('Tipo de arquivo não permitido');
      }

      // Verificar se o cliente existe
      const { data: clientExists, error: clientError } = await supabase
        .from('clients')
        .select('id')
        .eq('id', clientId)
        .single();

      if (clientError || !clientExists) {
        throw new Error('Cliente não encontrado');
      }

      // Gerar nome único para o arquivo
      const fileExtension = path.extname(fileData.originalname);
      const fileName = `${uuidv4()}${fileExtension}`;
      const filePath = `client-attachments/${clientId}/${fileName}`;

      // Upload para Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('attachments')
        .upload(filePath, fileData.buffer, {
          contentType: fileData.mimetype,
          duplex: false
        });

      if (uploadError) {
        console.error('Erro no upload para Supabase:', uploadError);
        throw new Error('Erro ao fazer upload do arquivo');
      }

      // Salvar no banco de dados
      const attachment = await ClientAttachment.create({
        client_id: clientId,
        file_name: fileName,
        original_name: fileData.originalname,
        file_path: filePath,
        file_size: fileData.size,
        mime_type: fileData.mimetype,
        uploaded_by: userId
      });

      return attachment;
    } catch (error) {
      console.error('Erro no ClientAttachmentService.uploadFile:', error);
      throw error;
    }
  }

  static async getClientAttachments(clientId, options = {}) {
    try {
      return await ClientAttachment.findByClientId(clientId);
    } catch (error) {
      console.error('Erro no ClientAttachmentService.getClientAttachments:', error);
      throw error;
    }
  }

  static async getAttachment(attachmentId) {
    try {
      return await ClientAttachment.findById(attachmentId);
    } catch (error) {
      console.error('Erro no ClientAttachmentService.getAttachment:', error);
      throw error;
    }
  }

  static async downloadFile(attachmentId) {
    try {
      const attachment = await ClientAttachment.findById(attachmentId);
      
      if (!attachment) {
        throw new Error('Anexo não encontrado');
      }

      // Buscar arquivo do Supabase Storage
      const { data, error } = await supabase.storage
        .from('attachments')
        .download(attachment.file_path);

      if (error) {
        console.error('Erro ao baixar arquivo:', error);
        throw new Error('Arquivo não encontrado no storage');
      }

      return {
        data,
        attachment
      };
    } catch (error) {
      console.error('Erro no ClientAttachmentService.downloadFile:', error);
      throw error;
    }
  }


  static async deleteAttachment(attachmentId, userId, userRole = 'User') {
    try {
      const attachment = await ClientAttachment.findById(attachmentId);
      
      if (!attachment) {
        throw new Error('Anexo não encontrado');
      }

      // Verificar permissão (admin ou quem fez upload)
      if (userRole !== 'Admin' && attachment.uploaded_by !== userId) {
        throw new Error('Sem permissão para deletar este anexo');
      }

      // Deletar do Supabase Storage
      const { error: deleteError } = await supabase.storage
        .from('attachments')
        .remove([attachment.file_path]);

      if (deleteError) {
        console.warn('Aviso: Erro ao deletar do storage:', deleteError);
      }

      // Marcar como inativo no banco (soft delete)
      return await ClientAttachment.delete(attachmentId);
    } catch (error) {
      console.error('Erro no ClientAttachmentService.deleteAttachment:', error);
      throw error;
    }
  }

  static async getAttachmentStats(clientId) {
    try {
      return await ClientAttachment.getStats(clientId);
    } catch (error) {
      console.error('Erro no ClientAttachmentService.getAttachmentStats:', error);
      throw error;
    }
  }


  static getFileIcon(mimeType) {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType === 'application/pdf') return 'pdf';
    if (mimeType.includes('word')) return 'word';
    if (mimeType.includes('excel') || mimeType.includes('sheet')) return 'excel';
    if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return 'powerpoint';
    if (mimeType.includes('zip') || mimeType.includes('rar')) return 'archive';
    if (mimeType.startsWith('text/')) return 'text';
    return 'file';
  }

  static formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

module.exports = ClientAttachmentService;