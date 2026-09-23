const service = require('../../../modules/reports/reportService');
const serialize = require('../serializers/reportSerializer');

exports.summary = (req, res) => res.json({ data: serialize(service.getDashboard(req.query.period)) });
