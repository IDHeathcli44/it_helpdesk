const { db } = require('../config/database');

const STATUS_LABELS = {
  new: 'Нова',
  in_progress: 'В роботі',
  waiting: 'Очікує',
  done: 'Виконано',
  closed: 'Закрито'
};

const PRIORITY_LABELS = {
  low: 'Низький',
  normal: 'Звичайний',
  high: 'Високий',
  critical: 'Критичний'
};

function addHistory(ticketId, userId, eventType, details) {
  db.prepare(`
    INSERT INTO ticket_history (ticket_id, user_id, event_type, details)
    VALUES (?, ?, ?, ?)
  `).run(ticketId, userId || null, eventType, details);
}

function formatDuration(minutes) {
  if (minutes === null || minutes === undefined || Number.isNaN(Number(minutes))) return '—';
  const rounded = Math.max(0, Math.round(Number(minutes)));
  const days = Math.floor(rounded / 1440);
  const hours = Math.floor((rounded % 1440) / 60);
  const mins = rounded % 60;
  const parts = [];
  if (days) parts.push(`${days} дн`);
  if (hours) parts.push(`${hours} год`);
  if (mins || parts.length === 0) parts.push(`${mins} хв`);
  return parts.join(' ');
}

module.exports = { STATUS_LABELS, PRIORITY_LABELS, addHistory, formatDuration };
