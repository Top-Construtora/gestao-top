const NotificationService = require('../src/services/notificationService');
const contractNotificationHelper = require('../src/services/contractNotificationHelper');
const Contract = require('../src/models/Contract');
const { User } = require('../src/models');
const Notification = require('../src/models/Notification');

// Mock das dependências
jest.mock('../src/models/Contract');
jest.mock('../src/models');
jest.mock('../src/models/Notification');
jest.mock('../src/config/websocket', () => ({
  getIO: jest.fn(() => ({
    to: jest.fn(() => ({
      emit: jest.fn()
    }))
  })),
  getSocketIdByUser: jest.fn()
}));

describe('Sistema de Notificações Direcionadas', () => {
  
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Notificações de Atribuição de Contrato', () => {
    
    it('deve notificar apenas usuários atribuídos ao contrato', async () => {
      // Preparar dados de teste
      const contractId = 1;
      const assignedUserIds = [2, 3, 4];
      const assignerId = 1;
      
      // Mock do contrato
      Contract.findById.mockResolvedValue({
        id: contractId,
        contract_number: 'TOP-2024-001'
      });
      
      // Mock do atribuidor
      User.findById.mockImplementation((id) => {
        if (id === assignerId) {
          return Promise.resolve({ id: 1, name: 'Admin João', is_active: true });
        }
        if (assignedUserIds.includes(id)) {
          return Promise.resolve({ 
            id, 
            name: `Usuário ${id}`, 
            is_active: true 
          });
        }
        return Promise.resolve(null);
      });
      
      // Mock da criação de notificação
      Notification.create.mockResolvedValue({ id: 1 });
      
      // Executar teste
      await NotificationService.notifyContractAssignment(contractId, assignedUserIds, assignerId);
      
      // Verificar que notificações foram criadas apenas para usuários atribuídos
      // (excluindo o próprio atribuidor)
      expect(Notification.create).toHaveBeenCalledTimes(assignedUserIds.length);
      
      // Verificar que o atribuidor não recebeu notificação
      const notificationCalls = Notification.create.mock.calls;
      notificationCalls.forEach(call => {
        expect(call[0].user_id).not.toBe(assignerId);
        expect(assignedUserIds).toContain(call[0].user_id);
      });
    });
    
    it('não deve notificar usuários não vinculados ao contrato', async () => {
      const contractId = 1;
      const assignedUserIds = [2];
      const assignerId = 1;
      const nonLinkedUserId = 5;
      
      Contract.findById.mockResolvedValue({
        id: contractId,
        contract_number: 'TOP-2024-001'
      });
      
      User.findById.mockImplementation((id) => {
        if (id === assignerId) {
          return Promise.resolve({ id: 1, name: 'Admin', is_active: true });
        }
        if (id === 2) {
          return Promise.resolve({ id: 2, name: 'Usuário 2', is_active: true });
        }
        return Promise.resolve(null);
      });
      
      Notification.create.mockResolvedValue({ id: 1 });
      
      // Tentar incluir usuário não vinculado
      await NotificationService.notifyContractAssignment(
        contractId, 
        [...assignedUserIds, nonLinkedUserId], 
        assignerId
      );
      
      // Verificar que apenas usuário válido foi notificado
      expect(Notification.create).toHaveBeenCalledTimes(1);
      expect(Notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 2,
          type: 'contract_assignment'
        })
      );
    });
    
    it('não deve notificar o próprio usuário que fez a atribuição', async () => {
      const contractId = 1;
      const assignerId = 1;
      const assignedUserIds = [1, 2]; // Incluindo o próprio atribuidor
      
      Contract.findById.mockResolvedValue({
        id: contractId,
        contract_number: 'TOP-2024-001'
      });
      
      User.findById.mockImplementation((id) => {
        return Promise.resolve({ 
          id, 
          name: `Usuário ${id}`, 
          is_active: true 
        });
      });
      
      Notification.create.mockResolvedValue({ id: 1 });
      
      await NotificationService.notifyContractAssignment(contractId, assignedUserIds, assignerId);
      
      // Verificar que apenas o usuário 2 foi notificado
      expect(Notification.create).toHaveBeenCalledTimes(1);
      expect(Notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 2,
          type: 'contract_assignment'
        })
      );
    });
  });

  describe('Notificações de Vencimento de Contrato', () => {
    
    it('deve notificar apenas usuários vinculados ao contrato e admins', async () => {
      const contractId = 1;
      const daysUntilExpiration = 7;
      
      Contract.findById.mockResolvedValue({
        id: contractId,
        contract_number: 'TOP-2024-001',
        end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      });
      
      // Mock usuários atribuídos
      Contract.getAssignedUsers.mockResolvedValue([
        { user: { id: 2, name: 'Usuário 2' }, is_active: true },
        { user: { id: 3, name: 'Usuário 3' }, is_active: true },
        { user: { id: 4, name: 'Usuário 4' }, is_active: false } // Inativo
      ]);
      
      // Mock admins
      User.findByRole.mockResolvedValue([
        { id: 1, name: 'Admin 1', is_active: true },
        { id: 5, name: 'Admin 2', is_active: true }
      ]);
      
      Notification.create.mockResolvedValue({ id: 1 });
      
      await NotificationService.notifyContractExpiring(contractId, daysUntilExpiration);
      
      // Verificar que notificações foram criadas
      // A quantidade depende da implementação do helper
      const notificationCalls = Notification.create.mock.calls;
      const notifiedUserIds = notificationCalls.map(call => call[0].user_id);
      
      // Verificar que usuário inativo não foi notificado
      expect(notifiedUserIds).not.toContain(4);
    });
  });

  describe('Notificações de Comentários em Serviços', () => {
    
    it('deve notificar apenas usuários do contrato exceto o autor do comentário', async () => {
      const contractServiceId = 10;
      const commentAuthorId = 2;
      const commentText = 'Novo comentário sobre o serviço';
      
      // Mock informações do serviço
      Contract.getContractServiceWithDetails.mockResolvedValue({
        contract_id: 1,
        contract_number: 'TOP-2024-001',
        service_name: 'Consultoria'
      });
      
      User.findById.mockResolvedValue({
        id: commentAuthorId,
        name: 'Autor do Comentário'
      });
      
      // Mock usuários atribuídos
      Contract.getAssignedUsers.mockResolvedValue([
        { user: { id: 2, name: 'Autor' }, is_active: true },
        { user: { id: 3, name: 'Usuário 3' }, is_active: true },
        { user: { id: 4, name: 'Usuário 4' }, is_active: true }
      ]);
      
      Notification.create.mockResolvedValue({ id: 1 });
      
      await NotificationService.notifyNewServiceComment(
        contractServiceId, 
        commentAuthorId, 
        commentText
      );
      
      // Verificar que o autor não foi notificado
      const notificationCalls = Notification.create.mock.calls;
      const notifiedUserIds = notificationCalls.map(call => call[0].user_id);
      
      expect(notifiedUserIds).not.toContain(commentAuthorId);
      
      // Verificar que outros usuários foram notificados
      notificationCalls.forEach(call => {
        expect(call[0].type).toBe('service_comment');
        expect(call[0].metadata.comment_preview).toBe(commentText.substring(0, 100));
      });
    });
  });

  describe('Notificações Globais do Sistema', () => {
    
    it('notificações de manutenção devem ser enviadas para todos os usuários ativos', async () => {
      // Mock todos os usuários ativos
      User.findAll = jest.fn().mockResolvedValue([
        { id: 1, name: 'Usuário 1', is_active: true },
        { id: 2, name: 'Usuário 2', is_active: true },
        { id: 3, name: 'Usuário 3', is_active: false }, // Inativo
        { id: 4, name: 'Usuário 4', is_active: true }
      ]);
      
      Notification.create.mockResolvedValue({ id: 1 });
      
      // Simular notificação global
      await NotificationService.notifyAdminsSystemEvent(
        'Manutenção Programada',
        'O sistema estará em manutenção das 22h às 23h',
        'system_maintenance',
        'high'
      );
      
      // Verificar que apenas usuários ativos foram notificados
      const notificationCalls = Notification.create.mock.calls;
      const notifiedUserIds = notificationCalls.map(call => call[0].user_id);
      
      // Usuário inativo (id: 3) não deve ser notificado
      expect(notifiedUserIds).not.toContain(3);
    });
  });

  describe('Notificações de Segurança (Apenas Admins)', () => {
    
    it('alertas de segurança devem ser enviados apenas para administradores', async () => {
      const email = 'user@example.com';
      const ipAddress = '192.168.1.1';
      const attemptCount = 5;
      
      // Mock apenas admins
      User.findByRole.mockResolvedValue([
        { id: 1, name: 'Admin 1', role: { name: 'admin' }, is_active: true },
        { id: 2, name: 'Admin 2', role: { name: 'admin' }, is_active: true }
      ]);
      
      Notification.create.mockResolvedValue({ id: 1 });
      
      await NotificationService.notifyAdminsFailedLogins(email, ipAddress, attemptCount);
      
      // Verificar que apenas admins foram notificados
      expect(Notification.create).toHaveBeenCalledTimes(2);
      
      const notificationCalls = Notification.create.mock.calls;
      notificationCalls.forEach(call => {
        expect(call[0].type).toBe('security_alert');
        expect(call[0].priority).toBe('high');
        expect(call[0].metadata.email).toBe(email);
        expect(call[0].metadata.ip_address).toBe(ipAddress);
      });
    });
  });

  describe('Helper de Determinação de Destinatários', () => {
    
    it('deve identificar corretamente usuários vinculados a contratos', async () => {
      const contractId = 1;
      
      // Mock usuários atribuídos
      Contract.getAssignedUsers.mockResolvedValue([
        { user: { id: 2, name: 'User 2' }, is_active: true },
        { user: { id: 3, name: 'User 3' }, is_active: true }
      ]);
      
      // Mock criador do contrato
      Contract.findById.mockResolvedValue({
        id: contractId,
        created_by: 4
      });
      
      const recipients = await contractNotificationHelper.getUsersForContractNotification(
        contractId,
        { includeAdmins: false }
      );
      
      // Deve incluir usuários atribuídos e criador
      expect(recipients).toContain(2);
      expect(recipients).toContain(3);
      expect(recipients).toContain(4);
    });
    
    it('deve excluir usuário quando solicitado', async () => {
      const contractId = 1;
      const excludeUserId = 2;
      
      Contract.getAssignedUsers.mockResolvedValue([
        { user: { id: 2, name: 'User 2' }, is_active: true },
        { user: { id: 3, name: 'User 3' }, is_active: true }
      ]);
      
      Contract.findById.mockResolvedValue({
        id: contractId,
        created_by: 4
      });
      
      const recipients = await contractNotificationHelper.getUsersForContractNotification(
        contractId,
        { excludeUserId }
      );
      
      // Não deve incluir usuário excluído
      expect(recipients).not.toContain(excludeUserId);
      expect(recipients).toContain(3);
      expect(recipients).toContain(4);
    });
  });
});

describe('Filtro de Notificações no Backend', () => {
  
  it('API deve retornar apenas notificações do usuário autenticado', async () => {
    const userId = 2;
    
    // Mock notificações no banco
    Notification.findByUserIdPaginated.mockResolvedValue({
      notifications: [
        { id: 1, user_id: userId, title: 'Notificação 1' },
        { id: 2, user_id: userId, title: 'Notificação 2' }
      ],
      total: 2,
      page: 1,
      limit: 20,
      totalPages: 1
    });
    
    const result = await NotificationService.getUserNotifications(userId, 1, 20);
    
    // Verificar que apenas notificações do usuário foram retornadas
    expect(result.notifications).toHaveLength(2);
    result.notifications.forEach(notification => {
      expect(notification.user_id).toBe(userId);
    });
  });
});