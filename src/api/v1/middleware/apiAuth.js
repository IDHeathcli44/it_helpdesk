const { sendError } = require('./apiErrorHandler');

function apiAuth(req, res, next) {
  res.set('Cache-Control', 'no-store');
  if (!req.session?.user) return sendError(res, 401, 'UNAUTHENTICATED', 'Authentication required');
  next();
}

function requirePasswordChanged(req, res, next) {
  if (req.session.user.mustChangePassword) {
    return sendError(res, 403, 'PASSWORD_CHANGE_REQUIRED', 'Password change required');
  }
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.session.user.role)) return sendError(res, 403, 'FORBIDDEN', 'Access denied');
    next();
  };
}

module.exports = { apiAuth, requireRole, requirePasswordChanged };
