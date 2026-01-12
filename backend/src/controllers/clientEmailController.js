const ClientEmailModel = require('../models/ClientEmail');

class ClientEmailController {
  /**
   * Listar emails de um cliente
   */
  async getClientEmails(req, res) {
    try {
      const { clientId } = req.params;
      const emails = await ClientEmailModel.findByClientId(parseInt(clientId));
      
      res.json({
        success: true,
        emails
      });
    } catch (error) {
      console.error('❌ Erro ao buscar emails do cliente:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: error.message
      });
    }
  }

  /**
   * Adicionar email a um cliente
   */
  async addEmail(req, res) {
    try {
      const { clientId } = req.params;
      const { email, is_primary = false } = req.body;

      if (!email || !email.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Email é obrigatório'
        });
      }

      const emailData = {
        client_id: parseInt(clientId),
        email: email.trim(),
        is_primary
      };

      const newEmail = await ClientEmailModel.create(emailData);
      
      res.status(201).json({
        success: true,
        message: 'Email adicionado com sucesso',
        email: newEmail
      });
    } catch (error) {
      console.error('❌ Erro ao adicionar email:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: error.message
      });
    }
  }

  /**
   * Atualizar email
   */
  async updateEmail(req, res) {
    try {
      const { emailId } = req.params;
      const { email, is_primary } = req.body;

      const updateData = {};
      if (email !== undefined) updateData.email = email;
      if (is_primary !== undefined) updateData.is_primary = is_primary;

      const updatedEmail = await ClientEmailModel.update(parseInt(emailId), updateData);
      
      res.json({
        success: true,
        message: 'Email atualizado com sucesso',
        email: updatedEmail
      });
    } catch (error) {
      console.error('❌ Erro ao atualizar email:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: error.message
      });
    }
  }

  /**
   * Definir email como primário
   */
  async setPrimaryEmail(req, res) {
    try {
      const { emailId } = req.params;
      
      const updatedEmail = await ClientEmailModel.setPrimary(parseInt(emailId));
      
      res.json({
        success: true,
        message: 'Email definido como primário',
        email: updatedEmail
      });
    } catch (error) {
      console.error('❌ Erro ao definir email primário:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: error.message
      });
    }
  }

  /**
   * Desativar email
   */
  async deleteEmail(req, res) {
    try {
      const { emailId } = req.params;
      
      await ClientEmailModel.softDelete(parseInt(emailId));
      
      res.json({
        success: true,
        message: 'Email removido com sucesso'
      });
    } catch (error) {
      console.error('❌ Erro ao remover email:', error);
      
      // Se for erro de validação (PJ precisa ter pelo menos um email)
      if (error.message.includes('pelo menos um email')) {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: error.message
      });
    }
  }

  /**
   * Substituir todos os emails de um cliente (para PJ)
   */
  async replaceAllEmails(req, res) {
    try {
      const { clientId } = req.params;
      const { emails } = req.body;

      if (!emails || !Array.isArray(emails) || emails.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Lista de emails é obrigatória e deve conter pelo menos um email'
        });
      }

      const validEmails = emails.filter(email => email && email.trim());
      if (validEmails.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Pelo menos um email válido é obrigatório'
        });
      }

      const newEmails = await ClientEmailModel.replaceAllEmails(parseInt(clientId), validEmails);
      
      res.json({
        success: true,
        message: 'Emails atualizados com sucesso',
        emails: newEmails
      });
    } catch (error) {
      console.error('❌ Erro ao substituir emails:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: error.message
      });
    }
  }
}

module.exports = new ClientEmailController();