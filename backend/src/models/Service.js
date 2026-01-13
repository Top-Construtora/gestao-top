const { supabase } = require('../config/database');

class ServiceModel {
  async create(serviceData, userId) {
    const {
      name,
      duration_amount,
      duration_unit,
      category,
      description
    } = serviceData;

    try {
      const { data, error } = await supabase
        .from('services')
        .insert([{
          name,
          duration_amount: duration_unit === 'Projeto' ? null : duration_amount,
          duration_unit,
          category: category || 'Geral',
          description: description,
          is_active: true
        }])
        .select('*')
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('❌ Erro no create do serviço:', error);
      throw error;
    }
  }

  async findAll(filters = {}) {
    try {
      let query = supabase
        .from('services')
        .select(`
          id, name, duration_amount, duration_unit, category, description, is_active,
          created_at, updated_at
        `)
        .order('name', { ascending: true });

      if (filters.is_active !== undefined) query = query.eq('is_active', filters.is_active);
      if (filters.search) query = query.or(`name.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
      
      // Excluir serviços internos apenas quando explicitamente solicitado (ex: seleção de contratos)
      if (filters.exclude_internal === true) {
        query = query.neq('category', 'Interno');
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('❌ Erro no findAll de serviços:', error);
      throw error;
    }
  }

  async findById(id) {
    try {
      const { data, error } = await supabase
        .from('services')
        .select(`
          id, name, duration_amount, duration_unit, category, description, is_active
        `)
        .eq('id', id)
        .single();
      if (error && error.code === 'PGRST116') return null;
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('❌ Erro no findById de serviço:', error);
      throw error;
    }
  }
  
  async update(id, serviceData, userId) {
    try {
      const {
        name,
        duration_amount,
        duration_unit,
        category,
        description,
        is_active
      } = serviceData;

      const updateObject = {
        name,
        duration_amount: duration_unit === 'Projeto' ? null : duration_amount,
        duration_unit,
        category,
        description,
        is_active
      };

      Object.keys(updateObject).forEach(key => updateObject[key] === undefined && delete updateObject[key]);

      const { data, error } = await supabase
        .from('services')
        .update(updateObject)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('❌ Erro no update do serviço:', error);
      throw error;
    }
  }

  async getStats() {
    try {
      // Get basic service stats
      const { data: stats, error } = await supabase
        .from('services')
        .select('id, is_active, duration_amount, duration_unit');
      if (error) throw error;

      // Get active contract IDs first
      const { data: activeContracts, error: contractsError } = await supabase
        .from('contracts')
        .select('id')
        .eq('status', 'active');
      
      if (contractsError) throw contractsError;
      
      const activeContractIds = (activeContracts || []).map(c => c.id);
      
      // Get count of all contract services from active contracts
      let activeServicesCount = 0;
      if (activeContractIds.length > 0) {
        const { count, error: activeServicesError } = await supabase
          .from('contract_services')
          .select('*', { count: 'exact', head: true })
          .in('contract_id', activeContractIds);
        
        if (activeServicesError) throw activeServicesError;
        activeServicesCount = count || 0;
      }

      let totalDurationInDays = 0;
      let countWithDuration = 0;
      (stats || []).forEach(s => {
        if (s.duration_unit === 'Projeto') {
          // Skip "Projeto" services in average calculation
          return;
        }
        let days = s.duration_amount || 0;
        if (s.duration_unit === 'semanas') days *= 7;
        if (s.duration_unit === 'meses') days *= 30;
        totalDurationInDays += days;
        countWithDuration++;
      });

      const total = stats?.length || 0;
      return {
        total,
        active: stats?.filter(s => s.is_active).length || 0,
        inactive: total - (stats?.filter(s => s.is_active).length || 0),
        averageDuration: countWithDuration > 0 ? Math.round(totalDurationInDays / countWithDuration) : 0,
        categoryStats: {},
        activeServicesFromActiveContracts: activeServicesCount
      };
    } catch (error) {
      console.error('❌ Erro no getStats de serviços:', error);
      throw error;
    }
  }

  async softDelete(id, userId) {
    try {
      return await this.update(id, { is_active: false }, userId);
    } catch (error) {
      console.error('❌ Erro no softDelete:', error);
      throw error;
    }
  }

  async hardDelete(id) {
    try {
      const { error } = await supabase
        .from('services')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('❌ Erro ao excluir serviço permanentemente:', error);
        throw error;
      }

      return true;
    } catch (error) {
      console.error('❌ Erro no hardDelete:', error);
      throw error;
    }
  }

  /**
   * Buscar categorias únicas
   */
  async getCategories() {
    try {
      const { data, error } = await supabase
        .from('services')
        .select('category')
        .not('category', 'is', null)
        .order('category');

      if (error) {
        console.error('❌ Erro ao buscar categorias:', error);
        throw error;
      }

      // Remover duplicatas
      const uniqueCategories = [...new Set((data || []).map(item => item.category))];
      return uniqueCategories.filter(category => category && category.trim());
    } catch (error) {
      console.error('❌ Erro no getCategories:', error);
      throw error;
    }
  }

  /**
   * Duplicar serviço
   */
  async duplicate(id, duplicateData, userId) {
    try {
      // Buscar serviço original
      const originalService = await this.findById(id);

      if (!originalService) {
        return null;
      }

      // Buscar etapas do serviço original
      const { data: originalStages, error: stagesError } = await supabase
        .from('service_stages')
        .select('*')
        .eq('service_id', id)
        .eq('is_active', true)
        .order('sort_order');

      if (stagesError) {
        console.error('❌ Erro ao buscar etapas do serviço original:', stagesError);
      }

      // Preparar dados do novo serviço
      const newServiceData = {
        name: duplicateData.name || `${originalService.name} (Cópia)`,
        duration_amount: duplicateData.duration_amount !== undefined ? duplicateData.duration_amount : originalService.duration_amount,
        duration_unit: duplicateData.duration_unit || originalService.duration_unit,
        category: duplicateData.category || originalService.category,
        description: duplicateData.description !== undefined ? duplicateData.description : originalService.description
      };

      // Criar novo serviço
      const newService = await this.create(newServiceData, userId);

      // Duplicar etapas se existirem
      if (originalStages && originalStages.length > 0) {
        const stagesToInsert = originalStages.map(stage => ({
          service_id: newService.id,
          name: stage.name,
          description: stage.description,
          sort_order: stage.sort_order,
          status: 'pending',
          category: stage.category,
          is_active: true
        }));

        const { error: insertStagesError } = await supabase
          .from('service_stages')
          .insert(stagesToInsert);

        if (insertStagesError) {
          console.error('❌ Erro ao duplicar etapas do serviço:', insertStagesError);
        }
      }

      // Buscar e retornar dados completos do serviço criado (incluindo etapas)
      const completeService = await this.findById(newService.id);

      return completeService;
    } catch (error) {
      console.error('❌ Erro no duplicate de serviço:', error);
      throw error;
    }
  }

  async toggleStatus(id, userId) {
    try {
      const service = await this.findById(id);
      if (!service) {
        throw new Error('Serviço não encontrado');
      }

      const newStatus = !service.is_active;
      return await this.update(id, { is_active: newStatus }, userId);
    } catch (error) {
      console.error('❌ Erro no toggleStatus:', error);
      throw error;
    }
  }
}

module.exports = new ServiceModel();