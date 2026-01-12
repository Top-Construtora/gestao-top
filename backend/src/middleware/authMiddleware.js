const authService = require('../services/authService');
const { User } = require('../models');

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Token não fornecido' });
    }

    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Formato de token inválido' });
    }

    const token = authHeader.replace('Bearer ', '');

    if (!token || token.trim() === '') {
      return res.status(401).json({ error: 'Token não fornecido' });
    }

    // Verificar se o token tem formato JWT básico (xxx.xxx.xxx)
    if (token.split('.').length !== 3) {
      console.error('Token malformed - não possui formato JWT:', token.substring(0, 20) + '...');
      return res.status(401).json({ error: 'Token inválido - formato incorreto' });
    }

    const decoded = authService.verifyToken(token);
    
    // Garantir que userId é um número
    const userId = parseInt(decoded.userId);
    
    if (isNaN(userId)) {
      return res.status(401).json({ error: 'Token inválido - userId inválido' });
    }
    
    const user = await User.findById(userId);

    if (!user) {
      return res.status(401).json({ error: 'Usuário não encontrado' });
    }

    if (!user.is_active) {
      return res.status(401).json({ error: 'Usuário inativo' });
    }

    // Adicionar dados do usuário à requisição
    req.user = {
      id: userId, // Garantir que é número
      email: user.email,
      name: user.name,
      role: decoded.role,
      role_name: user.role_name, // Add role_name from user data
      permissions: decoded.permissions
    };

    next();
  } catch (error) {
    console.error('Erro no authMiddleware:', error);
    
    // Diferentes tipos de erro JWT
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Token inválido - formato JWT incorreto' });
    } else if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expirado' });
    } else if (error.name === 'NotBeforeError') {
      return res.status(401).json({ error: 'Token ainda não é válido' });
    }
    
    return res.status(401).json({ error: 'Token inválido' });
  }
};

module.exports = authMiddleware;