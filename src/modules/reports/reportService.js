const repository = require('./reportRepository');
const { formatDuration } = require('../tickets/ticketService');
const XLSX = require('xlsx');

const ALLOWED_PERIODS = new Set(['7', '30', '90', '365', 'all']);

function normalizePeriod(period) {
  return ALLOWED_PERIODS.has(period) ? period : '30';
}

function getDashboard(periodValue) {
  const period = normalizePeriod(periodValue);
  return { period, ...repository.getDashboard(period), formatDuration };
}

function exportCsv(periodValue) {
  const period = normalizePeriod(periodValue);
  const rows = repository.getExportRows(period);
  const escape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const csvRows = rows.map(toExportRow);
  return {
    period,
    csv: '\ufeff' + [EXPORT_HEADERS, ...csvRows]
      .map((row) => row.map(escape).join(';'))
      .join('\r\n')
  };
}

function exportXlsx(periodValue) {
  const period = normalizePeriod(periodValue);
  const rows = repository.getExportRows(period);
  const worksheet = XLSX.utils.aoa_to_sheet([
    EXPORT_HEADERS,
    ...rows.map(toExportRow)
  ]);
  worksheet['!autofilter'] = { ref: worksheet['!ref'] };
  worksheet['!cols'] = [
    { wch: 8 }, { wch: 38 }, { wch: 20 }, { wch: 14 },
    { wch: 16 }, { wch: 24 }, { wch: 24 }, { wch: 24 },
    { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 20 }
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Заявки');
  return {
    period,
    workbook: XLSX.write(workbook, {
      type: 'buffer',
      bookType: 'xlsx',
      compression: true
    })
  };
}

const EXPORT_HEADERS = [
  'ID', 'Тема', 'Категорія', 'Пріоритет', 'Статус', 'Автор',
  'Виконавець', 'Обладнання', 'Створено', 'Перша реакція', 'Виконано', 'Закрито'
];

function toExportRow(row) {
  return [
    row.id,
    row.title,
    row.category,
    row.priority,
    row.status,
    row.creator,
    row.assignee,
    row.equipment,
    row.created_at,
    row.first_response_at,
    row.resolved_at,
    row.closed_at
  ];
}

module.exports = { normalizePeriod, getDashboard, exportCsv, exportXlsx };
