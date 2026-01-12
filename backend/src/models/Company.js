const { supabase } = require('../config/database');

class CompanyModel {
  /**
   * Criar nova empresa
   */
  async create(companyData, userId) {
    const { 
      name, 
      employee_count, 
      founded_date, 
      headquarters, 
      locations, 
      market_sector, 
      description 
    } = companyData;

    try {
      const { data, error } = await supabase
        .from('companies')
        .insert([{
          name,
          employee_count: employee_count || null,
          founded_date: founded_date || null,
          headquarters: headquarters || null,
          locations: locations || [],
          market_sector: market_sector || null,
          description: description || null,
          is_active: true,
          created_by: userId,
          updated_by: userId
        }])
        .select('*')
        .single();

      if (error) {
        console.error('❌ Erro ao criar empresa:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('❌ Erro no create:', error);
      throw error;
    }
  }

  /**
   * Buscar todas as empresas
   */
  async findAll(filters = {}) {
    try {
      let query = supabase
        .from('companies')
        .select(`
          id, name, employee_count, founded_date, headquarters,
          locations, market_sector, description, is_active,
          created_at, updated_at,
          created_by_user:users!companies_created_by_fkey(name),
          updated_by_user:users!companies_updated_by_fkey(name)
        `)
        .order('created_at', { ascending: false });

      // Aplicar filtros
      if (filters.is_active !== undefined) {
        query = query.eq('is_active', filters.is_active);
      }

      if (filters.market_sector) {
        query = query.eq('market_sector', filters.market_sector);
      }

      if (filters.search) {
        query = query.or(`name.ilike.%${filters.search}%,headquarters.ilike.%${filters.search}%`);
      }

      const { data, error } = await query;

      if (error) {
        console.error('❌ Erro ao buscar empresas:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('❌ Erro no findAll:', error);
      throw error;
    }
  }

  /**
   * Buscar empresa por ID
   */
  async findById(id) {
    try {
      const { data, error } = await supabase
        .from('companies')
        .select(`
          id, name, employee_count, founded_date, headquarters,
          locations, market_sector, description, is_active,
          created_at, updated_at,
          created_by_user:users!companies_created_by_fkey(name),
          updated_by_user:users!companies_updated_by_fkey(name)
        `)
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null; // Não encontrado
        console.error('❌ Erro ao buscar empresa por ID:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('❌ Erro no findById:', error);
      throw error;
    }
  }

  /**
   * Atualizar empresa
   */
  async update(id, companyData, userId) {
    try {
      const { 
        name, 
        employee_count, 
        founded_date, 
        headquarters, 
        locations, 
        market_sector, 
        description,
        is_active
      } = companyData;

      const { data, error } = await supabase
        .from('companies')
        .update({
          name,
          employee_count: employee_count || null,
          founded_date: founded_date || null,
          headquarters: headquarters || null,
          locations: locations || [],
          market_sector: market_sector || null,
          description: description || null,
          is_active: is_active !== undefined ? is_active : true,
          updated_by: userId
          // updated_at será atualizado automaticamente pelo trigger
        })
        .eq('id', id)
        .select('*')
        .single();

      if (error) {
        console.error('❌ Erro ao atualizar empresa:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('❌ Erro no update:', error);
      throw error;
    }
  }

  /**
   * Alternar status da empresa (ativo/inativo)
   */
  async toggleStatus(id, userId) {
    try {
      // Primeiro buscar o status atual
      const company = await this.findById(id);
      if (!company) {
        throw new Error('Empresa não encontrada');
      }

      const newStatus = !company.is_active;

      const { data, error } = await supabase
        .from('companies')
        .update({
          is_active: newStatus,
          updated_by: userId
        })
        .eq('id', id)
        .select('*')
        .single();

      if (error) {
        console.error('❌ Erro ao alterar status da empresa:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('❌ Erro no toggleStatus:', error);
      throw error;
    }
  }

  /**
   * Excluir empresa (soft delete)
   */
  async softDelete(id, userId) {
    try {
      return await this.update(id, { is_active: false }, userId);
    } catch (error) {
      console.error('❌ Erro no softDelete:', error);
      throw error;
    }
  }

  /**
   * Excluir empresa permanentemente (apenas admin)
   */
  async hardDelete(id) {
    try {
      const { error } = await supabase
        .from('companies')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('❌ Erro ao excluir empresa permanentemente:', error);
        throw error;
      }

      return true;
    } catch (error) {
      console.error('❌ Erro no hardDelete:', error);
      throw error;
    }
  }

  /**
   * Buscar setores de mercado únicos
   */
  async getMarketSectors() {
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('market_sector')
        .not('market_sector', 'is', null)
        .order('market_sector');

      if (error) {
        console.error('❌ Erro ao buscar setores:', error);
        throw error;
      }

      // Remover duplicatas
      const uniqueSectors = [...new Set((data || []).map(item => item.market_sector))];
      return uniqueSectors.filter(sector => sector && sector.trim());
    } catch (error) {
      console.error('❌ Erro no getMarketSectors:', error);
      throw error;
    }
  }

  /**
   * Estatísticas das empresas
   */
  async getStats() {
    try {
      const { data: stats, error } = await supabase
        .from('companies')
        .select('id, is_active, employee_count, market_sector');

      if (error) {
        console.error('❌ Erro ao buscar estatísticas:', error);
        throw error;
      }

      const total = stats?.length || 0;
      const active = stats?.filter(c => c.is_active).length || 0;
      const inactive = total - active;
      const totalEmployees = stats?.reduce((sum, c) => sum + (c.employee_count || 0), 0) || 0;
      
      // Agrupar por setor
      const sectorStats = {};
      (stats || []).forEach(company => {
        if (company.market_sector && company.is_active) {
          sectorStats[company.market_sector] = (sectorStats[company.market_sector] || 0) + 1;
        }
      });

      return {
        total,
        active,
        inactive,
        totalEmployees,
        sectorStats
      };
    } catch (error) {
      console.error('❌ Erro no getStats:', error);
      throw error;
    }
  }
}

module.exports = new CompanyModel();