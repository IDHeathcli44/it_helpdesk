const express = require('express');
const controller = require('../controllers/ticketController');
const reportController = require('../controllers/reportController');
const { requireAuth, requireRole } = require('../middleware/auth');
const { uploadTicketImages } = require('../middleware/ticketUpload');

const router = express.Router();
router.get('/', requireAuth, controller.dashboard);
router.get('/tickets/new', requireAuth, controller.showCreate);
router.post('/tickets', requireAuth, uploadTicketImages, controller.create);
router.get('/tickets/:id', requireAuth, controller.show);
router.post('/tickets/:id/comments', requireAuth, controller.addComment);
router.post('/tickets/:id/update', requireRole('it', 'admin'), controller.update);
router.get('/reports', requireRole('it', 'admin'), reportController.reports);
router.get('/reports/export.csv', requireRole('it', 'admin'), reportController.exportCsv);
module.exports = router;
