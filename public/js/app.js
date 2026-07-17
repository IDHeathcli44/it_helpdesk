// Невелика клієнтська логіка. Код навмисно не мініфікований.
document.querySelectorAll('.clickable-row[data-href]').forEach((row) => {
  row.addEventListener('click', (event) => {
    if (event.target.closest('a, button, input, select, textarea')) return;
    window.location.href = row.dataset.href;
  });
});

(() => {
  const button = document.getElementById('notificationButton');
  if (!button) return;
  const panel = document.getElementById('notificationPanel');
  const list = document.getElementById('notificationList');
  const count = document.getElementById('notificationCount');
  const readButton = document.getElementById('markNotificationsRead');
  let previousUnread = 0;

  async function loadNotifications(showDesktop = false) {
    try {
      const response = await fetch('/api/notifications');
      if (!response.ok) return;
      const data = await response.json();
      count.textContent = data.unread;
      count.hidden = !data.unread;
      list.innerHTML = data.notifications.length ? data.notifications.map(item => `
        <a class="notification-item ${item.is_read ? '' : 'unread'}" href="${item.link || '#'}">
          <strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.message)}</span><small>${item.created_at}</small>
        </a>`).join('') : '<p class="notification-empty">Нових сповіщень немає.</p>';
      if (showDesktop && data.unread > previousUnread && 'Notification' in window && Notification.permission === 'granted') {
        const newest = data.notifications[0];
        if (newest) new Notification(newest.title, { body: newest.message });
      }
      previousUnread = data.unread;
    } catch (_) { /* сервер може бути тимчасово недоступним */ }
  }
  button.addEventListener('click', async () => {
    panel.hidden = !panel.hidden;
    if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission();
    loadNotifications(false);
  });
  readButton.addEventListener('click', async () => { await fetch('/api/notifications/read-all', { method: 'POST' }); loadNotifications(false); });
  document.addEventListener('click', event => { if (!panel.contains(event.target) && !button.contains(event.target)) panel.hidden = true; });
  loadNotifications(false);
  setInterval(() => loadNotifications(true), 30000);
  function escapeHtml(value) { const div=document.createElement('div'); div.textContent=value ?? ''; return div.innerHTML; }
})();

// Показує користувачеві назви зображень, вибраних для нової заявки.
(() => {
  const input = document.getElementById('screenshots');
  const output = document.getElementById('selected-files');
  if (!input || !output) return;

  input.addEventListener('change', () => {
    const files = Array.from(input.files || []);
    if (!files.length) {
      output.textContent = '';
      return;
    }

    output.innerHTML = files
      .map((file) => `<span>${escapeFileName(file.name)} · ${formatFileSize(file.size)}</span>`)
      .join('');
  });

  function formatFileSize(bytes) {
    if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} КБ`;
    return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
  }

  function escapeFileName(value) {
    const div = document.createElement('div');
    div.textContent = value;
    return div.innerHTML;
  }
})();
