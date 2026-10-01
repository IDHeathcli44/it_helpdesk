const express = require('express');
const controller = require('./reportController');
const { requirePermission } = require('../../middleware/auth');

const router = express.Router();
router.get('/reports', requirePermission('viewReports'), controller.reports);
router.get('/reports/export.xlsx', requirePermission('viewReports'), controller.exportXlsx);
router.get('/reports/export.csv', requirePermission('viewReports'), controller.exportCsv);

module.exports = router;
