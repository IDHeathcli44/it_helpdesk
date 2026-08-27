const express = require('express');
const controller = require('./ticketController');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { uploadTicketImages } = require('../../middleware/ticketUpload');

const router = express.Router();
router.get('/', requireAuth, controller.dashboard);
router.get('/tickets/new', requireAuth, controller.showCreate);
router.post('/tickets', requireAuth, uploadTicketImages, controller.create);
router.get('/tickets/:id', requireAuth, controller.show);
router.post('/tickets/:id/comments', requireAuth, controller.addComment);
router.post('/tickets/:id/accept', requireRole('it', 'admin'), controller.accept);
router.post(
  '/tickets/:id/reset-password',
  requireRole('it', 'admin'),
  controller.setTemporaryPassword
);
router.post('/tickets/:id/update', requireRole('it', 'admin'), controller.update);

module.exports = router;
