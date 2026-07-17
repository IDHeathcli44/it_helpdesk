const { ROLES } = require('../config/constants');

function exposeUser(req, res, next) {
  res.locals.currentUser = req.session.user || null;
  next();
}

function requireAuth(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session.user) return res.redirect('/login');
    if (!roles.includes(req.session.user.role)) return res.status(403).render('errors/403');
    next();
  };
}

function requireAdmin(req, res, next) {
  return requireRole(ROLES.ADMIN)(req, res, next);
}

module.exports = { exposeUser, requireAuth, requireRole, requireAdmin };
