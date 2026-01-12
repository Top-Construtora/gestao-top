const Contract = require('../models/Contract');
const NotificationService = require('../services/notificationService');
const { 
  validateCreateContract, 
  validateUpdateContract,
  validateContractSearch,
  validateContractId,
  CONTRACT_TYPES,
  CONTRACT_STATUSES
} = require('../utils/validators');

class ContractController {
  /**
   * Criar novo contrato
   */
  async create(req, res, next) {
    try {
      console.log('🚀 [Controller] Recebendo dados para criar contrato:', JSON.stringify(req.body, null, 2));
      console.log('👤 [Controller] Usuário:', req.user);

      const { error, value } = validateCreateContract(req.body);
      if (error) {
        console.error('❌ [Controller] Erro de validação:', error.details);
        console.error('❌ [Controller] Dados recebidos que falharam:', req.body);
        return res.status(400).json({
          error: error.details[0].message,
          details: error.details
        });
      }

      console.log('✅ [Controller] Dados validados:', value);
      const contract = await Contract.create(value, req.user.id);

      // Criar rotinas para todos os services do contrato
      await Contract.createRoutinesForContract(contract.id);

      res.status(201).json({
        message: 'Contrato criado com sucesso',
        contract
      });
    } catch (error) {
      console.error('❌ [Controller] Erro ao criar contrato:', error);
      console.error('❌ [Controller] Stack trace:', error.stack);
      console.error('❌ [Controller] Erro detalhado:', {
        message: error.message,
        code: error.code,
        constraint: error.constraint,
        detail: error.detail,
        hint: error.hint
      });

      // Verificar se é erro de número duplicado
      if (error.code === '23505' && error.constraint === 'contracts_contract_number_key') {
        return res.status(400).json({
          error: 'Número de contrato já existe'
        });
      }

      // Retornar erro mais detalhado
      return res.status(500).json({
        error: error.message || 'Erro ao criar contrato',
        details: error.detail || error.message,
        code: error.code
      });
    }
  }

  /**
   * Listar contratos (apenas os que o usuário tem acesso)
   */
  async list(req, res, next) {
    try {
      const { error: searchError, value: searchParams } = validateContractSearch(req.query);
      if (searchError) {
        return res.status(400).json({ 
          error: searchError.details[0].message 
        });
      }

      const filters = {
        status: searchParams.status,
        type: searchParams.type,
        client_id: searchParams.client_id,
        search: searchParams.search,
        start_date: searchParams.start_date,
        end_date: searchParams.end_date,
        dateType: searchParams.dateType,
        month: searchParams.month,
        year: searchParams.year
      };

      // Se for admin ou admin_gerencial, buscar todos; senão, buscar apenas os que tem acesso
      const contracts = (req.user.role === 'admin' || req.user.role === 'admin_gerencial')
        ? await Contract.findAll(filters)
        : await Contract.findAllForUser(req.user.id, filters);
      
      res.json({ 
        contracts,
        total: contracts.length,
        filters: filters
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Buscar contrato por ID (verificar permissão)
   */
  async getById(req, res, next) {
    try {
      const { error, value } = validateContractId(req.params);
      if (error) {
        return res.status(400).json({ 
          error: error.details[0].message 
        });
      }

      // Verificar se o usuário tem acesso ao contrato (exceto admin e admin_gerencial)
      if (req.user.role !== 'admin' && req.user.role !== 'admin_gerencial') {
        const hasAccess = await Contract.userHasAccess(value.id, req.user.id);
        if (!hasAccess) {
          return res.status(403).json({
            error: 'Acesso negado a este contrato'
          });
        }
      }

      const contract = await Contract.findById(value.id);
      
      if (!contract) {
        return res.status(404).json({ 
          error: 'Contrato não encontrado' 
        });
      }

      // Incluir usuários atribuídos
      const assignedUsers = await Contract.getAssignedUsers(value.id);
      
      res.json({ 
        contract: {
          ...contract,
          assigned_users: assignedUsers
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Atualizar contrato
   */
  async update(req, res, next) {
    try {
      const { error: idError, value: idValue } = validateContractId(req.params);
      if (idError) {
        return res.status(400).json({ 
          error: idError.details[0].message 
        });
      }

      const { error: updateError, value: updateValue } = validateUpdateContract(req.body);
      if (updateError) {
        return res.status(400).json({ 
          error: updateError.details[0].message 
        });
      }

      // Verificar permissão (exceto admin e admin_gerencial)
      if (req.user.role !== 'admin' && req.user.role !== 'admin_gerencial') {
        const hasAccess = await Contract.userHasAccess(idValue.id, req.user.id);
        if (!hasAccess) {
          return res.status(403).json({
            error: 'Sem permissão para atualizar este contrato'
          });
        }

        // Verificar se tem role de editor ou owner
        const { data } = await require('../config/database').supabase
          .from('contract_assignments')
          .select('role')
          .match({
            contract_id: idValue.id,
            user_id: req.user.id,
            is_active: true
          })
          .single();

        if (!data || !['owner', 'editor'].includes(data.role)) {
          return res.status(403).json({ 
            error: 'Apenas proprietários e editores podem atualizar contratos' 
          });
        }
      }

      const contract = await Contract.update(idValue.id, updateValue, req.user.id);
      
      if (!contract) {
        return res.status(404).json({ 
          error: 'Contrato não encontrado' 
        });
      }

      res.json({
        message: 'Contrato atualizado com sucesso',
        contract
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Atribuir usuários ao contrato
   */
  async assignUsers(req, res, next) {
    try {
      const contractId = req.params.id;
      const { user_ids, role = 'viewer' } = req.body;

      if (!user_ids || !Array.isArray(user_ids)) {
        return res.status(400).json({ 
          error: 'Lista de IDs de usuários é obrigatória' 
        });
      }

      // Verificar se o usuário tem permissão para atribuir (deve ser owner, admin ou admin_gerencial)
      if (req.user.role !== 'admin' && req.user.role !== 'admin_gerencial') {
        const hasAccess = await Contract.userHasAccess(contractId, req.user.id);
        if (!hasAccess) {
          return res.status(403).json({
            error: 'Sem permissão para atribuir usuários a este contrato'
          });
        }

        // Verificar se é owner
        const { data } = await require('../config/database').supabase
          .from('contract_assignments')
          .select('role')
          .match({
            contract_id: contractId,
            user_id: req.user.id,
            is_active: true
          })
          .single();

        if (!data || data.role !== 'owner') {
          return res.status(403).json({ 
            error: 'Apenas proprietários podem atribuir usuários ao contrato' 
          });
        }
      }

      const assignments = await Contract.assignUsers(contractId, user_ids, req.user.id);
      
      // Notificar usuários atribuídos
      await NotificationService.notifyContractAssignment(contractId, user_ids, req.user.id);
      
      res.json({
        message: 'Usuários atribuídos com sucesso',
        assignments
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Remover atribuição de usuário
   */
  async unassignUser(req, res, next) {
    try {
      const contractId = req.params.id;
      const userId = parseInt(req.params.userId);

      // Verificar permissão
      if (req.user.role !== 'admin' && req.user.role !== 'admin_gerencial') {
        const hasAccess = await Contract.userHasAccess(contractId, req.user.id);
        if (!hasAccess) {
          return res.status(403).json({
            error: 'Sem permissão para remover atribuições deste contrato'
          });
        }

        // Verificar se é owner
        const { data } = await require('../config/database').supabase
          .from('contract_assignments')
          .select('role')
          .match({
            contract_id: contractId,
            user_id: req.user.id,
            is_active: true
          })
          .single();

        if (!data || data.role !== 'owner') {
          return res.status(403).json({ 
            error: 'Apenas proprietários podem remover atribuições' 
          });
        }

        // Prevenir auto-remoção se for o único owner
        if (userId === req.user.id && data.role === 'owner') {
          const { count } = await require('../config/database').supabase
            .from('contract_assignments')
            .select('*', { count: 'exact', head: true })
            .match({
              contract_id: contractId,
              role: 'owner',
              is_active: true
            });

          if (count <= 1) {
            return res.status(400).json({ 
              error: 'O contrato deve ter pelo menos um proprietário' 
            });
          }
        }
      }

      await Contract.unassignUser(contractId, userId);
      
      res.json({
        message: 'Atribuição removida com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Listar usuários atribuídos
   */
  async getAssignedUsers(req, res, next) {
    try {
      const contractId = req.params.id;

      // Verificar se o usuário tem acesso ao contrato
      if (req.user.role !== 'admin' && req.user.role !== 'admin_gerencial') {
        const hasAccess = await Contract.userHasAccess(contractId, req.user.id);
        if (!hasAccess) {
          return res.status(403).json({
            error: 'Sem permissão para ver usuários deste contrato'
          });
        }
      }

      const users = await Contract.getAssignedUsers(contractId);
      
      res.json({
        users,
        total: users.length
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Atualizar role de usuário
   */
  async updateUserRole(req, res, next) {
    try {
      const contractId = req.params.id;
      const userId = parseInt(req.params.userId);
      const { role } = req.body;

      const validRoles = ['owner', 'editor', 'viewer'];
      if (!role || !validRoles.includes(role)) {
        return res.status(400).json({ 
          error: `Role deve ser um dos seguintes: ${validRoles.join(', ')}` 
        });
      }

      // Verificar permissão
      if (req.user.role !== 'admin' && req.user.role !== 'admin_gerencial') {
        const hasAccess = await Contract.userHasAccess(contractId, req.user.id);
        if (!hasAccess) {
          return res.status(403).json({
            error: 'Sem permissão para alterar roles neste contrato'
          });
        }

        // Verificar se é owner
        const { data } = await require('../config/database').supabase
          .from('contract_assignments')
          .select('role')
          .match({
            contract_id: contractId,
            user_id: req.user.id,
            is_active: true
          })
          .single();

        if (!data || data.role !== 'owner') {
          return res.status(403).json({ 
            error: 'Apenas proprietários podem alterar roles' 
          });
        }
      }

      const updatedAssignment = await Contract.updateUserRole(contractId, userId, role);
      
      // Notificar usuário sobre mudança de role
      await NotificationService.notifyRoleChange(contractId, userId, role, req.user.id);
      
      res.json({
        message: 'Role atualizado com sucesso',
        assignment: updatedAssignment
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Alterar status do contrato
   */
  async updateStatus(req, res, next) {
    try {
      const { error: idError, value: idValue } = validateContractId(req.params);
      if (idError) {
        return res.status(400).json({ 
          error: idError.details[0].message 
        });
      }

      const { status } = req.body;
      
      if (!status || !CONTRACT_STATUSES.includes(status)) {
        return res.status(400).json({ 
          error: `Status deve ser um dos seguintes: ${CONTRACT_STATUSES.join(', ')}` 
        });
      }

      // Verificar permissão
      if (req.user.role !== 'admin' && req.user.role !== 'admin_gerencial') {
        const hasAccess = await Contract.userHasAccess(idValue.id, req.user.id);
        if (!hasAccess) {
          return res.status(403).json({
            error: 'Sem permissão para alterar status deste contrato'
          });
        }

        // Verificar se tem role adequado
        const { data } = await require('../config/database').supabase
          .from('contract_assignments')
          .select('role')
          .match({
            contract_id: idValue.id,
            user_id: req.user.id,
            is_active: true
          })
          .single();

        if (!data || !['owner', 'editor'].includes(data.role)) {
          return res.status(403).json({ 
            error: 'Apenas proprietários e editores podem alterar o status' 
          });
        }
      }

      const contract = await Contract.updateStatus(idValue.id, status, req.user.id);
      
      res.json({
        message: 'Status alterado com sucesso',
        contract
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Excluir contrato (soft delete)
   */
  async softDelete(req, res, next) {
    try {
      const { error, value } = validateContractId(req.params);
      if (error) {
        return res.status(400).json({ 
          error: error.details[0].message 
        });
      }

      // Verificar permissão
      if (req.user.role !== 'admin' && req.user.role !== 'admin_gerencial') {
        const hasAccess = await Contract.userHasAccess(value.id, req.user.id);
        if (!hasAccess) {
          return res.status(403).json({
            error: 'Sem permissão para excluir este contrato'
          });
        }

        // Verificar se é owner
        const { data } = await require('../config/database').supabase
          .from('contract_assignments')
          .select('role')
          .match({
            contract_id: value.id,
            user_id: req.user.id,
            is_active: true
          })
          .single();

        if (!data || data.role !== 'owner') {
          return res.status(403).json({ 
            error: 'Apenas proprietários podem excluir contratos' 
          });
        }
      }

      await Contract.softDelete(value.id, req.user.id);
      
      res.json({
        message: 'Contrato excluído com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Excluir contrato permanentemente (apenas admin)
   */
  async hardDelete(req, res, next) {
    try {
      const { error, value } = validateContractId(req.params);
      if (error) {
        return res.status(400).json({ 
          error: error.details[0].message 
        });
      }

      await Contract.hardDelete(value.id);
      
      res.json({
        message: 'Contrato excluído permanentemente'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Obter tipos de contratos
   */
  async getTypes(req, res) {
    res.json({
      types: CONTRACT_TYPES.map(type => ({
        value: type,
        label: type
      }))
    });
  }

  /**
   * Obter status de contratos
   */
  async getStatuses(req, res) {
    const statusLabels = {
      'active': 'Ativo',
      'completed': 'Concluído',
      'cancelled': 'Cancelado',
      'suspended': 'Suspenso'
    };

    res.json({
      statuses: CONTRACT_STATUSES.map(status => ({
        value: status,
        label: statusLabels[status] || status
      }))
    });
  }

  /**
   * Obter estatísticas
   */
  async getStats(req, res, next) {
    try {
      const isAdmin = req.user.role === 'admin' || req.user.role === 'admin_gerencial';
      const userId = isAdmin ? null : req.user.id;

      // Se for admin ou admin_gerencial, buscar todos os contratos; senão apenas os atribuídos
      const contracts = isAdmin
        ? await Contract.getAllWithDetails()
        : await Contract.getByUserId(userId);

      const stats = {
        total: contracts.length,
        active: 0,
        completed: 0,
        cancelled: 0,
        suspended: 0,
        totalValueActive: 0,
        totalValueAll: 0,
        typeStats: {
          Full: 0,
          Pontual: 0,
          Individual: 0,
          'Recrutamento & Seleção': 0
        },
        averageDuration: 0
      };

      if (contracts.length === 0) {
        return res.json({ stats });
      }

      let totalDurationDays = 0;
      let activeContractsCount = 0;

      // Processar cada contrato
      contracts.forEach(contract => {
        // Contar por status
        if (contract.status === 'active') {
          stats.active++;
          stats.totalValueActive += (contract.total_value || 0);
          activeContractsCount++;
          
          // Calcular duração para contratos ativos
          const startDate = new Date(contract.start_date);
          const endDate = contract.end_date ? new Date(contract.end_date) : new Date();
          const durationMs = endDate - startDate;
          const durationDays = Math.ceil(durationMs / (1000 * 60 * 60 * 24));
          totalDurationDays += durationDays;
        } else if (contract.status === 'completed') {
          stats.completed++;
        } else if (contract.status === 'cancelled') {
          stats.cancelled++;
        } else if (contract.status === 'suspended') {
          stats.suspended++;
        }

        // Somar valor total de todos os contratos
        stats.totalValueAll += (contract.total_value || 0);

        // Contar por tipo
        if (contract.type === 'Full') {
          stats.typeStats.Full++;
        } else if (contract.type === 'Pontual') {
          stats.typeStats.Pontual++;
        } else if (contract.type === 'Individual') {
          stats.typeStats.Individual++;
        } else if (contract.type === 'Recrutamento & Seleção') {
          stats.typeStats['Recrutamento & Seleção']++;
        }
      });

      if (activeContractsCount > 0) {
        stats.averageDuration = Math.round(totalDurationDays / activeContractsCount);
      }

      if (stats.total > 0) {
          stats.averageValue = stats.totalValueAll / stats.total;
        }

      // Calcular crescimento mensal
      const currentMonth = new Date();
      const lastMonth = new Date();
      lastMonth.setMonth(lastMonth.getMonth() - 1);
      
      const currentMonthKey = currentMonth.toISOString().substring(0, 7); // YYYY-MM
      const lastMonthKey = lastMonth.toISOString().substring(0, 7);
      
      const contractsThisMonth = contracts.filter(contract => {
        const contractDate = new Date(contract.created_at).toISOString().substring(0, 7);
        return contractDate === currentMonthKey;
      }).length;
      
      const contractsLastMonth = contracts.filter(contract => {
        const contractDate = new Date(contract.created_at).toISOString().substring(0, 7);
        return contractDate === lastMonthKey;
      }).length;
      
      let monthlyGrowth = 0;
      if (contractsLastMonth === 0 && contractsThisMonth > 0) {
        monthlyGrowth = 100; // Se não havia contratos no mês passado e há agora, é 100% de crescimento
      } else if (contractsLastMonth > 0) {
        monthlyGrowth = Math.round(((contractsThisMonth - contractsLastMonth) / contractsLastMonth) * 100);
      }
      
      stats.monthlyGrowth = monthlyGrowth;
      stats.contractsThisMonth = contractsThisMonth;
      stats.contractsLastMonth = contractsLastMonth;

      res.json({ stats });
    } catch (error) {
      console.error('❌ Erro ao buscar estatísticas:', error);
      next(error);
    }
  }

  async generateNumber(req, res, next) {
    try {
      const contractNumber = await Contract.generateContractNumber();
      
      res.json({ 
        contract_number: contractNumber,
        contractNumber: contractNumber
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Buscar um serviço específico por ID
   */
  async getContractServiceById(req, res, next) {
    try {
      const { serviceId } = req.params;

      // Buscar o serviço
      const contractService = await Contract.getContractServiceById(serviceId);
      if (!contractService) {
        return res.status(404).json({ 
          error: 'Serviço do contrato não encontrado' 
        });
      }

      // Verificar permissão no contrato
      if (req.user.role !== 'admin' && req.user.role !== 'admin_gerencial') {
        const contractId = contractService.contract_id || contractService.contract?.id;
        const hasAccess = await Contract.userHasAccess(contractId, req.user.id);
        if (!hasAccess) {
          return res.status(403).json({
            error: 'Sem permissão para ver este serviço'
          });
        }
      }
      
      res.json(contractService);
    } catch (error) {
      // Se é erro do Supabase indicando que não foi encontrado
      if (error.code === 'PGRST116' || error.message?.includes('JSON object requested, multiple (or no) rows returned')) {
        return res.status(404).json({ 
          error: 'Serviço do contrato não encontrado' 
        });
      }
      next(error);
    }
  }

  /**
   * Atualizar status e agendamento de um serviço do contrato
   */
  async updateContractService(req, res, next) {
    try {
      const { serviceId } = req.params;
      const { status, scheduled_start_date } = req.body;

      // Validar status
      const validStatuses = ['not_started', 'scheduled', 'in_progress', 'completed'];
      if (status && !validStatuses.includes(status)) {
        return res.status(400).json({ 
          error: `Status deve ser um dos seguintes: ${validStatuses.join(', ')}` 
        });
      }

      // Buscar o serviço para verificar permissões
      const contractService = await Contract.getContractServiceById(serviceId);
      if (!contractService) {
        return res.status(404).json({ 
          error: 'Serviço do contrato não encontrado' 
        });
      }

      // Verificar permissão no contrato
      if (req.user.role !== 'admin' && req.user.role !== 'admin_gerencial') {
        const hasAccess = await Contract.userHasAccess(contractService.contract.id, req.user.id);
        if (!hasAccess) {
          return res.status(403).json({
            error: 'Sem permissão para atualizar este serviço'
          });
        }

        // Verificar se tem role de editor ou owner
        const { data } = await require('../config/database').supabase
          .from('contract_assignments')
          .select('role')
          .match({
            contract_id: contractService.contract.id,
            user_id: req.user.id,
            is_active: true
          })
          .single();

        if (!data || !['owner', 'editor'].includes(data.role)) {
          return res.status(403).json({
            error: 'Apenas proprietários e editores podem atualizar serviços'
          });
        }
      }

      const updateData = {};
      if (status !== undefined) updateData.status = status;
      if (scheduled_start_date !== undefined) updateData.scheduled_start_date = scheduled_start_date;

      const updatedService = await Contract.updateContractService(serviceId, updateData);

      // Notificar sobre mudança de status se houver
      if (status !== undefined) {
        await NotificationService.notifyServiceStatusChange(serviceId, status, req.user.id);
      }
      
      res.json({
        message: 'Serviço atualizado com sucesso',
        service: updatedService
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Obter comentários de um serviço
   */
  async getServiceComments(req, res, next) {
    try {
      const { serviceId } = req.params;
      const ContractServiceComment = require('../models/ContractServiceComment');

      // Verificar se o serviço existe e se o usuário tem acesso
      const contractService = await Contract.getContractServiceById(serviceId);
      if (!contractService) {
        return res.status(404).json({ 
          error: 'Serviço do contrato não encontrado' 
        });
      }

      if (req.user.role !== 'admin' && req.user.role !== 'admin_gerencial') {
        const hasAccess = await Contract.userHasAccess(contractService.contract.id, req.user.id);
        if (!hasAccess) {
          return res.status(403).json({
            error: 'Sem permissão para ver comentários deste serviço'
          });
        }
      }

      const comments = await ContractServiceComment.getByContractServiceId(serviceId);
      
      res.json({
        comments,
        total: comments.length
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Adicionar comentário a um serviço
   */
  async addServiceComment(req, res, next) {
    try {
      const { serviceId } = req.params;
      const { comment } = req.body;
      const ContractServiceComment = require('../models/ContractServiceComment');

      if (!comment || comment.trim() === '') {
        return res.status(400).json({ 
          error: 'Comentário é obrigatório' 
        });
      }

      // Verificar se o serviço existe e se o usuário tem acesso
      const contractService = await Contract.getContractServiceById(serviceId);
      if (!contractService) {
        return res.status(404).json({ 
          error: 'Serviço do contrato não encontrado' 
        });
      }

      if (req.user.role !== 'admin' && req.user.role !== 'admin_gerencial') {
        const hasAccess = await Contract.userHasAccess(contractService.contract.id, req.user.id);
        if (!hasAccess) {
          return res.status(403).json({
            error: 'Sem permissão para comentar neste serviço'
          });
        }
      }

      const newComment = await ContractServiceComment.create({
        contract_service_id: serviceId,
        comment: comment.trim()
      }, req.user.id);
      
      // Notificar outros usuários sobre o novo comentário
      await NotificationService.notifyNewServiceComment(serviceId, req.user.id, comment.trim());
      
      res.status(201).json({
        message: 'Comentário adicionado com sucesso',
        comment: newComment
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Atualizar comentário
   */
  async updateServiceComment(req, res, next) {
    try {
      const { commentId } = req.params;
      const { comment } = req.body;
      const ContractServiceComment = require('../models/ContractServiceComment');

      if (!comment || comment.trim() === '') {
        return res.status(400).json({ 
          error: 'Comentário é obrigatório' 
        });
      }

      const updatedComment = await ContractServiceComment.update(
        commentId, 
        comment.trim(), 
        req.user.id
      );
      
      res.json({
        message: 'Comentário atualizado com sucesso',
        comment: updatedComment
      });
    } catch (error) {
      if (error.message === 'Unauthorized: You can only edit your own comments') {
        return res.status(403).json({ error: error.message });
      }
      next(error);
    }
  }

  /**
   * Deletar comentário
   */
  async deleteServiceComment(req, res, next) {
    try {
      const { commentId } = req.params;
      const ContractServiceComment = require('../models/ContractServiceComment');

      await ContractServiceComment.delete(
        commentId,
        req.user.id,
        req.user.role === 'admin' || req.user.role === 'admin_gerencial'
      );
      
      res.json({
        message: 'Comentário removido com sucesso'
      });
    } catch (error) {
      if (error.message === 'Unauthorized: You can only delete your own comments') {
        return res.status(403).json({ error: error.message });
      }
      next(error);
    }
  }

  /**
   * Buscar atividades recentes dos serviços
   */
  async getRecentServiceActivities(req, res, next) {
    try {
      const limit = parseInt(req.query.limit) || 10;
      const userId = (req.user.role === 'admin' || req.user.role === 'admin_gerencial') ? null : req.user.id;

      const activities = await Contract.getRecentServiceActivities(userId, limit);
      
      res.json({
        success: true,
        activities
      });
    } catch (error) {
      console.error('❌ Erro ao buscar atividades recentes:', error);
      next(error);
    }
  }

  /**
   * Obter tipos de contrato disponíveis
   */
  async getTypes(req, res, next) {
    try {
      const { CONTRACT_TYPES } = require('../utils/validators');
      
      const types = CONTRACT_TYPES.map(type => ({
        value: type,
        label: type
      }));

      res.json({ types });
    } catch (error) {
      console.error('❌ Erro ao buscar tipos de contrato:', error);
      next(error);
    }
  }

  /**
   * Obter status de contrato disponíveis
   */
  async getStatuses(req, res, next) {
    try {
      const { CONTRACT_STATUSES } = require('../utils/validators');
      
      const statuses = CONTRACT_STATUSES.map(status => ({
        value: status,
        label: status
      }));

      res.json({ statuses });
    } catch (error) {
      console.error('❌ Erro ao buscar status de contrato:', error);
      next(error);
    }
  }

  /**
   * Buscar contratos por cliente
   */
  async getByClient(req, res, next) {
    try {
      const clientId = req.params.clientId;

      if (!clientId) {
        return res.status(400).json({ error: 'client_id é obrigatório' });
      }

      const contracts = await Contract.findAllByClientId(clientId);

      res.json({ contracts });
    } catch (error) {
      console.error('❌ Erro ao buscar contratos por cliente:', error);
      next(error);
    }
  }

  /**
   * Endpoint otimizado para página de rotinas
   * Retorna apenas contratos ativos (exceto R&S) com dados mínimos necessários
   */
  async getRoutines(req, res, next) {
    try {
      const isAdmin = req.user.role === 'admin' || req.user.role === 'admin_gerencial';
      const routines = await Contract.findAllForRoutines(isAdmin ? null : req.user.id);

      // Evitar cache
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');

      res.json({
        routines,
        total: routines.length
      });
    } catch (error) {
      console.error('❌ Erro ao buscar rotinas:', error);
      next(error);
    }
  }
}

module.exports = new ContractController();