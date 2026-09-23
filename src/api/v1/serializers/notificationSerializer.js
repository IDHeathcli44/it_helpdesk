module.exports = function notificationSerializer(row) {
  return {
    id: row.id, type: row.type, title: row.title, message: row.message,
    link: row.link, isRead: Boolean(row.is_read), createdAt: row.created_at
  };
};
