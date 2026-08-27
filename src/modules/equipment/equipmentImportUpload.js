const path = require('node:path');
const multer = require('multer');

const ALLOWED_EXTENSIONS = new Set(['.xlsx', '.xls', '.csv']);

const uploadEquipmentImport = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      return callback(new Error('Дозволено завантажувати лише XLSX, XLS або CSV.'));
    }
    return callback(null, true);
  }
}).single('inventoryFile');

module.exports = { uploadEquipmentImport };
