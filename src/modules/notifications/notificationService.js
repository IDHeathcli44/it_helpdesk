const repository = require('./notificationRepository');

function createForUser({ io, userId, type, title, message, link }) {
  const result = repository.create({ userId, type, title, message, link });
  const notification = {
    id: Number(result.lastInsertRowid),
    user_id: userId,
    type,
    title,
    message,
    link,
    is_read: 0,
    created_at: new Date().toISOString()
  };

  if (io) io.to(`user:${userId}`).emit('notification:new', notification);
  return notification;
}

function notifyStaff({ io, excludeUserId = null, type, title, message, link }) {
  for (const user of repository.findActiveStaff()) {
    if (excludeUserId !== null && Number(user.id) === Number(excludeUserId)) continue;
    createForUser({ io, userId: user.id, type, title, message, link });
  }
}

function notifyTicketOwner({ io, ticket, actorUserId, type, title, message }) {
  const ownerId = Number(ticket?.created_by);
  if (!Number.isInteger(ownerId) || ownerId === Number(actorUserId)) return undefined;
  return createForUser({
    io,
    userId: ownerId,
    type,
    title,
    message,
    link: `/tickets/${ticket.id}`
  });
}

function getUserFeed(userId) {
  return {
    unread: repository.countUnreadForUser(userId),
    notifications: repository.findRecentForUser(userId)
  };
}

function markAllRead(userId) {
  repository.markAllReadForUser(userId);
}

function markRead(notificationId, userId) {
  const notification = repository.findForUser(notificationId, userId);
  if (!notification) {
    return {
      ok: false,
      unread: repository.countUnreadForUser(userId)
    };
  }

  if (!notification.is_read) {
    repository.markReadForUser(notificationId, userId);
  }

  return {
    ok: true,
    unread: repository.countUnreadForUser(userId)
  };
}

module.exports = {
  createForUser,
  notifyStaff,
  notifyTicketOwner,
  getUserFeed,
  markAllRead,
  markRead
};
