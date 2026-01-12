const authMiddleware = require('./authMiddleware');
const { roleMiddleware, permissionMiddleware } = require('./roleMiddleware');

const requireAuth = authMiddleware;

const requireRole = (roles) => {
  if (typeof roles === 'string') {
    roles = [roles];
  }
  return roleMiddleware(roles);
};

const requirePermission = (permission) => {
  return permissionMiddleware(permission);
};

module.exports = {
  requireAuth,
  requireRole,
  requirePermission
};