const { db } = require('../config/database');
const { setFlash } = require('../utils/flash');
const fs = require('fs');
const XLSX = require('xlsx');

const TYPES = { computer: 'Комп’ютер', printer: 'Принтер', monitor: 'Монітор', network: 'Мережеве обладнання', other: 'Інше' };
const STATUSES = { active: 'В експлуатації', repair: 'У ремонті', reserve: 'Резерв', retired: 'Списано' };

function list(req, res) {
  const type = Object.keys(TYPES).includes(req.query.type) ? req.query.type : '';
  const status = Object.keys(STATUSES).includes(req.query.status) ? req.query.status : '';
  const search = String(req.query.search || '').trim();
  const where = [];
  const params = [];
  if (type) { where.push('e.type = ?'); params.push(type); }
  if (status) { where.push('e.status = ?'); params.push(status); }
  if (search) {
    where.push(`(e.name LIKE ? OR e.asset_tag LIKE ? OR e.serial_number LIKE ? OR e.ip_address LIKE ? OR u.full_name LIKE ?)`);
    for (let i = 0; i < 5; i += 1) params.push(`%${search}%`);
  }
  const equipment = db.prepare(`
    SELECT e.*, u.full_name AS assigned_user_name,
      (SELECT COUNT(*) FROM tickets t WHERE t.equipment_id = e.id) AS ticket_count
    FROM equipment e LEFT JOIN users u ON u.id = e.assigned_user_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY e.status = 'active' DESC, e.type, e.name
  `).all(...params);
  const stats = db.prepare(`SELECT COUNT(*) total,
    SUM(type='computer') computers, SUM(type='printer') printers,
    SUM(status='repair') repair, SUM(status='active') active FROM equipment`).get();
  res.render('equipment/index', { equipment, stats, type, status, search, types: TYPES, statuses: STATUSES });
}

function showCreate(req, res) {
  const users = db.prepare("SELECT id, full_name, department, office FROM users WHERE is_active=1 ORDER BY full_name").all();
  res.render('equipment/form', { item: null, users, types: TYPES, statuses: STATUSES });
}

function create(req, res) {
  const name = String(req.body.name || '').trim();
  const type = Object.keys(TYPES).includes(req.body.type) ? req.body.type : 'other';
  if (!name) { setFlash(req, 'error', 'Вкажіть назву обладнання.'); return res.redirect('/equipment/new'); }
  try {
    const result = db.prepare(`INSERT INTO equipment
      (asset_tag,type,name,manufacturer,model,serial_number,ip_address,mac_address,operating_system,cpu,ram_gb,storage,department,office,assigned_user_id,status,notes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      val(req.body.assetTag), type, name, val(req.body.manufacturer), val(req.body.model), val(req.body.serialNumber),
      val(req.body.ipAddress), val(req.body.macAddress), val(req.body.operatingSystem), val(req.body.cpu),
      req.body.ramGb ? Number(req.body.ramGb) : null, val(req.body.storage), val(req.body.department), val(req.body.office),
      req.body.assignedUserId ? Number(req.body.assignedUserId) : null,
      Object.keys(STATUSES).includes(req.body.status) ? req.body.status : 'active', val(req.body.notes)
    );
    setFlash(req, 'success', 'Обладнання додано.');
    res.redirect(`/equipment/${result.lastInsertRowid}`);
  } catch (error) {
    setFlash(req, 'error', error.message.includes('UNIQUE') ? 'Такий інвентарний номер уже існує.' : 'Не вдалося зберегти обладнання.');
    res.redirect('/equipment/new');
  }
}

function show(req, res) {
  const item = db.prepare(`SELECT e.*, u.full_name assigned_user_name FROM equipment e LEFT JOIN users u ON u.id=e.assigned_user_id WHERE e.id=?`).get(Number(req.params.id));
  if (!item) return res.status(404).render('errors/404');
  const tickets = db.prepare(`SELECT id,title,status,priority,created_at FROM tickets WHERE equipment_id=? ORDER BY created_at DESC`).all(item.id);
  res.render('equipment/detail', { item, tickets, types: TYPES, statuses: STATUSES });
}

function showEdit(req, res) {
  const item = db.prepare('SELECT * FROM equipment WHERE id=?').get(Number(req.params.id));
  if (!item) return res.status(404).render('errors/404');
  const users = db.prepare("SELECT id, full_name, department, office FROM users WHERE is_active=1 ORDER BY full_name").all();
  res.render('equipment/form', { item, users, types: TYPES, statuses: STATUSES });
}

function update(req, res) {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT id FROM equipment WHERE id=?').get(id);
  if (!existing) return res.status(404).render('errors/404');
  try {
    db.prepare(`UPDATE equipment SET asset_tag=?,type=?,name=?,manufacturer=?,model=?,serial_number=?,ip_address=?,mac_address=?,operating_system=?,cpu=?,ram_gb=?,storage=?,department=?,office=?,assigned_user_id=?,status=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(
      val(req.body.assetTag), Object.keys(TYPES).includes(req.body.type) ? req.body.type : 'other', String(req.body.name||'').trim(),
      val(req.body.manufacturer), val(req.body.model), val(req.body.serialNumber), val(req.body.ipAddress), val(req.body.macAddress),
      val(req.body.operatingSystem), val(req.body.cpu), req.body.ramGb ? Number(req.body.ramGb) : null, val(req.body.storage),
      val(req.body.department), val(req.body.office), req.body.assignedUserId ? Number(req.body.assignedUserId) : null,
      Object.keys(STATUSES).includes(req.body.status) ? req.body.status : 'active', val(req.body.notes), id);
    setFlash(req, 'success', 'Дані обладнання оновлено.');
  } catch (error) { setFlash(req, 'error', 'Не вдалося оновити обладнання. Перевірте інвентарний номер.'); }
  res.redirect(`/equipment/${id}`);
}

function remove(req, res) {
  const id = Number(req.params.id);
  db.prepare('UPDATE tickets SET equipment_id=NULL WHERE equipment_id=?').run(id);
  db.prepare('DELETE FROM equipment WHERE id=?').run(id);
  setFlash(req, 'success', 'Обладнання видалено.');
  res.redirect('/equipment');
}

function val(v) { const s=String(v||'').trim(); return s || null; }
module.exports = { list, showCreate, create, show, showEdit, update, remove };

exports.importEquipment = (req, res) => {
  if (!req.file) {
    req.flash('error', 'Оберіть файл інвентаризації.');
    return res.redirect('/equipment');
  }

  const filePath = req.file.path;

  try {
    const workbook = XLSX.readFile(filePath);
    const firstSheetName = workbook.SheetNames[0];

    if (!firstSheetName) {
      throw new Error('У файлі немає аркушів.');
    }

    const worksheet = workbook.Sheets[firstSheetName];

    const rows = XLSX.utils.sheet_to_json(worksheet, {
      defval: '',
      raw: false,
    });

    if (rows.length === 0) {
      throw new Error('Файл не містить записів.');
    }

    const allowedTypes = new Set([
      'computer',
      'printer',
      'monitor',
      'network',
      'other',
    ]);

    const allowedStatuses = new Set([
      'active',
      'repair',
      'reserve',
      'written_off',
    ]);

    const insertEquipment = db.prepare(`
      INSERT INTO equipment (
        name,
        type,
        inventory_number,
        serial_number,
        manufacturer,
        model,
        ip_address,
        mac_address,
        department,
        room,
        status,
        created_at,
        updated_at
      )
      VALUES (
        @name,
        @type,
        @inventory_number,
        @serial_number,
        @manufacturer,
        @model,
        @ip_address,
        @mac_address,
        @department,
        @room,
        @status,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
    `);

    const inventoryExists = db.prepare(`
      SELECT id
      FROM equipment
      WHERE inventory_number = ?
      LIMIT 1
    `);

    let importedCount = 0;
    let skippedCount = 0;
    const errors = [];

    const importTransaction = db.transaction((equipmentRows) => {
      equipmentRows.forEach((row, index) => {
        const excelRowNumber = index + 2;

        const name = String(row.name || '').trim();
        const type = String(row.type || '').trim().toLowerCase();
        const inventoryNumber = String(
          row.inventory_number || ''
        ).trim();

        const status = String(row.status || 'active')
          .trim()
          .toLowerCase();

        if (!name) {
          errors.push(
            `Рядок ${excelRowNumber}: не заповнено поле name.`
          );

          skippedCount += 1;
          return;
        }

        if (!allowedTypes.has(type)) {
          errors.push(
            `Рядок ${excelRowNumber}: невідомий тип "${type}".`
          );

          skippedCount += 1;
          return;
        }

        if (!allowedStatuses.has(status)) {
          errors.push(
            `Рядок ${excelRowNumber}: невідомий статус "${status}".`
          );

          skippedCount += 1;
          return;
        }

        if (
          inventoryNumber &&
          inventoryExists.get(inventoryNumber)
        ) {
          errors.push(
            `Рядок ${excelRowNumber}: інвентарний номер ` +
            `"${inventoryNumber}" уже існує.`
          );

          skippedCount += 1;
          return;
        }

        insertEquipment.run({
          name,
          type,
          inventory_number: inventoryNumber || null,
          serial_number:
            String(row.serial_number || '').trim() || null,
          manufacturer:
            String(row.manufacturer || '').trim() || null,
          model:
            String(row.model || '').trim() || null,
          ip_address:
            String(row.ip_address || '').trim() || null,
          mac_address:
            String(row.mac_address || '').trim() || null,
          department:
            String(row.department || '').trim() || null,
          room:
            String(row.room || '').trim() || null,
          status,
        });

        importedCount += 1;
      });
    });

    importTransaction(rows);

    if (errors.length > 0) {
      req.session.importErrors = errors.slice(0, 50);
    }

    req.flash(
      'success',
      `Імпорт завершено. Додано: ${importedCount}, ` +
      `пропущено: ${skippedCount}.`
    );

    return res.redirect('/equipment');
  } catch (error) {
    console.error('Equipment import error:', error);

    req.flash(
      'error',
      `Не вдалося імпортувати файл: ${error.message}`
    );

    return res.redirect('/equipment');
  } finally {
    fs.unlink(filePath, (unlinkError) => {
      if (unlinkError && unlinkError.code !== 'ENOENT') {
        console.error(
          'Could not delete temporary import file:',
          unlinkError
        );
      }
    });
  }
};