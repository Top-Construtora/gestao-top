const Service = require('../models/Service');
const { 
  validateCreateService, 
  validateUpdateService,
  validateServiceSearch,
  validateServiceId,
  SERVICE_CATEGORIES
} = require('../utils/validators');

class ServiceController {
  /**
   * Criar novo serviço
   */
  async create(req, res, next) {
    try {
      const { error, value } = validateCreateService(req.body);
      if (error) {
        return res.status(400).json({ 
          error: error.details[0].message 
        });
      }

      const service = await Service.create(value, req.user.id);
      
      res.status(201).json({
        message: 'Serviço criado com sucesso',
        service
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Listar serviços
   */
  async list(req, res, next) {
    try {
      // Validar parâmetros de busca
      const { error: searchError, value: searchParams } = validateServiceSearch(req.query);
      if (searchError) {
        return res.status(400).json({ 
          error: searchError.details[0].message 
        });
      }

      const filters = {
        is_active: searchParams.is_active,
        category: searchParams.category,
        search: searchParams.search,
        exclude_internal: searchParams.exclude_internal === 'true'
      };

      const services = await Service.findAll(filters);
      
      res.json({ 
        services,
        total: services.length,
        filters: filters
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Buscar serviço por ID
   */
  async getById(req, res, next) {
    try {
      const { error: idError, value: idParams } = validateServiceId({ id: parseInt(req.params.id) });
      if (idError) {
        return res.status(400).json({ 
          error: idError.details[0].message 
        });
      }

      const service = await Service.findById(idParams.id);
      
      if (!service) {
        return res.status(404).json({ 
          error: 'Serviço não encontrado' 
        });
      }
      
      res.json({ service });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Atualizar serviço
   */
  async update(req, res, next) {
    try {
      const { id } = req.params;
      const { error, value } = validateUpdateService(req.body);
      
      if (error) {
        return res.status(400).json({ 
          error: error.details[0].message 
        });
      }

      const service = await Service.update(parseInt(id), value, req.user.id);
      
      if (!service) {
        return res.status(404).json({ 
          error: 'Serviço não encontrado' 
        });
      }
      
      res.json({
        message: 'Serviço atualizado com sucesso',
        service
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Alternar status do serviço
   */
  async toggleStatus(req, res, next) {
    try {
      const { id } = req.params;
      const service = await Service.toggleStatus(parseInt(id), req.user.id);
      
      res.json({
        message: `Serviço ${service.is_active ? 'ativado' : 'desativado'} com sucesso`,
        service
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Excluir serviço (soft delete)
   */
  async softDelete(req, res, next) {
    try {
      const { id } = req.params;
      await Service.softDelete(parseInt(id), req.user.id);
      
      res.json({
        message: 'Serviço desativado com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Excluir serviço permanentemente (apenas admin)
   */
  async hardDelete(req, res, next) {
    try {
      const { id } = req.params;
      
      // Verificar se é admin
      if (req.user.role !== 'admin') {
        return res.status(403).json({ 
          error: 'Apenas administradores podem excluir serviços permanentemente' 
        });
      }
      
      await Service.hardDelete(parseInt(id));
      
      res.json({
        message: 'Serviço excluído permanentemente'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Obter categorias de serviços
   */
  async getCategories(req, res, next) {
    try {
      // Retornar categorias predefinidas + categorias do banco
      const dbCategories = await Service.getCategories();
      
      // Combinar categorias predefinidas com as do banco, removendo duplicatas
      const allCategories = [...new Set([...SERVICE_CATEGORIES, ...dbCategories])].sort();
      
      res.json({ 
        categories: allCategories,
        predefined: SERVICE_CATEGORIES,
        fromDatabase: dbCategories
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Obter estatísticas dos serviços
   */
  async getStats(req, res, next) {
    try {
      const stats = await Service.getStats();

      res.json({
        stats
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Duplicar serviço
   */
  async duplicate(req, res, next) {
    try {
      const { id } = req.params;
      const duplicateData = req.body;

      const newService = await Service.duplicate(parseInt(id), duplicateData, req.user.id);

      if (!newService) {
        return res.status(404).json({
          error: 'Serviço original não encontrado'
        });
      }

      res.status(201).json({
        message: 'Serviço duplicado com sucesso',
        service: newService
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ServiceController();