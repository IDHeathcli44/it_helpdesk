const bcrypt = require('bcryptjs');
const {
  db,
  dbPath,
  defaultDbPath,
  developmentDbPath,
  databaseEnvironment
} = require('./database');
const { pathsEqual } = require('./databaseEnvironment');

const DEVELOPMENT_CREDENTIALS = Object.freeze([
  { username: 'dev-admin', password: 'DevAdmin123!', role: 'admin' },
  { username: 'dev-it', password: 'DevIt123!', role: 'it' },
  { username: 'dev-user1', password: 'DevUser123!', role: 'user' },
  { username: 'dev-user2', password: 'DevUser123!', role: 'user' }
]);

function assertDevelopmentSeedSafe({
  environment = databaseEnvironment,
  targetPath = dbPath
} = {}) {
  if (!['development', 'test'].includes(environment)) {
    throw new Error(
      'Development seed is allowed only in development or test mode.'
    );
  }

  if (pathsEqual(targetPath, defaultDbPath)) {
    throw new Error('Refusing to seed the default/legacy database.');
  }

  if (
    environment === 'development' &&
    !pathsEqual(targetPath, developmentDbPath)
  ) {
    throw new Error('Development seed target is not helpdesk-dev.db.');
  }

  if (environment === 'test' && pathsEqual(targetPath, developmentDbPath)) {
    throw new Error('Test seed cannot target the development database.');
  }
}

function ensureUser(user) {
  const existing = db
    .prepare('SELECT id FROM users WHERE username = ?')
    .get(user.username);

  if (existing) return Number(existing.id);

  const result = db.prepare(`
    INSERT INTO users (
      username, full_name, email, department, office, position,
      role, password_hash, must_change_password, is_active
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1)
  `).run(
    user.username,
    user.fullName,
    user.email,
    user.department,
    user.office,
    user.position,
    user.role,
    bcrypt.hashSync(user.password, 12)
  );

  return Number(result.lastInsertRowid);
}

function ensureEquipment(item) {
  const existing = db
    .prepare('SELECT id FROM equipment WHERE asset_tag = ?')
    .get(item.assetTag);

  if (existing) return Number(existing.id);

  const result = db.prepare(`
    INSERT INTO equipment (
      asset_tag, type, name, manufacturer, model, serial_number,
      ip_address, mac_address, operating_system, cpu, ram_gb,
      storage, department, office, assigned_user_id, status, notes
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
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
  );

  return Number(result.lastInsertRowid);
}

function ensureTicket(ticket) {
  const existing = db.prepare(`
    SELECT id FROM tickets
    WHERE title = ? AND created_by = ?
  `).get(ticket.title, ticket.createdBy);

  if (existing) return Number(existing.id);

  const result = db.prepare(`
    INSERT INTO tickets (
      title, description, category, priority, status, created_by,
      assigned_to, equipment_id, first_response_at, work_started_at,
      resolved_at, closed_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    ticket.title,
    ticket.description,
    ticket.category,
    ticket.priority,
    ticket.status,
    ticket.createdBy,
    ticket.assignedTo,
    ticket.equipmentId,
    ticket.firstResponseAt,
    ticket.workStartedAt,
    ticket.resolvedAt,
    ticket.closedAt
  );

  return Number(result.lastInsertRowid);
}

function ensureComment(ticketId, userId, body) {
  const existing = db.prepare(`
    SELECT id FROM ticket_comments
    WHERE ticket_id = ? AND user_id = ? AND body = ?
  `).get(ticketId, userId, body);

  if (!existing) {
    db.prepare(`
      INSERT INTO ticket_comments (ticket_id, user_id, body)
      VALUES (?, ?, ?)
    `).run(ticketId, userId, body);
  }
}

function ensureHistory(ticketId, userId, eventType, details) {
  const existing = db.prepare(`
    SELECT id FROM ticket_history
    WHERE ticket_id = ? AND user_id = ? AND event_type = ? AND details = ?
  `).get(ticketId, userId, eventType, details);

  if (!existing) {
    db.prepare(`
      INSERT INTO ticket_history (ticket_id, user_id, event_type, details)
      VALUES (?, ?, ?, ?)
    `).run(ticketId, userId, eventType, details);
  }
}

function ensureNotification(notification) {
  const existing = db.prepare(`
    SELECT id FROM notifications
    WHERE user_id = ? AND type = ? AND title = ? AND message = ?
      AND COALESCE(link, '') = COALESCE(?, '')
  `).get(
    notification.userId,
    notification.type,
    notification.title,
    notification.message,
    notification.link
  );

  if (!existing) {
    db.prepare(`
      INSERT INTO notifications (user_id, type, title, message, link)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      notification.userId,
      notification.type,
      notification.title,
      notification.message,
      notification.link
    );
  }
}

function getSeedSummary() {
  return {
    users: Number(db.prepare(
      "SELECT COUNT(*) AS total FROM users WHERE username LIKE 'dev-%'"
    ).get().total),
    tickets: Number(db.prepare(
      "SELECT COUNT(*) AS total FROM tickets WHERE title LIKE '[DEV]%'"
    ).get().total),
    comments: Number(db.prepare(`
      SELECT COUNT(*) AS total
      FROM ticket_comments c
      JOIN tickets t ON t.id = c.ticket_id
      WHERE t.title LIKE '[DEV]%'
    `).get().total),
    history: Number(db.prepare(`
      SELECT COUNT(*) AS total
      FROM ticket_history h
      JOIN tickets t ON t.id = h.ticket_id
      WHERE t.title LIKE '[DEV]%'
    `).get().total),
    notifications: Number(db.prepare(
      "SELECT COUNT(*) AS total FROM notifications WHERE title LIKE '[DEV]%'"
    ).get().total),
    equipment: Number(db.prepare(
      "SELECT COUNT(*) AS total FROM equipment WHERE asset_tag LIKE 'DEV-%'"
    ).get().total)
  };
}

function seedDevelopmentData() {
  assertDevelopmentSeedSafe();

  try {
    db.exec('BEGIN IMMEDIATE');

    const adminId = ensureUser({
      username: 'dev-admin',
      password: 'DevAdmin123!',
      fullName: 'Development Administrator',
      email: 'dev-admin@example.test',
      department: 'IT',
      office: 'DEV-101',
      position: 'Administrator',
      role: 'admin'
    });
    const itId = ensureUser({
      username: 'dev-it',
      password: 'DevIt123!',
      fullName: 'Development IT Specialist',
      email: 'dev-it@example.test',
      department: 'IT',
      office: 'DEV-102',
      position: 'IT Specialist',
      role: 'it'
    });
    const userOneId = ensureUser({
      username: 'dev-user1',
      password: 'DevUser123!',
      fullName: 'Development User One',
      email: 'dev-user1@example.test',
      department: 'Finance',
      office: 'DEV-201',
      position: 'Accountant',
      role: 'user'
    });
    const userTwoId = ensureUser({
      username: 'dev-user2',
      password: 'DevUser123!',
      fullName: 'Development User Two',
      email: 'dev-user2@example.test',
      department: 'Operations',
      office: 'DEV-301',
      position: 'Coordinator',
      role: 'user'
    });

    const computerId = ensureEquipment({
      assetTag: 'DEV-PC-001',
      type: 'computer',
      name: 'Development workstation',
      manufacturer: 'Dell',
      model: 'OptiPlex Test',
      serialNumber: 'DEV-SN-PC-001',
      ipAddress: '192.0.2.11',
      macAddress: '02:00:00:00:00:11',
      operatingSystem: 'Windows 11 Test',
      cpu: 'Intel Core i5',
      ramGb: 16,
      storage: 'SSD 512 GB',
      department: 'Finance',
      office: 'DEV-201',
      assignedUserId: userOneId,
      status: 'active',
      notes: 'Development-only equipment record.'
    });
    const printerId = ensureEquipment({
      assetTag: 'DEV-PRN-001',
      type: 'printer',
      name: 'Development office printer',
      manufacturer: 'HP',
      model: 'LaserJet Test',
      serialNumber: 'DEV-SN-PRN-001',
      ipAddress: '192.0.2.21',
      macAddress: '02:00:00:00:00:21',
      operatingSystem: null,
      cpu: null,
      ramGb: null,
      storage: null,
      department: 'Operations',
      office: 'DEV-301',
      assignedUserId: userTwoId,
      status: 'repair',
      notes: 'Development-only repair example.'
    });
    const networkId = ensureEquipment({
      assetTag: 'DEV-NET-001',
      type: 'network',
      name: 'Development access switch',
      manufacturer: 'Cisco',
      model: 'Catalyst Test',
      serialNumber: 'DEV-SN-NET-001',
      ipAddress: '192.0.2.31',
      macAddress: '02:00:00:00:00:31',
      operatingSystem: null,
      cpu: null,
      ramGb: null,
      storage: null,
      department: 'IT',
      office: 'DEV-102',
      assignedUserId: null,
      status: 'reserve',
      notes: 'Development-only reserve equipment.'
    });

    const ticketIds = [
      ensureTicket({
        title: '[DEV] VPN connection is unavailable',
        description: 'Development example of a new high-priority request.',
        category: 'Network',
        priority: 'high',
        status: 'new',
        createdBy: userOneId,
        assignedTo: null,
        equipmentId: computerId,
        firstResponseAt: null,
        workStartedAt: null,
        resolvedAt: null,
        closedAt: null
      }),
      ensureTicket({
        title: '[DEV] Office printer does not print',
        description: 'Development example of an active support request.',
        category: 'Printer',
        priority: 'critical',
        status: 'in_progress',
        createdBy: userTwoId,
        assignedTo: itId,
        equipmentId: printerId,
        firstResponseAt: '2026-01-15 09:15:00',
        workStartedAt: '2026-01-15 09:20:00',
        resolvedAt: null,
        closedAt: null
      }),
      ensureTicket({
        title: '[DEV] Accounting software update',
        description: 'Development example waiting for requester confirmation.',
        category: 'Software',
        priority: 'normal',
        status: 'waiting',
        createdBy: userOneId,
        assignedTo: itId,
        equipmentId: computerId,
        firstResponseAt: '2026-01-16 10:10:00',
        workStartedAt: '2026-01-16 10:20:00',
        resolvedAt: null,
        closedAt: null
      }),
      ensureTicket({
        title: '[DEV] Network access restored',
        description: 'Development example of a completed request.',
        category: 'Network',
        priority: 'low',
        status: 'done',
        createdBy: userTwoId,
        assignedTo: itId,
        equipmentId: networkId,
        firstResponseAt: '2026-01-17 11:05:00',
        workStartedAt: '2026-01-17 11:10:00',
        resolvedAt: '2026-01-17 11:45:00',
        closedAt: null
      })
    ];

    ensureComment(ticketIds[1], userTwoId, '[DEV] The printer queue is blocked.');
    ensureComment(ticketIds[1], itId, '[DEV] I am checking the print server.');
    ensureComment(ticketIds[2], userOneId, '[DEV] The update can be installed after 17:00.');
    ensureComment(ticketIds[2], itId, '[DEV] Please confirm when the workstation is available.');
    ensureComment(ticketIds[3], userTwoId, '[DEV] Network access is working again.');
    ensureComment(ticketIds[3], itId, '[DEV] The switch port configuration was corrected.');

    ensureHistory(ticketIds[0], userOneId, 'created', '[DEV] Ticket created');
    ensureHistory(ticketIds[1], userTwoId, 'created', '[DEV] Ticket created');
    ensureHistory(ticketIds[1], itId, 'updated', '[DEV] Status changed to In progress');
    ensureHistory(ticketIds[2], userOneId, 'created', '[DEV] Ticket created');
    ensureHistory(ticketIds[2], itId, 'updated', '[DEV] Status changed to Waiting');
    ensureHistory(ticketIds[3], userTwoId, 'created', '[DEV] Ticket created');
    ensureHistory(ticketIds[3], itId, 'updated', '[DEV] Status changed to Done');
    ensureHistory(ticketIds[3], itId, 'comment', '[DEV] Resolution comment added');

    ensureNotification({
      userId: itId,
      type: 'new_ticket',
      title: '[DEV] New ticket requires review',
      message: 'VPN connection is unavailable.',
      link: `/tickets/${ticketIds[0]}`
    });
    ensureNotification({
      userId: userTwoId,
      type: 'ticket_status_changed',
      title: '[DEV] Ticket status changed',
      message: 'Network access request was completed.',
      link: `/tickets/${ticketIds[3]}`
    });
    ensureNotification({
      userId: adminId,
      type: 'equipment_review',
      title: '[DEV] Equipment review',
      message: 'A development printer is marked as under repair.',
      link: `/equipment/${printerId}`
    });

    db.exec('COMMIT');
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch (_) {
      // The transaction may not have started.
    }
    throw error;
  }

  return getSeedSummary();
}

module.exports = {
  DEVELOPMENT_CREDENTIALS,
  assertDevelopmentSeedSafe,
  getSeedSummary,
  seedDevelopmentData
};
