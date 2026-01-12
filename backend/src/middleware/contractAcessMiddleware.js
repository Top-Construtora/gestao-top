// src/middleware/contractAccessMiddleware.js
const { supabase } = require('../config/database');
const Contract = require('../models/Contract');

/**
 * Middleware para verificar se o usuário tem acesso ao contrato
 */
const checkContractAccess = async (req, res, next) => {
  const contractId = req.params.id;
  const userId = req.user.id;
  
  try {
    // Verificar se o usuário tem acesso ao contrato
    const hasAccess = await Contract.userHasAccess(contractId, userId);
    
    if (!hasAccess) {
      // Se não tem acesso direto, verificar se é admin ou admin_gerencial global
      if (req.user.role === 'admin' || req.user.role === 'admin_gerencial') {
        // Admin e admin_gerencial tem acesso a todos os contratos
        req.contractAccess = {
          role: 'admin',
          isGlobalAdmin: true
        };
        return next();
      }

      return res.status(403).json({
        error: 'Acesso negado a este contrato',
        details: 'Você não tem permissão para acessar este contrato'
      });
    }
    
    // Buscar o nível de acesso do usuário
    const { data, error } = await supabase
      .from('contract_assignments')
      .select('role')
      .match({
        contract_id: contractId,
        user_id: userId,
        is_active: true
      })
      .single();
    
    if (error && error.code !== 'PGRST116') {
      console.error('❌ Erro ao buscar role do usuário no contrato:', error);
      throw error;
    }
    
    // Adicionar informações de acesso ao request
    req.contractAccess = {
      role: data?.role || 'viewer',
      isGlobalAdmin: false
    };
    
    next();
  } catch (error) {
    console.error('❌ Erro no middleware checkContractAccess:', error);
    return res.status(500).json({ 
      error: 'Erro ao verificar permissões',
      details: 'Ocorreu um erro ao verificar suas permissões de acesso'
    });
  }
};

/**
 * Middleware para verificar se o usuário é owner do contrato
 */
const checkContractOwner = async (req, res, next) => {
  // Se já passou pelo checkContractAccess, usar as informações
  if (req.contractAccess) {
    if (req.contractAccess.role === 'owner' || req.contractAccess.isGlobalAdmin) {
      return next();
    }
    
    return res.status(403).json({ 
      error: 'Permissão negada',
      details: 'Apenas o proprietário do contrato ou administradores podem realizar esta ação'
    });
  }
  
  // Se não passou pelo checkContractAccess, fazer a verificação completa
  const contractId = req.params.id;
  const userId = req.user.id;
  
  try {
    // Verificar se é admin ou admin_gerencial global
    if (req.user.role === 'admin' || req.user.role === 'admin_gerencial') {
      return next();
    }

    // Verificar se é owner do contrato
    const { data, error } = await supabase
      .from('contract_assignments')
      .select('role')
      .match({
        contract_id: contractId,
        user_id: userId,
        role: 'owner',
        is_active: true
      })
      .single();
    
    if (error || !data) {
      return res.status(403).json({ 
        error: 'Permissão negada',
        details: 'Apenas o proprietário do contrato pode realizar esta ação'
      });
    }
    
    next();
  } catch (error) {
    console.error('❌ Erro no middleware checkContractOwner:', error);
    return res.status(500).json({ 
      error: 'Erro ao verificar permissões',
      details: 'Ocorreu um erro ao verificar suas permissões'
    });
  }
};

/**
 * Middleware para verificar se o usuário pode editar o contrato
 */
const checkContractEditor = async (req, res, next) => {
  // Se já passou pelo checkContractAccess, usar as informações
  if (req.contractAccess) {
    const allowedRoles = ['owner', 'editor'];
    if (allowedRoles.includes(req.contractAccess.role) || req.contractAccess.isGlobalAdmin) {
      return next();
    }
    
    return res.status(403).json({ 
      error: 'Permissão negada',
      details: 'Você não tem permissão para editar este contrato'
    });
  }
  
  // Se não passou pelo checkContractAccess, fazer a verificação completa
  const contractId = req.params.id;
  const userId = req.user.id;
  
  try {
    // Verificar se é admin ou admin_gerencial global
    if (req.user.role === 'admin' || req.user.role === 'admin_gerencial') {
      return next();
    }

    // Verificar se tem role de editor ou owner
    const { data, error } = await supabase
      .from('contract_assignments')
      .select('role')
      .match({
        contract_id: contractId,
        user_id: userId,
        is_active: true
      })
      .in('role', ['owner', 'editor'])
      .single();
    
    if (error || !data) {
      return res.status(403).json({ 
        error: 'Permissão negada',
        details: 'Você não tem permissão para editar este contrato'
      });
    }
    
    next();
  } catch (error) {
    console.error('❌ Erro no middleware checkContractEditor:', error);
    return res.status(500).json({ 
      error: 'Erro ao verificar permissões',
      details: 'Ocorreu um erro ao verificar suas permissões'
    });
  }
};

/**
 * Middleware para log de acesso a contratos
 */
const logContractAccess = async (req, res, next) => {
  const contractId = req.params.id;
  const userId = req.user.id;
  const action = req.method + ' ' + req.path;
  
  try {
    // Registrar o acesso
    await supabase
      .from('contract_access_logs')
      .insert({
        contract_id: contractId,
        user_id: userId,
        action: action,
        ip_address: req.ip,
        user_agent: req.get('user-agent'),
        accessed_at: new Date().toISOString()
      });
    
    // Não bloquear a requisição se falhar o log
    next();
  } catch (error) {
    console.error('⚠️ Erro ao registrar log de acesso:', error);
    next(); // Continuar mesmo se falhar o log
  }
};

/**
 * Middleware para validar dados de atribuição de usuários
 */
const validateUserAssignment = (req, res, next) => {
  const { user_ids, role } = req.body;
  
  // Validar user_ids
  if (!user_ids || !Array.isArray(user_ids)) {
    return res.status(400).json({ 
      error: 'Dados inválidos',
      details: 'Lista de IDs de usuários é obrigatória e deve ser um array'
    });
  }
  
  if (user_ids.length === 0) {
    return res.status(400).json({ 
      error: 'Dados inválidos',
      details: 'Pelo menos um usuário deve ser selecionado'
    });
  }
  
  // Validar que todos os IDs são números
  const invalidIds = user_ids.filter(id => !Number.isInteger(id) || id <= 0);
  if (invalidIds.length > 0) {
    return res.status(400).json({ 
      error: 'Dados inválidos',
      details: 'IDs de usuários devem ser números inteiros positivos'
    });
  }
  
  // Validar role se fornecido
  if (role) {
    const validRoles = ['owner', 'editor', 'viewer'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ 
        error: 'Dados inválidos',
        details: `Role deve ser um dos seguintes: ${validRoles.join(', ')}`
      });
    }
  }
  
  next();
};

/**
 * Middleware para prevenir auto-remoção do owner
 */
const preventOwnerSelfRemoval = async (req, res, next) => {
  const contractId = req.params.id;
  const userIdToRemove = parseInt(req.params.userId);
  const currentUserId = req.user.id;
  
  try {
    // Se está tentando remover a si mesmo
    if (userIdToRemove === currentUserId) {
      // Verificar se é o owner
      const { data, error } = await supabase
        .from('contract_assignments')
        .select('role')
        .match({
          contract_id: contractId,
          user_id: currentUserId,
          role: 'owner',
          is_active: true
        })
        .single();
      
      if (data) {
        // Verificar se há outros owners
        const { count } = await supabase
          .from('contract_assignments')
          .select('*', { count: 'exact', head: true })
          .match({
            contract_id: contractId,
            role: 'owner',
            is_active: true
          });
        
        if (count <= 1) {
          return res.status(400).json({ 
            error: 'Operação não permitida',
            details: 'O contrato deve ter pelo menos um proprietário. Atribua outro proprietário antes de se remover.'
          });
        }
      }
    }
    
    next();
  } catch (error) {
    console.error('❌ Erro no middleware preventOwnerSelfRemoval:', error);
    return res.status(500).json({ 
      error: 'Erro ao validar operação',
      details: 'Ocorreu um erro ao validar a operação'
    });
  }
};

module.exports = {
  checkContractAccess,
  checkContractOwner,
  checkContractEditor,
  logContractAccess,
  validateUserAssignment,
  preventOwnerSelfRemoval
};