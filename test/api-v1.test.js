const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const test = require('node:test');
const { spawn } = require('node:child_process');

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'helpdesk-api-v1-'));
process.env.HELPDESK_ENV = 'test';
process.env.HELPDESK_DB_PATH = path.join(temporaryDirectory, 'api.test.db');
const database = require('../src/config/database');
database.initializeDatabase();
const { db } = database;
require('../src/config/developmentSeed').seedDevelopmentData();
const { app } = require('../src/app');
let server;
let base;
const cookies = {};
const users = Object.fromEntries(db.prepare("SELECT * FROM users WHERE username LIKE 'dev-%'").all()
  .map(user => [user.username, user]));
const userId = users['dev-user1'].id;
const own = db.prepare(`SELECT * FROM tickets WHERE created_by = ?
  AND EXISTS (SELECT 1 FROM ticket_comments WHERE ticket_id = tickets.id) LIMIT 1`).get(userId);
const foreign = db.prepare('SELECT * FROM tickets WHERE created_by = ? LIMIT 1').get(users['dev-user2'].id);
const item = db.prepare('SELECT * FROM equipment LIMIT 1').get();

async function login(username, password) {
  const response = await fetch(`${base}/login`, {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username, password })
  });
  assert.equal(response.status, 302);
  const cookie = response.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie);
  return cookie;
}

async function request(route, role, status = 200, options = {}) {
  const response = await fetch(`${base}/api/v1${route}`, {
    redirect: 'manual', ...options,
    headers: { ...(role ? { cookie: cookies[role] } : {}), ...options.headers }
  });
  assert.equal(response.status, status, `${role || 'anonymous'} ${route}`);
  assert.match(response.headers.get('content-type'), /application\/json/);
  assert.equal(response.headers.get('location'), null);
  const payload = await response.json();
  if (status >= 400) {
    assert.deepEqual(Object.keys(payload), ['error']);
    assert.deepEqual(Object.keys(payload.error).sort(), ['code', 'message']);
  }
  const serialized = JSON.stringify(payload);
  assert.doesNotMatch(serialized, /password_hash|stored_name|session_secret|"stack"|"sql"/i);
  function checkKeys(value) {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      assert.equal(key.includes('_'), false, `database field leaked: ${key}`);
      checkKeys(child);
    }
  }
  checkKeys(payload);
  return payload;
}

test.before(async () => {
  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  for (const [role, username, password] of [
    ['user', 'dev-user1', 'DevUser123!'], ['other', 'dev-user2', 'DevUser123!'],
    ['it', 'dev-it', 'DevIt123!'], ['admin', 'dev-admin', 'DevAdmin123!']
  ]) cookies[role] = await login(username, password);
});

test.after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  db.close();
  // Remove only this process's newly created isolated fixture directory.
  assert.equal(path.dirname(temporaryDirectory), path.resolve(os.tmpdir()));
  assert.ok(path.basename(temporaryDirectory).startsWith('helpdesk-api-v1-'));
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
});

test('every v1 endpoint requires an existing session; health remains public', async () => {
  for (const route of ['/session', '/tickets', `/tickets/${own.id}`, '/equipment',
    `/equipment/${item.id}`, '/notifications', '/users', `/users/${userId}`,
    '/reports/summary', '/does-not-exist']) {
    assert.equal((await request(route, null, 401)).error.code, 'UNAUTHENTICATED');
  }
  assert.equal((await fetch(`${base}/api/health`)).status, 200);
  const session = await request('/session', 'user');
  assert.deepEqual(session.data.user, {
    id: userId, username: 'dev-user1', fullName: users['dev-user1'].full_name,
    role: 'user', mustChangePassword: false
  });
});

test('ticket lists and details enforce ownership and staff access', async () => {
  const list = await request('/tickets', 'user');
  assert.ok(list.data.length);
  assert.ok(list.data.every(ticket => ticket.author.id === userId));
  assert.equal(list.meta.count, list.data.length);
  await request(`/tickets/${own.id}`, 'user');
  await request(`/tickets/${foreign.id}`, 'user', 403);
  for (const role of ['it', 'admin']) {
    const staffList = await request('/tickets', role);
    assert.ok(staffList.data.some(ticket => ticket.id === foreign.id));
    assert.ok(staffList.data.some(ticket => ticket.id === own.id));
    await request(`/tickets/${own.id}`, role);
    await request(`/tickets/${foreign.id}`, role);
  }
  db.prepare(`INSERT INTO ticket_attachments
    (ticket_id, uploaded_by, original_name, stored_name, mime_type, size_bytes)
    VALUES (?, ?, ?, ?, ?, ?)`).run(own.id, userId, 'C:\\private\\image.png', '/private/uploads/secret.png', 'image/png', 123);
  const detail = (await request(`/tickets/${own.id}`, 'user')).data;
  for (const field of ['description', 'category', 'author', 'assignedTo', 'equipment',
    'createdAt', 'firstResponseAt', 'startedAt', 'completedAt', 'closedAt', 'comments', 'history', 'attachments']) {
    assert.ok(Object.hasOwn(detail, field), field);
  }
  assert.ok(detail.comments.length);
  assert.ok(detail.history.length);
  assert.equal(detail.attachments[0].originalName, 'image.png');
  assert.doesNotMatch(JSON.stringify(detail), /private|secret\.png/);
});

test('ticket filters apply before limit and cannot widen user scope', async () => {
  for (const [field, value] of [['status', own.status], ['priority', own.priority], ['search', own.title]]) {
    const result = await request(`/tickets?${new URLSearchParams({ [field]: value })}`, 'user');
    assert.ok(result.data.some(ticket => ticket.id === own.id));
    assert.ok(result.data.every(ticket => ticket.author.id === userId));
    if (field !== 'search') assert.ok(result.data.every(ticket => ticket[field] === value));
  }
  assert.equal((await request('/tickets?search=nonexistent-needle', 'admin')).data.length, 0);
  assert.equal((await request(`/tickets?search=${encodeURIComponent(foreign.title)}`, 'user')).data.length, 0);
  for (const assigned of ['me', 'unassigned', String(users['dev-it'].id)]) {
    const result = await request(`/tickets?assigned=${assigned}`, 'it');
    assert.ok(result.data.every(ticket => assigned === 'unassigned'
      ? ticket.assignedTo === null : ticket.assignedTo?.id === users['dev-it'].id));
  }
  assert.equal((await request('/tickets?search=%27%20OR%201%3D1--', 'user')).data.length, 0);
  const created = db.prepare(`INSERT INTO tickets (title, description, created_by) VALUES (?, '', ?)`);
  for (let i = 0; i < 105; i++) created.run(`Pagination fixture ${i}`, userId);
  assert.equal((await request('/tickets', 'user')).data.length, 100);
  assert.ok((await request(`/tickets?search=${encodeURIComponent(own.title)}`, 'user')).data.some(t => t.id === own.id));
});

test('equipment access, filters, assigned user and linked tickets', async () => {
  await request('/equipment', 'user', 403);
  await request(`/equipment/${item.id}`, 'user', 403);
  for (const role of ['it', 'admin']) {
    assert.ok((await request('/equipment', role)).data.length);
    const detail = (await request(`/equipment/${item.id}`, role)).data;
    assert.ok(Object.hasOwn(detail, 'assignedUser'));
    assert.ok(Array.isArray(detail.tickets));
    for (const [field, value] of [['type', item.type], ['status', item.status], ['search', item.name]]) {
      const filtered = (await request(`/equipment?${new URLSearchParams({ [field]: value })}`, role)).data;
      assert.ok(filtered.some(row => row.id === item.id));
      if (field !== 'search') assert.ok(filtered.every(row => row[field] === value));
    }
  }
});

test('notifications return only current user and never mark read', async () => {
  for (const role of ['user', 'other', 'it', 'admin']) {
    const session = (await request('/session', role)).data.user;
    const before = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 20').all(session.id);
    const feed = await request('/notifications?userId=999', role);
    assert.deepEqual(feed.data.map(n => n.id), before.map(n => n.id));
    assert.equal(feed.meta.unreadCount,
      db.prepare('SELECT count(*) AS total FROM notifications WHERE user_id = ? AND is_read = 0').get(session.id).total);
    assert.deepEqual(db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 20').all(session.id), before);
  }
});

test('users remain admin-only, reports remain staff-only', async () => {
  for (const role of ['user', 'it']) {
    await request('/users', role, 403);
    await request(`/users/${userId}`, role, 403);
  }
  const usersList = await request('/users', 'admin');
  assert.ok(usersList.data.length);
  assert.equal((await request(`/users/${userId}`, 'admin')).data.id, userId);
  assert.doesNotMatch(JSON.stringify(usersList), /mustChangePassword|password/i);
  await request('/reports/summary', 'user', 403);
  for (const role of ['it', 'admin']) {
    const report = (await request('/reports/summary?period=all', role)).data;
    assert.equal(report.period, 'all');
    assert.equal(report.summary.total, db.prepare('SELECT count(*) AS total FROM tickets').get().total);
    assert.ok(Array.isArray(report.byAssignee));
    assert.equal((await request('/reports/summary?period=invalid', role)).data.period, '30');
  }
});

test('JSON errors cover missing resources, IDs, methods, parser and unexpected service failures', async () => {
  assert.deepEqual(await request('/does-not-exist', 'user', 404), {
    error: { code: 'NOT_FOUND', message: 'Endpoint not found' }
  });
  for (const collection of ['tickets', 'equipment', 'users']) {
    await request(`/${collection}/99999999`, 'admin', 404);
    for (const id of ['0', '-1', 'abc', '1.5', '9007199254740992']) await request(`/${collection}/${id}`, 'admin', 400);
  }
  const before = db.prepare('SELECT count(*) AS total FROM tickets').get().total;
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    await request('/tickets', 'admin', 404, { method });
  }
  assert.equal(db.prepare('SELECT count(*) AS total FROM tickets').get().total, before);
  await request('/tickets', 'admin', 400, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{bad'
  });
  await request('/tickets', 'admin', 413, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ a: 'x'.repeat(110000) })
  });
  const service = require('../src/modules/tickets/ticketService');
  const original = service.getList;
  try {
    service.getList = () => { throw new Error('SELECT secret FROM C:/private/database'); };
    assert.deepEqual(await request('/tickets', 'user', 500), {
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
    });
  } finally { service.getList = original; }
});

test('forced password change stays enforced without HTML redirects in v1', async () => {
  db.prepare('UPDATE users SET must_change_password = 1 WHERE id = ?').run(userId);
  const regularCookie = cookies.user;
  try {
    cookies.user = await login('dev-user1', 'DevUser123!');
    assert.equal((await request('/session', 'user')).data.user.mustChangePassword, true);
    assert.equal((await request('/tickets', 'user', 403)).error.code, 'PASSWORD_CHANGE_REQUIRED');
    const web = await fetch(`${base}/`, { redirect: 'manual', headers: { cookie: cookies.user } });
    assert.equal(web.headers.get('location'), '/change-password');
  } finally {
    cookies.user = regularCookie;
    db.prepare('UPDATE users SET must_change_password = 0 WHERE id = ?').run(userId);
  }
});

test('legacy ticket comments, equipment CRUD, admin and notifications remain working', async () => {
  async function web(route, role, status, body) {
    const response = await fetch(`${base}${route}`, {
      redirect: 'manual', method: body ? 'POST' : 'GET',
      headers: { cookie: cookies[role], ...(body ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
      ...(body ? { body: new URLSearchParams(body) } : {})
    });
    assert.equal(response.status, status, route);
    return response;
  }
  for (const route of ['/', `/tickets/${own.id}`, '/tickets/new', '/equipment', '/reports', '/admin/users']) {
    await web(route, 'admin', 200);
  }
  await web(`/tickets/${own.id}/comments`, 'user', 302, { body: 'API regression comment' });
  assert.ok((await request(`/tickets/${own.id}`, 'user')).data.comments.some(c => c.body === 'API regression comment'));
  const created = await web('/equipment', 'it', 302, { name: 'CRUD fixture', type: 'computer', status: 'active' });
  const location = created.headers.get('location');
  assert.match(location, /^\/equipment\/\d+$/);
  await web(location, 'it', 200);
  await web(location, 'it', 302, { name: 'Updated fixture', type: 'printer', status: 'repair' });
  assert.equal((await request(location, 'it')).data.name, 'Updated fixture');
  await web(`${location}/delete`, 'it', 302, {});
  await request(location, 'it', 404);
  await web('/api/notifications/read-all', 'user', 200, {});
  assert.equal((await request('/notifications', 'user')).meta.unreadCount, 0);
});

test('real server initializes Socket.IO with existing session authentication', async () => {
  const portProbe = http.createServer();
  await new Promise(resolve => portProbe.listen(0, '127.0.0.1', resolve));
  const port = portProbe.address().port;
  await new Promise(resolve => portProbe.close(resolve));
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: path.resolve(__dirname, '..'), windowsHide: true,
    env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { output += data; });
  try {
    const deadline = Date.now() + 10000;
    while (!output.includes('Server started:') && Date.now() < deadline && child.exitCode === null) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.match(output, /Server started:/);
    const url = `http://127.0.0.1:${port}`;
    const response = await fetch(`${url}/socket.io/?EIO=4&transport=polling`);
    assert.equal(response.status, 200);
    const handshake = await response.text();
    assert.ok(handshake.startsWith('0'));
    const { sid } = JSON.parse(handshake.slice(1));
    await fetch(`${url}/socket.io/?EIO=4&transport=polling&sid=${sid}`, { method: 'POST', body: '40' });
    const denied = await fetch(`${url}/socket.io/?EIO=4&transport=polling&sid=${sid}`);
    assert.match(await denied.text(), /Unauthorized/);
    const loginResponse = await fetch(`${url}/login`, {
      method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username: 'dev-it', password: 'DevIt123!' })
    });
    const headers = { cookie: loginResponse.headers.get('set-cookie').split(';')[0] };
    const authenticated = await fetch(`${url}/socket.io/?EIO=4&transport=polling`, { headers });
    const sessionId = JSON.parse((await authenticated.text()).slice(1)).sid;
    const transportUrl = `${url}/socket.io/?EIO=4&transport=polling&sid=${sessionId}`;
    await fetch(transportUrl, { method: 'POST', headers, body: '40' });
    assert.match(await (await fetch(transportUrl, { headers })).text(), /^40/);
    await fetch(transportUrl, { method: 'POST', headers, body: '41' });
  } finally {
    if (child.exitCode === null) {
      const exited = new Promise(resolve => child.once('exit', resolve));
      child.kill();
      await exited;
    }
  }
});
