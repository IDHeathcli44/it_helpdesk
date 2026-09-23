const { db } = require('../../config/database');

function listDashboard({ staff, userId, filters = {} }) {
  const conditions = staff ? [] : ['t.created_by = ?'];
  const params = staff ? [] : [userId];
  for (const field of ['status', 'priority']) {
    if (filters[field]) {
      conditions.push(`t.${field} = ?`);
      params.push(filters[field]);
    }
  }
  if (filters.search) {
    conditions.push('(t.title LIKE ? OR t.description LIKE ?)');
    params.push(`%${filters.search}%`, `%${filters.search}%`);
  }
  if (filters.assigned === 'unassigned') conditions.push('t.assigned_to IS NULL');
  else if (filters.assigned) {
    conditions.push('t.assigned_to = ?');
    params.push(filters.assigned === 'me' ? userId : Number(filters.assigned));
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return db.prepare(`
    SELECT t.*, creator.full_name AS creator_name, assignee.full_name AS assignee_name,
      e.name AS equipment_name, e.asset_tag AS equipment_asset_tag
    FROM tickets t
    LEFT JOIN users creator ON creator.id = t.created_by
    LEFT JOIN users assignee ON assignee.id = t.assigned_to
    LEFT JOIN equipment e ON e.id = t.equipment_id
    ${where}
    ORDER BY CASE t.status
      WHEN 'new' THEN 1 WHEN 'in_progress' THEN 2 WHEN 'waiting' THEN 3
      WHEN 'done' THEN 4 ELSE 5 END,
      t.updated_at DESC
    LIMIT 100
  `).all(...params);
}

function getDashboardStats({ staff, userId }) {
  const where = staff ? '' : 'WHERE t.created_by = ?';
  const params = staff ? [] : [userId];
  return db.prepare(`
    SELECT COUNT(*) AS total,
      SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) AS new_count,
      SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress_count,
      SUM(CASE WHEN status = 'waiting' THEN 1 ELSE 0 END) AS waiting_count,
      SUM(CASE WHEN status IN ('done','closed') THEN 1 ELSE 0 END) AS completed_count
    FROM tickets t ${where}
  `).get(...params);
}

function listSelectableEquipment({ staff, userId }) {
  if (staff) {
    return db.prepare(`
      SELECT id, name, asset_tag, type FROM equipment
      WHERE status != 'retired' ORDER BY name
    `).all();
  }
  return db.prepare(`
    SELECT id, name, asset_tag, type FROM equipment
    WHERE assigned_user_id = ? AND status != 'retired' ORDER BY name
  `).all(userId);
}

function createTicket({ title, description, category, priority, createdBy, equipmentId, files }) {
  db.exec('BEGIN');
  try {
    const result = db.prepare(`
      INSERT INTO tickets (title, description, category, priority, created_by, equipment_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(title, description, category, priority, createdBy, equipmentId);
    const ticketId = Number(result.lastInsertRowid);
    const insertAttachment = db.prepare(`
      INSERT INTO ticket_attachments
        (ticket_id, uploaded_by, original_name, stored_name, mime_type, size_bytes)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const file of files) {
      insertAttachment.run(
        ticketId,
        createdBy,
        file.originalname,
        file.filename,
        file.mimetype,
        file.size
      );
    }

    addHistory(
      ticketId,
      createdBy,
      'created',
      files.length ? `Заявку створено. Додано зображень: ${files.length}` : 'Заявку створено'
    );
    db.exec('COMMIT');
    return ticketId;
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (_) { /* transaction was not started */ }
    throw error;
  }
}

function findOpenPasswordResetByUser(userId) {
  return db.prepare(`
    SELECT id FROM tickets
    WHERE created_by = ?
      AND category = 'Відновлення доступу'
      AND status NOT IN ('done', 'closed')
    ORDER BY created_at DESC
    LIMIT 1
  `).get(userId);
}

function findDetails(id) {
  return db.prepare(`
    SELECT t.*, creator.full_name AS creator_name, creator.department, creator.office,
      assignee.full_name AS assignee_name, e.name AS equipment_name,
      e.asset_tag AS equipment_asset_tag
    FROM tickets t
    LEFT JOIN users creator ON creator.id = t.created_by
    LEFT JOIN users assignee ON assignee.id = t.assigned_to
    LEFT JOIN equipment e ON e.id = t.equipment_id
    WHERE t.id = ?
  `).get(id);
}

function listComments(id) {
  return db.prepare(`
    SELECT c.*, u.full_name AS author_name, u.role AS author_role
    FROM ticket_comments c
    LEFT JOIN users u ON u.id = c.user_id
    WHERE c.ticket_id = ? ORDER BY c.created_at ASC, c.id ASC
  `).all(id);
}

function listHistory(id) {
  return db.prepare(`
    SELECT h.*, u.full_name AS author_name
    FROM ticket_history h
    LEFT JOIN users u ON u.id = h.user_id
    WHERE h.ticket_id = ? ORDER BY h.created_at DESC, h.id DESC
  `).all(id);
}

function listAttachments(id) {
  return db.prepare(`
    SELECT id, original_name, stored_name, mime_type, size_bytes, created_at
    FROM ticket_attachments
    WHERE ticket_id = ? ORDER BY created_at ASC, id ASC
  `).all(id);
}

function listActiveStaff() {
  return db.prepare(`
    SELECT id, full_name, role FROM users
    WHERE role IN ('it','admin') AND is_active = 1
    ORDER BY full_name
  `).all();
}

function findForComment(id) {
  return db.prepare(
    'SELECT id, created_by, first_response_at FROM tickets WHERE id = ?'
  ).get(id);
}

function addComment({ ticketId, userId, body, staff, firstResponseExists }) {
  db.prepare(
    'INSERT INTO ticket_comments (ticket_id, user_id, body) VALUES (?, ?, ?)'
  ).run(ticketId, userId, body);

  if (staff && !firstResponseExists) {
    db.prepare(`
      UPDATE tickets
      SET first_response_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(ticketId);
  } else {
    db.prepare(
      'UPDATE tickets SET updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(ticketId);
  }
  addHistory(ticketId, userId, 'comment', 'Додано коментар');
}

function findById(id) {
  return db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
}

function findActiveStaffById(id) {
  return db.prepare(`
    SELECT id FROM users
    WHERE id = ? AND role IN ('it','admin') AND is_active = 1
  `).get(id);
}

function updateTicket({ id, status, assignedTo, setFirstResponse, setWorkStarted, setResolved, setClosed }) {
  return db.prepare(`
    UPDATE tickets SET
      status = ?, assigned_to = ?,
      first_response_at = CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE first_response_at END,
      work_started_at = CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE work_started_at END,
      resolved_at = CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE resolved_at END,
      closed_at = CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE closed_at END,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    status,
    assignedTo,
    Number(setFirstResponse),
    Number(setWorkStarted),
    Number(setResolved),
    Number(setClosed),
    id
  );
}

function acceptTicket(id, userId) {
  return db.prepare(`
    UPDATE tickets SET
      assigned_to = ?,
      status = CASE WHEN status = 'new' THEN 'in_progress' ELSE status END,
      first_response_at = COALESCE(first_response_at, CURRENT_TIMESTAMP),
      work_started_at = COALESCE(work_started_at, CURRENT_TIMESTAMP),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
      AND assigned_to IS NULL
      AND status NOT IN ('done', 'closed')
  `).run(userId, id);
}

function completePasswordReset(id, assignedTo) {
  return db.prepare(`
    UPDATE tickets
    SET status = 'done',
      resolved_at = COALESCE(resolved_at, CURRENT_TIMESTAMP),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
      AND assigned_to = ?
      AND category = 'Відновлення доступу'
      AND status = 'in_progress'
  `).run(id, assignedTo);
}

function runInTransaction(callback) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = callback();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (_) { /* transaction was not started */ }
    throw error;
  }
}

function addHistory(ticketId, userId, eventType, details) {
  return db.prepare(`
    INSERT INTO ticket_history (ticket_id, user_id, event_type, details)
    VALUES (?, ?, ?, ?)
  `).run(ticketId, userId || null, eventType, details);
}

module.exports = {
  listDashboard,
  getDashboardStats,
  listSelectableEquipment,
  createTicket,
  findOpenPasswordResetByUser,
  findDetails,
  listComments,
  listHistory,
  listAttachments,
  listActiveStaff,
  findForComment,
  addComment,
  findById,
  findActiveStaffById,
  updateTicket,
  acceptTicket,
  completePasswordReset,
  runInTransaction,
  addHistory
};
