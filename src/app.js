const path = require('node:path');
const express = require('express');
const session = require('express-session');
const { exposeUser } = require('./middleware/auth');
const { exposeFlash } = require('./utils/flash');
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const ticketRoutes = require('./routes/ticketRoutes');
const equipmentRoutes = require('./routes/equipmentRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const healthRoutes = require("./api/routes/healthRoutes");

const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'helpdesk-secret',
  resave: false,
  saveUninitialized: false,
});

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(path.join(__dirname, '../uploads'), {
  dotfiles: 'deny',
  index: false
}));
app.use(sessionMiddleware);

module.exports = {
  app,
  sessionMiddleware,
};
app.use(exposeUser);
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
app.use('/admin', adminRoutes);
app.use('/equipment', equipmentRoutes);
app.use(notificationRoutes);
app.use(ticketRoutes);
app.use((error, req, res, next) => {
  if (!error) return next();
  console.error(error);
  const message = error.code === 'LIMIT_FILE_SIZE'
    ? 'Одне із зображень перевищує 10 МБ.'
    : error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE'
      ? 'До заявки можна прикріпити не більше 5 зображень.'
      : error.message || 'Не вдалося завантажити файл.';
  req.session.flash = { type: 'error', message };
  return res.redirect(req.get('referer') || '/tickets/new');
});
app.use((req, res) => res.status(404).render('errors/404'));
module.exports = {
  app,
  sessionMiddleware,
};
