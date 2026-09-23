const service = require('../../../modules/users/userService');
const { userSerializer } = require('../serializers/userSerializer');
const { sendError } = require('../middleware/apiErrorHandler');

exports.list = (req, res) => {
  const data = service.listUsers().map(userSerializer);
  return res.json({ data, meta: { count: data.length } });
};

exports.show = (req, res) => {
  const user = service.getUser(Number(req.params.id));
  if (!user) return sendError(res, 404, 'NOT_FOUND', 'User not found');
  return res.json({ data: userSerializer(user) });
};
