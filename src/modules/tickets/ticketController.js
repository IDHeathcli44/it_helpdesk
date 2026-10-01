const fs = require('node:fs');
const service = require('./ticketService');
const { setFlash } = require('../../utils/flash');

function dashboard(req, res) {
  return res.render('tickets/dashboard', service.getDashboard(req.session.user));
}

function showCreate(req, res) {
  return res.render('tickets/create', service.getCreateData(req.session.user));
}

function create(req, res) {
  const title = String(req.body.title || '').trim();
  const description = String(req.body.description || '').trim();
  const category = String(req.body.category || 'Інше').trim();
  const priority = ['low', 'normal', 'high', 'critical'].includes(req.body.priority)
    ? req.body.priority
    : 'normal';
  const equipmentId = req.body.equipmentId ? Number(req.body.equipmentId) : null;
  const files = req.files || [];

  if (!title || !description) {
    removeFiles(files);
    setFlash(req, 'error', 'Заповніть тему та опис заявки.');
    return res.redirect('/tickets/new');
  }

  let ticketId;
  try {
    ticketId = service.createTicket({
      user: req.session.user,
      data: { title, description, category, priority, equipmentId },
      files
    });
  } catch (error) {
    removeFiles(files);
    console.error('Ticket creation error:', error);
    setFlash(req, 'error', 'Не вдалося створити заявку.');
    return res.redirect('/tickets/new');
  }

  service.notifyTicketCreated({
    ticketId,
    title,
    user: req.session.user,
    io: req.app.get('io')
  });
  setFlash(req, 'success', 'Заявку створено.');
  return res.redirect(`/tickets/${ticketId}`);
}

function show(req, res) {
  const result = service.getDetails(Number(req.params.id), req.session.user);
  if (result.outcome === 'not_found') return res.status(404).render('errors/404');
  if (result.outcome === 'forbidden') return res.status(403).render('errors/403');
  return res.render('tickets/detail', {
    ...result.data,
    formatDuration: (minutes) => service.formatDuration(minutes, req.locale)
  });
}

function addComment(req, res) {
  const ticketId = Number(req.params.id);
  const body = String(req.body.body || '').trim();

  const outcome = service.addComment({
    ticketId,
    body,
    user: req.session.user,
    io: req.app.get('io')
  });
  if (outcome === 'not_found') return res.status(404).render('errors/404');
  if (outcome === 'forbidden') return res.status(403).render('errors/403');
  if (outcome === 'empty') {
    setFlash(req, 'error', 'Коментар не може бути порожнім.');
    return res.redirect(`/tickets/${ticketId}`);
  }
  setFlash(req, 'success', 'Коментар додано.');
  return res.redirect(`/tickets/${ticketId}`);
}

function update(req, res) {
  const ticketId = Number(req.params.id);
  const result = service.updateTicket({
    ticketId,
    requestedStatus: req.body.status,
    requestedAssignee: req.body.assignedTo,
    user: req.session.user,
    io: req.app.get('io')
  });
  if (result.outcome === 'not_found') return res.status(404).render('errors/404');
  if (result.outcome === 'invalid_assignee') {
    setFlash(req, 'error', 'Вибраного виконавця не знайдено.');
    return res.redirect(`/tickets/${ticketId}`);
  }
  if (result.outcome === 'reset_workflow_only') {
    return res.status(403).render('errors/403');
  }
  setFlash(req, 'success', result.changed ? 'Заявку оновлено.' : 'Змін не було.');
  return res.redirect(`/tickets/${ticketId}`);
}

function accept(req, res) {
  const ticketId = Number(req.params.id);
  const outcome = service.acceptTicket({
    ticketId,
    user: req.session.user,
    io: req.app.get('io')
  });
  if (outcome === 'not_found') return res.status(404).render('errors/404');
  if (outcome === 'already_assigned') {
    setFlash(req, 'error', 'Цю заявку вже прийняв інший спеціаліст.');
  } else if (outcome === 'not_available') {
    setFlash(req, 'error', 'Завершену заявку не можна прийняти в роботу.');
  } else {
    setFlash(req, 'success', 'Заявку закріплено за вами.');
  }
  return res.redirect(`/tickets/${ticketId}`);
}

function setTemporaryPassword(req, res) {
  const ticketId = Number(req.params.id);
  const outcome = service.setPasswordResetTemporaryPassword({
    ticketId,
    user: req.session.user,
    temporaryPassword: String(req.body.temporaryPassword || ''),
    io: req.app.get('io')
  });
  if (outcome === 'not_found') return res.status(404).render('errors/404');
  if (['wrong_category', 'not_assigned'].includes(outcome)) {
    return res.status(403).render('errors/403');
  }
  if (outcome === 'short_password') {
    setFlash(req, 'error', 'Тимчасовий пароль має містити щонайменше 8 символів.');
  } else if (outcome === 'not_available') {
    setFlash(req, 'error', 'Цю заявку вже виконано або вона більше не доступна для скидання пароля.');
  } else if (outcome === 'user_unavailable') {
    setFlash(req, 'error', 'Користувача не знайдено або його обліковий запис вимкнено.');
  } else {
    setFlash(req, 'success', 'Тимчасовий пароль встановлено. Передайте його користувачеві безпечним каналом.');
  }
  return res.redirect(`/tickets/${ticketId}`);
}

function removeFiles(files) {
  for (const file of files) fs.unlink(file.path, () => {});
}

module.exports = {
  dashboard,
  showCreate,
  create,
  show,
  addComment,
  update,
  accept,
  setTemporaryPassword
};
