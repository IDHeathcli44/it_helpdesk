const bcrypt = require('bcryptjs');
const repository = require('./userRepository');

const ALLOWED_ROLES = new Set(['user', 'it', 'admin']);

function listUsers() {
  return repository.list();
}

function getUser(id) {
  return repository.findDetailsById(id);
}

function createUser({ fullName, username, password, role }) {
  return repository.create({
    fullName,
    username,
    role: ALLOWED_ROLES.has(role) ? role : 'user',
    passwordHash: bcrypt.hashSync(password, 12)
  });
}

function updateUser({ userId, actorId, body }) {
  const current = repository.findById(userId);
  if (!current) return { outcome: 'not_found' };

  const data = normalizeUpdate(body, current);
  if (!data.fullName || !data.username) return { outcome: 'required_fields' };
  if (repository.findDuplicateUsername(data.username, userId)) {
    return { outcome: 'duplicate_username' };
  }
  if (data.email && repository.findDuplicateEmail(data.email, userId)) {
    return { outcome: 'duplicate_email' };
  }
  if (current.role === 'admin' && data.role !== 'admin' && repository.countAdmins() <= 1) {
    return { outcome: 'last_admin' };
  }
  if (userId === actorId && !data.isActive) return { outcome: 'disable_self' };
  if (data.temporaryPassword && data.temporaryPassword.length < 8) {
    return { outcome: 'short_password' };
  }

  repository.update(userId, {
    ...data,
    temporaryPasswordHash: data.temporaryPassword
      ? bcrypt.hashSync(data.temporaryPassword, 12)
      : null
  });
  return { outcome: 'ok', current, data };
}

function toggleUser(id, actorId) {
  if (id === actorId) return false;
  repository.toggle(id);
  return true;
}

function deleteUser(id, actorId) {
  const user = repository.findById(id);
  if (!user) return 'not_found';
  if (id === actorId) return 'delete_self';
  if (user.role === 'admin' && repository.countAdmins() <= 1) return 'last_admin';
  repository.remove(id);
  return 'ok';
}

function setTemporaryPassword(userId, temporaryPassword) {
  if (String(temporaryPassword || '').length < 8) return false;
  const result = repository.setTemporaryPassword(
    userId,
    bcrypt.hashSync(temporaryPassword, 12)
  );
  return Number(result.changes) > 0;
}

function normalizeUpdate(body, current) {
  const role = ALLOWED_ROLES.has(body.role) ? body.role : current.role;
  return {
    fullName: String(body.fullName || '').trim(),
    username: String(body.username || '').trim().toLowerCase(),
    nickname: optional(body.nickname),
    email: optional(body.email, true),
    phone: optional(body.phone),
    department: optional(body.department),
    office: optional(body.office),
    position: optional(body.position),
    role,
    isActive: body.isActive === '1' ? 1 : 0,
    temporaryPassword: String(body.temporaryPassword || '')
  };
}

function optional(value, lowercase = false) {
  const normalized = String(value || '').trim();
  return (lowercase ? normalized.toLowerCase() : normalized) || null;
}

module.exports = {
  listUsers,
  getUser,
  createUser,
  updateUser,
  toggleUser,
  deleteUser,
  setTemporaryPassword
};
