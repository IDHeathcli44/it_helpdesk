const { db } = require('../../config/database');

const insertStatement = db.prepare(`
  INSERT INTO notifications (user_id, type, title, message, link)
  VALUES (?, ?, ?, ?, ?)
`);

function create({ userId, type, title, message, link }) {
  return insertStatement.run(userId, type, title, message, link);
}

function findActiveStaff() {
  return db.prepare(`
    SELECT id FROM users
    WHERE role IN ('it', 'admin') AND is_active = 1
  `).all();
}

function findRecentForUser(userId) {
  return db.prepare(
    'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 20'
  ).all(userId);
}

function countUnreadForUser(userId) {
  return db.prepare(
    'SELECT COUNT(*) AS total FROM notifications WHERE user_id = ? AND is_read = 0'
  ).get(userId).total;
}

function findForUser(notificationId, userId) {
  return db.prepare(`
    SELECT id, is_read
    FROM notifications
    WHERE id = ? AND user_id = ?
  `).get(notificationId, userId);
}

function markAllReadForUser(userId) {
  return db.prepare(
    'UPDATE notifications SET is_read = 1 WHERE user_id = ?'
  ).run(userId);
}

function markReadForUser(notificationId, userId) {
  return db.prepare(`
    UPDATE notifications
    SET is_read = 1
    WHERE id = ? AND user_id = ?
  `).run(notificationId, userId);
}

module.exports = {
  create,
  findActiveStaff,
  findRecentForUser,
  countUnreadForUser,
  findForUser,
  markAllReadForUser,
  markReadForUser
};
