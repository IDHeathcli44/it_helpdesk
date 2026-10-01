(() => {
  'use strict';
  const root = document.documentElement;
  const config = JSON.parse(document.getElementById('helpdesk-locale').textContent);
  const t = window.HelpdeskTranslation.createTranslator(config.locale, config.messages);
  const themeKey = 'helpdeskTheme';
  const languageKey = 'helpdeskLanguage';
  const media = window.matchMedia('(prefers-color-scheme: dark)');

  function readCookie(name) {
    const entry = document.cookie.split(';').map(value => value.trim())
      .find(value => value.startsWith(`${name}=`));
    try { return entry ? decodeURIComponent(entry.slice(name.length + 1)) : null; }
    catch { return null; }
  }

  function readStoredTheme() {
    const cookie = readCookie(themeKey);
    if (['light', 'dark'].includes(cookie)) return cookie;
    try {
      const saved = localStorage.getItem(themeKey);
      if (['light', 'dark'].includes(saved)) return saved;
    } catch { /* Private browsing can disable storage. */ }
    return null;
  }

  function saveCookie(name, value) {
    document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
  }

  function applyTheme(theme) {
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    document.querySelectorAll('[data-theme-toggle]').forEach(button => {
      const label = t(theme === 'dark' ? 'Світла тема' : 'Нічна тема');
      button.setAttribute('aria-pressed', String(theme === 'dark'));
      button.setAttribute('aria-label', label);
      button.title = label;
      button.querySelector('[data-theme-label]').textContent = label;
      button.querySelector('[data-theme-icon]').textContent = theme === 'dark' ? '☀' : '☾';
    });
  }

  // Run in <head>, before CSS or body paints, to avoid flashing the light theme.
  applyTheme(readStoredTheme() || (media.matches ? 'dark' : 'light'));
  window.HelpdeskPreferences = { t, locale: config.locale };

  document.addEventListener('DOMContentLoaded', () => {
    applyTheme(root.dataset.theme);
    document.querySelectorAll('[data-theme-toggle]').forEach(button => {
      button.addEventListener('click', () => {
        const theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
        saveCookie(themeKey, theme);
        try { localStorage.setItem(themeKey, theme); } catch { /* Cookie remains available. */ }
        applyTheme(theme);
      });
    });
    document.querySelectorAll('[data-language-select]').forEach(select => {
      select.value = config.locale;
      select.addEventListener('change', () => {
        if (!['uk', 'en'].includes(select.value) || select.value === config.locale) return;
        saveCookie(languageKey, select.value);
        window.location.reload();
      });
    });
  });

  media.addEventListener('change', () => {
    if (!readStoredTheme()) applyTheme(media.matches ? 'dark' : 'light');
  });
  window.addEventListener('storage', event => {
    if (event.key === themeKey && ['light', 'dark'].includes(event.newValue)) {
      applyTheme(event.newValue);
    }
  });
})();
