const service = require('./reportService');

function reports(req, res) {
  const data = service.getDashboard(req.query.period);
  return res.render('reports/index', {
    ...data,
    formatDuration: (minutes) => data.formatDuration(minutes, req.locale)
  });
}

function exportCsv(req, res) {
  const result = service.exportCsv(req.query.period);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="helpdesk-report-${result.period}.csv"`
  );
  return res.send(result.csv);
}

function exportXlsx(req, res) {
  const result = service.exportXlsx(req.query.period);
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="helpdesk-report-${result.period}.xlsx"`
  );
  return res.send(result.workbook);
}

module.exports = { reports, exportCsv, exportXlsx };
