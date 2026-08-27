const express = require('express');
const controller = require('./reportController');
const { requireRole } = require('../../middleware/auth');

const router = express.Router();
router.get('/reports', requireRole('it', 'admin'), controller.reports);
router.get('/reports/export.xlsx', requireRole('it', 'admin'), controller.exportXlsx);
router.get('/reports/export.csv', requireRole('it', 'admin'), controller.exportCsv);

module.exports = router;
