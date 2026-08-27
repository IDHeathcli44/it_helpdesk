const express = require('express');
const controller = require('./notificationController');
const { requireAuth } = require('../../middleware/auth');

const router = express.Router();
router.get('/api/notifications', requireAuth, controller.listJson);
router.post('/api/notifications/:id/read', requireAuth, controller.markRead);
router.post('/api/notifications/read-all', requireAuth, controller.markAllRead);

module.exports = router;
