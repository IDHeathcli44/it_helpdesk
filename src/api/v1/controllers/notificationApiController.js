const service = require('../../../modules/notifications/notificationService');
const serialize = require('../serializers/notificationSerializer');

exports.list = (req, res) => {
  const feed = service.getUserFeed(req.session.user.id);
  return res.json({ data: feed.notifications.map(serialize), meta: { unreadCount: feed.unread } });
};
