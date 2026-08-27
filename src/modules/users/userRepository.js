const { db } = require('../../config/database');

function list() {
  return db.prepare(`
    SELECT id, username, full_name, nickname, email, phone, department, office,
      position, role, is_active, must_change_password, created_at
    FROM users ORDER BY full_name COLLATE NOCASE
  `).all();
}

function findById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function findDetailsById(id) {
  return db.prepare(`
    SELECT id, username, full_name, nickname, email, phone, department, office,
      position, role, is_active, must_change_password, created_at, updated_at
    FROM users WHERE id = ?
  `).get(id);
}

function create({ username, fullName, role, passwordHash }) {
  return db.prepare(`
    INSERT INTO users (username, full_name, role, password_hash, must_change_password)
    VALUES (?, ?, ?, ?, 1)
  `).run(username, fullName, role, passwordHash);
}

function findDuplicateUsername(username, excludedId) {
  return db.prepare(
    'SELECT id FROM users WHERE username = ? AND id != ?'
  ).get(username, excludedId);
}

function findDuplicateEmail(email, excludedId) {
  return db.prepare(
    'SELECT id FROM users WHERE email = ? AND id != ?'
  ).get(email, excludedId);
}

function countAdmins() {
  return db.prepare(
    "SELECT COUNT(*) AS total FROM users WHERE role = 'admin'"
  ).get().total;
}

function update(userId, data) {
  db.exec('BEGIN');
  try {
    db.prepare(`
      UPDATE users SET
        username = ?, full_name = ?, nickname = ?, email = ?, phone = ?,
        department = ?, office = ?, position = ?, role = ?, is_active = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      data.username,
      data.fullName,
      data.nickname,
      data.email,
      data.phone,
      data.department,
      data.office,
      data.position,
      data.role,
      data.isActive,
      userId
    );

    if (data.temporaryPasswordHash) {
      db.prepare(`
        UPDATE users
        SET password_hash = ?, must_change_password = 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(data.temporaryPasswordHash, userId);
    }
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (_) { /* transaction was not started */ }
    throw error;
  }
}

function toggle(id) {
  return db.prepare(`
    UPDATE users SET is_active = CASE is_active WHEN 1 THEN 0 ELSE 1 END
    WHERE id = ?
  `).run(id);
}

function remove(id) {
  return db.prepare('DELETE FROM users WHERE id = ?').run(id);
}

function setTemporaryPassword(id, passwordHash) {
  return db.prepare(`
    UPDATE users
    SET password_hash = ?, must_change_password = 1, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND is_active = 1
  `).run(passwordHash, id);
}

module.exports = {
  list,
  findById,
  findDetailsById,
  create,
  findDuplicateUsername,
  findDuplicateEmail,
  countAdmins,
  update,
  toggle,
  remove,
  setTemporaryPassword
};
