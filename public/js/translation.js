(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HelpdeskTranslation = factory();
})(typeof window === 'object' ? window : this, function () {
  'use strict';

  const owns = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const interpolate = (text, values) => text.replace(/\{(\w+)\}/g,
    (token, name) => owns(values, name) ? String(values[name] ?? '') : token);
  const escapePattern = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  function createTranslator(locale, messages = {}) {
    // Only explicitly translated system messages use these anchored patterns.
    // Captured names and user content are inserted verbatim, never translated.
    const templates = Object.entries(messages)
      .filter(([source]) => /\{\w+\}/.test(source))
      .map(([source, translation]) => {
        const names = [];
        let offset = 0;
        let pattern = '^';
        for (const match of source.matchAll(/\{(\w+)\}/g)) {
          pattern += escapePattern(source.slice(offset, match.index)) + '([\\s\\S]*?)';
          names.push(match[1]);
          offset = match.index + match[0].length;
        }
        pattern += escapePattern(source.slice(offset)) + '$';
        return { pattern: new RegExp(pattern), names, translation };
      });

    return function t(source, values = {}) {
      const text = String(source ?? '');
      if (locale !== 'en') return interpolate(text, values);
      if (owns(messages, text)) return interpolate(messages[text], values);
      for (const template of templates) {
        const match = template.pattern.exec(text);
        if (!match) continue;
        const captured = Object.fromEntries(template.names.map((name, index) => [name, match[index + 1]]));
        return interpolate(template.translation, { ...captured, ...values });
      }
      return interpolate(text, values);
    };
  }

  return { createTranslator };
});
