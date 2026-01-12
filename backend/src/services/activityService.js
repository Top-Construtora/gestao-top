const { supabase } = require('../config/database');

class ActivityService {
  async log(activityData) {
    try {
      const {
        user_id,
        action,
        entity_type,
        entity_id,
        details
      } = activityData;

      return true;
    } catch (error) {
      console.error('❌ Erro no log de atividade:', error);
      // Não falhar a operação principal se o log falhar
      return false;
    }
  }
}

module.exports = new ActivityService();