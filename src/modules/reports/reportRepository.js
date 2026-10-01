const { db } = require('../../config/database');

function getDashboard(period) {
  const periodSql = period === 'all'
    ? ''
    : `AND datetime(created_at) >= datetime('now', '-${Number(period)} days')`;

  const summary = db.prepare(`
    SELECT COUNT(*) AS total,
      SUM(CASE WHEN status IN ('done','closed') THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN status NOT IN ('done','closed') THEN 1 ELSE 0 END) AS open,
      ROUND(AVG(CASE WHEN first_response_at IS NOT NULL
        THEN (julianday(first_response_at) - julianday(created_at)) * 1440 END), 1) AS avg_response_minutes,
      ROUND(AVG(CASE WHEN COALESCE(closed_at, resolved_at) IS NOT NULL
        THEN (julianday(COALESCE(closed_at, resolved_at)) - julianday(created_at)) * 1440 END), 1) AS avg_resolution_minutes
    FROM tickets WHERE 1 = 1 ${periodSql}
  `).get();

  const byStatus = db.prepare(`
    SELECT status, COUNT(*) AS total FROM tickets
    WHERE 1 = 1 ${periodSql}
    GROUP BY status ORDER BY total DESC
  `).all();

  const byCategory = db.prepare(`
    SELECT category, COUNT(*) AS total FROM tickets
    WHERE 1 = 1 ${periodSql}
    GROUP BY category ORDER BY total DESC LIMIT 10
  `).all();

  const byAssignee = db.prepare(`
    SELECT t.assigned_to AS assignee_id,
      COALESCE(u.full_name, 'Не призначено') AS assignee,
      COUNT(*) AS total,
      SUM(CASE WHEN t.status IN ('done','closed') THEN 1 ELSE 0 END) AS completed,
      ROUND(AVG(CASE WHEN COALESCE(t.closed_at, t.resolved_at) IS NOT NULL
        THEN (julianday(COALESCE(t.closed_at, t.resolved_at)) - julianday(t.created_at)) * 1440 END), 1) AS avg_minutes
    FROM tickets t
    LEFT JOIN users u ON u.id = t.assigned_to
    WHERE 1 = 1 ${periodSql.replaceAll('created_at', 't.created_at')}
    GROUP BY t.assigned_to, u.full_name
    ORDER BY completed DESC, total DESC
  `).all();

  const daily = db.prepare(`
    SELECT date(created_at) AS day,
      COUNT(*) AS created,
      SUM(CASE WHEN status IN ('done','closed') THEN 1 ELSE 0 END) AS completed
    FROM tickets
    WHERE datetime(created_at) >= datetime('now', '-13 days')
    GROUP BY date(created_at) ORDER BY day ASC
  `).all();

  return { summary, byStatus, byCategory, byAssignee, daily };
}

function getExportRows(period) {
  const periodSql = period === 'all'
    ? ''
    : `WHERE datetime(t.created_at) >= datetime('now', '-${Number(period)} days')`;
  return db.prepare(`
    SELECT t.id, t.title, t.category, t.priority, t.status, t.created_at,
      t.first_response_at, t.resolved_at, t.closed_at,
      creator.full_name AS creator, assignee.full_name AS assignee,
      e.name AS equipment
    FROM tickets t
    LEFT JOIN users creator ON creator.id = t.created_by
    LEFT JOIN users assignee ON assignee.id = t.assigned_to
    LEFT JOIN equipment e ON e.id = t.equipment_id
    ${periodSql}
    ORDER BY t.created_at DESC
  `).all();
}

module.exports = { getDashboard, getExportRows };
