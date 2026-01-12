const Company = require('../models/Company');
const { 
  validateCreateCompany, 
  validateUpdateCompany,
  validateCompanySearch,
  validateCompanyId,
  MARKET_SECTORS
} = require('../utils/validators');

class CompanyController {
  /**
   * Criar nova empresa
   */
  async create(req, res, next) {
    try {
      const { error, value } = validateCreateCompany(req.body);
      if (error) {
        return res.status(400).json({ 
          error: error.details[0].message 
        });
      }

      const company = await Company.create(value, req.user.id);
      
      res.status(201).json({
        message: 'Empresa criada com sucesso',
        company
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Listar empresas
   */
  async list(req, res, next) {
    try {
      // Validar parâmetros de busca
      const { error: searchError, value: searchParams } = validateCompanySearch(req.query);
      if (searchError) {
        return res.status(400).json({ 
          error: searchError.details[0].message 
        });
      }

      const filters = {
        is_active: searchParams.is_active,
        market_sector: searchParams.market_sector,
        search: searchParams.search
      };

      const companies = await Company.findAll(filters);
      
      res.json({ 
        companies,
        total: companies.length,
        filters: filters
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Buscar empresa por ID
   */
  async getById(req, res, next) {
    try {
      const { error: idError, value: idParams } = validateCompanyId({ id: parseInt(req.params.id) });
      if (idError) {
        return res.status(400).json({ 
          error: idError.details[0].message 
        });
      }

      const company = await Company.findById(idParams.id);
      
      if (!company) {
        return res.status(404).json({ 
          error: 'Empresa não encontrada' 
        });
      }
      
      res.json({ company });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Atualizar empresa
   */
  async update(req, res, next) {
    try {
      const { id } = req.params;
      const { error, value } = validateUpdateCompany(req.body);
      
      if (error) {
        return res.status(400).json({ 
          error: error.details[0].message 
        });
      }

      const company = await Company.update(parseInt(id), value, req.user.id);
      
      if (!company) {
        return res.status(404).json({ 
          error: 'Empresa não encontrada' 
        });
      }
      
      res.json({
        message: 'Empresa atualizada com sucesso',
        company
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Alternar status da empresa
   */
  async toggleStatus(req, res, next) {
    try {
      const { id } = req.params;
      const company = await Company.toggleStatus(parseInt(id), req.user.id);
      
      res.json({
        message: `Empresa ${company.is_active ? 'ativada' : 'desativada'} com sucesso`,
        company
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Excluir empresa (soft delete)
   */
  async softDelete(req, res, next) {
    try {
      const { id } = req.params;
      await Company.softDelete(parseInt(id), req.user.id);
      
      res.json({
        message: 'Empresa desativada com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Excluir empresa permanentemente (apenas admin)
   */
  async hardDelete(req, res, next) {
    try {
      const { id } = req.params;
      
      // Verificar se é admin
      if (req.user.role !== 'admin') {
        return res.status(403).json({ 
          error: 'Apenas administradores podem excluir empresas permanentemente' 
        });
      }
      
      await Company.hardDelete(parseInt(id));
      
      res.json({
        message: 'Empresa excluída permanentemente'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Obter setores de mercado
   */
  async getMarketSectors(req, res, next) {
    try {
      // Retornar setores predefinidos + setores do banco
      const dbSectors = await Company.getMarketSectors();
      
      // Combinar setores predefinidos com os do banco, removendo duplicatas
      const allSectors = [...new Set([...MARKET_SECTORS, ...dbSectors])].sort();
      
      res.json({ 
        sectors: allSectors,
        predefined: MARKET_SECTORS,
        fromDatabase: dbSectors
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Obter estatísticas das empresas
   */
  async getStats(req, res, next) {
    try {
      const stats = await Company.getStats();
      
      res.json({ 
        stats 
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new CompanyController();