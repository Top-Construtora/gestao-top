const { supabase } = require('../config/database');

class NotificationModel {
  async create(notificationData) {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .insert(notificationData)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('❌ Erro ao criar notificação no model:', error);
      throw error;
    }
  }

  async findByUserId(userId) {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('❌ Erro ao buscar notificações do usuário:', error);
      throw error;
    }
  }

  async markAsRead(notificationId, userId) {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .match({ id: notificationId, user_id: userId })
        .select();
      
      if (error) throw error;
      
      // Return the first item if exists, null otherwise
      return data && data.length > 0 ? data[0] : null;
    } catch (error) {
      console.error('❌ Erro ao marcar como lida:', error);
      throw error;
    }
  }

  async findByUserIdPaginated(userId, page = 1, limit = 20) {
    try {
      const offset = (page - 1) * limit;
      
      const { data, error, count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact' })
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;
      
      return {
        notifications: data || [],
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit)
      };
    } catch (error) {
      console.error('❌ Erro ao buscar notificações paginadas:', error);
      throw error;
    }
  }

  async countUnreadByUserId(userId) {
    try {
      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_read', false);

      if (error) throw error;
      return count || 0;
    } catch (error) {
      console.error('❌ Erro ao contar notificações não lidas:', error);
      throw error;
    }
  }

  async markAllAsReadByUserId(userId) {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('is_read', false)
        .select();

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('❌ Erro ao marcar todas como lidas:', error);
      throw error;
    }
  }

  async deleteAllByUserId(userId) {
    try {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('user_id', userId);

      if (error) throw error;
      return { success: true };
    } catch (error) {
      console.error('❌ Erro ao deletar todas as notificações:', error);
      throw error;
    }
  }

  async deleteOldNotifications(userId, daysOld = 30) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('user_id', userId)
        .lt('created_at', cutoffDate.toISOString());

      if (error) throw error;
      return { success: true };
    } catch (error) {
      console.error('❌ Erro ao deletar notificações antigas:', error);
      throw error;
    }
  }
}

module.exports = new NotificationModel();