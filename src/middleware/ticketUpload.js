const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const multer = require('multer');

const uploadDirectory = path.join(__dirname, '../../uploads/tickets');
fs.mkdirSync(uploadDirectory, { recursive: true });

const EXTENSION_BY_MIME_TYPE = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
  ['image/bmp', '.bmp']
]);

const storage = multer.diskStorage({
  destination: (req, file, callback) => callback(null, uploadDirectory),
  filename: (req, file, callback) => {
    const extension = EXTENSION_BY_MIME_TYPE.get(file.mimetype) || '.bin';
    callback(null, `${Date.now()}-${crypto.randomUUID()}${extension}`);
  }
});

const uploadTicketImages = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 5
  },
  fileFilter: (req, file, callback) => {
    if (!EXTENSION_BY_MIME_TYPE.has(file.mimetype)) {
      return callback(new Error('Дозволені формати: JPG, PNG, WEBP, GIF або BMP.'));
    }
    return callback(null, true);
  }
}).array('screenshots', 5);

module.exports = { uploadTicketImages, uploadDirectory };
