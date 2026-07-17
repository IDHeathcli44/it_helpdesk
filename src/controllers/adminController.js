const bcrypt = require('bcryptjs');
const { db } = require('../config/database');
const { setFlash } = require('../utils/flash');

function listUsers(req, res) {
  const users = db.prepare(`
    SELECT id, username, full_name, nickname, email, phone, department, office,
           position, role, is_active, must_change_password, created_at
    FROM users
    ORDER BY full_name COLLATE NOCASE
  `).all();

  res.render('admin/users', { users });
}

function showUser(req, res) {
  const userId = Number(req.params.id);
  const targetUser = db.prepare(`
    SELECT id, username, full_name, nickname, email, phone, department, office,
           position, role, is_active, must_change_password, created_at, updated_at
    FROM users
    WHERE id = ?
  `).get(userId);

  if (!targetUser) {
    setFlash(req, 'error', 'Користувача не знайдено.');
    return res.redirect('/admin/users');
  }

  return res.render('admin/user-edit', { targetUser });
}

function createUser(req, res) {
  const fullName = String(req.body.fullName || '').trim();
  const username = String(req.body.username || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const role = ['user', 'it', 'admin'].includes(req.body.role) ? req.body.role : 'user';

  if (!fullName || !username || password.length < 8) {
    setFlash(req, 'error', 'Заповніть ім’я, логін і пароль від 8 символів.');
    return res.redirect('/admin/users');
  }

  try {
    db.prepare(`
      INSERT INTO users (username, full_name, role, password_hash, must_change_password)
      VALUES (?, ?, ?, ?, 1)
    `).run(username, fullName, role, bcrypt.hashSync(password, 12));

    setFlash(req, 'success', 'Користувача створено. Під час першого входу він змінить пароль.');
  } catch {
    setFlash(req, 'error', 'Такий логін уже існує.');
  }

  return res.redirect('/admin/users');
}

function updateUser(req, res) {
  const userId = Number(req.params.id);
  const current = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);

  if (!current) {
    setFlash(req, 'error', 'Користувача не знайдено.');
    return res.redirect('/admin/users');
  }

  const fullName = String(req.body.fullName || '').trim();
  const username = String(req.body.username || '').trim().toLowerCase();
  const nickname = String(req.body.nickname || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const phone = String(req.body.phone || '').trim();
  const department = String(req.body.department || '').trim();
  const office = String(req.body.office || '').trim();
  const position = String(req.body.position || '').trim();
  const role = ['user', 'it', 'admin'].includes(req.body.role) ? req.body.role : current.role;
  const isActive = req.body.isActive === '1' ? 1 : 0;
  const temporaryPassword = String(req.body.temporaryPassword || '');

  if (!fullName || !username) {
    setFlash(req, 'error', 'ПІБ і логін є обов’язковими.');
    return res.redirect(`/admin/users/${userId}`);
  }

  const duplicateUsername = db.prepare(
    'SELECT id FROM users WHERE username = ? AND id != ?'
  ).get(username, userId);

  if (duplicateUsername) {
    setFlash(req, 'error', 'Такий логін уже використовується.');
    return res.redirect(`/admin/users/${userId}`);
  }

  if (email) {
    const duplicateEmail = db.prepare(
      'SELECT id FROM users WHERE email = ? AND id != ?'
    ).get(email, userId);

    if (duplicateEmail) {
      setFlash(req, 'error', 'Такий email уже використовується.');
      return res.redirect(`/admin/users/${userId}`);
    }
  }

  if (current.role === 'admin' && role !== 'admin') {
    const adminCount = db.prepare("SELECT COUNT(*) AS total FROM users WHERE role = 'admin'").get().total;
    if (adminCount <= 1) {
      setFlash(req, 'error', 'Не можна змінити роль останнього адміністратора.');
      return res.redirect(`/admin/users/${userId}`);
    }
  }

  if (userId === req.session.user.id && !isActive) {
    setFlash(req, 'error', 'Не можна вимкнути власний обліковий запис.');
    return res.redirect(`/admin/users/${userId}`);
  }

  if (temporaryPassword && temporaryPassword.length < 8) {
    setFlash(req, 'error', 'Тимчасовий пароль має містити щонайменше 8 символів.');
    return res.redirect(`/admin/users/${userId}`);
  }

  try {
    db.exec('BEGIN');

    db.prepare(`
      UPDATE users
      SET username = ?, full_name = ?, nickname = ?, email = ?, phone = ?,
          department = ?, office = ?, position = ?, role = ?, is_active = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      username,
      fullName,
      nickname || null,
      email || null,
      phone || null,
      department || null,
      office || null,
      position || null,
      role,
      isActive,
      userId
    );

    if (temporaryPassword) {
      db.prepare(`
        UPDATE users
        SET password_hash = ?, must_change_password = 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(bcrypt.hashSync(temporaryPassword, 12), userId);
    }

    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (_) { /* transaction was not started */ }
    console.error('User update error:', error);
    setFlash(req, 'error', 'Не вдалося зберегти зміни користувача.');
    return res.redirect(`/admin/users/${userId}`);
  }

  if (userId === req.session.user.id) {
    req.session.user.username = username;
    req.session.user.fullName = fullName;
    req.session.user.role = role;
    req.session.user.mustChangePassword = temporaryPassword ? 1 : current.must_change_password;
  }

  setFlash(
    req,
    'success',
    temporaryPassword
      ? 'Дані збережено. Під час наступного входу користувач змінить тимчасовий пароль.'
      : 'Дані користувача збережено.'
  );

  if (userId === req.session.user.id && role !== 'admin') {
    return res.redirect('/');
  }

  return res.redirect(`/admin/users/${userId}`);
}

function toggleUser(req, res) {
  const id = Number(req.params.id);

  if (id === req.session.user.id) {
    setFlash(req, 'error', 'Не можна вимкнути власний обліковий запис.');
    return res.redirect('/admin/users');
  }

  db.prepare('UPDATE users SET is_active = CASE is_active WHEN 1 THEN 0 ELSE 1 END WHERE id = ?').run(id);
  setFlash(req, 'success', 'Статус користувача змінено.');
  return res.redirect('/admin/users');
}

function deleteUser(req, res) {
  const id = Number(req.params.id);
  const user = db.prepare('SELECT id, role FROM users WHERE id = ?').get(id);

  if (!user) {
    setFlash(req, 'error', 'Користувача не знайдено.');
    return res.redirect('/admin/users');
  }

  if (id === req.session.user.id) {
    setFlash(req, 'error', 'Не можна видалити власний обліковий запис.');
    return res.redirect('/admin/users');
  }

  if (user.role === 'admin') {
    const count = db.prepare("SELECT COUNT(*) AS total FROM users WHERE role = 'admin'").get().total;
    if (count <= 1) {
      setFlash(req, 'error', 'Не можна видалити останнього адміністратора.');
      return res.redirect('/admin/users');
    }
  }

  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  setFlash(req, 'success', 'Користувача видалено. Його заявки збережені без прив’язки до облікового запису.');
  return res.redirect('/admin/users');
}

module.exports = {
  listUsers,
  showUser,
  createUser,
  updateUser,
  toggleUser,
  deleteUser
};
