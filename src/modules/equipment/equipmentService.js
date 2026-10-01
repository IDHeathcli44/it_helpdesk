const repository = require('./equipmentRepository');
const { TYPES, STATUSES } = require('./equipmentConstants');
const XLSX = require('xlsx');
const { can } = require('../../config/permissions');

const IMPORT_HEADERS = [
  'Інвентарний номер', 'Тип', 'Назва', 'Виробник', 'Модель',
  'Серійний номер', 'IP', 'MAC', 'Операційна система', 'CPU',
  'RAM (ГБ)', 'Накопичувач', 'Відділ', 'Кабінет', 'Користувач',
  'Статус', 'Примітки'
];
const AMBIGUOUS_USER = Symbol('ambiguous-user');

function getList(query, user) {
  const filters = {
    type: Object.hasOwn(TYPES, query.type) ? query.type : '',
    status: Object.hasOwn(STATUSES, query.status) ? query.status : '',
    search: String(query.search || '').trim()
  };
  return {
    ...filters,
    equipment: repository.list({ ...filters, ticketOwnerId: user && !can(user, 'viewAllTickets') ? user.id : null }),
    stats: repository.getStats(),
    types: TYPES,
    statuses: STATUSES
  };
}

function getForm(id = null) {
  return {
    item: id === null ? null : repository.findById(id),
    users: repository.listActiveUsers(),
    types: TYPES,
    statuses: STATUSES
  };
}

function getDetails(id, user) {
  const item = repository.findDetailsById(id);
  if (!item) return null;
  return {
    item,
    tickets: repository.listTickets(item.id, user && !can(user, 'viewAllTickets') ? user.id : null),
    types: TYPES,
    statuses: STATUSES
  };
}

function create(body) {
  return repository.create(normalize(body));
}

function update(id, body) {
  return repository.update(id, normalize(body));
}

function remove(id) {
  return repository.remove(id);
}

function importInventory(buffer, t = formatImportMessage) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error(t('У файлі немає аркушів.'));
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    defval: '',
    raw: false
  });
  if (!rows.length) throw new Error(t('Файл не містить записів.'));
  if (rows.length > 5000) throw new Error(t('За один раз можна імпортувати не більше 5000 рядків.'));

  const users = createUserLookup(repository.listImportUsers());
  const errors = [];
  let imported = 0;

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    try {
      const item = normalizeImportRow(row, users, t);
      if (!item.name) throw new Error(t('не заповнено назву обладнання'));
      if (item.assetTag && repository.findByAssetTag(item.assetTag)) {
        throw new Error(t('інвентарний номер «{assetTag}» уже існує', { assetTag: item.assetTag }));
      }
      repository.create(item);
      imported += 1;
    } catch (error) {
      errors.push(t('Рядок {row}: {error}.', { row: rowNumber, error: error.message }));
    }
  });

  return {
    imported,
    skipped: rows.length - imported,
    errors: errors.slice(0, 50)
  };
}

function createImportTemplate() {
  const inventorySheet = XLSX.utils.aoa_to_sheet([IMPORT_HEADERS]);
  inventorySheet['!cols'] = IMPORT_HEADERS.map((header) => ({
    wch: Math.max(14, header.length + 3)
  }));
  const referenceSheet = XLSX.utils.aoa_to_sheet([
    ['Код типу', 'Назва типу', 'Код статусу', 'Назва статусу'],
    ...Object.keys(TYPES).map((type, index) => {
      const statuses = Object.keys(STATUSES);
      const status = statuses[index] || '';
      return [type, TYPES[type], status, status ? STATUSES[status] : ''];
    })
  ]);
  referenceSheet['!cols'] = [{ wch: 18 }, { wch: 28 }, { wch: 18 }, { wch: 24 }];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, inventorySheet, 'Інвентаризація');
  XLSX.utils.book_append_sheet(workbook, referenceSheet, 'Довідник');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx', compression: true });
}

function exportInventory(query = {}) {
  const filters = {
    type: Object.hasOwn(TYPES, query.type) ? query.type : '',
    status: Object.hasOwn(STATUSES, query.status) ? query.status : '',
    search: String(query.search || '').trim()
  };
  const rows = repository.list(filters).map(item => [
    item.asset_tag, item.type, item.name, item.manufacturer, item.model,
    item.serial_number, item.ip_address, item.mac_address, item.operating_system,
    item.cpu, item.ram_gb, item.storage, item.department, item.office,
    item.assigned_username, item.status, item.notes
  ]);
  const sheet = XLSX.utils.aoa_to_sheet([IMPORT_HEADERS, ...rows]);
  sheet['!cols'] = IMPORT_HEADERS.map(header => ({ wch: Math.max(18, header.length + 3) }));
  sheet['!autofilter'] = { ref: sheet['!ref'] };
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Інвентаризація');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx', compression: true });
}

function normalize(body) {
  return {
    assetTag: optional(body.assetTag),
    type: Object.hasOwn(TYPES, body.type) ? body.type : 'other',
    name: String(body.name || '').trim(),
    manufacturer: optional(body.manufacturer),
    model: optional(body.model),
    serialNumber: optional(body.serialNumber),
    ipAddress: optional(body.ipAddress),
    macAddress: optional(body.macAddress),
    operatingSystem: optional(body.operatingSystem),
    cpu: optional(body.cpu),
    ramGb: body.ramGb ? Number(body.ramGb) : null,
    storage: optional(body.storage),
    department: optional(body.department),
    office: optional(body.office),
    assignedUserId: body.assignedUserId ? Number(body.assignedUserId) : null,
    status: Object.hasOwn(STATUSES, body.status) ? body.status : 'active',
    notes: optional(body.notes)
  };
}

function optional(value) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function normalizeImportRow(row, users, t) {
  const typeValue = cell(row, ['Тип', 'type']) || 'other';
  const statusValue = cell(row, ['Статус', 'status']) || 'active';
  const type = matchDictionary(typeValue, TYPES, {
    'компютер': 'computer',
    'принтер': 'printer',
    'монітор': 'monitor',
    'мережевеобладнання': 'network',
    'інше': 'other'
  });
  const status = matchDictionary(statusValue, STATUSES, {
    'вексплуатації': 'active',
    'уремонті': 'repair',
    'резерв': 'reserve',
    'списано': 'retired',
    'writtenoff': 'retired'
  });
  if (!type) throw new Error(t('невідомий тип «{type}»', { type: typeValue }));
  if (!status) throw new Error(t('невідомий статус «{status}»', { status: statusValue }));

  const assignedUser = cell(row, [
    'Користувач', 'Логін користувача', 'assigned_user', 'username', 'email'
  ]);
  let assignedUserId = null;
  if (assignedUser) {
    const userKey = String(assignedUser).trim().toLowerCase();
    const directMatch = users.direct.get(userKey);
    const matchedUser = directMatch === undefined
      ? users.names.get(userKey)
      : directMatch;
    if (matchedUser === AMBIGUOUS_USER) {
      throw new Error(
        t('значення «{user}» відповідає кільком користувачам; укажіть унікальний логін або email', { user: assignedUser })
      );
    }
    assignedUserId = matchedUser || null;
    if (!assignedUserId) throw new Error(t('користувача «{user}» не знайдено', { user: assignedUser }));
  }

  const ramValue = cell(row, ['RAM (ГБ)', 'RAM', 'ram_gb']);
  const ramGb = ramValue === '' ? null : Number(String(ramValue).replace(',', '.'));
  if (ramGb !== null && (!Number.isFinite(ramGb) || ramGb < 0)) {
    throw new Error(t('RAM має бути невід’ємним числом'));
  }

  return {
    assetTag: nullableCell(row, ['Інвентарний номер', 'Інв. №', 'asset_tag', 'inventory_number']),
    type,
    name: String(cell(row, ['Назва', 'Обладнання', 'name'])).trim(),
    manufacturer: nullableCell(row, ['Виробник', 'manufacturer']),
    model: nullableCell(row, ['Модель', 'model']),
    serialNumber: nullableCell(row, ['Серійний номер', 'serial_number']),
    ipAddress: nullableCell(row, ['IP', 'IP-адреса', 'ip_address']),
    macAddress: nullableCell(row, ['MAC', 'MAC-адреса', 'mac_address']),
    operatingSystem: nullableCell(row, ['Операційна система', 'ОС', 'operating_system']),
    cpu: nullableCell(row, ['CPU', 'Процесор', 'cpu']),
    ramGb,
    storage: nullableCell(row, ['Накопичувач', 'storage']),
    department: nullableCell(row, ['Відділ', 'department']),
    office: nullableCell(row, ['Кабінет', 'Офіс', 'office', 'room']),
    assignedUserId,
    status,
    notes: nullableCell(row, ['Примітки', 'notes'])
  };
}

function createUserLookup(users) {
  const direct = new Map();
  const names = new Map();
  for (const user of users) {
    addUserIdentity(direct, user.username, user.id);
    addUserIdentity(direct, user.email, user.id);
    addUserIdentity(names, user.full_name, user.id);
  }
  return { direct, names };
}

function addUserIdentity(lookup, identity, userId) {
  if (!identity) return;
  const key = String(identity).trim().toLowerCase();
  const existing = lookup.get(key);
  if (existing === undefined || existing === userId) lookup.set(key, userId);
  else lookup.set(key, AMBIGUOUS_USER);
}

function matchDictionary(value, dictionary, aliases) {
  const normalized = normalizeKey(value);
  if (Object.hasOwn(dictionary, String(value).trim())) return String(value).trim();
  for (const [key, label] of Object.entries(dictionary)) {
    if (normalizeKey(label) === normalized || normalizeKey(key) === normalized) return key;
  }
  return aliases[normalized] || null;
}

function cell(row, aliases) {
  const normalizedAliases = new Set(aliases.map(normalizeKey));
  for (const [key, value] of Object.entries(row)) {
    if (normalizedAliases.has(normalizeKey(key))) return value;
  }
  return '';
}

function nullableCell(row, aliases) {
  const value = String(cell(row, aliases) || '').trim();
  return value || null;
}

function normalizeKey(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[’'`]/g, '')
    .replace(/[^a-zа-яіїєґ0-9]+/giu, '');
}

function formatImportMessage(source, params = {}) {
  return source.replace(/\{(\w+)\}/g, (match, key) => params[key] ?? match);
}

module.exports = {
  IMPORT_HEADERS,
  exportInventory,
  getList,
  getForm,
  getDetails,
  create,
  update,
  remove,
  importInventory,
  createImportTemplate
};
