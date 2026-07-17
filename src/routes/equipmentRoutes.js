const path = require('path');
const multer = require('multer');
const equipmentController = require('../controllers/equipmentController');
const express = require('express');
const controller = require('../controllers/equipmentController');
const { requireRole } = require('../middleware/auth');
const router = express.Router();
const upload = multer({
    dest: path.join(process.cwd(), 'temp-imports'),

    limits: {
        fileSize: 10 * 1024 * 1024,
    },

    fileFilter: (req, file, callback) => {
        const allowedExtensions = ['.xlsx', '.xls', '.csv'];
        const extension = path.extname(file.originalname).toLowerCase();

        if (!allowedExtensions.includes(extension)) {
            return callback(
                new Error('Дозволено завантажувати лише XLSX, XLS або CSV.')
            );
        }

        callback(null, true);
    },
});
/*router.post(
    '/import',
    requireRole('admin', 'it'),
    upload.single('inventoryFile'),
    equipmentController.importEquipment
);*/
router.use(requireRole('it', 'admin'));
router.get('/', controller.list);
router.get('/new', controller.showCreate);
router.post('/', controller.create);
router.get('/:id', controller.show);
router.get('/:id/edit', controller.showEdit);
router.post('/:id', controller.update);
router.post('/:id/delete', controller.remove);
module.exports = router;
