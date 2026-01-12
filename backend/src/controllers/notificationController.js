const Notification = require('../models/Notification');
const NotificationService = require('../services/notificationService');

class NotificationController {
  // Método de teste para debugar notificações
  async testNotification(req, res, next) {
    try {
      const userId = req.user.id;
      console.log(`🧪 TESTE: Criando notificação de teste para usuário ${userId}`);
      
      const testNotification = await NotificationService.create({
        user_id: userId,
        type: 'info',
        title: 'Teste de Notificação',
        message: `Esta é uma notificação de teste criada às ${new Date().toLocaleString('pt-BR')}`,
        priority: 'normal'
      });
      
      console.log(`🧪 TESTE: Notificação criada:`, testNotification);
      
      res.json({ 
        success: true, 
        message: 'Notificação de teste criada com sucesso!',
        notification: testNotification 
      });
    } catch (error) {
      console.error('🧪 TESTE: Erro ao criar notificação de teste:', error);
      next(error);
    }
  }

  async listForUser(req, res, next) {
    try {
      const userId = req.user.id;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
            
      const result = await NotificationService.getUserNotifications(userId, page, limit);
            
      // TEMPORARIAMENTE REMOVIDO: Filtrar notificações baseado nos vínculos do usuário
      // Vamos testar sem esse filtro primeiro
      /* 
      if (result.notifications && result.notifications.length > 0) {
        const filteredNotifications = await NotificationService.filterNotificationsByUserAccess(userId, result.notifications);
        result.notifications = filteredNotifications;
        result.total = filteredNotifications.length;
        console.log(`📋 Notificações após filtro: ${filteredNotifications.length}`);
      }
      */
            
      res.json({ success: true, ...result });
    } catch (error) {
      console.error('❌ Erro ao buscar notificações:', error);
      next(error);
    }
  }

  async getUnreadCount(req, res, next) {
    try {
      const userId = req.user.id;
      const count = await NotificationService.getUnreadCount(userId);
      res.json({ success: true, unreadCount: count });
    } catch (error) {
      next(error);
    }
  }

  async markAsRead(req, res, next) {
    try {
      const userId = req.user.id;
      const notificationId = parseInt(req.params.id);
      
      const notification = await Notification.markAsRead(notificationId, userId);
      
      if (!notification) {
        return res.status(404).json({ success: false, message: 'Notificação não encontrada ou não pertence ao usuário.' });
      }
      
      res.json({ success: true, message: 'Notificação marcada como lida.', notification });
    } catch (error) {
      next(error);
    }
  }

  async markAllAsRead(req, res, next) {
    try {
      const userId = req.user.id;
      const notifications = await NotificationService.markAllAsRead(userId);
      res.json({ success: true, message: 'Todas as notificações foram marcadas como lidas.', count: notifications.length });
    } catch (error) {
      next(error);
    }
  }

  async deleteAll(req, res, next) {
    try {
      const userId = req.user.id;
      console.log(`🗑️ Deletando todas as notificações do usuário ${userId}`);

      await NotificationService.deleteAllUserNotifications(userId);

      res.json({
        success: true,
        message: 'Todas as notificações foram deletadas com sucesso.'
      });
    } catch (error) {
      console.error('❌ Erro ao deletar notificações:', error);
      next(error);
    }
  }

  async deleteOld(req, res, next) {
    try {
      const userId = req.user.id;
      const daysOld = parseInt(req.query.days) || 30;

      console.log(`🗑️ Deletando notificações antigas (>${daysOld} dias) do usuário ${userId}`);

      await NotificationService.deleteOldNotifications(userId, daysOld);

      res.json({
        success: true,
        message: `Notificações com mais de ${daysOld} dias foram deletadas.`
      });
    } catch (error) {
      console.error('❌ Erro ao deletar notificações antigas:', error);
      next(error);
    }
  }
}

module.exports = new NotificationController();