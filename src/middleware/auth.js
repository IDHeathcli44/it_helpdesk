const { ROLES } = require('../config/constants');
const authService = require('../modules/auth/authService');

function refreshSessionUser(req, res, next) {
  const sessionUser = req.session?.user;
  if (!sessionUser) return next();

  const user = authService.getSessionUser(sessionUser.id);
  if (!user || !user.is_active) {
    delete req.session.user;
    return next();
  }

  req.session.user = {
    id: user.id,
    username: user.username,
    fullName: user.full_name,
    role: user.role,
    mustChangePassword: Boolean(user.must_change_password)
  };
  next();
}

function exposeUser(req, res, next) {
  res.locals.currentUser = req.session?.user || null;
  next();
}

function requireAuth(req, res, next) {
  if (!req.session?.user) return res.redirect('/login');
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session?.user) return res.redirect('/login');
    if (!roles.includes(req.session.user.role)) return res.status(403).render('errors/403');
    next();
  };
}

function requireAdmin(req, res, next) {
  return requireRole(ROLES.ADMIN)(req, res, next);
}

module.exports = {
  refreshSessionUser,
  exposeUser,
  requireAuth,
  requireRole,
  requireAdmin
};
