const bcrypt = require('bcryptjs');
const repository = require('./authRepository');
const ticketService = require('../tickets/ticketService');

function authenticate(username, password) {
  const user = repository.findByUsername(username);
  if (!user || !user.is_active || !bcrypt.compareSync(password, user.password_hash)) {
    return null;
  }
  return user;
}

function register(data) {
  return repository.createUser({
    ...data,
    passwordHash: bcrypt.hashSync(data.password, 12)
  });
}

function verifyCurrentPassword(userId, currentPassword) {
  const user = repository.findById(userId);
  return Boolean(user && bcrypt.compareSync(currentPassword, user.password_hash));
}

function changePassword(
  userId,
  currentPassword,
  newPassword,
  { requireCurrentPassword = true } = {}
) {
  const user = repository.findById(userId);
  if (
    !user ||
    (requireCurrentPassword && !bcrypt.compareSync(currentPassword, user.password_hash))
  ) {
    return false;
  }
  repository.updatePassword(user.id, bcrypt.hashSync(newPassword, 12));
  return true;
}

function requestPasswordReset({ username, io }) {
  const user = repository.findByUsername(username);
  if (!user || !user.is_active) return null;
  return ticketService.requestPasswordReset({ user, io });
}

module.exports = {
  authenticate,
  register,
  verifyCurrentPassword,
  changePassword,
  requestPasswordReset
};
