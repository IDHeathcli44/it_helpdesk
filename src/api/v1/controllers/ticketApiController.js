const service = require('../../../modules/tickets/ticketService');
const { ticketSerializer, ticketDetailSerializer } = require('../serializers/ticketSerializer');
const { sendError } = require('../middleware/apiErrorHandler');

exports.list = (req, res) => {
  const data = service.getList(req.session.user, req.query).map(ticketSerializer);
  return res.json({ data, meta: { count: data.length, limit: 100 } });
};

exports.show = (req, res) => {
  const result = service.getDetails(Number(req.params.id), req.session.user);
  if (result.outcome === 'not_found') return sendError(res, 404, 'NOT_FOUND', 'Ticket not found');
  if (result.outcome === 'forbidden') return sendError(res, 403, 'FORBIDDEN', 'Access denied');
  return res.json({ data: ticketDetailSerializer(result.data) });
};
