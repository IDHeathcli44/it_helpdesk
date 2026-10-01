const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const { createTranslator } = require('../public/js/translation');

test('translation preserves interpolation values and unknown user text', () => {
  const t = createTranslator('en', {
    'Обладнання': 'Equipment',
    'Заявка #{id}: {title}': 'Ticket #{id}: {title}'
  });
  assert.equal(t('Обладнання'), 'Equipment');
  assert.equal(t('Заявка #{id}: {title}', { id: 42, title: 'Обладнання <script>' }), 'Ticket #42: Обладнання <script>');
  assert.equal(t('Заявка #42: Обладнання'), 'Ticket #42: Обладнання');
  assert.equal(t('Мій власний текст'), 'Мій власний текст');
  assert.equal(t('toString'), 'toString');
  assert.equal(createTranslator('uk')('Заявка #{id}', { id: 42 }), 'Заявка #42');
});

test('English notifications translate system messages without changing ticket and comment text', () => {
  const messages = {
    ...require('../public/locales/en-ui.json'),
    ...require('../public/locales/en-messages.json')
  };
  const context = {
    window: { HelpdeskPreferences: { locale: 'en', t: createTranslator('en', messages) } },
    document: { querySelectorAll: () => [], getElementById: () => null }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/app.js'), 'utf8'), context);
  for (const [type, title] of [
    ['new_ticket', 'Нова заявка #42'], ['ticket_comment', 'Новий коментар у заявці #42']
  ]) {
    const notification = { type, title, message: 'Обладнання <b>коментар</b>' };
    const result = context.localizeHelpdeskNotification(notification);
    assert.doesNotMatch(result.title, /[А-Яа-яІіЇїЄє]/);
    assert.equal(result.message, notification.message);
    assert.equal(notification.title, title);
  }
  const status = context.localizeHelpdeskNotification({
    type: 'ticket_status_changed', title: 'Змінено статус заявки #42', message: 'Новий статус: В роботі'
  });
  assert.equal(status.message, 'New status: In progress');
  const accepted = context.localizeHelpdeskNotification({
    type: 'ticket_accepted', title: 'Заявку #42 прийнято в роботу', message: 'Обладнання прийняв заявку.'
  });
  assert.equal(accepted.message, 'Обладнання accepted the ticket.');
});

function preferencesBrowser({ cookie = '', storedTheme = null, darkSystem = false, blockedStorage = false, locale = 'uk' } = {}) {
  const events = {};
  const windowEvents = {};
  const themeEvents = {};
  const languageEvents = {};
  const attributes = {};
  const label = { textContent: '' };
  const icon = { textContent: '' };
  const root = { dataset: {}, style: {} };
  const cookies = new Map(cookie.split(';').filter(Boolean).map(entry => entry.trim().split('=')));
  const storage = new Map(storedTheme ? [['helpdeskTheme', storedTheme]] : []);
  const button = {
    title: '',
    setAttribute: (key, value) => { attributes[key] = value; },
    querySelector: selector => selector === '[data-theme-label]' ? label : icon,
    addEventListener: (name, fn) => { themeEvents[name] = fn; }
  };
  const select = { value: locale, addEventListener: (name, fn) => { languageEvents[name] = fn; } };
  let cookieWrite;
  const document = {
    documentElement: root,
    getElementById: () => ({ textContent: JSON.stringify({ locale, messages: {
      'Нічна тема': 'Dark theme', 'Світла тема': 'Light theme'
    } }) }),
    querySelectorAll: selector => selector === '[data-theme-toggle]' ? [button] : [select],
    addEventListener: (name, fn) => { events[name] = fn; },
    get cookie() { return [...cookies].map(([key, value]) => `${key}=${value}`).join('; '); },
    set cookie(value) {
      cookieWrite = value;
      const [key, item] = value.split(';')[0].split('=');
      cookies.set(key, item);
    }
  };
  let reloads = 0;
  const location = { protocol: 'https:', reload: () => { reloads += 1; } };
  const media = { matches: darkSystem, addEventListener: (name, fn) => { media.change = fn; } };
  const window = {
    HelpdeskTranslation: { createTranslator }, location,
    matchMedia: () => media,
    addEventListener: (name, fn) => { windowEvents[name] = fn; }
  };
  const localStorage = {
    getItem: key => { if (blockedStorage) throw new Error('Storage blocked'); return storage.get(key); },
    setItem: (key, value) => { if (blockedStorage) throw new Error('Storage blocked'); storage.set(key, value); }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/js/preferences.js'), 'utf8'), {
    window, document, localStorage, location
  });
  return { root, document, events, themeEvents, languageEvents, select, attributes, label, media,
    get reloads() { return reloads; }, get cookieWrite() { return cookieWrite; } };
}

test('theme applies before page load and explicit choice persists over system preference', () => {
  const browser = preferencesBrowser({ darkSystem: true });
  assert.equal(browser.root.dataset.theme, 'dark');
  browser.events.DOMContentLoaded();
  assert.equal(browser.attributes['aria-pressed'], 'true');
  browser.themeEvents.click();
  assert.equal(browser.root.dataset.theme, 'light');
  assert.equal(browser.attributes['aria-pressed'], 'false');
  assert.match(browser.cookieWrite, /helpdeskTheme=light; Path=\/; Max-Age=31536000; SameSite=Lax; Secure/);
  const nextPage = preferencesBrowser({ cookie: browser.document.cookie, darkSystem: true });
  assert.equal(nextPage.root.dataset.theme, 'light');
  nextPage.media.change();
  assert.equal(nextPage.root.dataset.theme, 'light');
});

test('language persists, validates choices and works when browser storage is blocked', () => {
  const browser = preferencesBrowser({ cookie: 'helpdeskTheme=dark', blockedStorage: true, locale: 'en' });
  browser.events.DOMContentLoaded();
  assert.equal(browser.label.textContent, 'Light theme');
  browser.themeEvents.click();
  assert.equal(browser.root.dataset.theme, 'light');
  assert.equal(browser.label.textContent, 'Dark theme');
  browser.select.value = 'fr';
  browser.languageEvents.change();
  assert.equal(browser.reloads, 0);
  browser.select.value = 'uk';
  browser.languageEvents.change();
  assert.match(browser.document.cookie, /helpdeskLanguage=uk/);
  assert.equal(browser.reloads, 1);
});

test('English and Ukrainian pages, form values and authentication work against an isolated database', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'helpdesk-preferences-'));
  process.env.HELPDESK_ENV = 'test';
  process.env.HELPDESK_DB_PATH = path.join(directory, 'preferences.test.db');
  let server;
  let database;
  try {
    database = require('../src/config/database');
    database.initializeDatabase();
    require('../src/config/developmentSeed').seedDevelopmentData();
    const { app } = require('../src/app');
    const { readPreference } = require('../src/middleware/preferences');
    assert.equal(readPreference('helpdeskLanguage=%E0%A4%A', 'helpdeskLanguage', ['uk', 'en'], 'uk'), 'uk');
    assert.equal(readPreference('helpdeskTheme=%22onload%3Dalert(1)', 'helpdeskTheme', ['light', 'dark'], 'light'), 'light');
    server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const request = async (route, cookie = '', options = {}) => {
      const response = await fetch(base + route, { redirect: 'manual', ...options,
        headers: { cookie, ...options.headers } });
      return { response, html: await response.text() };
    };
    for (const locale of ['uk', 'en']) {
      for (const route of ['/login', '/register', '/forgot-password', '/missing-page']) {
        const { response, html } = await request(route, `helpdeskLanguage=${locale}; helpdeskTheme=dark`);
        assert.equal(response.status, route === '/missing-page' ? 404 : 200, `${locale} ${route}`);
        assert.match(html, new RegExp(`<html lang="${locale}" data-theme="dark">`));
        assert.match(html, /data-language-select/);
        if (locale === 'en') assert.doesNotMatch(html.match(/<h1>(.*?)<\/h1>/s)?.[1] || '', /[А-Яа-яІіЇїЄє]/);
      }
    }
    const invalid = await request('/login', 'helpdeskLanguage=unknown; helpdeskTheme=%3Cscript%3E');
    assert.match(invalid.html, /<html lang="uk" data-theme="light">/);

    const login = await request('/login', 'helpdeskLanguage=en', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username: 'dev-admin', password: 'DevAdmin123!' })
    });
    assert.equal(login.response.status, 302);
    const session = login.response.headers.get('set-cookie').split(';')[0];
    const user = database.db.prepare("SELECT id FROM users WHERE username = 'dev-admin'").get();
    const ticket = database.db.prepare('SELECT id FROM tickets LIMIT 1').get();
    const equipment = database.db.prepare('SELECT id FROM equipment LIMIT 1').get();
    const sentinel = 'Обладнання <script>user-content</script>';
    database.db.prepare('UPDATE tickets SET title = ?, description = ? WHERE id = ?').run(sentinel, sentinel, ticket.id);
    for (const locale of ['uk', 'en']) {
      const cookie = `${session}; helpdeskLanguage=${locale}; helpdeskTheme=dark`;
      for (const route of ['/', '/tickets/new', `/tickets/${ticket.id}`, '/equipment', '/equipment/new',
        `/equipment/${equipment.id}`, `/equipment/${equipment.id}/edit`, '/reports?period=all',
        '/admin/users', `/admin/users/${user.id}`, '/change-password']) {
        const { response, html } = await request(route, cookie);
        assert.equal(response.status, 200, `${locale} ${route}`);
        assert.match(html, new RegExp(`<html lang="${locale}" data-theme="dark">`));
        assert.match(html, /data-theme-toggle/);
        assert.doesNotMatch(html, /<script>user-content<\/script>/);
        if (route === `/tickets/${ticket.id}`) assert.match(html, /Обладнання &lt;script&gt;user-content&lt;\/script&gt;/);
        if (route === '/tickets/new') assert.match(html, /value="Комп’ютер"/);
      }
    }
    const created = await request('/tickets', `${session}; helpdeskLanguage=en`, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ title: 'English interface test', description: 'Оригінальний опис', category: 'Комп’ютер', priority: 'normal' })
    });
    assert.equal(created.response.status, 302);
    const saved = database.db.prepare('SELECT category, description FROM tickets WHERE title = ?').get('English interface test');
    assert.deepEqual({ ...saved }, { category: 'Комп’ютер', description: 'Оригінальний опис' });
    const failedLogin = await request('/login', 'helpdeskLanguage=en', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username: 'dev-user1', password: 'wrong-password' })
    });
    const failedCookie = failedLogin.response.headers.get('set-cookie').split(';')[0];
    const failedPage = await request('/login', `${failedCookie}; helpdeskLanguage=en`);
    const flash = failedPage.html.match(/class="flash error"[^>]*>([\s\S]*?)<\/div>/)?.[1];
    assert.ok(flash, 'failed English login displays the error');
    assert.doesNotMatch(flash, /[А-Яа-яІіЇїЄє]/);
    assert.match(failedPage.html, /value="dev-user1"/);
  } finally {
    if (server?.listening) await new Promise(resolve => server.close(resolve));
    if (database?.db.isOpen) database.db.close();
    delete process.env.HELPDESK_ENV;
    delete process.env.HELPDESK_DB_PATH;
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('helpdesk-preferences-'));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
