const bcrypt = require('bcryptjs');
const { db } = require('../config/database');
const { setFlash } = require('../utils/flash');

function showLogin(req, res) {
  if (req.session.user) return res.redirect('/');
  res.render('auth/login');
}

function login(req, res) {
  const username = String(req.body.username || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

  if (!user || !user.is_active || !bcrypt.compareSync(password, user.password_hash)) {
    setFlash(req, 'error', 'Неправильний логін або пароль.');
    return res.redirect('/login');
  }

  req.session.user = {
    id: user.id,
    username: user.username,
    fullName: user.full_name,
    role: user.role,
    mustChangePassword: Boolean(user.must_change_password)
  };

  if (user.must_change_password) return res.redirect('/change-password');
  res.redirect('/');
}

function showRegister(req, res) {
  if (req.session.user) return res.redirect('/');
  res.render('auth/register');
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
    const result = db.prepare(`
      INSERT INTO users (username, full_name, email, department, office, role, password_hash, must_change_password)
      VALUES (?, ?, ?, ?, ?, 'user', ?, 0)
    `).run(username, fullName, email, department, office, bcrypt.hashSync(password, 12));

    req.session.user = { id: Number(result.lastInsertRowid), username, fullName, role: 'user', mustChangePassword: false };
    setFlash(req, 'success', 'Реєстрацію завершено.');
    res.redirect('/');
  } catch (error) {
    setFlash(req, 'error', 'Такий логін або email уже використовується.');
    res.redirect('/register');
  }
}

function showChangePassword(req, res) {
  res.render('auth/change-password');
}

function changePassword(req, res) {
  const currentPassword = String(req.body.currentPassword || '');
  const newPassword = String(req.body.newPassword || '');
  const confirmPassword = String(req.body.confirmPassword || '');
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id);

  if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
    setFlash(req, 'error', 'Поточний пароль неправильний.');
    return res.redirect('/change-password');
  }
  if (newPassword.length < 8 || newPassword !== confirmPassword) {
    setFlash(req, 'error', 'Нові паролі не збігаються або пароль надто короткий.');
    return res.redirect('/change-password');
  }

  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?')
    .run(bcrypt.hashSync(newPassword, 12), user.id);
  req.session.user.mustChangePassword = false;
  setFlash(req, 'success', 'Пароль змінено.');
  res.redirect('/');
}

function logout(req, res) {
  req.session.destroy(() => res.redirect('/login'));
}

module.exports = { showLogin, login, showRegister, register, showChangePassword, changePassword, logout };
