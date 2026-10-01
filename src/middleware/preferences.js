const { createTranslator } = require('../../public/js/translation');
const { STATUS_LABELS } = require('../modules/tickets/ticketConstants');
const messages = {
  ...require('../../public/locales/en-ui.json'),
  ...require('../../public/locales/en-messages.json'),
  ...require('../../public/locales/en-shell.json')
};
const translators = { uk: createTranslator('uk'), en: createTranslator('en', messages) };

function readPreference(cookieHeader, name, allowed, fallback) {
  for (const cookie of String(cookieHeader || '').split(';')) {
    const separator = cookie.indexOf('=');
    if (cookie.slice(0, separator).trim() !== name) continue;
    try {
      const value = decodeURIComponent(cookie.slice(separator + 1));
      return allowed.includes(value) ? value : fallback;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function exposePreferences(req, res, next) {
  const locale = readPreference(req.headers.cookie, 'helpdeskLanguage', ['uk', 'en'], 'uk');
  const theme = readPreference(req.headers.cookie, 'helpdeskTheme', ['light', 'dark'], 'light');
  req.locale = locale;
  req.t = translators[locale];
  res.locals.locale = locale;
  res.locals.theme = theme;
  res.locals.t = req.t;
  res.locals.ticketStatusLabels = STATUS_LABELS;
  // Escape the JSON script boundary even if a future translation contains markup.
  res.locals.localeJson = JSON.stringify({ locale, messages: locale === 'en' ? messages : {} })
    .replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  next();
}

module.exports = { exposePreferences, readPreference, messages, translators };
