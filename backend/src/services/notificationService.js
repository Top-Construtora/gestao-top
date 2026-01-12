const Notification = require('../models/Notification');
const { getIO, getSocketIdByUser } = require('../config/websocket');
const Contract = require('../models/Contract');
const { User } = require('../models');
const contractNotificationHelper = require('./contractNotificationHelper');

class NotificationService {
  async create(notificationData) {
    try {

      const newNotification = await Notification.create(notificationData);

      const io = getIO();
      const userSocketId = getSocketIdByUser(newNotification.user_id);

      if (userSocketId) {
        io.to(userSocketId).emit('new_notification', newNotification);
      } else {
      }

      return newNotification;

    } catch (error) {
      console.error('❌ Erro no serviço ao criar notificação:', error);
      console.error('❌ Dados da notificação:', notificationData);
      throw error;
    }
  }

  /**
   * Notifica usuários que foram atribuídos a um contrato.
   */
  async notifyContractAssignment(contractId, assignedUserIds, assignerId) {
    try {
      console.log(`🔔 Iniciando notificação de atribuição - Contrato: ${contractId}, Usuários: [${assignedUserIds.join(', ')}], Atribuidor: ${assignerId}`);
      
      const contract = await Contract.findById(contractId);
      const assigner = await User.findById(assignerId);

      if (!contract || !assigner) {
        console.log(`❌ Contrato ou atribuidor não encontrado - Contrato: ${contract ? 'OK' : 'ERRO'}, Atribuidor: ${assigner ? 'OK' : 'ERRO'}`);
        return;
      }

      const message = `Você foi atribuído ao contrato ${contract.contract_number} por ${assigner.name}.`;
      
      // Usar o helper para determinar quem deve receber
      const recipients = await contractNotificationHelper.determineNotificationRecipients({
        notificationType: 'contract_assignment',
        contractId: contractId,
        actorUserId: assignerId,
        specificUserIds: assignedUserIds
      });
      
      console.log(`📋 Destinatários determinados: [${recipients.join(', ')}]`);
      
      for (const userId of recipients) {
        const targetUser = await User.findById(userId);
        if (!targetUser || !targetUser.is_active) {
          console.log(`❌ Usuário ${userId} não encontrado ou inativo`);
          continue;
        }
        
        await this.create({
          user_id: userId,
          type: 'contract_assignment',
          title: 'Novo Contrato Atribuído',
          message,
          link: `/home/contracts/view/${contractId}`,
          metadata: {
            contract_id: contractId,
            assigner_id: assignerId
          }
        });
        
      }
    } catch (error) {
      console.error('❌ Erro ao notificar atribuição de contrato:', error);
    }
  }

  /**
   * Notifica um usuário que sua permissão em um contrato foi alterada.
   */
  async notifyRoleChange(contractId, userId, newRole, changerId) {
    try {
      const contract = await Contract.findById(contractId);
      const changer = await User.findById(changerId);

      if (!contract || !changer) return;
      
      // Verificar se o usuário pode receber notificações deste contrato
      const canReceive = await contractNotificationHelper.canUserReceiveContractNotification(userId, contractId);
      if (!canReceive) {
        console.log(`❌ Usuário ${userId} não pode receber notificações do contrato ${contractId}`);
        return;
      }

      const roleLabels = { owner: 'Proprietário', editor: 'Editor', viewer: 'Visualizador' };
      const message = `Sua permissão no contrato ${contract.contract_number} foi alterada para "${roleLabels[newRole] || newRole}" por ${changer.name}.`;

      await this.create({
        user_id: userId,
        type: 'permission_change',
        title: 'Permissão de Contrato Alterada',
        message,
        link: `/home/contracts/view/${contractId}`,
        metadata: {
          contract_id: contractId,
          new_role: newRole,
          changer_id: changerId
        }
      });
    } catch (error) {
      console.error('❌ Erro ao notificar mudança de permissão:', error);
    }
  }

  /**
   * Notifica sobre vencimento de contratos
   */
  async notifyContractExpiring(contractId, daysUntilExpiration) {
    try {
      const contract = await Contract.findById(contractId);
      if (!contract) return;

      // Usar o helper para determinar quem deve receber
      const recipients = await contractNotificationHelper.determineNotificationRecipients({
        notificationType: 'contract_expiring',
        contractId: contractId
      });
      
      const message = `O contrato ${contract.contract_number} expirará em ${daysUntilExpiration} dias (${new Date(contract.end_date).toLocaleDateString('pt-BR')}).`;
      
      for (const userId of recipients) {
        await this.create({
          user_id: userId,
          type: 'contract_expiring',
          title: 'Contrato Próximo do Vencimento',
          message,
          link: `/home/contracts/view/${contractId}`,
          priority: daysUntilExpiration <= 7 ? 'high' : 'normal',
          metadata: {
            contract_id: contractId,
            days_until_expiration: daysUntilExpiration
          }
        });
      }
    } catch (error) {
      console.error('❌ Erro ao notificar vencimento de contrato:', error);
    }
  }

  /**
   * Notifica sobre pagamentos em atraso
   */
  async notifyPaymentOverdue(contractId, daysOverdue) {
    try {
      const contract = await Contract.findById(contractId);
      if (!contract) return;

      // Verificar se já existe notificação similar recente (últimas 24h)
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      const { data: existingNotifications, error: checkError } = await require('../config/database').supabase
        .from('notifications')
        .select('id')
        .eq('type', 'payment_overdue')
        .contains('metadata', { contract_id: contractId, days_overdue: daysOverdue })
        .gte('created_at', yesterday.toISOString())
        .limit(1);

      if (checkError) {
        console.error('❌ Erro ao verificar notificações existentes:', checkError);
        return;
      }

      // Se já existe notificação similar nas últimas 24h, não criar nova
      if (existingNotifications && existingNotifications.length > 0) {
        console.log(`⏭️ Notificação de pagamento em atraso já enviada para contrato ${contract.contract_number} (${daysOverdue} dias)`);
        return;
      }

      // Usar o helper para determinar quem deve receber
      const recipients = await contractNotificationHelper.determineNotificationRecipients({
        notificationType: 'payment_overdue',
        contractId: contractId
      });
      
      const message = `O pagamento do contrato ${contract.contract_number} está em atraso há ${daysOverdue} dias.`;
      
      for (const userId of recipients) {
        await this.create({
          user_id: userId,
          type: 'payment_overdue',
          title: 'Pagamento em Atraso',
          message,
          link: `/home/contracts/view/${contractId}`,
          priority: 'high',
          metadata: {
            contract_id: contractId,
            days_overdue: daysOverdue
          }
        });
      }

      console.log(`📢 Notificação de pagamento em atraso enviada para contrato ${contract.contract_number} (${daysOverdue} dias)`);
    } catch (error) {
      console.error('❌ Erro ao notificar pagamento em atraso:', error);
    }
  }

  /**
   * Notifica sobre novo comentário em serviço
   */
  async notifyNewServiceComment(contractServiceId, commentAuthorId, commentText) {
    try {
      // Buscar informações do serviço e contrato
      const serviceInfo = await Contract.getContractServiceWithDetails(contractServiceId);
      if (!serviceInfo) return;

      const author = await User.findById(commentAuthorId);
      if (!author) return;

      // Usar o helper para determinar quem deve receber
      const recipients = await contractNotificationHelper.determineNotificationRecipients({
        notificationType: 'service_comment',
        contractId: serviceInfo.contract_id,
        actorUserId: commentAuthorId
      });
      
      const message = `${author.name} adicionou um comentário ao serviço "${serviceInfo.service_name}" do contrato ${serviceInfo.contract_number}.`;
      
      for (const userId of recipients) {
        await this.create({
          user_id: userId,
          type: 'service_comment',
          title: 'Novo Comentário em Serviço',
          message,
          link: `/home/contracts/view/${serviceInfo.contract_id}#service-${contractServiceId}`,
          metadata: {
            contract_id: serviceInfo.contract_id,
            service_id: contractServiceId,
            comment_preview: commentText.substring(0, 100),
            author_id: commentAuthorId
          }
        });
      }
    } catch (error) {
      console.error('❌ Erro ao notificar novo comentário:', error);
    }
  }

  /**
   * Notifica sobre mudança de status de serviço
   */
  async notifyServiceStatusChange(contractServiceId, newStatus, changedBy) {
    try {
      const serviceInfo = await Contract.getContractServiceWithDetails(contractServiceId);
      if (!serviceInfo) return;

      const changer = await User.findById(changedBy);
      if (!changer) return;

      // Usar o helper para determinar quem deve receber
      const recipients = await contractNotificationHelper.determineNotificationRecipients({
        notificationType: 'service_status_change',
        contractId: serviceInfo.contract_id,
        actorUserId: changedBy
      });
      
      const statusLabels = {
        'not_started': 'Não Iniciado',
        'scheduled': 'Agendado',
        'in_progress': 'Em Andamento',
        'completed': 'Concluído'
      };

      const message = `O status do serviço "${serviceInfo.service_name}" foi alterado para "${statusLabels[newStatus]}" por ${changer.name}.`;
      
      for (const userId of recipients) {
        await this.create({
          user_id: userId,
          type: 'service_status_change',
          title: 'Status de Serviço Alterado',
          message,
          link: `/home/contracts/view/${serviceInfo.contract_id}#service-${contractServiceId}`,
          metadata: {
            contract_id: serviceInfo.contract_id,
            service_id: contractServiceId,
            new_status: newStatus,
            changed_by: changedBy
          }
        });
      }
    } catch (error) {
      console.error('❌ Erro ao notificar mudança de status:', error);
    }
  }

  /**
   * Busca todas as notificações do usuário com paginação
   */
  async getUserNotifications(userId, page = 1, limit = 20) {
    try {
      return await Notification.findByUserIdPaginated(userId, page, limit);
    } catch (error) {
      console.error('❌ Erro ao buscar notificações paginadas:', error);
      throw error;
    }
  }

  /**
   * Conta notificações não lidas do usuário
   */
  async getUnreadCount(userId) {
    try {
      return await Notification.countUnreadByUserId(userId);
    } catch (error) {
      console.error('❌ Erro ao contar notificações não lidas:', error);
      throw error;
    }
  }

  /**
   * Marca todas as notificações do usuário como lidas
   */
  async markAllAsRead(userId) {
    try {
      return await Notification.markAllAsReadByUserId(userId);
    } catch (error) {
      console.error('❌ Erro ao marcar todas como lidas:', error);
      throw error;
    }
  }

  /**
   * Notifica todos os administradores sobre eventos importantes
   */
  async notifyAdmins(type, title, message, link = null, priority = 'normal', metadata = {}) {
    try {
      // Buscar todos os usuários com role de admin
      const admins = await User.findByRole('admin');
      
      if (!admins || admins.length === 0) {
        console.log('💡 Nenhum administrador encontrado para notificar');
        return;
      }

      console.log(`🔔 Notificando ${admins.length} administrador(es) sobre: ${title}`);
      
      for (const admin of admins) {
        await this.create({
          user_id: admin.id,
          type,
          title,
          message,
          link,
          priority,
          metadata
        });
      }
    } catch (error) {
      console.error('❌ Erro ao notificar administradores:', error);
    }
  }

  /**
   * Notifica administradores sobre novo contrato criado
   */
  async notifyAdminsNewContract(contractId, creatorId) {
    try {
      const contract = await Contract.findById(contractId);
      const creator = await User.findById(creatorId);

      if (!contract || !creator) return;

      // Buscar nome do cliente baseado no tipo (PF ou PJ)
      let clientName = 'N/A';
      if (contract.client) {
        clientName = contract.client.name || 'Cliente sem nome';
      }

      const message = `Novo contrato ${contract.contract_number} foi criado por ${creator.name}. Cliente: ${clientName}.`;
      
      // Usar o helper para obter apenas administradores
      const adminIds = await contractNotificationHelper.getAdminUserIds();
      
      for (const adminId of adminIds) {
        // Não notificar o admin se ele foi quem criou
        if (adminId === creatorId) continue;
        
        await this.create({
          user_id: adminId,
          type: 'new_contract',
          title: 'Novo Contrato Criado',
          message,
          link: `/home/contracts/view/${contractId}`,
          priority: 'normal',
          metadata: {
            contract_id: contractId,
            contract_number: contract.contract_number,
            creator_id: creatorId,
            client_name: clientName
          }
        });
      }
    } catch (error) {
      console.error('❌ Erro ao notificar criação de contrato:', error);
    }
  }

  /**
   * Notifica administradores sobre novo usuário criado
   */
  async notifyAdminsNewUser(userId, creatorId) {
    try {
      const newUser = await User.findById(userId);
      const creator = await User.findById(creatorId);

      if (!newUser || !creator) return;

      const message = `Novo usuário ${newUser.name} (${newUser.email}) foi criado por ${creator.name}.`;
      
      await this.notifyAdmins(
        'new_user',
        'Novo Usuário Criado',
        message,
        `/home/users`,
        'normal',
        {
          new_user_id: userId,
          creator_id: creatorId
        }
      );
    } catch (error) {
      console.error('❌ Erro ao notificar criação de usuário:', error);
    }
  }

  /**
   * Notifica administradores sobre tentativas de login falhadas múltiplas
   */
  async notifyAdminsFailedLogins(email, ipAddress, attemptCount) {
    try {
      const message = `Múltiplas tentativas de login falhadas (${attemptCount}x) para o email ${email} do IP ${ipAddress}.`;
      
      await this.notifyAdmins(
        'security_alert',
        'Alerta de Segurança: Login Falhado',
        message,
        null,
        'high',
        {
          email,
          ip_address: ipAddress,
          attempt_count: attemptCount,
          timestamp: new Date().toISOString()
        }
      );
    } catch (error) {
      console.error('❌ Erro ao notificar tentativas de login:', error);
    }
  }

  /**
   * Notifica administradores sobre contratos que requerem aprovação
   */
  async notifyAdminsContractNeedsApproval(contractId, reason) {
    try {
      const contract = await Contract.findById(contractId);
      if (!contract) return;

      const message = `O contrato ${contract.contract_number} requer aprovação administrativa. Motivo: ${reason}.`;
      
      await this.notifyAdmins(
        'approval_required',
        'Aprovação de Contrato Necessária',
        message,
        `/home/contracts/view/${contractId}`,
        'high',
        {
          contract_id: contractId,
          contract_number: contract.contract_number,
          reason
        }
      );
    } catch (error) {
      console.error('❌ Erro ao notificar aprovação necessária:', error);
    }
  }

  /**
   * Notifica administradores sobre eventos críticos do sistema
   */
  async notifyAdminsSystemEvent(title, message, type = 'system_event', priority = 'high') {
    try {
      await this.notifyAdmins(
        type,
        title,
        message,
        null,
        priority,
        {
          system_event: true,
          timestamp: new Date().toISOString()
        }
      );
    } catch (error) {
      console.error('❌ Erro ao notificar evento do sistema:', error);
    }
  }

  /**
   * Verifica se um usuário tem vínculo ativo com um contrato
   * Esta função é crucial para garantir que apenas usuários
   * vinculados ao contrato recebam notificações relevantes
   */
  async checkUserContractLink(userId, contractId) {
    try {
      
      // Verificar se é admin (admins veem tudo)
      const user = await User.findById(userId);
      if (!user) {
        console.log(`❌ Usuário ${userId} não encontrado`);
        return false;
      }
      
      console.log(`📋 Usuário encontrado: ${user.name}, role: ${user.role?.name}`);
      
      // Se for admin, permitir acesso a todos os contratos
      if (user.role?.name === 'admin') {
        console.log(`👑 Usuário ${userId} é admin - acesso liberado ao contrato ${contractId}`);
        return true;
      }

      // Para usuários normais, verificar se estão atribuídos ao contrato
      console.log(`🔍 Buscando usuários atribuídos ao contrato ${contractId}...`);
      const assignedUsers = await Contract.getAssignedUsers(contractId);
      console.log(`📝 Usuários atribuídos encontrados:`, assignedUsers.map(a => ({
        userId: a.user.id,
        userName: a.user.name,
        isActive: a.is_active
      })));
      
      const isAssigned = assignedUsers.some(assignment => 
        assignment.user.id === userId && assignment.is_active === true
      );

      if (isAssigned) {
      } else {
        console.log(`❌ Usuário ${userId} NÃO está vinculado ao contrato ${contractId}`);
        console.log(`🔍 Motivo: usuário não encontrado na lista de atribuições ativas`);
      }

      return isAssigned;
    } catch (error) {
      console.error('❌ Erro ao verificar vínculo do usuário com contrato:', error);
      // Em caso de erro, negar acesso por segurança
      return false;
    }
  }

  /**
   * Método utilitário para filtrar notificações baseado em vínculos
   * Usado pelo frontend para filtrar notificações já recebidas
   */
  async filterNotificationsByUserAccess(userId, notifications) {
    try {
      const filteredNotifications = [];
      
      for (const notification of notifications) {
        // Se não tem metadata com contract_id, é uma notificação geral (manter)
        if (!notification.metadata?.contract_id) {
          filteredNotifications.push(notification);
          continue;
        }

        // Verificar se o usuário tem acesso ao contrato da notificação
        const hasAccess = await this.checkUserContractLink(userId, notification.metadata.contract_id);
        if (hasAccess) {
          filteredNotifications.push(notification);
        }
      }

      return filteredNotifications;
    } catch (error) {
      console.error('❌ Erro ao filtrar notificações por acesso:', error);
      // Em caso de erro, retornar array vazio por segurança
      return [];
    }
  }

  /**
   * Deletar todas as notificações de um usuário
   */
  async deleteAllUserNotifications(userId) {
    try {
      return await Notification.deleteAllByUserId(userId);
    } catch (error) {
      console.error('❌ Erro ao deletar notificações do usuário:', error);
      throw error;
    }
  }

  /**
   * Deletar notificações antigas de um usuário
   */
  async deleteOldNotifications(userId, daysOld = 30) {
    try {
      return await Notification.deleteOldNotifications(userId, daysOld);
    } catch (error) {
      console.error('❌ Erro ao deletar notificações antigas:', error);
      throw error;
    }
  }
}

module.exports = new NotificationService();