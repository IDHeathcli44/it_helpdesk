const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

test('database bootstrap, Express app load and public health endpoint', async () => {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'it-helpdesk-'));
  const testDatabasePath = path.join(temporaryDirectory, 'helpdesk.test.db');
  let db;
  let server;

  const {
    defaultDbPath,
    developmentDbPath,
    resolveDatabaseEnvironment
  } = require('../src/config/databaseEnvironment');

  assert.equal(
    resolveDatabaseEnvironment({ HELPDESK_ENV: 'development' }).dbPath,
    developmentDbPath
  );
  assert.throws(
    () => resolveDatabaseEnvironment({ HELPDESK_ENV: 'test' }),
    /explicit temporary HELPDESK_DB_PATH/
  );
  assert.throws(
    () => resolveDatabaseEnvironment({
      HELPDESK_ENV: 'development',
      HELPDESK_DB_PATH: defaultDbPath
    }),
    /only use data\/helpdesk-dev.db/
  );
  assert.throws(
    () => resolveDatabaseEnvironment({
      HELPDESK_ENV: 'test',
      HELPDESK_DB_PATH: developmentDbPath
    }),
    /cannot use the default or development database/
  );

  process.env.HELPDESK_ENV = 'test';
  process.env.HELPDESK_DB_PATH = testDatabasePath;

  try {
    const database = require('../src/config/database');
    db = database.db;

    assert.equal(database.databaseEnvironment, 'test');
    assert.equal(database.dbPath, path.resolve(testDatabasePath));
    assert.doesNotThrow(() => database.initializeDatabase());
    assert.doesNotThrow(() => database.initializeDatabase());

    const {
      assertDevelopmentSeedSafe,
      seedDevelopmentData
    } = require('../src/config/developmentSeed');

    assert.throws(
      () => assertDevelopmentSeedSafe({
        environment: 'default',
        targetPath: database.defaultDbPath
      }),
      /development or test mode/
    );
    assert.throws(
      () => assertDevelopmentSeedSafe({
        environment: 'development',
        targetPath: database.defaultDbPath
      }),
      /default\/legacy database/
    );

    const firstSeedSummary = seedDevelopmentData();
    const secondSeedSummary = seedDevelopmentData();

    assert.deepEqual(firstSeedSummary, {
      users: 4,
      tickets: 4,
      comments: 6,
      history: 8,
      notifications: 3,
      equipment: 3
    });
    assert.deepEqual(secondSeedSummary, firstSeedSummary);

    const tableNames = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => row.name);

    for (const expectedTable of [
      'users',
      'tickets',
      'ticket_comments',
      'ticket_history',
      'ticket_attachments',
      'equipment',
      'notifications'
    ]) {
      assert.ok(tableNames.includes(expectedTable), `${expectedTable} was initialized`);
    }

    let application;
    assert.doesNotThrow(() => {
      application = require('../src/app');
    });

    server = http.createServer(application.app);
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });

    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/health`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type')?.includes('application/json'), true);
    assert.equal(payload.status, 'ok');
    assert.equal(payload.service, 'it-helpdesk-backend');
    assert.equal(typeof payload.timestamp, 'string');
    assert.deepEqual(Object.keys(payload).sort(), ['service', 'status', 'timestamp']);
  } finally {
    if (server?.listening) {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }

    if (db?.isOpen) db.close();
    delete process.env.HELPDESK_ENV;
    delete process.env.HELPDESK_DB_PATH;
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test('notification client retains sound, realtime and polling paths', () => {
  const clientSource = fs.readFileSync(
    path.join(__dirname, '../public/js/app.js'),
    'utf8'
  );

  assert.equal(
    clientSource.match(/soundButton\.addEventListener\("click"/g)?.length,
    1
  );
  assert.equal(clientSource.includes('unlockNotificationSound'), false);
  assert.equal(clientSource.includes('socket.on("notification:new"'), true);
  assert.equal(clientSource.includes('loadNotifications(true)'), true);
});
