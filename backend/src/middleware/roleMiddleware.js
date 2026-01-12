const roleMiddleware = (requiredRoles = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    const userRole = req.user.role;
    
    if (!requiredRoles.includes(userRole)) {
      return res.status(403).json({ 
        error: 'Acesso negado. Role necessária: ' + requiredRoles.join(' ou ') 
      });
    }

    next();
  };
};

const permissionMiddleware = (requiredPermission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    const userPermissions = req.user.permissions || [];
    
    if (!userPermissions.includes(requiredPermission)) {
      return res.status(403).json({ 
        error: `Acesso negado. Permissão necessária: ${requiredPermission}` 
      });
    }

    next();
  };
};

module.exports = {
  roleMiddleware,
  permissionMiddleware
};