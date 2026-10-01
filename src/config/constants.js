const ROLES = Object.freeze({
  USER: 'user',
  IT: 'it',
  ADMIN: 'admin',
  ACCOUNTING: 'accounting',
  PROCUREMENT: 'procurement',
  DIRECTOR: 'director'
});

const TICKET_STATUSES = Object.freeze({
  NEW: 'new',
  IN_PROGRESS: 'in_progress',
  WAITING: 'waiting',
  DONE: 'done',
  CLOSED: 'closed'
});

module.exports = { ROLES, TICKET_STATUSES };
