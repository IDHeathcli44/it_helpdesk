const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const bcrypt = require('bcryptjs');
const XLSX = require('xlsx');

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

    const baseUrl = `http://127.0.0.1:${address.port}`;
    for (const route of ['/', '/tickets/new', '/equipment', '/reports', '/admin/users', '/api/notifications']) {
      const protectedResponse = await fetch(`${baseUrl}${route}`, { redirect: 'manual' });
      assert.equal(protectedResponse.status, 302, `${route} remains protected`);
      assert.equal(protectedResponse.headers.get('location'), '/login');
    }

    for (const route of ['/login', '/register', '/forgot-password']) {
      const publicResponse = await fetch(`${baseUrl}${route}`, { redirect: 'manual' });
      assert.equal(publicResponse.status, 200, `${route} remains public`);
    }

    const failedLoginResponse = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username: 'dev-user1', password: 'WrongPassword!' })
    });
    const failedLoginCookie = failedLoginResponse.headers.get('set-cookie')?.split(';', 1)[0];
    const retriedLoginPage = await fetch(`${baseUrl}/login`, {
      headers: { cookie: failedLoginCookie }
    });
    const retriedLoginHtml = await retriedLoginPage.text();
    assert.equal(retriedLoginHtml.includes('value="dev-user1"'), true);
    assert.equal(retriedLoginHtml.includes('value="WrongPassword!"'), false);
    const refreshedLoginPage = await fetch(`${baseUrl}/login`, {
      headers: { cookie: failedLoginCookie }
    });
    assert.equal((await refreshedLoginPage.text()).includes('value="dev-user1"'), true);

    const wrongCaseLoginResponse = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username: 'DEV-IT', password: 'DevIt123!' })
    });
    assert.equal(wrongCaseLoginResponse.status, 302);
    assert.equal(wrongCaseLoginResponse.headers.get('location'), '/login');

    const wrongCasePasswordResponse = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username: 'dev-it', password: 'devit123!' })
    });
    assert.equal(wrongCasePasswordResponse.status, 302);
    assert.equal(wrongCasePasswordResponse.headers.get('location'), '/login');

    const forgotPasswordResponse = await fetch(`${baseUrl}/forgot-password`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username: 'dev-user1' })
    });
    assert.equal(forgotPasswordResponse.status, 302);
    assert.equal(forgotPasswordResponse.headers.get('location'), '/login');
    const passwordResetTicket = db.prepare(`
      SELECT id, created_by, assigned_to, status
      FROM tickets
      WHERE category = 'Відновлення доступу'
      ORDER BY id DESC LIMIT 1
    `).get();
    assert.ok(passwordResetTicket);
    assert.equal(passwordResetTicket.assigned_to, null);
    assert.equal(passwordResetTicket.status, 'new');
    assert.equal(
      db.prepare(`
        SELECT COUNT(*) AS total FROM notifications
        WHERE type = 'password_reset_requested' AND link = ?
      `).get(`/tickets/${passwordResetTicket.id}`).total,
      db.prepare(`
        SELECT COUNT(*) AS total FROM users
        WHERE role IN ('it', 'admin') AND is_active = 1
      `).get().total,
      'every active IT and admin account is notified'
    );

    await fetch(`${baseUrl}/forgot-password`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username: 'dev-user1' })
    });
    assert.equal(
      db.prepare(`
        SELECT COUNT(*) AS total FROM tickets
        WHERE category = 'Відновлення доступу' AND created_by = ?
          AND status NOT IN ('done', 'closed')
      `).get(passwordResetTicket.created_by).total,
      1,
      'repeated forgot-password requests reuse the open ticket'
    );

    const loginResponse = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username: 'dev-it', password: 'DevIt123!' })
    });
    assert.equal(loginResponse.status, 302);
    assert.equal(loginResponse.headers.get('location'), '/');
    const sessionCookie = loginResponse.headers.get('set-cookie')?.split(';', 1)[0];
    assert.ok(sessionCookie, 'login returns the existing session cookie');

    const voluntaryPasswordPage = await fetch(`${baseUrl}/change-password`, {
      headers: { cookie: sessionCookie }
    });
    assert.equal((await voluntaryPasswordPage.text()).includes('name="currentPassword"'), true);

    const acceptResponse = await fetch(
      `${baseUrl}/tickets/${passwordResetTicket.id}/accept`,
      {
        method: 'POST',
        redirect: 'manual',
        headers: { cookie: sessionCookie }
      }
    );
    assert.equal(acceptResponse.status, 302);
    const itUserId = db.prepare("SELECT id FROM users WHERE username = 'dev-it'").get().id;
    const acceptedTicket = db.prepare(
      'SELECT assigned_to, status FROM tickets WHERE id = ?'
    ).get(passwordResetTicket.id);
    assert.equal(acceptedTicket.assigned_to, itUserId);
    assert.equal(acceptedTicket.status, 'in_progress');

    const temporaryPasswordResponse = await fetch(
      `${baseUrl}/tickets/${passwordResetTicket.id}/reset-password`,
      {
        method: 'POST',
        redirect: 'manual',
        headers: {
          cookie: sessionCookie,
          'content-type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({ temporaryPassword: 'SupportTemporary123!' })
      }
    );
    assert.equal(temporaryPasswordResponse.status, 302);
    const resetUser = db.prepare(
      "SELECT id, password_hash, must_change_password FROM users WHERE username = 'dev-user1'"
    ).get();
    assert.equal(resetUser.must_change_password, 1);
    assert.equal(bcrypt.compareSync('SupportTemporary123!', resetUser.password_hash), true);
    assert.equal(
      db.prepare('SELECT status FROM tickets WHERE id = ?')
        .get(passwordResetTicket.id).status,
      'waiting'
    );
    assert.equal(
      db.prepare(`
        SELECT details FROM ticket_history
        WHERE ticket_id = ? AND event_type = 'password_reset_ready'
      `).get(passwordResetTicket.id).details.includes('SupportTemporary123!'),
      false,
      'temporary password is not written to ticket history'
    );

    for (const route of ['/', '/tickets/new', '/equipment', '/reports']) {
      const authenticatedResponse = await fetch(`${baseUrl}${route}`, {
        headers: { cookie: sessionCookie },
        redirect: 'manual'
      });
      assert.equal(authenticatedResponse.status, 200, `${route} keeps its authenticated URL`);
    }

    const notificationResponse = await fetch(`${baseUrl}/api/notifications`, {
      headers: { cookie: sessionCookie }
    });
    assert.equal(notificationResponse.status, 200);
    const notificationPayload = await notificationResponse.json();
    assert.deepEqual(
      Object.keys(notificationPayload).sort(),
      ['notifications', 'unread']
    );
    const unreadNotification = notificationPayload.notifications.find((item) => !item.is_read);
    assert.ok(unreadNotification, 'development feed contains an unread notification');

    const readResponse = await fetch(
      `${baseUrl}/api/notifications/${unreadNotification.id}/read`,
      {
        method: 'POST',
        headers: { cookie: sessionCookie, accept: 'application/json' }
      }
    );
    assert.equal(readResponse.status, 200);
    assert.deepEqual(await readResponse.json(), {
      ok: true,
      unread: notificationPayload.unread - 1
    });

    const updatedFeedResponse = await fetch(`${baseUrl}/api/notifications`, {
      headers: { cookie: sessionCookie }
    });
    const updatedFeed = await updatedFeedResponse.json();
    assert.equal(updatedFeed.unread, notificationPayload.unread - 1);
    assert.equal(
      updatedFeed.notifications.find((item) => item.id === unreadNotification.id).is_read,
      1
    );

    const otherUsersNotification = db.prepare(`
      SELECT n.id, n.is_read
      FROM notifications n
      JOIN users u ON u.id = n.user_id
      WHERE u.username = 'dev-user2'
      LIMIT 1
    `).get();
    const foreignReadResponse = await fetch(
      `${baseUrl}/api/notifications/${otherUsersNotification.id}/read`,
      {
        method: 'POST',
        headers: { cookie: sessionCookie, accept: 'application/json' }
      }
    );
    assert.equal(foreignReadResponse.status, 404);
    const foreignReadPayload = await foreignReadResponse.json();
    assert.equal(foreignReadPayload.ok, false);
    assert.equal(typeof foreignReadPayload.unread, 'number');
    assert.equal(
      db.prepare('SELECT is_read FROM notifications WHERE id = ?')
        .get(otherUsersNotification.id).is_read,
      otherUsersNotification.is_read,
      'a user cannot mark another user notification as read'
    );

    const reportResponse = await fetch(`${baseUrl}/reports/export.csv?period=30`, {
      headers: { cookie: sessionCookie }
    });
    assert.equal(reportResponse.status, 200);
    assert.equal(reportResponse.headers.get('content-type')?.includes('text/csv'), true);

    const excelResponse = await fetch(`${baseUrl}/reports/export.xlsx?period=30`, {
      headers: { cookie: sessionCookie }
    });
    assert.equal(excelResponse.status, 200);
    assert.equal(
      excelResponse.headers.get('content-type'),
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    const excelBytes = new Uint8Array(await excelResponse.arrayBuffer());
    assert.equal(excelBytes[0], 0x50);
    assert.equal(excelBytes[1], 0x4b);
    const workbook = XLSX.read(excelBytes, { type: 'array' });
    assert.deepEqual(workbook.SheetNames, ['Заявки']);
    const excelRows = XLSX.utils.sheet_to_json(workbook.Sheets['Заявки'], {
      header: 1
    });
    assert.deepEqual(excelRows[0], [
      'ID', 'Тема', 'Категорія', 'Пріоритет', 'Статус', 'Автор',
      'Виконавець', 'Обладнання', 'Створено', 'Перша реакція', 'Виконано', 'Закрито'
    ]);

    const templateResponse = await fetch(`${baseUrl}/equipment/import-template.xlsx`, {
      headers: { cookie: sessionCookie }
    });
    assert.equal(templateResponse.status, 200);
    const templateWorkbook = XLSX.read(
      new Uint8Array(await templateResponse.arrayBuffer()),
      { type: 'array' }
    );
    assert.deepEqual(templateWorkbook.SheetNames, ['Інвентаризація', 'Довідник']);

    const importWorkbook = XLSX.utils.book_new();
    const importSheet = XLSX.utils.aoa_to_sheet([
      [
        'Інвентарний номер', 'Тип', 'Назва', 'Виробник', 'Модель',
        'Серійний номер', 'IP', 'MAC', 'Операційна система', 'CPU',
        'RAM (ГБ)', 'Накопичувач', 'Відділ', 'Кабінет', 'Користувач',
        'Статус', 'Примітки'
      ],
      [
        'TEST-IMPORT-001', 'Комп’ютер', 'Імпортований ПК', 'Dell', 'OptiPlex',
        'SER-IMPORT-001', '10.0.0.50', '00:11:22:33:44:55', 'Windows 11',
        'Intel Core i5', 16, '512 GB SSD', 'IT', '101', 'dev-user1',
        'В експлуатації', 'Imported by smoke test'
      ]
    ]);
    XLSX.utils.book_append_sheet(importWorkbook, importSheet, 'Інвентаризація');
    const importBuffer = XLSX.write(importWorkbook, { type: 'buffer', bookType: 'xlsx' });
    const importForm = new FormData();
    importForm.append(
      'inventoryFile',
      new Blob([importBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      }),
      'inventory.xlsx'
    );
    const importResponse = await fetch(`${baseUrl}/equipment/import`, {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie: sessionCookie },
      body: importForm
    });
    assert.equal(importResponse.status, 302);
    const importedEquipment = db.prepare(
      'SELECT name, type, status, assigned_user_id FROM equipment WHERE asset_tag = ?'
    ).get('TEST-IMPORT-001');
    assert.equal(importedEquipment.name, 'Імпортований ПК');
    assert.equal(importedEquipment.type, 'computer');
    assert.equal(importedEquipment.status, 'active');
    assert.equal(
      importedEquipment.assigned_user_id,
      db.prepare("SELECT id FROM users WHERE username = 'dev-user1'").get().id
    );

    const adminResponse = await fetch(`${baseUrl}/admin/users`, {
      headers: { cookie: sessionCookie },
      redirect: 'manual'
    });
    assert.equal(adminResponse.status, 403, 'IT role still cannot open admin user management');

    const adminLoginResponse = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username: 'dev-admin', password: 'DevAdmin123!' })
    });
    const adminCookie = adminLoginResponse.headers.get('set-cookie')?.split(';', 1)[0];
    await fetch(`${baseUrl}/tickets/${passwordResetTicket.id}/accept`, {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie: adminCookie }
    });
    assert.equal(
      db.prepare('SELECT assigned_to FROM tickets WHERE id = ?')
        .get(passwordResetTicket.id).assigned_to,
      itUserId,
      'the second staff member cannot take over an already accepted ticket'
    );

    const forcedLoginResponse = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username: 'dev-user1', password: 'SupportTemporary123!' })
    });
    assert.equal(forcedLoginResponse.headers.get('location'), '/change-password');
    const forcedCookie = forcedLoginResponse.headers.get('set-cookie')?.split(';', 1)[0];
    const forcedPasswordPage = await fetch(`${baseUrl}/change-password`, {
      headers: { cookie: forcedCookie }
    });
    assert.equal((await forcedPasswordPage.text()).includes('name="currentPassword"'), false);
    const forcedChangeResponse = await fetch(`${baseUrl}/change-password`, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        cookie: forcedCookie,
        'content-type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        newPassword: 'NewUserPassword123!',
        confirmPassword: 'NewUserPassword123!'
      })
    });
    assert.equal(forcedChangeResponse.headers.get('location'), '/');
    const changedUser = db.prepare(
      'SELECT password_hash, must_change_password FROM users WHERE id = ?'
    ).get(resetUser.id);
    assert.equal(changedUser.must_change_password, 0);
    assert.equal(bcrypt.compareSync('NewUserPassword123!', changedUser.password_hash), true);
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
  assert.equal(clientSource.includes('/api/notifications/${notificationId}/read'), true);
  assert.equal(clientSource.includes('notificationLink.classList.remove("unread")'), true);
  assert.equal(clientSource.includes('updateUnreadCount(result.unread)'), true);
  assert.equal(clientSource.includes('pointsToCurrentTicket(notification.link)'), true);
  assert.equal(clientSource.includes('window.location.reload()'), true);
  assert.equal(clientSource.includes('document.addEventListener("paste", handleDescriptionPaste, true)'), true);
  assert.equal(clientSource.includes('clipboardData.files || []'), true);
  assert.equal(clientSource.includes('clipboardData.items || []'), true);
  assert.equal(clientSource.includes('const transfer = new DataTransfer()'), true);
});

test('equipment view tolerates an older controller without importErrors', () => {
  const equipmentView = fs.readFileSync(
    path.join(__dirname, '../views/equipment/index.ejs'),
    'utf8'
  );
  assert.equal(
    equipmentView.includes("typeof importErrors === 'undefined' ? [] : importErrors"),
    true
  );
  assert.equal(equipmentView.includes('if (importErrors.length)'), false);
  assert.equal(
    equipmentView.includes('secondary-button equipment-action-button template-download-button'),
    true
  );
  assert.equal(equipmentView.includes('id="inventoryFileName"'), true);
  assert.equal(equipmentView.includes('Імпортувати обладнання'), true);
});

test('legacy backend imports remain compatibility facades over modules', () => {
  const facadePairs = [
    ['../src/controllers/authController', '../src/modules/auth/authController'],
    ['../src/controllers/adminController', '../src/modules/users/userController'],
    ['../src/controllers/ticketController', '../src/modules/tickets/ticketController'],
    ['../src/controllers/equipmentController', '../src/modules/equipment/equipmentController'],
    ['../src/controllers/notificationController', '../src/modules/notifications/notificationController'],
    ['../src/controllers/reportController', '../src/modules/reports/reportController'],
    ['../src/services/ticketService', '../src/modules/tickets/ticketService'],
    ['../src/services/notificationService', '../src/modules/notifications/notificationService']
  ];

  for (const [legacyPath, modulePath] of facadePairs) {
    assert.strictEqual(require(legacyPath), require(modulePath), `${legacyPath} remains compatible`);
  }

  for (const moduleName of ['auth', 'users', 'tickets', 'equipment', 'notifications', 'reports']) {
    const moduleDirectory = path.join(__dirname, '../src/modules', moduleName);
    const controller = fs.readFileSync(
      path.join(moduleDirectory, `${moduleName === 'users' ? 'user' : moduleName.replace(/s$/, '')}Controller.js`),
      'utf8'
    );
    assert.equal(controller.includes('config/database'), false, `${moduleName} controller has no SQLite dependency`);
  }
});
