const STATUS_LABELS = Object.freeze({
  new: 'Нова',
  in_progress: 'В роботі',
  waiting: 'Очікує',
  done: 'Виконано',
  closed: 'Закрито'
});

const PRIORITY_LABELS = Object.freeze({
  low: 'Низький',
  normal: 'Звичайний',
  high: 'Високий',
  critical: 'Критичний'
});

module.exports = { STATUS_LABELS, PRIORITY_LABELS };
