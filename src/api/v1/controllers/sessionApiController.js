const { sessionSerializer } = require('../serializers/userSerializer');

exports.show = (req, res) => res.json({ data: { user: sessionSerializer(req.session.user) } });
