const service = require('../../../modules/equipment/equipmentService');
const { equipmentSerializer, equipmentDetailSerializer } = require('../serializers/equipmentSerializer');
const { sendError } = require('../middleware/apiErrorHandler');

exports.list = (req, res) => {
  const data = service.getList(req.query).equipment.map(equipmentSerializer);
  return res.json({ data, meta: { count: data.length } });
};

exports.show = (req, res) => {
  const result = service.getDetails(Number(req.params.id));
  if (!result) return sendError(res, 404, 'NOT_FOUND', 'Equipment not found');
  return res.json({ data: equipmentDetailSerializer(result) });
};
