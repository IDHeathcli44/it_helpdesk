const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { ROLES } = require('../constants');

// Rebuild the constrained table in one transaction. Keep every existing column,
// index, trigger and ID; disable FK actions only for the duration of this rebuild.
// Procedure: https://www.sqlite.org/lang_altertable.html#otheralter
function migrateUserRoles(db, { dbPath, backup = true } = {}) {
  const original = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'").get()?.sql;
  if (!original) return false;
  const constraint = /CHECK\s*\(\s*role\s+IN\s*\([^)]*\)\s*\)/i;
  const existing = original.match(constraint)?.[0];
  if (!existing) throw new Error('Cannot migrate users: expected role constraint was not found.');
  if (Object.values(ROLES).every(role => existing.includes(`'${role}'`))) return false;
  const replacement = `CHECK(role IN (${Object.values(ROLES).map(role => `'${role}'`).join(',')}))`;
  const schema = original.replace(constraint, replacement)
    .replace(/^CREATE TABLE\s+(?:IF NOT EXISTS\s+)?["`\[]?users["`\]]?/i, 'CREATE TABLE users_role_migration');
  if (schema === original || !schema.startsWith('CREATE TABLE users_role_migration')) {
    throw new Error('Cannot migrate unexpected users table definition.');
  }
  if (db.prepare('PRAGMA foreign_key_check').all().length) {
    throw new Error('Cannot migrate roles: existing foreign key violations need repair.');
  }
  if (backup) {
    if (!dbPath || dbPath === ':memory:') throw new Error('A database path is required for a role-migration backup.');
    const backupPath = path.join(path.dirname(dbPath), `${path.basename(dbPath, '.db')}.before-roles-${randomUUID()}.db`);
    db.prepare('VACUUM INTO ?').run(backupPath);
    console.log(`Role migration backup: ${backupPath}`);
  }
  const foreignKeys = db.prepare('PRAGMA foreign_keys').get().foreign_keys;
  const objects = db.prepare("SELECT sql FROM sqlite_master WHERE tbl_name = 'users' AND type IN ('index','trigger') AND sql IS NOT NULL").all();
  const columns = db.prepare('PRAGMA table_info(users)').all().map(row => `"${row.name.replaceAll('"', '""')}"`).join(', ');
  const sequence = db.prepare("SELECT seq FROM sqlite_sequence WHERE name = 'users'").get()?.seq;
  db.exec('PRAGMA foreign_keys = OFF');
  try {
    db.exec('BEGIN IMMEDIATE');
    db.exec(schema);
    db.exec(`INSERT INTO users_role_migration (${columns}) SELECT ${columns} FROM users`);
    db.exec('DROP TABLE users');
    db.exec('ALTER TABLE users_role_migration RENAME TO users');
    for (const object of objects) db.exec(object.sql);
    if (sequence !== undefined) {
      const updated = db.prepare("UPDATE sqlite_sequence SET seq = MAX(seq, ?) WHERE name = 'users'").run(sequence);
      if (!updated.changes) db.prepare("INSERT INTO sqlite_sequence(name, seq) VALUES('users', ?)").run(sequence);
    }
    if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Role migration failed foreign key validation.');
    db.exec('COMMIT');
    return true;
  } catch (error) {
    if (db.isTransaction) db.exec('ROLLBACK');
    else { try { db.exec('ROLLBACK'); } catch { /* BEGIN may have failed. */ } }
    throw error;
  } finally {
    db.exec(`PRAGMA foreign_keys = ${foreignKeys ? 'ON' : 'OFF'}`);
  }
}
module.exports = { migrateUserRoles };
