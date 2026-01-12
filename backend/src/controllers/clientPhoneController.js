const ClientPhoneModel = require('../models/ClientPhone');

class ClientPhoneController {
  /**
   * Listar telefones de um cliente
   */
  async getClientPhones(req, res) {
    try {
      const { clientId } = req.params;
      const phones = await ClientPhoneModel.findByClientId(parseInt(clientId));
      
      res.json({
        success: true,
        phones
      });
    } catch (error) {
      console.error('❌ Erro ao buscar telefones do cliente:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: error.message
      });
    }
  }

  /**
   * Adicionar telefone a um cliente
   */
  async addPhone(req, res) {
    try {
      const { clientId } = req.params;
      const { phone, is_primary = false } = req.body;

      if (!phone || !phone.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Telefone é obrigatório'
        });
      }

      const phoneData = {
        client_id: parseInt(clientId),
        phone: phone.trim(),
        is_primary
      };

      const newPhone = await ClientPhoneModel.create(phoneData);
      
      res.status(201).json({
        success: true,
        message: 'Telefone adicionado com sucesso',
        phone: newPhone
      });
    } catch (error) {
      console.error('❌ Erro ao adicionar telefone:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: error.message
      });
    }
  }

  /**
   * Atualizar telefone
   */
  async updatePhone(req, res) {
    try {
      const { phoneId } = req.params;
      const { phone, is_primary } = req.body;

      const updateData = {};
      if (phone !== undefined) updateData.phone = phone;
      if (is_primary !== undefined) updateData.is_primary = is_primary;

      const updatedPhone = await ClientPhoneModel.update(parseInt(phoneId), updateData);
      
      res.json({
        success: true,
        message: 'Telefone atualizado com sucesso',
        phone: updatedPhone
      });
    } catch (error) {
      console.error('❌ Erro ao atualizar telefone:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: error.message
      });
    }
  }

  /**
   * Definir telefone como primário
   */
  async setPrimaryPhone(req, res) {
    try {
      const { phoneId } = req.params;
      
      const updatedPhone = await ClientPhoneModel.setPrimary(parseInt(phoneId));
      
      res.json({
        success: true,
        message: 'Telefone definido como primário',
        phone: updatedPhone
      });
    } catch (error) {
      console.error('❌ Erro ao definir telefone primário:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: error.message
      });
    }
  }

  /**
   * Desativar telefone
   */
  async deletePhone(req, res) {
    try {
      const { phoneId } = req.params;
      
      await ClientPhoneModel.softDelete(parseInt(phoneId));
      
      res.json({
        success: true,
        message: 'Telefone removido com sucesso'
      });
    } catch (error) {
      console.error('❌ Erro ao remover telefone:', error);
      
      // Se for erro de validação (cliente precisa ter pelo menos um telefone)
      if (error.message.includes('pelo menos um telefone')) {
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
   * Substituir todos os telefones de um cliente
   */
  async replaceAllPhones(req, res) {
    try {
      const { clientId } = req.params;
      const { phones } = req.body;

      if (!phones || !Array.isArray(phones) || phones.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Lista de telefones é obrigatória e deve conter pelo menos um telefone'
        });
      }

      const validPhones = phones.filter(phone => phone && phone.trim());
      if (validPhones.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Pelo menos um telefone válido é obrigatório'
        });
      }

      const newPhones = await ClientPhoneModel.replaceAllPhones(parseInt(clientId), validPhones);
      
      res.json({
        success: true,
        message: 'Telefones atualizados com sucesso',
        phones: newPhones
      });
    } catch (error) {
      console.error('❌ Erro ao substituir telefones:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: error.message
      });
    }
  }
}

module.exports = new ClientPhoneController();