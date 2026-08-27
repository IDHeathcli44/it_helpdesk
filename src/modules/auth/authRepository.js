const { db } = require('../../config/database');

function findByUsername(username) {
  return db.prepare(
    'SELECT * FROM users WHERE username = ? COLLATE BINARY'
  ).get(username);
}

function findById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function createUser({ username, fullName, email, department, office, passwordHash }) {
  return db.prepare(`
    INSERT INTO users (username, full_name, email, department, office, role, password_hash, must_change_password)
    VALUES (?, ?, ?, ?, ?, 'user', ?, 0)
  `).run(username, fullName, email, department, office, passwordHash);
}

function updatePassword(userId, passwordHash) {
  return db.prepare(
    'UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?'
  ).run(passwordHash, userId);
}

module.exports = { findByUsername, findById, createUser, updatePassword };
