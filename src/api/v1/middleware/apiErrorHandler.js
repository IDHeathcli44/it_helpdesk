function sendError(res, status, code, message) {
  res.set('Cache-Control', 'no-store');
  return res.status(status).json({ error: { code, message } });
}

function apiErrorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error.type === 'entity.parse.failed') {
    return sendError(res, 400, 'INVALID_JSON', 'Invalid JSON body');
  }
  if (error.type === 'entity.too.large') {
    return sendError(res, 413, 'PAYLOAD_TOO_LARGE', 'Request body too large');
  }
  return sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
}

function notFound(req, res) {
  return sendError(res, 404, 'NOT_FOUND', 'Endpoint not found');
}

module.exports = { sendError, apiErrorHandler, notFound };
