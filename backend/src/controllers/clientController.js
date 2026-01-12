const ClientModel = require('../models/Client');
const { validateRequiredFields } = require('../utils/validators');

class ClientController {
  /**
   * Listar clientes
   * GET /api/clients
   */
  async list(req, res) {
    try {
      const { type, city, state, search, is_active } = req.query;
      
      const filters = {
        type,
        city,
        state,
        search,
        is_active: is_active ? is_active === 'true' : undefined
      };

      const clientsData = await ClientModel.findAll(filters);
      
      const clientsArray = Array.isArray(clientsData) ? clientsData : (clientsData ? [clientsData] : []);

      res.json({
        success: true,
        clients: clientsArray,
        total: clientsArray.length,
        filters
      });

    } catch (error) {
      console.error('Erro ao listar clientes:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao listar clientes',
        error: error.message
      });
    }
  }

  /**
   * Buscar cliente por ID
   * GET /api/clients/:id
   */
  async getById(req, res) {
    try {
      const { id } = req.params;
      const client = await ClientModel.findById(id);
      
      if (!client) {
        return res.status(404).json({
          success: false,
          message: 'Cliente não encontrado'
        });
      }
      
      res.json({
        success: true,
        client
      });
    } catch (error) {
      console.error('Erro ao buscar cliente:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao buscar cliente',
        error: error.message
      });
    }
  }

  /**
   * Criar novo cliente
   * POST /api/clients
   */
  async create(req, res) {
    try {
      const clientData = req.body;
      const userId = req.user?.id;
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Usuário não autenticado',
          error: 'req.user.id não encontrado'
        });
      }

      const requiredFields = ['type', 'email', 'street', 'number', 'neighborhood', 'city', 'state', 'zipcode'];
      const validation = validateRequiredFields(clientData, requiredFields);
      if (!validation.isValid) {
        return res.status(400).json({
          success: false,
          message: 'Campos obrigatórios não preenchidos',
          missingFields: validation.missingFields
        });
      }
      
      if (clientData.type === 'PF') {
        const pfRequiredFields = ['cpf', 'full_name'];
        const pfValidation = validateRequiredFields(clientData, pfRequiredFields);
        if (!pfValidation.isValid) {
          return res.status(400).json({
            success: false,
            message: 'Campos obrigatórios de pessoa física não preenchidos',
            missingFields: pfValidation.missingFields
          });
        }
      } else if (clientData.type === 'PJ') {
        const pjRequiredFields = ['cnpj', 'company_name'];
        const pjValidation = validateRequiredFields(clientData, pjRequiredFields);
        if (!pjValidation.isValid) {
          return res.status(400).json({
            success: false,
            message: 'Campos obrigatórios de pessoa jurídica não preenchidos',
            missingFields: pjValidation.missingFields
          });
        }
      } else {
        return res.status(400).json({
          success: false,
          message: 'Tipo de cliente inválido. Use "PF" ou "PJ"'
        });
      }

      const client = await ClientModel.create(clientData, userId);
      
      res.status(201).json({
        success: true,
        message: 'Cliente criado com sucesso',
        client
      });
    } catch (error) {
      console.error('Erro no create:', error);

      if (error.code === '23505') {
        // Verificar em constraint, message ou details qual campo está duplicado
        const errorInfo = (error.constraint || error.message || error.details || '').toLowerCase();
        const isCpfDuplicate = errorInfo.includes('cpf');
        const message = isCpfDuplicate ? 'CPF já cadastrado' : 'CNPJ já cadastrado';
        return res.status(400).json({ success: false, message });
      }

      res.status(500).json({
        success: false,
        message: 'Erro ao criar cliente',
        error: error.message,
      });
    }
  }

  /**
   * Atualizar cliente
   * PUT /api/clients/:id
   */
  async update(req, res) {
    try {
      const { id } = req.params;
      const clientData = req.body;
      const userId = req.user.id;

      // Buscar cliente existente para validar tipo
      const existingClient = await ClientModel.findById(id);
      if (!existingClient) {
        return res.status(404).json({
          success: false,
          message: 'Cliente não encontrado'
        });
      }

      // Validar campos específicos por tipo
      if (existingClient.type === 'PF' && (clientData.cpf || clientData.full_name)) {
        if (!clientData.cpf || !clientData.full_name) {
          return res.status(400).json({
            success: false,
            message: 'CPF e nome completo são obrigatórios para pessoa física'
          });
        }
      } else if (existingClient.type === 'PJ' && (clientData.cnpj || clientData.company_name)) {
        if (!clientData.cnpj || !clientData.company_name) {
          return res.status(400).json({
            success: false,
            message: 'CNPJ e razão social são obrigatórios para pessoa jurídica'
          });
        }
      }

      const client = await ClientModel.update(id, clientData, userId);
      
      res.json({
        success: true,
        message: 'Cliente atualizado com sucesso',
        client
      });
    } catch (error) {
      console.error('Erro ao atualizar cliente:', error);
      
      // Verificar erros de duplicação
      if (error.code === '23505') {
        if (error.constraint === 'clients_pf_cpf_key') {
          return res.status(400).json({
            success: false,
            message: 'CPF já cadastrado'
          });
        } else if (error.constraint === 'clients_pj_cnpj_key') {
          return res.status(400).json({
            success: false,
            message: 'CNPJ já cadastrado'
          });
        }
      }
      
      res.status(500).json({
        success: false,
        message: 'Erro ao atualizar cliente',
        error: error.message
      });
    }
  }

  /**
   * Excluir cliente (soft delete)
   * DELETE /api/clients/:id
   */
  async delete(req, res) {
    try {
      const { id } = req.params;
      
      const client = await ClientModel.findById(id);
      if (!client) {
        return res.status(404).json({
          success: false,
          message: 'Cliente não encontrado'
        });
      }

      await ClientModel.softDelete(id);
      
      res.json({
        success: true,
        message: 'Cliente desativado com sucesso'
      });
    } catch (error) {
      console.error('Erro ao desativar cliente:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao desativar cliente',
        error: error.message
      });
    }
  }

  /**
   * Excluir cliente permanentemente (apenas admin)
   * DELETE /api/clients/:id/permanent
   */
  async deletePermanent(req, res) {
    try {
      const { id } = req.params;
      
      // Verificar se é admin
      if (req.user.role_name !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Apenas administradores podem excluir permanentemente'
        });
      }

      const client = await ClientModel.findById(id);
      if (!client) {
        return res.status(404).json({
          success: false,
          message: 'Cliente não encontrado'
        });
      }

      await ClientModel.hardDelete(id);
      
      res.json({
        success: true,
        message: 'Cliente excluído permanentemente'
      });
    } catch (error) {
      console.error('Erro ao excluir cliente permanentemente:', error);
      
      // Verificar se é um erro de constraint de negócio
      if (error.message && error.message.includes('contratos associados')) {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }
      
      if (error.message && error.message.includes('propostas associadas')) {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }
      
      // Verificar erros de foreign key constraint do banco
      if (error.code === '23503') {
        return res.status(400).json({
          success: false,
          message: 'Não é possível excluir o cliente pois existem registros relacionados. Verifique contratos, propostas e outros dados associados.'
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Erro ao excluir cliente permanentemente',
        error: error.message
      });
    }
  }

  /**
   * Obter estatísticas
   * GET /api/clients/meta/stats
   */
  async getStats(req, res) {
    try {
      const stats = await ClientModel.getStats();
      
      res.json({
        success: true,
        stats
      });
    } catch (error) {
      console.error('Erro ao buscar estatísticas:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao buscar estatísticas',
        error: error.message
      });
    }
  }

  /**
   * Obter lista de cidades
   * GET /api/clients/meta/cities
   */
  async getCities(req, res) {
    try {
      const cities = await ClientModel.getCities();
      
      res.json({
        success: true,
        cities
      });
    } catch (error) {
      console.error('Erro ao buscar cidades:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao buscar cidades',
        error: error.message
      });
    }
  }

  /**
   * Obter lista de estados
   * GET /api/clients/meta/states
   */
  async getStates(req, res) {
    try {
      const states = await ClientModel.getStates();
      
      res.json({
        success: true,
        states
      });
    } catch (error) {
      console.error('Erro ao buscar estados:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao buscar estados',
        error: error.message
      });
    }
  }
}

module.exports = new ClientController();