const ContractServiceStage = require('../models/ContractServiceStage');

class ContractServiceStageController {
  /**
   * Buscar etapas de um contract_service (serviço específico do contrato)
   */
  async getByContractServiceId(req, res, next) {
    try {
      const { contractServiceId } = req.params;

      if (!contractServiceId || isNaN(parseInt(contractServiceId))) {
        return res.status(400).json({
          error: 'ID do serviço do contrato inválido'
        });
      }

      const stages = await ContractServiceStage.findByContractServiceId(parseInt(contractServiceId));
      const progress = await ContractServiceStage.getContractServiceProgress(parseInt(contractServiceId));

      // Evitar cache para garantir dados atualizados
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');

      res.json({
        stages,
        progress
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Obter progresso de um contract_service
   */
  async getProgress(req, res, next) {
    try {
      const { contractServiceId } = req.params;

      if (!contractServiceId || isNaN(parseInt(contractServiceId))) {
        return res.status(400).json({
          error: 'ID do serviço do contrato inválido'
        });
      }

      const progress = await ContractServiceStage.getContractServiceProgress(parseInt(contractServiceId));

      // Evitar cache para garantir dados atualizados
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');

      res.json({
        progress
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
      const { status } = req.body;

      if (!status || !['pending', 'completed'].includes(status)) {
        return res.status(400).json({
          error: 'Status deve ser "pending" ou "completed"'
        });
      }

      const stage = await ContractServiceStage.updateStatus(parseInt(id), status, req.user.id);

      if (!stage) {
        return res.status(404).json({
          error: 'Etapa não encontrada'
        });
      }

      // Buscar progresso atualizado do contract_service
      const progress = await ContractServiceStage.getContractServiceProgress(stage.contract_service_id);

      const { supabase } = require('../config/database');
      let serviceAutoCompleted = false;
      let serviceAutoStarted = false;

      // Se a etapa foi marcada como 'completed' e há progresso (mas não 100%)
      // atualizar contract_service e rotina de "not_started" para "in_progress"
      if (status === 'completed' && progress && progress.progressPercentage > 0 && progress.progressPercentage < 100) {
        // Verificar se o contract_service está como 'not_started'
        const { data: contractService } = await supabase
          .from('contract_services')
          .select('id, status')
          .eq('id', stage.contract_service_id)
          .single();

        if (contractService && contractService.status === 'not_started') {
          // Atualizar para 'in_progress'
          await supabase
            .from('contract_services')
            .update({
              status: 'in_progress',
              updated_at: new Date().toISOString()
            })
            .eq('id', stage.contract_service_id);

          // Atualizar rotina associada para 'in_progress'
          await supabase
            .from('service_routines')
            .update({
              status: 'in_progress',
              updated_at: new Date().toISOString()
            })
            .eq('contract_service_id', stage.contract_service_id)
            .eq('status', 'not_started');

          serviceAutoStarted = true;
        }
      }

      // Se todas as etapas estão 100% concluídas, atualizar status para "completed"
      if (progress && progress.progressPercentage === 100) {
        // Atualizar contract_service para 'completed'
        await supabase
          .from('contract_services')
          .update({
            status: 'completed',
            updated_at: new Date().toISOString()
          })
          .eq('id', stage.contract_service_id);

        // Atualizar rotina associada para 'completed'
        await supabase
          .from('service_routines')
          .update({
            status: 'completed',
            updated_at: new Date().toISOString()
          })
          .eq('contract_service_id', stage.contract_service_id);

        serviceAutoCompleted = true;
      }

      res.json({
        message: `Etapa marcada como ${status === 'completed' ? 'concluída' : 'pendente'}`,
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

      const stage = await ContractServiceStage.findById(parseInt(id));
      if (!stage) {
        return res.status(404).json({
          error: 'Etapa não encontrada'
        });
      }

      const updatedStage = await ContractServiceStage.updateNotApplicable(parseInt(id), is_not_applicable, req.user.id);

      // Buscar progresso atualizado
      const progress = await ContractServiceStage.getContractServiceProgress(updatedStage.contract_service_id);

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
   * Atualizar status de múltiplas etapas
   */
  async updateMultipleStatuses(req, res, next) {
    try {
      const { updates } = req.body;

      if (!updates || !Array.isArray(updates)) {
        return res.status(400).json({
          error: 'updates deve ser um array com { id, status }'
        });
      }

      const stages = await ContractServiceStage.updateMultipleStatuses(updates, req.user.id);

      // Buscar progresso atualizado para cada contract_service único afetado
      const contractServiceIds = [...new Set(stages.map(stage => stage.contract_service_id))];
      const progressData = {};
      const autoCompletedServices = [];
      const autoStartedServices = [];

      const { supabase } = require('../config/database');

      for (const contractServiceId of contractServiceIds) {
        progressData[contractServiceId] = await ContractServiceStage.getContractServiceProgress(contractServiceId);

        // Se pelo menos uma etapa foi concluída (mas não 100%), atualizar de "not_started" para "in_progress"
        if (progressData[contractServiceId] && progressData[contractServiceId].progressPercentage > 0 && progressData[contractServiceId].progressPercentage < 100) {
          const { data: contractService } = await supabase
            .from('contract_services')
            .select('id, status')
            .eq('id', contractServiceId)
            .single();

          if (contractService && contractService.status === 'not_started') {
            await supabase
              .from('contract_services')
              .update({
                status: 'in_progress',
                updated_at: new Date().toISOString()
              })
              .eq('id', contractServiceId);

            await supabase
              .from('service_routines')
              .update({
                status: 'in_progress',
                updated_at: new Date().toISOString()
              })
              .eq('contract_service_id', contractServiceId)
              .eq('status', 'not_started');

            autoStartedServices.push(contractServiceId);
          }
        }

        // Se todas as etapas estão 100% concluídas, atualizar status para "completed"
        if (progressData[contractServiceId] && progressData[contractServiceId].progressPercentage === 100) {
          await supabase
            .from('contract_services')
            .update({
              status: 'completed',
              updated_at: new Date().toISOString()
            })
            .eq('id', contractServiceId);

          await supabase
            .from('service_routines')
            .update({
              status: 'completed',
              updated_at: new Date().toISOString()
            })
            .eq('contract_service_id', contractServiceId);

          autoCompletedServices.push(contractServiceId);
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
}

module.exports = new ContractServiceStageController();
