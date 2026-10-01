const express = require('express');
const controller = require('./userController');
const { requirePermission } = require('../../middleware/auth');

const router = express.Router();
router.use(requirePermission('viewUsers'));
router.get('/users', controller.listUsers);
router.post('/users', requirePermission('manageUsers'), controller.createUser);
router.get('/users/:id', controller.showUser);
router.post('/users/:id', requirePermission('manageUsers'), controller.updateUser);
router.post('/users/:id/toggle', requirePermission('manageUsers'), controller.toggleUser);
router.post('/users/:id/delete', requirePermission('manageUsers'), controller.deleteUser);

module.exports = router;
