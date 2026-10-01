const path = require('node:path');
const express = require('express');
const session = require('express-session');
const { refreshSessionUser, exposeUser } = require('./middleware/auth');
const { exposeFlash } = require('./utils/flash');
const { exposePreferences } = require('./middleware/preferences');
const authRoutes = require('./modules/auth/authRoutes');
const userRoutes = require('./modules/users/userRoutes');
const ticketRoutes = require('./modules/tickets/ticketRoutes');
const equipmentRoutes = require('./modules/equipment/equipmentRoutes');
const notificationRoutes = require('./modules/notifications/notificationRoutes');
const reportRoutes = require('./modules/reports/reportRoutes');
const healthRoutes = require('./api/routes/healthRoutes');
const apiV1Router = require('./api/v1/apiRouter');
const { apiErrorHandler } = require('./api/v1/middleware/apiErrorHandler');

const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'helpdesk-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.SESSION_COOKIE_SECURE === 'true'
  }
});

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(path.join(__dirname, '../uploads'), {
  dotfiles: 'deny',
  index: false,
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  }
}));
app.use(sessionMiddleware);
app.use(refreshSessionUser);
app.use('/api/v1', apiV1Router);
// Also catches parser errors raised before the router is entered.
app.use('/api/v1', apiErrorHandler);

module.exports = {
  app,
  sessionMiddleware,
};
app.use(exposeUser);
app.use(exposePreferences);
app.use(exposeFlash);
app.use((req, res, next) => {
  res.locals.currentPath = req.path;
  next();
});
app.use("/api", healthRoutes);
app.use((req, res, next) => {
  if (req.session.user?.mustChangePassword && !['/change-password', '/logout'].includes(req.path)) {
    return res.redirect('/change-password');
  }
  next();
});
app.use(authRoutes);
app.use('/admin', userRoutes);
app.use('/equipment', equipmentRoutes);
app.use(notificationRoutes);
app.use(reportRoutes);
app.use(ticketRoutes);
app.use((error, req, res, next) => {
  if (!error) return next();
  console.error(error);
  const inventoryUpload = error.field === 'inventoryFile';
  const message = error.code === 'LIMIT_FILE_SIZE'
    ? inventoryUpload
      ? 'Файл інвентаризації перевищує 10 МБ.'
      : 'Одне із зображень перевищує 10 МБ.'
    : error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE'
      ? inventoryUpload
        ? 'Можна завантажити лише один файл інвентаризації.'
        : 'До заявки можна прикріпити не більше 5 зображень.'
      : error.message || 'Не вдалося завантажити файл.';
  req.session.flash = { type: 'error', message };
  return res.redirect(req.get('referer') || '/tickets/new');
});
app.use((req, res) => res.status(404).render('errors/404'));
module.exports = {
  app,
  sessionMiddleware,
};
