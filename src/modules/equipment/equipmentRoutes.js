const express = require('express');
const controller = require('./equipmentController');
const { requireRole } = require('../../middleware/auth');
const { uploadEquipmentImport } = require('./equipmentImportUpload');

const router = express.Router();
router.use(requireRole('it', 'admin'));
router.get('/', controller.list);
router.get('/import-template.xlsx', controller.downloadImportTemplate);
router.post('/import', uploadEquipmentImport, controller.importInventory);
router.get('/new', controller.showCreate);
router.post('/', controller.create);
router.get('/:id', controller.show);
router.get('/:id/edit', controller.showEdit);
router.post('/:id', controller.update);
router.post('/:id/delete', controller.remove);

module.exports = router;
