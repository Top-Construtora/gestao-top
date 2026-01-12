const { supabase } = require('../config/database');

class ServiceStageModel {
  async create(stageData, userId) {
    const { 
      service_id,
      name, 
      description,
      category,
      sort_order
    } = stageData;

    try {
      const { data, error } = await supabase
        .from('service_stages')
        .insert([{
          service_id,
          name,
          description: description || null,
          category: category || null,
          sort_order: sort_order || 1,
          status: 'pending',
          is_active: true,
          created_by: userId,
          updated_by: userId
        }])
        .select('*')
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('❌ Erro no create da etapa do serviço:', error);
      throw error;
    }
  }

  async findByServiceId(serviceId) {
    try {
      const { data, error } = await supabase
        .from('service_stages')
        .select(`
          id, service_id, name, description, category, sort_order, status, is_active,
          is_not_applicable, created_at, updated_at, created_by, updated_by
        `)
        .eq('service_id', serviceId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('❌ Erro no findByServiceId de etapas:', error);
      throw error;
    }
  }

  async findById(id) {
    try {
      const { data, error } = await supabase
        .from('service_stages')
        .select(`
          id, service_id, name, description, category, sort_order, status, is_active,
          is_not_applicable
        `)
        .eq('id', id)
        .single();

      if (error && error.code === 'PGRST116') return null;
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('❌ Erro no findById de etapa:', error);
      throw error;
    }
  }
  
  async update(id, stageData, userId) {
    try {
      const {
        name,
        description,
        category,
        sort_order,
        status,
        is_active,
        is_not_applicable
      } = stageData;

      const updateObject = {
        updated_by: userId
      };

      if (name !== undefined) updateObject.name = name;
      if (description !== undefined) updateObject.description = description;
      if (category !== undefined) updateObject.category = category;
      if (sort_order !== undefined) updateObject.sort_order = sort_order;
      if (status !== undefined) updateObject.status = status;
      if (is_active !== undefined) updateObject.is_active = is_active;
      if (is_not_applicable !== undefined) updateObject.is_not_applicable = is_not_applicable;

      Object.keys(updateObject).forEach(key => updateObject[key] === undefined && delete updateObject[key]);

      const { data, error } = await supabase
        .from('service_stages')
        .update(updateObject)
        .eq('id', id)
        .select('*')
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('❌ Erro no update da etapa:', error);
      throw error;
    }
  }

  async updateStatus(id, status, userId) {
    try {
      return await this.update(id, { status }, userId);
    } catch (error) {
      console.error('❌ Erro no updateStatus da etapa:', error);
      throw error;
    }
  }

  async updateMultipleStatuses(updates, userId) {
    try {
      const results = [];
      
      for (const update of updates) {
        const { id, status } = update;
        const result = await this.updateStatus(id, status, userId);
        results.push(result);
      }
      
      return results;
    } catch (error) {
      console.error('❌ Erro no updateMultipleStatuses:', error);
      throw error;
    }
  }

  async reorderStages(serviceId, stageOrders, userId) {
    try {
      const results = [];
      
      for (const order of stageOrders) {
        const { id, sort_order } = order;
        const result = await this.update(id, { sort_order }, userId);
        results.push(result);
      }
      
      return results;
    } catch (error) {
      console.error('❌ Erro no reorderStages:', error);
      throw error;
    }
  }

  async softDelete(id, userId) {
    try {
      return await this.update(id, { is_active: false }, userId);
    } catch (error) {
      console.error('❌ Erro no softDelete da etapa:', error);
      throw error;
    }
  }

  async hardDelete(id) {
    try {
      const { error } = await supabase
        .from('service_stages')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('❌ Erro ao excluir etapa permanentemente:', error);
        throw error;
      }

      return true;
    } catch (error) {
      console.error('❌ Erro no hardDelete da etapa:', error);
      throw error;
    }
  }

  async getServiceProgress(serviceId) {
    try {
      const stages = await this.findByServiceId(serviceId);

      // Filtrar etapas que NÃO são N/A para o cálculo de progresso
      const applicableStages = stages.filter(stage => !stage.is_not_applicable);

      const totalStages = applicableStages.length;
      const completedStages = applicableStages.filter(stage => stage.status === 'completed').length;

      return {
        totalStages,
        completedStages,
        progressPercentage: totalStages > 0 ? Math.round((completedStages / totalStages) * 100) : 0,
        stages
      };
    } catch (error) {
      console.error('❌ Erro no getServiceProgress:', error);
      throw error;
    }
  }

  async createDefaultStages(serviceId, userId) {
    const defaultStages = [
      { name: 'Planejamento', description: 'Análise inicial e planejamento do serviço', sort_order: 1 },
      { name: 'Execução', description: 'Execução principal do serviço', sort_order: 2 },
      { name: 'Revisão', description: 'Revisão e ajustes finais', sort_order: 3 },
      { name: 'Entrega', description: 'Finalização e entrega do serviço', sort_order: 4 }
    ];

    try {
      const results = [];

      for (const stageData of defaultStages) {
        const stage = await this.create({
          service_id: serviceId,
          ...stageData
        }, userId);
        results.push(stage);
      }

      return results;
    } catch (error) {
      console.error('❌ Erro no createDefaultStages:', error);
      throw error;
    }
  }

  /**
   * Sincronizar etapas de um serviço para todos os contract_services que o utilizam
   * Cria contract_service_stages baseadas nas service_stages do template
   */
  async syncStagesToContractServices(serviceId) {
    try {
      console.log(`🔄 Iniciando sincronização de etapas para serviço ${serviceId}`);

      // 1. Buscar todas as etapas template do serviço
      const serviceStages = await this.findByServiceId(serviceId);

      if (serviceStages.length === 0) {
        console.log(`⚠️ Nenhuma etapa encontrada para o serviço ${serviceId}`);
        return { created: 0, updated: 0, contractServices: 0 };
      }

      // 2. Buscar todos os contract_services que usam este serviço
      const { data: contractServices, error: csError } = await supabase
        .from('contract_services')
        .select('id, service_id')
        .eq('service_id', serviceId);

      if (csError) throw csError;

      if (!contractServices || contractServices.length === 0) {
        console.log(`⚠️ Nenhum contract_service encontrado para o serviço ${serviceId}`);
        return { created: 0, updated: 0, contractServices: 0 };
      }

      console.log(`📋 Encontrados ${contractServices.length} contract_services para sincronizar`);

      let createdCount = 0;
      let updatedCount = 0;

      // 3. Para cada contract_service, sincronizar as etapas
      for (const contractService of contractServices) {
        // Buscar etapas existentes para este contract_service
        const { data: existingStages, error: existError } = await supabase
          .from('contract_service_stages')
          .select('id, service_stage_id')
          .eq('contract_service_id', contractService.id);

        if (existError) throw existError;

        const existingStageIds = new Set((existingStages || []).map(s => s.service_stage_id));

        // 4. Para cada etapa do template, criar se não existir
        for (const serviceStage of serviceStages) {
          if (!existingStageIds.has(serviceStage.id)) {
            // Criar nova contract_service_stage
            const { error: insertError } = await supabase
              .from('contract_service_stages')
              .insert([{
                contract_service_id: contractService.id,
                service_stage_id: serviceStage.id,
                status: 'pending',
                is_not_applicable: false,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              }]);

            if (insertError) {
              console.error(`❌ Erro ao criar contract_service_stage:`, insertError);
              throw insertError;
            }

            createdCount++;
            console.log(`✅ Criada etapa "${serviceStage.name}" para contract_service ${contractService.id}`);
          }
        }
      }

      console.log(`🎉 Sincronização concluída: ${createdCount} etapas criadas para ${contractServices.length} contract_services`);

      return {
        created: createdCount,
        updated: updatedCount,
        contractServices: contractServices.length
      };

    } catch (error) {
      console.error('❌ Erro ao sincronizar etapas para contract_services:', error);
      throw error;
    }
  }

  /**
   * Remover contract_service_stages órfãs (quando uma service_stage é deletada)
   */
  async removeOrphanedContractServiceStages(serviceStageId) {
    try {
      console.log(`🗑️ Removendo contract_service_stages órfãs para service_stage ${serviceStageId}`);

      const { error } = await supabase
        .from('contract_service_stages')
        .delete()
        .eq('service_stage_id', serviceStageId);

      if (error) throw error;

      console.log(`✅ Contract_service_stages órfãas removidas`);
      return true;

    } catch (error) {
      console.error('❌ Erro ao remover contract_service_stages órfãs:', error);
      throw error;
    }
  }
}

module.exports = new ServiceStageModel();