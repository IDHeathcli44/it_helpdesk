module.exports = function reportSerializer({ period, summary, byStatus, byCategory, byAssignee, daily }) {
  return {
    period,
    summary: {
      total: summary.total, completed: summary.completed ?? 0, open: summary.open ?? 0,
      avgResponseMinutes: summary.avg_response_minutes,
      avgResolutionMinutes: summary.avg_resolution_minutes
    },
    byStatus: byStatus.map(row => ({ status: row.status, total: row.total })),
    byCategory: byCategory.map(row => ({ category: row.category, total: row.total })),
    byAssignee: byAssignee.map(row => ({
      assignee: row.assignee, total: row.total, completed: row.completed,
      avgMinutes: row.avg_minutes
    })),
    daily: daily.map(row => ({ day: row.day, created: row.created, completed: row.completed }))
  };
};
