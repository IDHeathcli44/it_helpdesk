const { userReference } = require('./userSerializer');

function equipmentSerializer(row) {
  return {
    id: row.id, assetTag: row.asset_tag, type: row.type, name: row.name,
    manufacturer: row.manufacturer, model: row.model, serialNumber: row.serial_number,
    ipAddress: row.ip_address, macAddress: row.mac_address,
    operatingSystem: row.operating_system, cpu: row.cpu, ramGb: row.ram_gb,
    storage: row.storage, department: row.department, office: row.office,
    assignedUser: userReference(row.assigned_user_id, row.assigned_user_name),
    status: row.status, notes: row.notes, createdAt: row.created_at, updatedAt: row.updated_at
  };
}

function equipmentDetailSerializer({ item, tickets }) {
  return {
    ...equipmentSerializer(item),
    tickets: tickets.map(row => ({
      id: row.id, title: row.title, status: row.status,
      priority: row.priority, createdAt: row.created_at
    }))
  };
}

module.exports = { equipmentSerializer, equipmentDetailSerializer };
