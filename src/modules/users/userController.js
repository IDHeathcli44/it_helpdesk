const service = require('./userService');
const { setFlash } = require('../../utils/flash');
const { ROLES } = require('../../config/constants');
const { can } = require('../../config/permissions');

function listUsers(req, res) {
  return res.render('admin/users', { users: service.listUsers() });
}

function showUser(req, res) {
  const targetUser = service.getUser(Number(req.params.id));
  if (!targetUser) {
    setFlash(req, 'error', 'Користувача не знайдено.');
    return res.redirect('/admin/users');
  }
  return res.render(can(req.session.user, 'manageUsers') ? 'admin/user-edit' : 'admin/user-detail', { targetUser });
}

function createUser(req, res) {
  const fullName = String(req.body.fullName || '').trim();
  const username = String(req.body.username || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const role = Object.values(ROLES).includes(req.body.role) ? req.body.role : 'user';
  if (!fullName || !username || password.length < 8) {
    setFlash(req, 'error', 'Заповніть ім’я, логін і пароль від 8 символів.');
    return res.redirect('/admin/users');
  }
  try {
    service.createUser({ fullName, username, password, role });
    setFlash(req, 'success', 'Користувача створено. Під час першого входу він змінить пароль.');
  } catch {
    setFlash(req, 'error', 'Такий логін уже існує.');
  }
  return res.redirect('/admin/users');
}

function updateUser(req, res) {
  const userId = Number(req.params.id);
  let result;
  try {
    result = service.updateUser({ userId, actorId: req.session.user.id, body: req.body });
  } catch (error) {
    console.error('User update error:', error);
    setFlash(req, 'error', 'Не вдалося зберегти зміни користувача.');
    return res.redirect(`/admin/users/${userId}`);
  }

  const failures = {
    not_found: ['Користувача не знайдено.', '/admin/users'],
    required_fields: ['ПІБ і логін є обов’язковими.', `/admin/users/${userId}`],
    duplicate_username: ['Такий логін уже використовується.', `/admin/users/${userId}`],
    duplicate_email: ['Такий email уже використовується.', `/admin/users/${userId}`],
    last_admin: ['Не можна змінити роль останнього адміністратора.', `/admin/users/${userId}`],
    disable_self: ['Не можна вимкнути власний обліковий запис.', `/admin/users/${userId}`],
    short_password: ['Тимчасовий пароль має містити щонайменше 8 символів.', `/admin/users/${userId}`]
  };
  if (result.outcome !== 'ok') {
    const [message, redirect] = failures[result.outcome];
    setFlash(req, 'error', message);
    return res.redirect(redirect);
  }

  const { current, data } = result;
  if (userId === req.session.user.id) {
    req.session.user.username = data.username;
    req.session.user.fullName = data.fullName;
    req.session.user.role = data.role;
    req.session.user.mustChangePassword = data.temporaryPassword
      ? 1
      : current.must_change_password;
  }
  setFlash(
    req,
    'success',
    data.temporaryPassword
      ? 'Дані збережено. Під час наступного входу користувач змінить тимчасовий пароль.'
      : 'Дані користувача збережено.'
  );
  if (userId === req.session.user.id && data.role !== 'admin') return res.redirect('/');
  return res.redirect(`/admin/users/${userId}`);
}

function toggleUser(req, res) {
  const id = Number(req.params.id);
  if (!service.toggleUser(id, req.session.user.id)) {
    setFlash(req, 'error', 'Не можна вимкнути власний обліковий запис.');
    return res.redirect('/admin/users');
  }
  setFlash(req, 'success', 'Статус користувача змінено.');
  return res.redirect('/admin/users');
}

function deleteUser(req, res) {
  const outcome = service.deleteUser(Number(req.params.id), req.session.user.id);
  if (outcome === 'not_found') setFlash(req, 'error', 'Користувача не знайдено.');
  else if (outcome === 'delete_self') setFlash(req, 'error', 'Не можна видалити власний обліковий запис.');
  else if (outcome === 'last_admin') setFlash(req, 'error', 'Не можна видалити останнього адміністратора.');
  else setFlash(req, 'success', 'Користувача видалено. Його заявки збережені без прив’язки до облікового запису.');
  return res.redirect('/admin/users');
}

module.exports = { listUsers, showUser, createUser, updateUser, toggleUser, deleteUser };
