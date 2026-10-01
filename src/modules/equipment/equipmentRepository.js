const { db } = require('../../config/database');

function list({ type, status, search, ticketOwnerId = null }) {
  const where = [];
  const params = [];
  if (type) {
    where.push('e.type = ?');
    params.push(type);
  }
  if (status) {
    where.push('e.status = ?');
    params.push(status);
  }
  if (search) {
    where.push(
      '(e.name LIKE ? OR e.asset_tag LIKE ? OR e.serial_number LIKE ? OR e.ip_address LIKE ? OR u.full_name LIKE ?)'
    );
    for (let index = 0; index < 5; index += 1) params.push(`%${search}%`);
  }

  if (ticketOwnerId !== null) params.unshift(ticketOwnerId);
  return db.prepare(`
    SELECT e.*, u.full_name AS assigned_user_name, u.username AS assigned_username,
      (SELECT COUNT(*) FROM tickets t WHERE t.equipment_id = e.id
        ${ticketOwnerId === null ? '' : 'AND t.created_by = ?'}) AS ticket_count
    FROM equipment e
    LEFT JOIN users u ON u.id = e.assigned_user_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY e.status = 'active' DESC, e.type, e.name
  `).all(...params);
}

function getStats() {
  return db.prepare(`
    SELECT COUNT(*) AS total,
      SUM(type = 'computer') AS computers,
      SUM(type = 'printer') AS printers,
      SUM(status = 'repair') AS repair,
      SUM(status = 'active') AS active,
      SUM(status = 'reserve') AS reserve
    FROM equipment
  `).get();
}

function listActiveUsers() {
  return db.prepare(`
    SELECT id, full_name, department, office
    FROM users WHERE is_active = 1 ORDER BY full_name
  `).all();
}

function listImportUsers() {
  return db.prepare(`
    SELECT id, username, full_name, email
    FROM users WHERE is_active = 1
  `).all();
}

function findByAssetTag(assetTag) {
  return db.prepare(
    'SELECT id FROM equipment WHERE asset_tag = ?'
  ).get(assetTag);
}

function findById(id) {
  return db.prepare('SELECT * FROM equipment WHERE id = ?').get(id);
}

function findDetailsById(id) {
  return db.prepare(`
    SELECT e.*, u.full_name AS assigned_user_name
    FROM equipment e
    LEFT JOIN users u ON u.id = e.assigned_user_id
    WHERE e.id = ?
  `).get(id);
}

function listTickets(id, ticketOwnerId = null) {
  return db.prepare(`
    SELECT id, title, status, priority, created_at
    FROM tickets WHERE equipment_id = ?
      ${ticketOwnerId === null ? '' : 'AND created_by = ?'} ORDER BY created_at DESC
  `).all(...(ticketOwnerId === null ? [id] : [id, ticketOwnerId]));
}


function create(item) {
  return db.prepare(`
    INSERT INTO equipment
      (asset_tag, type, name, manufacturer, model, serial_number, ip_address,
       mac_address, operating_system, cpu, ram_gb, storage, department, office,
       assigned_user_id, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(...toParameters(item));
}

function update(id, item) {
  return db.prepare(`
    UPDATE equipment SET
      asset_tag = ?, type = ?, name = ?, manufacturer = ?, model = ?,
      serial_number = ?, ip_address = ?, mac_address = ?, operating_system = ?,
      cpu = ?, ram_gb = ?, storage = ?, department = ?, office = ?,
      assigned_user_id = ?, status = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(...toParameters(item), id);
}

function remove(id) {
  db.exec('BEGIN');
  try {
    db.prepare('UPDATE tickets SET equipment_id = NULL WHERE equipment_id = ?').run(id);
    db.prepare('DELETE FROM equipment WHERE id = ?').run(id);
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (_) { /* transaction was not started */ }
    throw error;
  }
}

function toParameters(item) {
  return [
    item.assetTag,
    item.type,
    item.name,
    item.manufacturer,
    item.model,
    item.serialNumber,
    item.ipAddress,
    item.macAddress,
    item.operatingSystem,
    item.cpu,
    item.ramGb,
    item.storage,
    item.department,
    item.office,
    item.assignedUserId,
    item.status,
    item.notes
  ];
}

module.exports = {
  list,
  getStats,
  listActiveUsers,
  listImportUsers,
  findByAssetTag,
  findById,
  findDetailsById,
  listTickets,
  create,
  update,
  remove
};
