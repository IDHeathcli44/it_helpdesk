const service = require('./equipmentService');
const { setFlash } = require('../../utils/flash');

function list(req, res) {
  const importErrors = req.session.importErrors || [];
  delete req.session.importErrors;
  return res.render('equipment/index', {
    ...service.getList(req.query),
    importErrors
  });
}

function showCreate(req, res) {
  return res.render('equipment/form', service.getForm());
}

function create(req, res) {
  const name = String(req.body.name || '').trim();
  if (!name) {
    setFlash(req, 'error', 'Вкажіть назву обладнання.');
    return res.redirect('/equipment/new');
  }

  try {
    const result = service.create(req.body);
    setFlash(req, 'success', 'Обладнання додано.');
    return res.redirect(`/equipment/${result.lastInsertRowid}`);
  } catch (error) {
    setFlash(
      req,
      'error',
      error.message.includes('UNIQUE')
        ? 'Такий інвентарний номер уже існує.'
        : 'Не вдалося зберегти обладнання.'
    );
    return res.redirect('/equipment/new');
  }
}

function show(req, res) {
  const details = service.getDetails(Number(req.params.id));
  if (!details) return res.status(404).render('errors/404');
  return res.render('equipment/detail', details);
}

function showEdit(req, res) {
  const form = service.getForm(Number(req.params.id));
  if (!form.item) return res.status(404).render('errors/404');
  return res.render('equipment/form', form);
}

function update(req, res) {
  const id = Number(req.params.id);
  if (!service.getForm(id).item) return res.status(404).render('errors/404');
  try {
    service.update(id, req.body);
    setFlash(req, 'success', 'Дані обладнання оновлено.');
  } catch {
    setFlash(req, 'error', 'Не вдалося оновити обладнання. Перевірте інвентарний номер.');
  }
  return res.redirect(`/equipment/${id}`);
}

function remove(req, res) {
  service.remove(Number(req.params.id));
  setFlash(req, 'success', 'Обладнання видалено.');
  return res.redirect('/equipment');
}

function importInventory(req, res) {
  if (!req.file) {
    setFlash(req, 'error', 'Оберіть Excel або CSV файл інвентаризації.');
    return res.redirect('/equipment');
  }
  try {
    const result = service.importInventory(req.file.buffer);
    req.session.importErrors = result.errors;
    setFlash(
      req,
      result.imported ? 'success' : 'error',
      `Імпорт завершено. Додано: ${result.imported}, пропущено: ${result.skipped}.`
    );
  } catch (error) {
    setFlash(req, 'error', `Не вдалося імпортувати файл: ${error.message}`);
  }
  return res.redirect('/equipment');
}

function downloadImportTemplate(req, res) {
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader(
    'Content-Disposition',
    'attachment; filename="equipment-inventory-template.xlsx"'
  );
  return res.send(service.createImportTemplate());
}

module.exports = {
  list,
  showCreate,
  create,
  show,
  showEdit,
  update,
  remove,
  importInventory,
  downloadImportTemplate
};
