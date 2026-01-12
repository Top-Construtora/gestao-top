const Contract = require('../models/Contract');
const { User } = require('../models');

class ContractNotificationHelper {
  /**
   * Obtém todos os usuários que devem receber notificações de um contrato
   * @param {number} contractId - ID do contrato
   * @param {object} options - Opções de filtro
   * @param {boolean} options.includeAdmins - Se deve incluir administradores
   * @param {boolean} options.excludeUserId - ID do usuário a excluir (ex: quem fez a ação)
   * @returns {Array} Lista de IDs de usuários
   */
  async getUsersForContractNotification(contractId, options = {}) {
    const { includeAdmins = false, excludeUserId = null } = options;
    const userIds = new Set();

    try {
      // 1. Buscar usuários atribuídos ao contrato
      const assignedUsers = await Contract.getAssignedUsers(contractId);
      
      for (const assignment of assignedUsers) {
        if (assignment.is_active && assignment.user?.id) {
          userIds.add(assignment.user.id);
        }
      }

      // 2. Buscar o criador do contrato
      const contract = await Contract.findById(contractId);
      if (contract?.created_by) {
        userIds.add(contract.created_by);
      }

      // 3. Incluir administradores se solicitado
      if (includeAdmins) {
        const admins = await User.findByRole('admin');
        for (const admin of admins) {
          if (admin.is_active) {
            userIds.add(admin.id);
          }
        }
      }

      // 4. Remover o usuário que deve ser excluído (quem fez a ação)
      if (excludeUserId) {
        userIds.delete(excludeUserId);
      }

      return Array.from(userIds);
    } catch (error) {
      console.error('❌ Erro ao obter usuários para notificação:', error);
      return [];
    }
  }

  /**
   * Obtém apenas os administradores ativos
   * @returns {Array} Lista de IDs de administradores
   */
  async getAdminUserIds() {
    try {
      const admins = await User.findByRole('admin');
      return admins
        .filter(admin => admin.is_active)
        .map(admin => admin.id);
    } catch (error) {
      console.error('❌ Erro ao obter administradores:', error);
      return [];
    }
  }

  /**
   * Verifica se um usuário pode receber notificações de um contrato
   * @param {number} userId - ID do usuário
   * @param {number} contractId - ID do contrato
   * @returns {boolean} Se o usuário pode receber notificações
   */
  async canUserReceiveContractNotification(userId, contractId) {
    try {
      // 1. Verificar se o usuário existe e está ativo
      const user = await User.findById(userId);
      if (!user || !user.is_active) {
        return false;
      }

      // 2. Administradores sempre podem receber
      if (user.role?.name === 'admin') {
        return true;
      }

      // 3. Verificar se está atribuído ao contrato
      const assignedUsers = await Contract.getAssignedUsers(contractId);
      const isAssigned = assignedUsers.some(
        assignment => assignment.user.id === userId && assignment.is_active
      );

      if (isAssigned) {
        return true;
      }

      // 4. Verificar se é o criador do contrato
      const contract = await Contract.findById(contractId);
      if (contract?.created_by === userId) {
        return true;
      }

      return false;
    } catch (error) {
      console.error('❌ Erro ao verificar permissão de notificação:', error);
      return false;
    }
  }

  /**
   * Obtém notificações filtradas para tipos específicos
   * @param {string} notificationType - Tipo de notificação
   * @returns {object} Configuração de quem deve receber
   */
  getNotificationTargetConfig(notificationType) {
    const configs = {
      // Notificações de contrato
      'contract_assignment': {
        includeAdmins: false,
        onlyAssigned: true,
        excludeActor: true
      },
      'contract_created': {
        includeAdmins: true,
        onlyAssigned: false,
        excludeActor: false
      },
      'contract_updated': {
        includeAdmins: false,
        onlyAssigned: true,
        excludeActor: true
      },
      'contract_status_change': {
        includeAdmins: false,
        onlyAssigned: true,
        excludeActor: true
      },
      'contract_expiring': {
        includeAdmins: true,
        onlyAssigned: true,
        excludeActor: false
      },
      
      // Notificações de pagamento
      'payment_overdue': {
        includeAdmins: true,
        onlyAssigned: true,
        excludeActor: false
      },
      'payment_received': {
        includeAdmins: false,
        onlyAssigned: true,
        excludeActor: false
      },
      
      // Notificações de serviço
      'service_comment': {
        includeAdmins: false,
        onlyAssigned: true,
        excludeActor: true
      },
      'service_status_change': {
        includeAdmins: false,
        onlyAssigned: true,
        excludeActor: true
      },
      
      // Notificações de sistema (globais)
      'system_maintenance': {
        includeAdmins: true,
        onlyAssigned: false,
        excludeActor: false,
        isGlobal: true
      },
      'system_update': {
        includeAdmins: true,
        onlyAssigned: false,
        excludeActor: false,
        isGlobal: true
      },
      
      // Notificações de segurança (apenas admins)
      'security_alert': {
        includeAdmins: true,
        onlyAssigned: false,
        excludeActor: false,
        adminOnly: true
      },
      'failed_login': {
        includeAdmins: true,
        onlyAssigned: false,
        excludeActor: false,
        adminOnly: true
      }
    };

    return configs[notificationType] || {
      includeAdmins: false,
      onlyAssigned: true,
      excludeActor: true
    };
  }

  /**
   * Determina quem deve receber uma notificação baseado no tipo e contexto
   * @param {object} params - Parâmetros da notificação
   * @returns {Array} Lista de IDs de usuários que devem receber
   */
  async determineNotificationRecipients(params) {
    const { 
      notificationType, 
      contractId = null, 
      actorUserId = null,
      specificUserIds = null 
    } = params;

    // Se usuários específicos foram fornecidos, usar apenas eles
    if (specificUserIds && Array.isArray(specificUserIds)) {
      return specificUserIds.filter(id => id !== actorUserId);
    }

    const config = this.getNotificationTargetConfig(notificationType);
    const recipients = new Set();

    // Notificações globais (todos os usuários ativos)
    if (config.isGlobal) {
      const allUsers = await User.findAll({ where: { is_active: true } });
      allUsers.forEach(user => recipients.add(user.id));
      return Array.from(recipients);
    }

    // Notificações apenas para admins
    if (config.adminOnly) {
      const adminIds = await this.getAdminUserIds();
      return adminIds;
    }

    // Notificações relacionadas a contratos
    if (contractId) {
      const userIds = await this.getUsersForContractNotification(contractId, {
        includeAdmins: config.includeAdmins,
        excludeUserId: config.excludeActor ? actorUserId : null
      });
      
      userIds.forEach(id => recipients.add(id));
    }

    return Array.from(recipients);
  }
}

module.exports = new ContractNotificationHelper();