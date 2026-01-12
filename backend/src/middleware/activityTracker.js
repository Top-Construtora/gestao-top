const { User } = require('../models');

/**
 * Middleware para tracking de atividade do usuário
 * Atualiza last_activity_at em requisições autenticadas
 */
const activityTracker = async (req, res, next) => {
  // Só executar se o usuário estiver autenticado
  if (req.user && req.user.id) {
    try {
      // Não bloquear a requisição se o tracking falhar
      setImmediate(async () => {
        try {
          await User.updateLastActivity(req.user.id);
          // console.log(`🔍 Activity tracked for user ${req.user.id}`);
        } catch (error) {
          console.warn('⚠️ Erro ao trackear atividade:', error.message);
        }
      });
    } catch (error) {
      console.warn('⚠️ Erro no activity tracker:', error.message);
    }
  }
  
  next();
};

module.exports = activityTracker;