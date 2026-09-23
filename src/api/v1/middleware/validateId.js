const { sendError } = require('./apiErrorHandler');

module.exports = function validateId(req, res, next, value) {
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) {
    return sendError(res, 400, 'INVALID_ID', 'ID must be a positive safe integer');
  }
  next();
};
