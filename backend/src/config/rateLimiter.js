const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');

// Configurações diferentes por tipo de rota
const rateLimiters = {
  // Para login - mais restritivo
  auth: rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 15, // 10 tentativas
    message: 'Muitas tentativas de login. Tente novamente em 15 minutos.',
    standardHeaders: true,
    legacyHeaders: false,
    // Usar apenas IP para key, pois body pode não estar disponível
    keyGenerator: (req) => {
      return req.ip || req.connection.remoteAddress;
    },
    skip: (req) => {
      // Skip rate limiting em desenvolvimento
      return process.env.NODE_ENV === 'development';
    }
  }),

  // Para recuperação de senha
  passwordReset: rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hora
    max: 5, // 5 tentativas por hora
    message: 'Muitas solicitações de recuperação de senha. Tente novamente em 1 hora.',
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      return req.ip || req.connection.remoteAddress;
    }
  }),

  // Para criação de recursos
  create: rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 30, // 30 criações
    message: 'Limite de criação excedido. Tente novamente mais tarde.',
    standardHeaders: true,
    legacyHeaders: false
  }),

  // Para leitura geral
  general: rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 100, // 100 requisições
    message: 'Muitas requisições. Tente novamente mais tarde.',
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      // Skip para health checks e rotas do sistema
      return req.path === '/health' || req.path === '/';
    }
  }),

  // Slow down para APIs
  apiSlowDown: slowDown({
    windowMs: 15 * 60 * 1000, // 15 minutos
    delayAfter: 50, // Permitir 50 requisições sem delay
    delayMs: (used, req) => {
      const delayAfter = 50; // Usar valor fixo em vez de req.slowDown.limit
      return Math.min((used - delayAfter) * 500, 20000); // Max 20s
    },
    skip: (req) => {
      // Skip para health checks
      return req.path === '/health' || req.path === '/';
    }
  })
};

// Função helper para criar rate limiter customizado
rateLimiters.createCustom = (options) => {
  return rateLimit({
    windowMs: options.windowMs || 15 * 60 * 1000,
    max: options.max || 100,
    message: options.message || 'Muitas requisições. Tente novamente mais tarde.',
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      return req.ip || req.connection.remoteAddress;
    },
    ...options
  });
};

module.exports = rateLimiters;