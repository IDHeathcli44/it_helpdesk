const express = require('express');
const controller = require('./equipmentController');
const { requirePermission } = require('../../middleware/auth');
const { uploadEquipmentImport } = require('./equipmentImportUpload');

const router = express.Router();
router.use(requirePermission('viewEquipment'));
router.get('/', controller.list);
router.get('/import-template.xlsx', controller.downloadImportTemplate);
router.get('/export.xlsx', controller.exportInventory);
router.post('/import', requirePermission('manageEquipment'), uploadEquipmentImport, controller.importInventory);
router.get('/new', requirePermission('manageEquipment'), controller.showCreate);
router.post('/', requirePermission('manageEquipment'), controller.create);
router.get('/:id', controller.show);
router.get('/:id/edit', requirePermission('manageEquipment'), controller.showEdit);
router.post('/:id', requirePermission('manageEquipment'), controller.update);
router.post('/:id/delete', requirePermission('manageEquipment'), controller.remove);

module.exports = router;
