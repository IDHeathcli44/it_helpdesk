const authService = require('./authService');
const { setFlash } = require('../../utils/flash');

function showLogin(req, res) {
  if (req.session.user) return res.redirect('/');
  const loginUsername = req.session.loginUsername || '';
  return res.render('auth/login', { loginUsername });
}

function login(req, res) {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  const user = authService.authenticate(username, password);

  if (!user) {
    req.session.loginUsername = username;
    setFlash(req, 'error', 'Неправильний логін або пароль.');
    return res.redirect('/login');
  }

  delete req.session.loginUsername;

  req.session.user = {
    id: user.id,
    username: user.username,
    fullName: user.full_name,
    role: user.role,
    mustChangePassword: Boolean(user.must_change_password)
  };

  return res.redirect(user.must_change_password ? '/change-password' : '/');
}

function showRegister(req, res) {
  if (req.session.user) return res.redirect('/');
  return res.render('auth/register');
}

function register(req, res) {
  const fullName = String(req.body.fullName || '').trim();
  const username = String(req.body.username || '').trim().toLowerCase();
  const email = String(req.body.email || '').trim().toLowerCase() || null;
  const department = String(req.body.department || '').trim() || null;
  const office = String(req.body.office || '').trim() || null;
  const password = String(req.body.password || '');
  const confirmPassword = String(req.body.confirmPassword || '');

  if (!fullName || !username || password.length < 8 || password !== confirmPassword) {
    setFlash(req, 'error', 'Перевірте поля. Пароль має містити щонайменше 8 символів.');
    return res.redirect('/register');
  }

  try {
    const result = authService.register({
      fullName,
      username,
      email,
      department,
      office,
      password
    });
    req.session.user = {
      id: Number(result.lastInsertRowid),
      username,
      fullName,
      role: 'user',
      mustChangePassword: false
    };
    setFlash(req, 'success', 'Реєстрацію завершено.');
    return res.redirect('/');
  } catch {
    setFlash(req, 'error', 'Такий логін або email уже використовується.');
    return res.redirect('/register');
  }
}

function showChangePassword(req, res) {
  return res.render('auth/change-password');
}

function changePassword(req, res) {
  const currentPassword = String(req.body.currentPassword || '');
  const newPassword = String(req.body.newPassword || '');
  const confirmPassword = String(req.body.confirmPassword || '');

  const forcedChange = Boolean(req.session.user.mustChangePassword);
  if (
    !forcedChange &&
    !authService.verifyCurrentPassword(req.session.user.id, currentPassword)
  ) {
    setFlash(req, 'error', 'Поточний пароль неправильний.');
    return res.redirect('/change-password');
  }
  if (newPassword.length < 8 || newPassword !== confirmPassword) {
    setFlash(req, 'error', 'Нові паролі не збігаються або пароль надто короткий.');
    return res.redirect('/change-password');
  }

  authService.changePassword(
    req.session.user.id,
    currentPassword,
    newPassword,
    { requireCurrentPassword: !forcedChange }
  );
  req.session.user.mustChangePassword = false;
  setFlash(req, 'success', 'Пароль змінено.');
  return res.redirect('/');
}

function showForgotPassword(req, res) {
  if (req.session.user) return res.redirect('/');
  return res.render('auth/forgot-password', {
    loginUsername: req.session.loginUsername || ''
  });
}

function forgotPassword(req, res) {
  const username = String(req.body.username || '').trim();
  req.session.loginUsername = username;
  if (username) {
    authService.requestPasswordReset({
      username,
      io: req.app.get('io')
    });
  }
  setFlash(
    req,
    'success',
    'Якщо такий обліковий запис існує, заявку на відновлення доступу створено.'
  );
  return res.redirect('/login');
}

function logout(req, res) {
  req.session.destroy(() => res.redirect('/login'));
}

module.exports = {
  showLogin,
  login,
  showRegister,
  register,
  showForgotPassword,
  forgotPassword,
  showChangePassword,
  changePassword,
  logout
};
