const express = require('express');
const controller = require('../controllers/adminController');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAdmin);
router.get('/users', controller.listUsers);
router.post('/users', controller.createUser);
router.get('/users/:id', controller.showUser);
router.post('/users/:id', controller.updateUser);
router.post('/users/:id/toggle', controller.toggleUser);
router.post('/users/:id/delete', controller.deleteUser);

module.exports = router;
