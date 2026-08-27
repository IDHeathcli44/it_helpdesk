const service = require('./notificationService');

function listJson(req, res) {
  return res.json(service.getUserFeed(req.session.user.id));
}

function markAllRead(req, res) {
  service.markAllRead(req.session.user.id);
  return res.json({ ok: true });
}

function markRead(req, res) {
  const notificationId = Number(req.params.id);
  if (!Number.isInteger(notificationId) || notificationId < 1) {
    return res.status(400).json({ ok: false });
  }
  const result = service.markRead(notificationId, req.session.user.id);
  return res.status(result.ok ? 200 : 404).json(result);
}

module.exports = { listJson, markAllRead, markRead };
