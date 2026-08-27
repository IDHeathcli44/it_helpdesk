const TYPES = Object.freeze({
  computer: 'Комп’ютер',
  printer: 'Принтер',
  monitor: 'Монітор',
  network: 'Мережеве обладнання',
  other: 'Інше'
});

const STATUSES = Object.freeze({
  active: 'В експлуатації',
  repair: 'У ремонті',
  reserve: 'Резерв',
  retired: 'Списано'
});

module.exports = { TYPES, STATUSES };
