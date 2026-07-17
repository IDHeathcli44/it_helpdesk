const { db } = require("../config/database");

const insertNotification = db.prepare(`
  INSERT INTO notifications (
    user_id,
    type,
    title,
    message,
    link
  )
  VALUES (?, ?, ?, ?, ?)
`);

function createForUser({ io, userId, type, title, message, link }) {
  const result = insertNotification.run(userId, type, title, message, link);

  const notification = {
    id: Number(result.lastInsertRowid),
    user_id: userId,
    type,
    title,
    message,
    link,
    is_read: 0,
    created_at: new Date().toISOString(),
  };

  if (io) {
    io.to(`user:${userId}`).emit("notification:new", notification);
  }

  return notification;
}

function notifyStaff({ io, excludeUserId = null, type, title, message, link }) {
  const staffUsers = db
    .prepare(
      `
      SELECT id
      FROM users
      WHERE role IN ('it', 'admin')
        AND is_active = 1
    `,
    )
    .all();

  for (const user of staffUsers) {
    if (excludeUserId !== null && Number(user.id) === Number(excludeUserId)) {
      continue;
    }

    createForUser({
      io,
      userId: user.id,
      type,
      title,
      message,
      link,
    });
  }
}
function notifyTicketOwner({ io, ticket, actorUserId, type, title, message }) {
  const ownerId = Number(ticket?.created_by);

  if (!Number.isInteger(ownerId)) {
    return;
  }

  if (ownerId === Number(actorUserId)) {
    return;
  }

  return createForUser({
    io,
    userId: ownerId,
    type,
    title,
    message,
    link: `/tickets/${ticket.id}`,
  });
}

module.exports = {
  createForUser,
  notifyStaff,
  notifyTicketOwner,
};
