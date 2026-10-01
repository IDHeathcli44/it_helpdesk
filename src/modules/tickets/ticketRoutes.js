const express = require('express');
const controller = require('./ticketController');
const { requireAuth, requireRole, requirePermission } = require('../../middleware/auth');
const { uploadTicketImages } = require('../../middleware/ticketUpload');

const router = express.Router();
router.get('/', requireAuth, controller.dashboard);
router.get('/tickets/new', requirePermission('createTickets'), controller.showCreate);
router.post('/tickets', requirePermission('createTickets'), uploadTicketImages, controller.create);
router.get('/tickets/:id', requireAuth, controller.show);
router.post('/tickets/:id/comments', requirePermission('commentTickets'), controller.addComment);
router.post('/tickets/:id/accept', requireRole('it', 'admin'), controller.accept);
router.post(
  '/tickets/:id/reset-password',
  requireRole('it', 'admin'),
  controller.setTemporaryPassword
);
router.post('/tickets/:id/update', requireRole('it', 'admin'), controller.update);

module.exports = router;
