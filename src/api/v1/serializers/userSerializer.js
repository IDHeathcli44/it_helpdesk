function userSerializer(row) {
  return {
    id: row.id, username: row.username, fullName: row.full_name,
    nickname: row.nickname, email: row.email, phone: row.phone,
    department: row.department, office: row.office, position: row.position,
    role: row.role, isActive: Boolean(row.is_active), createdAt: row.created_at
  };
}

function sessionSerializer(user) {
  return {
    id: user.id, username: user.username, fullName: user.fullName,
    role: user.role, mustChangePassword: Boolean(user.mustChangePassword)
  };
}

function userReference(id, fullName) {
  return id == null ? null : { id, fullName: fullName ?? null };
}

module.exports = { userSerializer, sessionSerializer, userReference };
