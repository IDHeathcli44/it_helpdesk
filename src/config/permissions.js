const { ROLES } = require('./constants');

const ROLE_LABELS = Object.freeze({
  user: 'Користувач', it: 'IT-спеціаліст', admin: 'Адміністратор',
  accounting: 'Бухгалтерія', procurement: 'Забезпечення', director: 'Дирекція'
});
const RULES = Object.freeze({
  viewAllTickets: [ROLES.IT, ROLES.ADMIN, ROLES.DIRECTOR],
  createTickets: [ROLES.USER, ROLES.IT, ROLES.ADMIN, ROLES.ACCOUNTING, ROLES.PROCUREMENT],
  commentTickets: [ROLES.USER, ROLES.IT, ROLES.ADMIN, ROLES.ACCOUNTING, ROLES.PROCUREMENT],
  manageTickets: [ROLES.IT, ROLES.ADMIN],
  viewEquipment: [ROLES.IT, ROLES.ADMIN, ROLES.ACCOUNTING, ROLES.PROCUREMENT, ROLES.DIRECTOR],
  manageEquipment: [ROLES.IT, ROLES.ADMIN, ROLES.ACCOUNTING, ROLES.PROCUREMENT],
  viewReports: [ROLES.IT, ROLES.ADMIN, ROLES.DIRECTOR],
  viewUsers: [ROLES.ADMIN, ROLES.DIRECTOR],
  manageUsers: [ROLES.ADMIN]
});
function can(user, permission) {
  return RULES[permission]?.includes(user?.role) || false;
}
function permissionsFor(user) {
  return Object.fromEntries(Object.keys(RULES).map(permission => [permission, can(user, permission)]));
}
module.exports = { ROLE_LABELS, can, permissionsFor };
