const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const test = require('node:test');
const { DatabaseSync } = require('node:sqlite');
const XLSX = require('xlsx');
const { migrateUserRoles } = require('../src/config/migrations/userRoles');

test('role migration preserves existing users, links, extra columns, indexes, triggers and IDs', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'helpdesk-role-migration-'));
  const dbPath = path.join(directory, 'legacy.db');
  const db = new DatabaseSync(dbPath);
  try {
    db.exec(`PRAGMA foreign_keys=ON;
      CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL,
        role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','it','admin')), extra TEXT);
      CREATE UNIQUE INDEX users_extra ON users(extra) WHERE extra IS NOT NULL;
      CREATE TABLE refs (id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE);
      CREATE TABLE audit (username TEXT);
      CREATE TRIGGER users_audit AFTER INSERT ON users BEGIN INSERT INTO audit VALUES(NEW.username); END;
      INSERT INTO users VALUES(7, 'keep-user', 'user', 'keep-extra');
      INSERT INTO users VALUES(500, 'deleted', 'it', NULL);
      DELETE FROM users WHERE id=500;
      INSERT INTO refs VALUES(1,7);`);
    const before = db.prepare('SELECT * FROM users').all();
    assert.equal(migrateUserRoles(db, { dbPath }), true);
    assert.deepEqual(db.prepare('SELECT * FROM users').all(), before);
    assert.equal(db.prepare('SELECT user_id FROM refs').get().user_id, 7);
    assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    assert.equal(migrateUserRoles(db, { dbPath }), false);
    for (const role of ['accounting', 'procurement', 'director']) {
      const result = db.prepare('INSERT INTO users(username,role) VALUES(?,?)').run(role, role);
      assert.ok(Number(result.lastInsertRowid) > 500);
    }
    assert.equal(db.prepare('SELECT count(*) AS n FROM audit').get().n, 5);
    assert.throws(() => db.prepare('INSERT INTO users(username,role) VALUES(?,?)').run('bad', 'superuser'), /CHECK/);
    assert.throws(() => db.prepare('INSERT INTO users(username,extra) VALUES(?,?)').run('duplicate', 'keep-extra'), /UNIQUE/);
    const backups = fs.readdirSync(directory).filter(name => name.includes('.before-roles-'));
    assert.equal(backups.length, 1);
    const backup = new DatabaseSync(path.join(directory, backups[0]), { readOnly: true });
    try { assert.deepEqual(backup.prepare('SELECT * FROM users').all(), before); }
    finally { backup.close(); }
  } finally {
    db.close();
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('helpdesk-role-migration-'));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('role migration preserves the ID sequence even when all users were deleted', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY AUTOINCREMENT, role TEXT CHECK(role IN ('user','it','admin')));
      INSERT INTO users(id,role) VALUES(500,'user'); DELETE FROM users;`);
    migrateUserRoles(db, { backup: false });
    assert.equal(Number(db.prepare("INSERT INTO users(role) VALUES('director')").run().lastInsertRowid), 501);
  } finally { db.close(); }
});

test('role migration rolls back a failed rebuild and restores foreign key enforcement', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`PRAGMA foreign_keys=ON;
      CREATE TABLE users(id INTEGER PRIMARY KEY AUTOINCREMENT, role TEXT CHECK(role IN ('user','it','admin')));
      INSERT INTO users(role) VALUES('admin');
      CREATE TABLE users_role_migration(id INTEGER);`);
    assert.throws(() => migrateUserRoles(db, { backup: false }), /already exists/);
    assert.equal(db.prepare('SELECT role FROM users').get().role, 'admin');
    assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
    assert.throws(() => db.prepare('INSERT INTO users(role) VALUES(?)').run('director'), /CHECK/);
  } finally { db.close(); }
});

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'helpdesk-roles-'));
process.env.HELPDESK_ENV = 'test';
process.env.HELPDESK_DB_PATH = path.join(directory, 'roles.test.db');
const database = require('../src/config/database');
database.initializeDatabase();
require('../src/config/developmentSeed').seedDevelopmentData();
const { db } = database;
const { app } = require('../src/app');
let server;
let base;
const cookies = {};
const roleUsers = {};
const ownTickets = {};
const equipmentId = db.prepare('SELECT id FROM equipment LIMIT 1').get().id;
const foreignTicket = db.prepare('SELECT id, title FROM tickets LIMIT 1').get();

async function request(route, role, status, options = {}) {
  const response = await fetch(base + route, { redirect: 'manual', ...options,
    headers: { cookie: `${cookies[role] || ''}; helpdeskLanguage=en`, ...options.headers } });
  assert.equal(response.status, status, `${role} ${options.method || 'GET'} ${route}`);
  return response;
}
function post(body = {}) {
  return { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) };
}

test.before(async () => {
  const hash = db.prepare("SELECT password_hash FROM users WHERE username='dev-admin'").get().password_hash;
  for (const role of ['accounting', 'procurement', 'director']) {
    roleUsers[role] = Number(db.prepare(`INSERT INTO users(username,full_name,role,password_hash)
      VALUES(?,?,?,?)`).run(`test-${role}`, `Test ${role}`, role, hash).lastInsertRowid);
    ownTickets[role] = Number(db.prepare(`INSERT INTO tickets(title,description,created_by,equipment_id)
      VALUES(?,?,?,?)`).run(`${role} own ticket`, 'own content', roleUsers[role], equipmentId).lastInsertRowid);
  }
  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  for (const role of ['accounting', 'procurement', 'director', 'admin', 'user']) {
    const username = role === 'admin' ? 'dev-admin' : role === 'user' ? 'dev-user1' : `test-${role}`;
    const password = role === 'user' ? 'DevUser123!' : 'DevAdmin123!';
    const response = await request('/login', role, 302, post({ username, password }));
    cookies[role] = response.headers.get('set-cookie').split(';')[0];
  }
});
test.after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  db.close();
  assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
  assert.ok(path.basename(directory).startsWith('helpdesk-roles-'));
  fs.rmSync(directory, { recursive: true, force: true });
});

test('accounting and procurement manage equipment but see only own tickets and cannot open ticket reports or users', async () => {
  for (const role of ['accounting', 'procurement']) {
    for (const route of ['/', '/tickets/new', `/tickets/${ownTickets[role]}`, '/equipment', `/equipment/${equipmentId}`, '/equipment/new', `/equipment/${equipmentId}/edit`]) {
      await request(route, role, 200);
    }
    for (const route of ['/reports', '/reports/export.xlsx', '/reports/export.csv', '/admin/users', '/api/v1/reports/summary', '/api/v1/users', `/tickets/${foreignTicket.id}`, `/api/v1/tickets/${foreignTicket.id}`]) {
      await request(route, role, 403);
    }
    const list = await (await request('/api/v1/tickets', role, 200)).json();
    assert.ok(list.data.length > 0);
    assert.ok(list.data.every(ticket => ticket.author.id === roleUsers[role]));
    const details = await (await request(`/api/v1/equipment/${equipmentId}`, role, 200)).json();
    assert.deepEqual(details.data.tickets.map(ticket => ticket.id), [ownTickets[role]]);
    const html = await (await request(`/equipment/${equipmentId}`, role, 200)).text();
    assert.ok(!html.includes(foreignTicket.title));
    const dashboard = await (await request('/', role, 200)).text();
    assert.match(dashboard, /My tickets/);
    assert.doesNotMatch(dashboard, /href="\/reports"|href="\/admin\/users"/);
    await request('/tickets', role, 302, post({ title: `${role} created`, description: 'test', category: 'Інше' }));
    await request(`/tickets/${ownTickets[role]}/comments`, role, 302, post({ body: 'Own comment' }));
    await request(`/tickets/${foreignTicket.id}/comments`, role, 403, post({ body: 'Forbidden comment' }));
    for (const action of ['accept', 'update', 'reset-password']) {
      await request(`/tickets/${ownTickets[role]}/${action}`, role, 403, post({ status: 'done', temporaryPassword: 'Forbidden123!' }));
    }
    const created = await request('/equipment', role, 302, post({ name: `${role} reserve item`, type: 'other', status: 'reserve', assetTag: `${role}-reserve` }));
    const equipmentRoute = created.headers.get('location');
    await request(equipmentRoute, role, 302, post({ name: `${role} updated item`, type: 'other', status: 'reserve', assetTag: `${role}-reserve` }));
    assert.equal(db.prepare('SELECT status FROM equipment WHERE asset_tag=?').get(`${role}-reserve`).status, 'reserve');
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ['Інвентарний номер', 'Тип', 'Назва', 'Статус'], [`${role}-imported`, 'other', `${role} imported`, 'reserve']
    ]), 'Inventory');
    const form = new FormData();
    form.append('inventoryFile', new Blob([XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })]), 'inventory.xlsx');
    await request('/equipment/import', role, 302, { method: 'POST', body: form });
    assert.ok(db.prepare('SELECT id FROM equipment WHERE asset_tag=?').get(`${role}-imported`));
    const exported = await request('/equipment/export.xlsx?status=reserve', role, 200);
    assert.match(exported.headers.get('content-disposition'), /equipment-inventory.xlsx/);
    const parsed = XLSX.read(new Uint8Array(await exported.arrayBuffer()), { type: 'array' });
    const rows = XLSX.utils.sheet_to_json(parsed.Sheets['Інвентаризація'], { header: 1 });
    assert.ok(rows.length > 1);
    assert.ok(rows.slice(1).every(row => row[15] === 'reserve'));
    assert.ok(rows.some(row => row[0] === `${role}-reserve`));
    await request(`${equipmentRoute}/delete`, role, 302, post());
  }
  await request('/equipment/export.xlsx', 'user', 403);
});

test('director reads all sections and exports, with all business writes denied even via direct requests', async () => {
  const target = db.prepare("SELECT id FROM users WHERE username='dev-user1'").get();
  const before = ['users', 'tickets', 'equipment', 'ticket_comments'].map(table => db.prepare(`SELECT * FROM ${table} ORDER BY id`).all());
  for (const route of ['/', `/tickets/${foreignTicket.id}`, '/equipment', `/equipment/${equipmentId}`, '/reports', '/admin/users', `/admin/users/${target.id}`, '/api/v1/users', `/api/v1/users/${target.id}`, '/api/v1/reports/summary']) {
    const response = await request(route, 'director', 200);
    const body = await response.text();
    assert.doesNotMatch(body, /password_hash/);
    if (!route.startsWith('/api')) {
      assert.doesNotMatch(body, /action="\/(?:equipment|tickets|admin)\b[^\"]*"[^>]*method="post"|method="post"[^>]*action="\/(?:equipment|tickets|admin)\b/);
      assert.doesNotMatch(body, /href="\/tickets\/new"|href="\/equipment\/new"|href="\/equipment\/\d+\/edit"/);
    }
  }
  const tickets = await (await request('/api/v1/tickets', 'director', 200)).json();
  assert.equal(tickets.data.length, db.prepare('SELECT COUNT(*) AS n FROM tickets').get().n);
  for (const route of ['/equipment/export.xlsx', '/equipment/import-template.xlsx', '/reports/export.xlsx', '/reports/export.csv']) await request(route, 'director', 200);
  for (const route of ['/tickets/new', '/equipment/new', `/equipment/${equipmentId}/edit`]) await request(route, 'director', 403);
  for (const route of ['/tickets', `/tickets/${ownTickets.director}/comments`, `/tickets/${foreignTicket.id}/update`, `/tickets/${foreignTicket.id}/accept`, `/tickets/${foreignTicket.id}/reset-password`,
    '/equipment', '/equipment/import', `/equipment/${equipmentId}`, `/equipment/${equipmentId}/delete`,
    '/admin/users', `/admin/users/${target.id}`, `/admin/users/${target.id}/toggle`, `/admin/users/${target.id}/delete`]) {
    await request(route, 'director', 403, post({ title: 'blocked', body: 'blocked', name: 'blocked', role: 'admin' }));
  }
  const after = ['users', 'tickets', 'equipment', 'ticket_comments'].map(table => db.prepare(`SELECT * FROM ${table} ORDER BY id`).all());
  assert.deepEqual(after, before);
});

test('admin can assign all three roles and role changes take effect on an existing session', async () => {
  const html = await (await request('/admin/users', 'admin', 200)).text();
  for (const role of ['accounting', 'procurement', 'director']) {
    assert.match(html, new RegExp(`value="${role}"`));
    await request('/admin/users', 'admin', 302, post({ fullName: role, username: `created-${role}`, password: 'Temporary123!', role }));
    const created = db.prepare('SELECT role,must_change_password FROM users WHERE username=?').get(`created-${role}`);
    assert.equal(created.role, role);
    assert.equal(created.must_change_password, 1);
  }
  await request(`/admin/users/${roleUsers.accounting}`, 'admin', 302, post({
    fullName: 'Test accounting', username: 'test-accounting', role: 'director', isActive: '1'
  }));
  await request('/reports', 'accounting', 200);
  await request('/equipment', 'accounting', 403, post({ name: 'must not save' }));
  const session = await (await request('/api/v1/session', 'accounting', 200)).json();
  assert.equal(session.data.user.role, 'director');
});
