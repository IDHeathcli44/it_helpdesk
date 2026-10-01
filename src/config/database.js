const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const { migrateUserRoles } = require('./migrations/userRoles');
const {
  resolveDatabaseEnvironment
} = require('./databaseEnvironment');

const databaseConfiguration = resolveDatabaseEnvironment();
const {
  environment: databaseEnvironment,
  dbPath,
  defaultDbPath,
  developmentDbPath
} = databaseConfiguration;
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');

function columnExists(table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((item) => item.name === column);
}

function addColumn(table, definition) {
  const column = definition.trim().split(/\s+/)[0];
  if (!columnExists(table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  }
}

function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      email TEXT UNIQUE,
      department TEXT,
      office TEXT,
      role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','it','admin','accounting','procurement','director')),
      password_hash TEXT NOT NULL,
      must_change_password INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Інше',
      priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('low','normal','high','critical')),
      status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','in_progress','waiting','done','closed')),
      created_by INTEGER,
      assigned_to INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY(assigned_to) REFERENCES users(id) ON DELETE SET NULL
    );
  `);

  addColumn('tickets', 'first_response_at TEXT');
  addColumn('tickets', 'work_started_at TEXT');
  addColumn('tickets', 'resolved_at TEXT');
  addColumn('tickets', 'closed_at TEXT');
  addColumn('tickets', 'equipment_id INTEGER REFERENCES equipment(id) ON DELETE SET NULL');

  addColumn('users', 'nickname TEXT');
  addColumn('users', 'phone TEXT');
  addColumn('users', 'position TEXT');
  addColumn('users', 'updated_at TEXT');

  db.exec(`
    CREATE TABLE IF NOT EXISTS equipment (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_tag TEXT UNIQUE,
      type TEXT NOT NULL CHECK(type IN ('computer','printer','monitor','network','other')),
      name TEXT NOT NULL,
      manufacturer TEXT,
      model TEXT,
      serial_number TEXT,
      ip_address TEXT,
      mac_address TEXT,
      operating_system TEXT,
      cpu TEXT,
      ram_gb INTEGER,
      storage TEXT,
      department TEXT,
      office TEXT,
      assigned_user_id INTEGER,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','repair','reserve','retired')),
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(assigned_user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      link TEXT,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_equipment_type ON equipment(type);
    CREATE INDEX IF NOT EXISTS idx_equipment_status ON equipment(status);
    CREATE INDEX IF NOT EXISTS idx_equipment_assigned_user ON equipment(assigned_user_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS ticket_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL,
      user_id INTEGER,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS ticket_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL,
      user_id INTEGER,
      event_type TEXT NOT NULL,
      details TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS ticket_attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL,
      uploaded_by INTEGER,
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL UNIQUE,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
      FOREIGN KEY(uploaded_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
    CREATE INDEX IF NOT EXISTS idx_tickets_assigned_to ON tickets(assigned_to);
    CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket ON ticket_comments(ticket_id);
    CREATE INDEX IF NOT EXISTS idx_ticket_history_ticket ON ticket_history(ticket_id);
    CREATE INDEX IF NOT EXISTS idx_ticket_attachments_ticket ON ticket_attachments(ticket_id);
  `);

  migrateUserRoles(db, { dbPath, backup: databaseEnvironment !== 'test' });
  seedAccount('admin', 'Адміністратор', 'admin123', 'admin');
  seedAccount('it', 'IT спеціаліст', 'it12345', 'it');
}

function seedAccount(username, fullName, password, role) {
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) return;
  const passwordHash = bcrypt.hashSync(password, 12);
  db.prepare(`
    INSERT INTO users (username, full_name, role, password_hash, must_change_password)
    VALUES (?, ?, ?, ?, 1)
  `).run(username, fullName, role, passwordHash);
}

module.exports = {
  db,
  dbPath,
  defaultDbPath,
  developmentDbPath,
  databaseEnvironment,
  initializeDatabase
};
