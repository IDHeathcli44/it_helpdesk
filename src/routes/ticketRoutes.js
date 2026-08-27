const express = require('express');
const ticketRoutes = require('../modules/tickets/ticketRoutes');
const reportRoutes = require('../modules/reports/reportRoutes');

const router = express.Router();
router.use(reportRoutes);
router.use(ticketRoutes);

module.exports = router;
