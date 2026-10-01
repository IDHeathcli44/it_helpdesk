# API v1 — Phase 4.3A

Base URL: `/api/v1`. This phase exposes nine read-only GET endpoints. No POST,
PUT, PATCH or DELETE handlers are provided. Express also supports HEAD for GET
routes. Unsupported methods return the same JSON 404 as unknown endpoints.
The machine-readable contract is in [openapi.yaml](openapi.yaml).

## Authentication and access

Use the existing Express session cookie (`connect.sid`) obtained through the
legacy `/login` form. There is no new login endpoint, JWT, OAuth or CORS setup.
Requests use the same origin and existing session lifetime. User roles and active
status are refreshed from the database on each request.
API responses use `Cache-Control: no-store`.

| Resource | Anonymous | user | it | admin | accounting / procurement | director |
| --- | --- | --- | --- | --- | --- | --- |
| Session | 401 | own session | own session | own session | own session | own session |
| Tickets list/detail | 401 | own tickets | all tickets | all tickets | own tickets | all tickets |
| Equipment list/detail | 401 | 403 | allowed | allowed | allowed | allowed |
| Notifications | 401 | own feed | own feed | own feed | own feed | own feed |
| Users list/detail | 401 | 403 | 403 | allowed | 403 | allowed |
| Reports summary | 401 | 403 | allowed | allowed | 403 | allowed |

Equipment linked-ticket lists and ticket counts also respect ticket ownership:
accounting and procurement never receive other users' tickets through equipment.

An existing ticket belonging to another ordinary user returns **403**; a missing
ticket returns 404. This follows the existing ticket service and reveals whether
an ID exists. Role checks for equipment/users prevent access to those resources.
Users required to change their password can read `/session`, but receive 403
`PASSWORD_CHANGE_REQUIRED` for other known resources. Complete the existing
`/change-password` flow first. Legacy web redirects are unchanged.

## Envelopes and errors

Object: `{ "data": { ... } }`.
List: `{ "data": [ ... ], "meta": { ... } }`.
Errors: `{ "error": { "code": "FORBIDDEN", "message": "Access denied" } }`.

| HTTP | Code | Meaning |
| --- | --- | --- |
| 400 | INVALID_ID | ID must be a positive safe integer |
| 400 | INVALID_JSON | Malformed JSON request body |
| 401 | UNAUTHENTICATED | No session |
| 403 | FORBIDDEN | Role or ticket ownership denied |
| 403 | PASSWORD_CHANGE_REQUIRED | Complete password change |
| 404 | NOT_FOUND | Missing resource or endpoint |
| 413 | PAYLOAD_TOO_LARGE | Request exceeds existing parser limit |
| 500 | INTERNAL_ERROR | Unexpected failure; details withheld |

An authenticated unknown endpoint returns exactly:
`{ "error": { "code": "NOT_FOUND", "message": "Endpoint not found" } }`.
Anonymous requests, including unknown paths, require authentication (401).
Parser errors occur before authentication and return 400/413. Authenticated
requests with a malformed resource ID return 400 before resource role checks.

## Endpoints and query parameters

- `GET /session`: `{ data: { user: { id, username, fullName, role, mustChangePassword } } }`.
- `GET /tickets`: list of ticket objects; `meta: { count, limit: 100 }`.
  Filters: `search` (trimmed title/description substring), `status`
  (`new`, `in_progress`, `waiting`, `done`, `closed`), `priority`
  (`low`, `normal`, `high`, `critical`), `assigned` (`me`, `unassigned`,
  or a positive safe integer staff user ID). Filters combine with AND and never
  widen ownership scope. They apply before the existing 100-ticket limit.
  Order follows the dashboard: status rank, then updated time descending.
- `GET /tickets/{id}`: ticket plus `comments`, `history`, `attachments`.
  Tickets contain `id`, `title`, `description`, `category`, `priority`, `status`,
  `author`, `assignedTo`, `equipment`, `createdAt`, `updatedAt`,
  `firstResponseAt`, `startedAt`, `completedAt`, `closedAt`.
  User references are `{ id, fullName }` or null. Equipment references are
  `{ id, name, assetTag }` or null. Comments include author/body/time; history
  includes author/eventType/details/time. Attachment metadata contains only
  `id`, `originalName` (basename), `mimeType`, `sizeBytes`, `createdAt`.
  Stored names, local paths and download URLs are excluded.
- `GET /equipment`: filters `search`, `type`, `status`; `meta: { count }`.
  Search matches name, asset tag, serial number, IP or assigned user's name.
  Equipment types/statuses use the existing module dictionaries (see OpenAPI).
  List order is active first, then type and name. No pagination.
- `GET /equipment/{id}`: equipment with `assignedUser: { id, fullName } | null`
  and `tickets: [{ id, title, status, priority, createdAt }]`.
- `GET /notifications`: current user's latest 20 notifications, newest first;
  `meta: { unreadCount }` counts **all** unread notifications, not just this page.
  Reading does not mark anything read. Items contain `id`, `type`, `title`,
  `message`, `link`, `isRead` (boolean), `createdAt`.
- `GET /users`: admin/director list; `meta: { count }`. No pagination.
- `GET /users/{id}`: public administrative profile fields: `id`, `username`,
  `fullName`, `nickname`, `email`, `phone`, `department`, `office`, `position`,
  `role`, `isActive`, `createdAt`. No password hashes or password-reset fields.
- `GET /reports/summary`: `period=7|30|90|365|all` (default `30`). Returns
  `period`, `summary`, `byStatus`, `byCategory`, `byAssignee`, `daily`.
  Summary counts total/completed/open and average response/resolution minutes.
  Categories are the existing top ten. Daily series retains the service's
  **last 14 calendar dates** independently of `period`; completed counts are
  grouped by ticket creation date, not completion date.

Unknown query parameters are ignored. Invalid enum filters are ignored;
invalid report periods become `30`. Search preserves SQLite LIKE wildcard
semantics (`%`, `_`) and uses bound parameters. `meta.count` is the number
returned, not a global total. Timestamps retain existing service strings
(typically SQLite UTC `YYYY-MM-DD HH:mm:ss`); missing milestones are null.
API property names use camelCase and explicit allowlists, not raw database rows.

## Examples

Log in with a local development account through `/login`, then use the cookie:

```sh
curl -b cookies.txt http://localhost:3000/api/v1/session
curl -b cookies.txt 'http://localhost:3000/api/v1/tickets?status=new&priority=high'
curl -b cookies.txt http://localhost:3000/api/v1/tickets/1
curl -b cookies.txt 'http://localhost:3000/api/v1/equipment?type=computer&status=active'
curl -b cookies.txt http://localhost:3000/api/v1/notifications
curl -b cookies.txt http://localhost:3000/api/v1/users
curl -b cookies.txt 'http://localhost:3000/api/v1/reports/summary?period=30'
```

Example session response:

```json
{"data":{"user":{"id":1,"username":"example-user","fullName":"Example User","role":"user","mustChangePassword":false}}}
```

Example empty notification feed:

```json
{"data":[],"meta":{"unreadCount":0}}
```

Example missing resource:

```json
{"error":{"code":"NOT_FOUND","message":"Ticket not found"}}
```

## Architecture, compatibility and verification

`src/api/v1/apiRouter.js` → API controllers → existing module services →
repositories → SQLite. Serializers whitelist and map response fields.
Ticket list filtering is implemented in the existing service/repository;
web dashboard behavior with no filters remains the same. The API mounts after
session middleware and before flash/web password redirects. Its error handler
also catches upstream parser errors; API failures never render EJS.

`GET /api/health`, legacy notification GET/read/read-all endpoints, EJS pages,
Excel import/template, report CSV/XLSX exports and Socket.IO are unchanged.
The web equipment export is `GET /equipment/export.xlsx` and accepts the same
`search`, `type`, and `status` filters as the equipment list. It is available to
all roles with equipment-view permission, including director. Report export
remains `/reports/export.xlsx`. There is no legacy GET `/tickets` list route;
the dashboard is `/`. GET `/tickets` continues to return its existing 404.

Run `npm run check` for syntax, isolated database integration tests and legacy
regressions. All automated database work uses a newly created OS temporary
database with `HELPDESK_ENV=test`. Manual development uses `npm run start:dev`
and `data/helpdesk-dev.db`. Never initialize, seed or test against legacy
`data/helpdesk.db`.

Phase 4.3B should add mutation endpoints together with CSRF protection, request
validation, session/security hardening and corresponding negative access tests.
Pagination, stricter filter validation and consistent ISO timestamps can be
introduced as explicit future contract changes. Existing MemoryStore and
session storage remains unchanged; current roles are reloaded per request.
