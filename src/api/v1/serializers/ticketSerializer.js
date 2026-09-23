const { userReference } = require('./userSerializer');

function ticketSerializer(row) {
  return {
    id: row.id, title: row.title, description: row.description, category: row.category,
    priority: row.priority, status: row.status,
    author: userReference(row.created_by, row.creator_name),
    assignedTo: userReference(row.assigned_to, row.assignee_name),
    equipment: row.equipment_id == null ? null : {
      id: row.equipment_id, name: row.equipment_name, assetTag: row.equipment_asset_tag
    },
    createdAt: row.created_at, updatedAt: row.updated_at,
    firstResponseAt: row.first_response_at, startedAt: row.work_started_at,
    completedAt: row.resolved_at, closedAt: row.closed_at
  };
}

function ticketDetailSerializer({ ticket, comments, history, attachments }) {
  return {
    ...ticketSerializer(ticket),
    comments: comments.map(row => ({
      id: row.id, body: row.body, author: userReference(row.user_id, row.author_name),
      createdAt: row.created_at
    })),
    history: history.map(row => ({
      id: row.id, eventType: row.event_type, details: row.details,
      author: userReference(row.user_id, row.author_name), createdAt: row.created_at
    })),
    attachments: attachments.map(row => ({
      id: row.id, originalName: String(row.original_name).split(/[\\/]/).pop(),
      mimeType: row.mime_type, sizeBytes: row.size_bytes, createdAt: row.created_at
    }))
  };
}

module.exports = { ticketSerializer, ticketDetailSerializer };
