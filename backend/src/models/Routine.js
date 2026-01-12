const { supabase } = require('../config/database');

class Routine {
  /**
   * Buscar rotina por ID da rotina
   */
  static async findById(routineId) {
    try {
      const { data, error } = await supabase
        .from('service_routines')
        .select('*')
        .eq('id', routineId)
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    } catch (error) {
      console.error('Erro ao buscar rotina por ID:', error);
      throw error;
    }
  }

  /**
   * Buscar rotina por ID do serviço do contrato
   */
  static async findByContractServiceId(contractServiceId) {
    try {
      const { data, error } = await supabase
        .from('service_routines')
        .select('*')
        .eq('contract_service_id', contractServiceId)
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    } catch (error) {
      console.error('Erro ao buscar rotina:', error);
      throw error;
    }
  }

  /**
   * Criar nova rotina
   */
  static async create(routineData) {
    try {
      // Verificar se o contract_service existe antes de criar a rotina
      if (routineData.contract_service_id) {
        const { data: contractService, error: serviceError } = await supabase
          .from('contract_services')
          .select('id')
          .eq('id', routineData.contract_service_id)
          .single();

        if (serviceError || !contractService) {
          const error = new Error('Serviço do contrato não encontrado');
          error.code = 'SERVICE_NOT_FOUND';
          error.statusCode = 404;
          throw error;
        }
      }

      const { data, error } = await supabase
        .from('service_routines')
        .insert(routineData)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Erro ao criar rotina:', error);
      throw error;
    }
  }

  /**
   * Criar ou atualizar rotina
   */
  static async upsert(routineData) {
    try {
      const { data, error } = await supabase
        .from('service_routines')
        .upsert(routineData, { 
          onConflict: 'contract_service_id',
          returning: true 
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Erro ao salvar rotina:', error);
      throw error;
    }
  }

  /**
   * Atualizar status e data da rotina
   */
  static async updateStatus(contractServiceId, status, scheduledDate = null, notes = null) {
    try {
      // Primeiro, verificar se a rotina existe
      const { data: existingRoutine, error: findError } = await supabase
        .from('service_routines')
        .select('id')
        .eq('contract_service_id', contractServiceId)
        .single();

      if (findError && findError.code !== 'PGRST116') {
        throw findError;
      }

      const updateData = {
        status,
        updated_at: new Date().toISOString()
      };

      if (scheduledDate !== null) {
        updateData.scheduled_date = scheduledDate;
      }

      if (notes !== null) {
        updateData.notes = notes;
      }

      let result;

      if (existingRoutine) {
        // Se existe, fazer UPDATE
        const { data, error } = await supabase
          .from('service_routines')
          .update(updateData)
          .eq('contract_service_id', contractServiceId)
          .select()
          .single();

        if (error) throw error;
        result = data;
      } else {
        // Se não existe, primeiro verificar se o contract_service existe
        const { data: contractService, error: serviceError } = await supabase
          .from('contract_services')
          .select('id')
          .eq('id', contractServiceId)
          .single();

        if (serviceError || !contractService) {
          const error = new Error('Serviço do contrato não encontrado');
          error.code = 'SERVICE_NOT_FOUND';
          error.statusCode = 404;
          throw error;
        }

        // Se o serviço existe, fazer INSERT
        const insertData = {
          ...updateData,
          contract_service_id: contractServiceId
        };

        const { data, error } = await supabase
          .from('service_routines')
          .insert(insertData)
          .select()
          .single();

        if (error) throw error;
        result = data;
      }

      return result;
    } catch (error) {
      console.error('Erro ao atualizar status da rotina:', error);
      throw error;
    }
  }

  /**
   * Buscar comentários da rotina
   */
  static async getComments(routineId) {
    try {
      console.log('Buscando comentários para rotina:', routineId);
      
      const { data, error } = await supabase
        .from('routine_comments')
        .select(`
          *,
          user:users(id, name, email),
          attachments:routine_comment_attachments(*),
          referenced_stage:service_stages(id, name, category)
        `)
        .eq('routine_id', routineId)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Erro ao buscar comentários:', error);
        throw error;
      }
      
      console.log(`Encontrados ${data?.length || 0} comentários`);
      
      // Log para debug dos anexos
      data?.forEach(comment => {
        if (comment.has_attachments) {
          console.log(`Comentário ${comment.id} tem ${comment.attachments?.length || 0} anexos`);
        }
      });
      
      return data || [];
    } catch (error) {
      console.error('Erro ao buscar comentários:', error);
      throw error;
    }
  }

  /**
   * Adicionar comentário à rotina
   * CAMADA DE PROTEÇÃO EXTRA: Valida existência da rotina antes de salvar
   */
  static async addComment(routineId, userId, comment, hasAttachments = false, serviceStageId = null) {
    try {
      // PROTEÇÃO EXTRA: Verificar se a rotina existe antes de inserir
      const { data: routineExists, error: routineError } = await supabase
        .from('service_routines')
        .select('id, contract_service_id')
        .eq('id', routineId)
        .single();

      if (routineError || !routineExists) {
        const error = new Error(`Tentativa de comentar em rotina inexistente: ${routineId}`);
        error.code = 'ROUTINE_NOT_FOUND';
        console.error('🚨 SEGURANÇA: Tentativa de adicionar comentário em rotina inexistente', {
          routineId,
          userId,
          timestamp: new Date().toISOString()
        });
        throw error;
      }

      console.log('✅ Validação do Model: Rotina existe', {
        routineId: routineExists.id,
        contractServiceId: routineExists.contract_service_id,
        userId,
        timestamp: new Date().toISOString()
      });

      const insertData = {
        routine_id: routineId,
        user_id: userId,
        comment,
        has_attachments: hasAttachments
      };

      // Adicionar service_stage_id apenas se fornecido
      if (serviceStageId) {
        insertData.service_stage_id = serviceStageId;
      }

      const { data, error } = await supabase
        .from('routine_comments')
        .insert(insertData)
        .select(`
          *,
          user:users(id, name, email),
          referenced_stage:service_stages(id, name, category)
        `)
        .single();

      if (error) throw error;

      // Log de sucesso com detalhes completos
      console.log('✅ Comentário salvo com sucesso', {
        commentId: data.id,
        routineId: data.routine_id,
        userId: data.user_id,
        hasAttachments: data.has_attachments,
        timestamp: new Date().toISOString()
      });

      return data;
    } catch (error) {
      console.error('❌ Erro ao adicionar comentário:', error);
      throw error;
    }
  }

  /**
   * Adicionar anexo ao comentário
   */
  static async addAttachment(commentId, attachmentData) {
    try {
      const { data, error } = await supabase
        .from('routine_comment_attachments')
        .insert(attachmentData)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Erro ao adicionar anexo:', error);
      throw error;
    }
  }

  /**
   * Deletar comentário da rotina
   */
  static async deleteComment(commentId, userId) {
    try {
      // Primeiro verificar se o comentário existe e se o usuário tem permissão para deletar
      const { data: comment, error: findError } = await supabase
        .from('routine_comments')
        .select('id, user_id, has_attachments')
        .eq('id', commentId)
        .single();

      if (findError || !comment) {
        throw new Error('Comentário não encontrado');
      }

      // Verificar se o usuário é o dono do comentário
      if (comment.user_id !== userId) {
        throw new Error('Unauthorized: You can only delete your own comments');
      }

      // Se há anexos, deletar arquivos físicos primeiro
      if (comment.has_attachments) {
        const { data: attachments } = await supabase
          .from('routine_comment_attachments')
          .select('file_path')
          .eq('comment_id', commentId)
          .eq('is_active', true);

        if (attachments && attachments.length > 0) {
          const fs = require('fs').promises;
          for (const attachment of attachments) {
            try {
              await fs.unlink(attachment.file_path);
            } catch (unlinkError) {
              console.error('Erro ao deletar arquivo físico:', unlinkError);
              // Não falhar se não conseguir deletar o arquivo físico
            }
          }
        }

        // Deletar registros de anexos
        await supabase
          .from('routine_comment_attachments')
          .update({ is_active: false })
          .eq('comment_id', commentId);
      }

      // Deletar o comentário
      const { error: deleteError } = await supabase
        .from('routine_comments')
        .delete()
        .eq('id', commentId);

      if (deleteError) throw deleteError;

      return { success: true, message: 'Comentário deletado com sucesso' };
    } catch (error) {
      console.error('Erro ao deletar comentário:', error);
      throw error;
    }
  }

  /**
   * Buscar todas as rotinas de um contrato
   */
  static async findByContractId(contractId) {
    try {
      const { data, error } = await supabase
        .from('service_routines')
        .select(`
          *,
          contract_service:contract_services!inner(
            id,
            contract_id,
            service:services(id, name, category)
          )
        `)
        .eq('contract_service.contract_id', contractId)
        .order('scheduled_date', { ascending: true });
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Erro ao buscar rotinas do contrato:', error);
      throw error;
    }
  }
}

module.exports = Routine;