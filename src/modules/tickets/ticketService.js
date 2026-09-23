const repository = require('./ticketRepository');
const { STATUS_LABELS, PRIORITY_LABELS } = require('./ticketConstants');
const notificationService = require('../notifications/notificationService');
const userService = require('../users/userService');

function isStaff(user) {
  return ['it', 'admin'].includes(user.role);
}

function getDashboard(user) {
  const staff = isStaff(user);
  const criteria = { staff, userId: user.id };
  return {
    tickets: repository.listDashboard(criteria),
    stats: repository.getDashboardStats(criteria),
    isStaff: staff,
    statusLabels: STATUS_LABELS,
    priorityLabels: PRIORITY_LABELS
  };
}

function getList(user, query = {}) {
  const filters = {
    search: String(query.search || '').trim(),
    status: Object.hasOwn(STATUS_LABELS, query.status) ? query.status : '',
    priority: Object.hasOwn(PRIORITY_LABELS, query.priority) ? query.priority : '',
    assigned: ['me', 'unassigned'].includes(query.assigned) ||
      (/^[1-9]\d*$/.test(query.assigned || '') && Number.isSafeInteger(Number(query.assigned)))
      ? query.assigned : ''
  };
  return repository.listDashboard({ staff: isStaff(user), userId: user.id, filters });
}

function getCreateData(user) {
  return {
    equipment: repository.listSelectableEquipment({
      staff: isStaff(user),
      userId: user.id
    })
  };
}

function createTicket({ user, data, files }) {
  return repository.createTicket({
    ...data,
    createdBy: user.id,
    files
  });
}

function notifyTicketCreated({ ticketId, title, user, io }) {
  notificationService.notifyStaff({
    io,
    excludeUserId: user.id,
    type: 'new_ticket',
    title: `Нова заявка #${ticketId}`,
    message: title,
    link: `/tickets/${ticketId}`
  });
}

function requestPasswordReset({ user, io }) {
  const existing = repository.findOpenPasswordResetByUser(user.id);
  if (existing) return { ticketId: existing.id, created: false };

  const title = `Відновлення доступу: ${user.username}`;
  const ticketId = repository.createTicket({
    title,
    description: `Користувач ${user.full_name} (${user.username}) запросив відновлення доступу через форму входу.`,
    category: 'Відновлення доступу',
    priority: 'high',
    createdBy: user.id,
    equipmentId: null,
    files: []
  });
  notificationService.notifyStaff({
    io,
    excludeUserId: user.id,
    type: 'password_reset_requested',
    title: `Запит на відновлення доступу #${ticketId}`,
    message: `${user.full_name} (${user.username}) не може увійти в систему.`,
    link: `/tickets/${ticketId}`
  });
  return { ticketId, created: true };
}

function getDetails(id, user) {
  const ticket = repository.findDetails(id);
  if (!ticket) return { outcome: 'not_found' };
  if (!isStaff(user) && ticket.created_by !== user.id) return { outcome: 'forbidden' };
  return {
    outcome: 'ok',
    data: {
      ticket,
      comments: repository.listComments(id),
      history: repository.listHistory(id),
      attachments: repository.listAttachments(id),
      staffUsers: repository.listActiveStaff(),
      isStaff: isStaff(user),
      statusLabels: STATUS_LABELS,
      priorityLabels: PRIORITY_LABELS,
      formatDuration
    }
  };
}

function addComment({ ticketId, body, user, io }) {
  const ticket = repository.findForComment(ticketId);
  if (!ticket) return 'not_found';
  const staff = isStaff(user);
  if (!staff && ticket.created_by !== user.id) return 'forbidden';
  if (!body) return 'empty';

  repository.addComment({
    ticketId,
    userId: user.id,
    body,
    staff,
    firstResponseExists: Boolean(ticket.first_response_at)
  });

  if (staff) {
    notificationService.notifyTicketOwner({
      io,
      ticket,
      actorUserId: user.id,
      type: 'ticket_comment',
      title: `Новий коментар у заявці #${ticketId}`,
      message: body
    });
  } else {
    notificationService.notifyStaff({
      io,
      excludeUserId: user.id,
      type: 'ticket_comment',
      title: `Новий коментар у заявці #${ticketId}`,
      message: body,
      link: `/tickets/${ticketId}`
    });
  }
  return 'ok';
}

function updateTicket({ ticketId, requestedStatus, requestedAssignee, user, io }) {
  const ticket = repository.findById(ticketId);
  if (!ticket) return { outcome: 'not_found' };
  if (ticket.category === 'Відновлення доступу') {
    return { outcome: 'reset_workflow_only' };
  }
  const status = Object.hasOwn(STATUS_LABELS, requestedStatus)
    ? requestedStatus
    : ticket.status;
  const assignedTo = requestedAssignee ? Number(requestedAssignee) : null;

  if (assignedTo && !repository.findActiveStaffById(assignedTo)) {
    return { outcome: 'invalid_assignee' };
  }

  const changes = [];
  if (ticket.status !== status) {
    changes.push(`Статус: ${STATUS_LABELS[ticket.status]} → ${STATUS_LABELS[status]}`);
  }
  if ((ticket.assigned_to || null) !== assignedTo) changes.push('Змінено виконавця');

  const statusChanged = ticket.status !== status;
  const assigneeChanged = (ticket.assigned_to || null) !== assignedTo;
  repository.updateTicket({
    id: ticketId,
    status,
    assignedTo,
    setFirstResponse: !ticket.first_response_at,
    setWorkStarted: status === 'in_progress' && !ticket.work_started_at,
    setResolved: status === 'done' && !ticket.resolved_at,
    setClosed: status === 'closed' && !ticket.closed_at
  });
  if (changes.length) repository.addHistory(ticketId, user.id, 'updated', changes.join('. '));

  if (statusChanged) {
    notificationService.notifyTicketOwner({
      io,
      ticket,
      actorUserId: user.id,
      type: 'ticket_status_changed',
      title: `Змінено статус заявки #${ticketId}`,
      message: `Новий статус: ${STATUS_LABELS[status]}`
    });
  }
  if (assigneeChanged && !statusChanged) {
    notificationService.notifyTicketOwner({
      io,
      ticket,
      actorUserId: user.id,
      type: 'ticket_assignee_changed',
      title: `Оновлено заявку #${ticketId}`,
      message: 'Для вашої заявки змінено виконавця.'
    });
  }
  return { outcome: 'ok', changed: changes.length > 0 };
}

function acceptTicket({ ticketId, user, io }) {
  const ticket = repository.findById(ticketId);
  if (!ticket) return 'not_found';
  if (ticket.assigned_to) return 'already_assigned';
  if (['done', 'closed'].includes(ticket.status)) return 'not_available';

  const result = repository.acceptTicket(ticketId, user.id);
  if (Number(result.changes) === 0) return 'already_assigned';
  repository.addHistory(ticketId, user.id, 'accepted', 'Заявку прийнято в роботу');
  notificationService.notifyTicketOwner({
    io,
    ticket,
    actorUserId: user.id,
    type: 'ticket_accepted',
    title: `Заявку #${ticketId} прийнято в роботу`,
    message: `${user.fullName} прийняв заявку.`
  });
  return 'ok';
}

function setPasswordResetTemporaryPassword({ ticketId, user, temporaryPassword, io }) {
  const ticket = repository.findById(ticketId);
  if (!ticket) return 'not_found';
  if (ticket.category !== 'Відновлення доступу') return 'wrong_category';
  if (Number(ticket.assigned_to) !== Number(user.id)) return 'not_assigned';
  if (ticket.status !== 'in_progress') return 'not_available';
  if (String(temporaryPassword || '').length < 8) return 'short_password';

  let outcome;
  try {
    outcome = repository.runInTransaction(() => {
      const completed = repository.completePasswordReset(ticketId, user.id);
      if (Number(completed.changes) === 0) return 'not_available';
      if (!userService.setTemporaryPassword(ticket.created_by, temporaryPassword)) {
        const error = new Error('Password-reset target is unavailable.');
        error.code = 'RESET_USER_UNAVAILABLE';
        throw error;
      }
      repository.addHistory(
        ticketId,
        user.id,
        'password_reset_ready',
        'Встановлено тимчасовий пароль; заявка виконана'
      );
      return 'ok';
    });
  } catch (error) {
    if (error.code === 'RESET_USER_UNAVAILABLE') return 'user_unavailable';
    throw error;
  }
  if (outcome !== 'ok') return outcome;
  notificationService.notifyTicketOwner({
    io,
    ticket,
    actorUserId: user.id,
    type: 'password_reset_ready',
    title: `Відновлення доступу за заявкою #${ticketId}`,
    message: 'Тимчасовий пароль встановлено. Отримайте його у відповідального спеціаліста.'
  });
  return 'ok';
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

module.exports = {
  STATUS_LABELS,
  PRIORITY_LABELS,
  isStaff,
  getDashboard,
  getList,
  getCreateData,
  createTicket,
  notifyTicketCreated,
  requestPasswordReset,
  getDetails,
  addComment,
  updateTicket,
  acceptTicket,
  setPasswordResetTemporaryPassword,
  formatDuration,
  addHistory: repository.addHistory
};
