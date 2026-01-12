const { supabase } = require('../config/database');

class ContractServiceStageModel {
  /**
   * Buscar etapas de um contract_service
   */
  async findByContractServiceId(contractServiceId) {
    try {
      const { data, error } = await supabase
        .from('contract_service_stages')
        .select(`
          id,
          contract_service_id,
          service_stage_id,
          status,
          is_not_applicable,
          completed_at,
          completed_by,
          created_at,
          updated_at,
          service_stages:service_stage_id (
            id,
            service_id,
            name,
            description,
            category,
            sort_order
          )
        `)
        .eq('contract_service_id', contractServiceId)
        .order('service_stages(sort_order)', { ascending: true });

      if (error) throw error;

      // Mapear para incluir os dados da etapa diretamente no objeto
      const mappedData = (data || []).map(stage => ({
        id: stage.id,
        contract_service_id: stage.contract_service_id,
        service_stage_id: stage.service_stage_id,
        name: stage.service_stages?.name || 'Sem nome',
        description: stage.service_stages?.description || null,
        category: stage.service_stages?.category || null,
        sort_order: stage.service_stages?.sort_order || 0,
        service_id: stage.service_stages?.service_id || null,
        status: stage.status,
        is_not_applicable: stage.is_not_applicable,
        completed_at: stage.completed_at,
        completed_by: stage.completed_by,
        created_at: stage.created_at,
        updated_at: stage.updated_at
      }));

      return mappedData;
    } catch (error) {
      console.error('❌ Erro no findByContractServiceId de contract_service_stages:', error);
      throw error;
    }
  }

  /**
   * Atualizar status de uma etapa
   */
  async updateStatus(id, status, userId) {
    try {
      const updateData = {
        status,
        updated_at: new Date().toISOString()
      };

      if (status === 'completed') {
        updateData.completed_at = new Date().toISOString();
        updateData.completed_by = userId;
      } else {
        updateData.completed_at = null;
        updateData.completed_by = null;
      }

      const { data, error } = await supabase
        .from('contract_service_stages')
        .update(updateData)
        .eq('id', id)
        .select(`
          *,
          service_stages:service_stage_id (
            id,
            service_id,
            name,
            description,
            category,
            sort_order
          )
        `)
        .single();

      if (error) throw error;

      // Mapear para incluir os dados da etapa
      return {
        id: data.id,
        contract_service_id: data.contract_service_id,
        service_stage_id: data.service_stage_id,
        name: data.service_stages?.name || 'Sem nome',
        description: data.service_stages?.description || null,
        category: data.service_stages?.category || null,
        sort_order: data.service_stages?.sort_order || 0,
        service_id: data.service_stages?.service_id || null,
        status: data.status,
        is_not_applicable: data.is_not_applicable,
        completed_at: data.completed_at,
        completed_by: data.completed_by,
        created_at: data.created_at,
        updated_at: data.updated_at
      };
    } catch (error) {
      console.error('❌ Erro no updateStatus de contract_service_stage:', error);
      throw error;
    }
  }

  /**
   * Atualizar is_not_applicable de uma etapa
   */
  async updateNotApplicable(id, isNotApplicable, userId) {
    try {
      const { data, error } = await supabase
        .from('contract_service_stages')
        .update({
          is_not_applicable: isNotApplicable,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select(`
          *,
          service_stages:service_stage_id (
            id,
            service_id,
            name,
            description,
            category,
            sort_order
          )
        `)
        .single();

      if (error) throw error;

      // Mapear para incluir os dados da etapa
      return {
        id: data.id,
        contract_service_id: data.contract_service_id,
        service_stage_id: data.service_stage_id,
        name: data.service_stages?.name || 'Sem nome',
        description: data.service_stages?.description || null,
        category: data.service_stages?.category || null,
        sort_order: data.service_stages?.sort_order || 0,
        service_id: data.service_stages?.service_id || null,
        status: data.status,
        is_not_applicable: data.is_not_applicable,
        completed_at: data.completed_at,
        completed_by: data.completed_by,
        created_at: data.created_at,
        updated_at: data.updated_at
      };
    } catch (error) {
      console.error('❌ Erro no updateNotApplicable de contract_service_stage:', error);
      throw error;
    }
  }

  /**
   * Atualizar status de múltiplas etapas
   */
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

  /**
   * Calcular progresso de um contract_service
   */
  async getContractServiceProgress(contractServiceId) {
    try {
      const stages = await this.findByContractServiceId(contractServiceId);

      // Filtrar etapas aplicáveis (não marcadas como N/A)
      const applicableStages = stages.filter(stage => !stage.is_not_applicable);

      const totalStages = applicableStages.length;
      const completedStages = applicableStages.filter(stage => stage.status === 'completed').length;

      return {
        totalStages,
        completedStages,
        progressPercentage: totalStages > 0 ? Math.round((completedStages / totalStages) * 100) : 0,
        stages: stages.map(stage => ({
          id: stage.id,
          contract_service_id: stage.contract_service_id,
          service_stage_id: stage.service_stage_id,
          name: stage.service_stages?.name || 'Sem nome',
          description: stage.service_stages?.description || null,
          category: stage.service_stages?.category || null,
          sort_order: stage.service_stages?.sort_order || 0,
          status: stage.status,
          is_not_applicable: stage.is_not_applicable,
          completed_at: stage.completed_at,
          completed_by: stage.completed_by
        }))
      };
    } catch (error) {
      console.error('❌ Erro no getContractServiceProgress:', error);
      throw error;
    }
  }

  /**
   * Buscar etapa por ID
   */
  async findById(id) {
    try {
      const { data, error } = await supabase
        .from('contract_service_stages')
        .select(`
          *,
          service_stages:service_stage_id (
            id,
            service_id,
            name,
            description,
            category,
            sort_order
          )
        `)
        .eq('id', id)
        .single();

      if (error && error.code === 'PGRST116') return null;
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('❌ Erro no findById de contract_service_stage:', error);
      throw error;
    }
  }
}

module.exports = new ContractServiceStageModel();
