const { executeQuery } = require('../config/database');

class ClientAttachment {
  constructor(data) {
    this.id = data.id;
    this.client_id = data.client_id;
    this.file_name = data.file_name;
    this.original_name = data.original_name;
    this.file_path = data.file_path;
    this.file_size = data.file_size;
    this.mime_type = data.mime_type;
    this.uploaded_by = data.uploaded_by;
    this.uploaded_at = data.uploaded_at;
    this.updated_at = data.updated_at;
    this.is_active = data.is_active;
  }

  static async create(attachmentData) {
    const query = `
      INSERT INTO client_attachments (
        client_id, file_name, original_name, file_path, file_size, 
        mime_type, uploaded_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    
    const values = [
      attachmentData.client_id,
      attachmentData.file_name,
      attachmentData.original_name,
      attachmentData.file_path,
      attachmentData.file_size,
      attachmentData.mime_type,
      attachmentData.uploaded_by
    ];

    const result = await executeQuery(query, values);
    return result.length > 0 ? new ClientAttachment(result[0]) : null;
  }

  static async findById(id) {
    const query = `
      SELECT ca.*, u.name as uploader_name 
      FROM client_attachments ca
      LEFT JOIN users u ON ca.uploaded_by = u.id
      WHERE ca.id = $1 AND ca.is_active = true
    `;
    const result = await executeQuery(query, [id]);
    return result.length > 0 ? new ClientAttachment(result[0]) : null;
  }

  static async findByClientId(clientId) {
    const query = `
      SELECT ca.*, u.name as uploader_name 
      FROM client_attachments ca
      LEFT JOIN users u ON ca.uploaded_by = u.id
      WHERE ca.client_id = $1 AND ca.is_active = true
      ORDER BY ca.uploaded_at DESC
    `;
    const result = await executeQuery(query, [clientId]);
    return result.map(row => new ClientAttachment(row));
  }


  static async update(id, updateData) {
    // Sem campos para atualizar, apenas updated_at
    const query = `
      UPDATE client_attachments 
      SET updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND is_active = true
      RETURNING *
    `;

    const result = await executeQuery(query, [id]);
    return result.length > 0 ? new ClientAttachment(result[0]) : null;
  }

  static async delete(id) {
    const query = `
      UPDATE client_attachments 
      SET is_active = false, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;
    const result = await executeQuery(query, [id]);
    return result.length > 0;
  }

  static async getStats(clientId) {
    const query = `
      SELECT 
        COUNT(*) as total_attachments,
        COALESCE(SUM(file_size), 0) as total_size
      FROM client_attachments 
      WHERE client_id = $1 AND is_active = true
    `;
    const result = await executeQuery(query, [clientId]);
    return result[0] || {};
  }

  // Método para validar tipos de arquivo permitidos
  static isValidFileType(mimeType) {
    const allowedTypes = [
      // Documentos
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      
      // Imagens
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/bmp',
      'image/webp',
      
      // Outros
      'application/zip',
      'application/x-rar-compressed',
      'application/x-zip-compressed'
    ];
    
    return allowedTypes.includes(mimeType);
  }

  // Método para obter extensão do arquivo baseada no MIME type
  static getFileExtension(mimeType) {
    const extensions = {
      'application/pdf': '.pdf',
      'application/msword': '.doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
      'application/vnd.ms-excel': '.xls',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
      'text/plain': '.txt',
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/bmp': '.bmp',
      'image/webp': '.webp',
      'application/zip': '.zip',
      'application/x-rar-compressed': '.rar',
      'application/x-zip-compressed': '.zip'
    };
    
    return extensions[mimeType] || '';
  }
}

module.exports = ClientAttachment;