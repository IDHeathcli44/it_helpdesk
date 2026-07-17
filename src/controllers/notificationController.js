const { db } = require('../config/database');
function listJson(req, res) {
  const rows = db.prepare('SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 20').all(req.session.user.id);
  const unread = db.prepare('SELECT COUNT(*) total FROM notifications WHERE user_id=? AND is_read=0').get(req.session.user.id).total;
  res.json({ unread, notifications: rows });
}
function markAllRead(req, res) {
  db.prepare('UPDATE notifications SET is_read=1 WHERE user_id=?').run(req.session.user.id);
  res.json({ ok: true });
}
module.exports = { listJson, markAllRead };
