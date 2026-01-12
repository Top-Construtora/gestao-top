const ServiceStage = require('../models/ServiceStage');
const Service = require('../models/Service');
const { 
  validateCreateServiceStage, 
  validateUpdateServiceStage,
  validateServiceStageId,
  validateServiceId,
  validateStageStatusUpdate,
  validateMultipleStageUpdates
} = require('../utils/serviceStageValidators');

class ServiceStageController {
  /**
   * Criar nova etapa para um serviço
   */
  async create(req, res, next) {
    try {
      const { error, value } = validateCreateServiceStage(req.body);
      if (error) {
        return res.status(400).json({
          error: error.details[0].message
        });
      }

      // Verificar se o serviço existe
      const service = await Service.findById(value.service_id);
      if (!service) {
        return res.status(404).json({
          error: 'Serviço não encontrado'
        });
      }

      const stage = await ServiceStage.create(value, req.user.id);

      // Sincronizar a nova etapa para todos os contract_services que usam este serviço
      const syncResult = await ServiceStage.syncStagesToContractServices(value.service_id);

      res.status(201).json({
        message: 'Etapa criada com sucesso',
        stage,
        syncResult
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Listar etapas de um serviço
   */
  async getByServiceId(req, res, next) {
    try {
      const { error: idError, value: idParams } = validateServiceId({ id: parseInt(req.params.serviceId) });
      if (idError) {
        return res.status(400).json({ 
          error: idError.details[0].message 
        });
      }

      // Verificar se o serviço existe
      const service = await Service.findById(idParams.id);
      if (!service) {
        return res.status(404).json({ 
          error: 'Serviço não encontrado' 
        });
      }

      const stages = await ServiceStage.findByServiceId(idParams.id);
      const progress = await ServiceStage.getServiceProgress(idParams.id);
      
      res.json({ 
        stages,
        progress,
        service: {
          id: service.id,
          name: service.name
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Buscar etapa por ID
   */
  async getById(req, res, next) {
    try {
      const { error: idError, value: idParams } = validateServiceStageId({ id: parseInt(req.params.id) });
      if (idError) {
        return res.status(400).json({ 
          error: idError.details[0].message 
        });
      }

      const stage = await ServiceStage.findById(idParams.id);
      
      if (!stage) {
        return res.status(404).json({ 
          error: 'Etapa não encontrada' 
        });
      }
      
      res.json({ stage });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Atualizar etapa
   */
  async update(req, res, next) {
    try {
      const { id } = req.params;
      const { error, value } = validateUpdateServiceStage(req.body);

      if (error) {
        return res.status(400).json({
          error: error.details[0].message
        });
      }

      const stage = await ServiceStage.update(parseInt(id), value, req.user.id);

      if (!stage) {
        return res.status(404).json({
          error: 'Etapa não encontrada'
        });
      }

      // Sincronizar mudanças para contract_services (garante que novas instâncias sejam criadas se necessário)
      const syncResult = await ServiceStage.syncStagesToContractServices(stage.service_id);

      res.json({
        message: 'Etapa atualizada com sucesso',
        stage,
        syncResult
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Atualizar status de uma etapa
   */
  async updateStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { error, value } = validateStageStatusUpdate(req.body);

      if (error) {
        return res.status(400).json({
          error: error.details[0].message
        });
      }

      const stage = await ServiceStage.updateStatus(parseInt(id), value.status, req.user.id);

      if (!stage) {
        return res.status(404).json({
          error: 'Etapa não encontrada'
        });
      }

      // Buscar progresso atualizado do serviço
      const progress = await ServiceStage.getServiceProgress(stage.service_id);

      const { supabase } = require('../config/database');
      let serviceAutoCompleted = false;
      let serviceAutoStarted = false;

      // Se a etapa foi marcada como 'completed' e havia pelo menos uma etapa pendente,
      // atualizar serviços de "not_started" para "in_progress"
      if (value.status === 'completed' && progress && progress.percentage > 0 && progress.percentage < 100) {
        // Buscar contract_services com status 'not_started' para este serviço
        const { data: notStartedServices } = await supabase
          .from('contract_services')
          .select('id')
          .eq('service_id', stage.service_id)
          .eq('status', 'not_started');

        if (notStartedServices && notStartedServices.length > 0) {
          // Atualizar para 'in_progress'
          await supabase
            .from('contract_services')
            .update({
              status: 'in_progress',
              updated_at: new Date().toISOString()
            })
            .eq('service_id', stage.service_id)
            .eq('status', 'not_started');

          // Atualizar rotinas associadas para 'in_progress'
          await supabase
            .from('service_routines')
            .update({
              status: 'in_progress',
              updated_at: new Date().toISOString()
            })
            .in('contract_service_id', notStartedServices.map(cs => cs.id))
            .eq('status', 'not_started');

          serviceAutoStarted = true;
        }
      }

      // Se todas as etapas estão 100% concluídas, atualizar status do serviço para "completed"
      if (progress && progress.percentage === 100) {
        // Atualizar todos os contract_services deste serviço para 'completed'
        await supabase
          .from('contract_services')
          .update({
            status: 'completed',
            updated_at: new Date().toISOString()
          })
          .eq('service_id', stage.service_id);

        // Buscar e atualizar todas as rotinas associadas
        const { data: contractServices } = await supabase
          .from('contract_services')
          .select('id')
          .eq('service_id', stage.service_id);

        if (contractServices && contractServices.length > 0) {
          await supabase
            .from('service_routines')
            .update({
              status: 'completed',
              updated_at: new Date().toISOString()
            })
            .in('contract_service_id', contractServices.map(cs => cs.id));
        }

        serviceAutoCompleted = true;
      }

      res.json({
        message: `Etapa marcada como ${stage.status === 'completed' ? 'concluída' : 'pendente'}`,
        stage,
        progress,
        serviceAutoCompleted,
        serviceAutoStarted
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Atualizar status de múltiplas etapas
   */
  async updateMultipleStatuses(req, res, next) {
    try {
      const { error, value } = validateMultipleStageUpdates(req.body);

      if (error) {
        return res.status(400).json({
          error: error.details[0].message
        });
      }

      const stages = await ServiceStage.updateMultipleStatuses(value.updates, req.user.id);

      // Buscar progresso atualizado para cada serviço único afetado
      const serviceIds = [...new Set(stages.map(stage => stage.service_id))];
      const progressData = {};
      const autoCompletedServices = [];
      const autoStartedServices = [];

      const { supabase } = require('../config/database');

      for (const serviceId of serviceIds) {
        progressData[serviceId] = await ServiceStage.getServiceProgress(serviceId);

        // Se pelo menos uma etapa foi concluída (mas não 100%), atualizar de "not_started" para "in_progress"
        if (progressData[serviceId] && progressData[serviceId].percentage > 0 && progressData[serviceId].percentage < 100) {
          const { data: notStartedServices } = await supabase
            .from('contract_services')
            .select('id')
            .eq('service_id', serviceId)
            .eq('status', 'not_started');

          if (notStartedServices && notStartedServices.length > 0) {
            await supabase
              .from('contract_services')
              .update({
                status: 'in_progress',
                updated_at: new Date().toISOString()
              })
              .eq('service_id', serviceId)
              .eq('status', 'not_started');

            await supabase
              .from('service_routines')
              .update({
                status: 'in_progress',
                updated_at: new Date().toISOString()
              })
              .in('contract_service_id', notStartedServices.map(cs => cs.id))
              .eq('status', 'not_started');

            autoStartedServices.push(serviceId);
          }
        }

        // Se todas as etapas estão 100% concluídas, atualizar status do serviço para "completed"
        if (progressData[serviceId] && progressData[serviceId].percentage === 100) {
          autoCompletedServices.push(serviceId);

          // Atualizar todos os contract_services deste serviço para 'completed'
          await supabase
            .from('contract_services')
            .update({
              status: 'completed',
              updated_at: new Date().toISOString()
            })
            .eq('service_id', serviceId);

          // Buscar e atualizar todas as rotinas associadas
          const { data: contractServices } = await supabase
            .from('contract_services')
            .select('id')
            .eq('service_id', serviceId);

          if (contractServices && contractServices.length > 0) {
            await supabase
              .from('service_routines')
              .update({
                status: 'completed',
                updated_at: new Date().toISOString()
              })
              .in('contract_service_id', contractServices.map(cs => cs.id));
          }
        }
      }

      res.json({
        message: 'Etapas atualizadas com sucesso',
        stages,
        progressData,
        autoCompletedServices,
        autoStartedServices
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Reordenar etapas de um serviço
   */
  async reorder(req, res, next) {
    try {
      const { serviceId } = req.params;
      const { stageOrders } = req.body;

      if (!stageOrders || !Array.isArray(stageOrders)) {
        return res.status(400).json({ 
          error: 'stageOrders deve ser um array com { id, sort_order }' 
        });
      }

      // Verificar se o serviço existe
      const service = await Service.findById(parseInt(serviceId));
      if (!service) {
        return res.status(404).json({ 
          error: 'Serviço não encontrado' 
        });
      }

      const stages = await ServiceStage.reorderStages(parseInt(serviceId), stageOrders, req.user.id);
      
      res.json({
        message: 'Etapas reordenadas com sucesso',
        stages
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Obter progresso de um serviço
   */
  async getProgress(req, res, next) {
    try {
      const { error: idError, value: idParams } = validateServiceId({ id: parseInt(req.params.serviceId) });
      if (idError) {
        return res.status(400).json({ 
          error: idError.details[0].message 
        });
      }

      // Verificar se o serviço existe
      const service = await Service.findById(idParams.id);
      if (!service) {
        return res.status(404).json({ 
          error: 'Serviço não encontrado' 
        });
      }

      const progress = await ServiceStage.getServiceProgress(idParams.id);
      
      res.json({ 
        progress,
        service: {
          id: service.id,
          name: service.name
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Criar etapas padrão para um serviço
   */
  async createDefault(req, res, next) {
    try {
      const { serviceId } = req.params;

      // Verificar se o serviço existe
      const service = await Service.findById(parseInt(serviceId));
      if (!service) {
        return res.status(404).json({ 
          error: 'Serviço não encontrado' 
        });
      }

      // Verificar se já existem etapas para este serviço
      const existingStages = await ServiceStage.findByServiceId(parseInt(serviceId));
      if (existingStages.length > 0) {
        return res.status(409).json({ 
          error: 'Este serviço já possui etapas cadastradas' 
        });
      }

      const stages = await ServiceStage.createDefaultStages(parseInt(serviceId), req.user.id);
      
      res.status(201).json({
        message: 'Etapas padrão criadas com sucesso',
        stages
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Atualizar is_not_applicable de uma etapa
   */
  async updateNotApplicable(req, res, next) {
    try {
      const { id } = req.params;
      const { is_not_applicable } = req.body;

      if (typeof is_not_applicable !== 'boolean') {
        return res.status(400).json({
          error: 'is_not_applicable deve ser um valor booleano'
        });
      }

      const stage = await ServiceStage.findById(parseInt(id));
      if (!stage) {
        return res.status(404).json({
          error: 'Etapa não encontrada'
        });
      }

      // Atualizar is_not_applicable
      const updatedStage = await ServiceStage.update(parseInt(id), { is_not_applicable }, req.user.id);

      // Buscar progresso atualizado do serviço
      const progress = await ServiceStage.getServiceProgress(updatedStage.service_id);

      res.json({
        message: `Etapa marcada como ${is_not_applicable ? 'não aplicável' : 'aplicável'}`,
        stage: updatedStage,
        progress
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Excluir etapa (soft delete)
   */
  async softDelete(req, res, next) {
    try {
      const { id } = req.params;

      const stage = await ServiceStage.findById(parseInt(id));
      if (!stage) {
        return res.status(404).json({
          error: 'Etapa não encontrada'
        });
      }

      await ServiceStage.softDelete(parseInt(id), req.user.id);

      // Remover contract_service_stages órfãs associadas a esta etapa
      await ServiceStage.removeOrphanedContractServiceStages(parseInt(id));

      res.json({
        message: 'Etapa removida com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Excluir etapa permanentemente (apenas admin)
   */
  async hardDelete(req, res, next) {
    try {
      const { id } = req.params;

      // Verificar se é admin
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          error: 'Apenas administradores podem excluir etapas permanentemente'
        });
      }

      const stage = await ServiceStage.findById(parseInt(id));
      if (!stage) {
        return res.status(404).json({
          error: 'Etapa não encontrada'
        });
      }

      // Remover contract_service_stages órfãs associadas a esta etapa ANTES de deletar
      await ServiceStage.removeOrphanedContractServiceStages(parseInt(id));

      await ServiceStage.hardDelete(parseInt(id));

      res.json({
        message: 'Etapa excluída permanentemente'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Sincronizar manualmente etapas de um serviço para todos os contract_services
   * Útil para corrigir dados ou quando há mudanças estruturais
   */
  async syncToContractServices(req, res, next) {
    try {
      const { serviceId } = req.params;

      // Verificar se o serviço existe
      const service = await Service.findById(parseInt(serviceId));
      if (!service) {
        return res.status(404).json({
          error: 'Serviço não encontrado'
        });
      }

      const syncResult = await ServiceStage.syncStagesToContractServices(parseInt(serviceId));

      res.json({
        message: 'Etapas sincronizadas com sucesso',
        result: syncResult
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ServiceStageController();