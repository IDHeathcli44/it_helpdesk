# IT HelpDesk architecture

## Current architecture

IT HelpDesk is currently a single Node.js process and a single deployable server-rendered application.

### Runtime bootstrap

`src/server.js` is the process entry point. It initializes SQLite before loading the Express application, creates the HTTP server, attaches Socket.IO, shares the Express session middleware with Socket.IO, registers user and staff rooms, and starts listening on `PORT` or port 3000.

`src/app.js` configures Express, EJS, request body parsing, static assets, ticket uploads, sessions, view locals, the forced-password-change guard, route modules, error handling and the HTML 404 response. The public `GET /api/health` route is mounted before the password-change guard and does not require authentication.

### HTTP application

- `src/modules` owns the backend vertical modules: `auth`, `users`, `tickets`, `equipment`, `notifications` and `reports`.
- Each module separates HTTP routes, request/response controllers, application services and SQLite repositories. Controllers do not import the database.
- `src/routes`, `src/controllers` and `src/services` are compatibility facades over the modules. They preserve the pre-Phase 4.2 import paths while new code uses `src/modules` directly.
- `src/middleware` contains shared role/authentication guards and Multer configuration for ticket images.
- `src/utils` contains the shared session-backed flash-message helper.
- `src/api/routes` currently contains the public health endpoint. Notification JSON endpoints remain at their existing URLs through the notifications module.

The enforced dependency direction is:

```text
route -> controller -> service -> repository -> SQLite
```

Cross-module behavior is called through services. For example, the tickets service asks the notifications service to deliver ticket events; it does not write notification rows itself.

### Access recovery workflow

The public `GET/POST /forgot-password` flow returns the same response whether or not a username exists. A valid active account receives one open `Відновлення доступу` ticket in the shared staff queue; repeated submissions reuse that ticket. Every active administrator and IT specialist receives a notification. `POST /tickets/:id/accept` uses a conditional database update so only the first staff member can claim an unassigned ticket.

The assigned staff member may set a temporary password only from that accepted, in-progress access-recovery ticket. Normal ticket editing cannot reassign access-recovery tickets. Setting the temporary password and completing the ticket happen in one database transaction, so the ticket is a one-time capability and a later legitimate request creates a new ticket. The password value is never written to ticket history or notifications. `must_change_password` is refreshed from the database on every request, so both new logins and already-open sessions are forced to choose a new password without re-entering the temporary one. Voluntary password changes still require the current password.

### Equipment inventory import

The equipment module accepts `.xlsx`, `.xls` and `.csv` inventory files through an in-memory, size-limited upload. The downloadable Excel template documents the supported Ukrainian columns and type/status codes. Import validates every row, rejects ambiguous user identities instead of assigning equipment arbitrarily, skips duplicates or invalid rows with a visible error summary, and keeps the existing manual equipment form available.

### Interface preferences

Theme and language controls are available on public authentication screens and in the signed-in header. Ukrainian is the default language; English translations cover the HTML interface and system messages. `helpdeskLanguage` is an allowlisted, year-long cookie read by `src/middleware/preferences.js`. It selects an explicit EJS translation helper and an escaped JSON catalog for client messages. Switching language reloads the current URL. User names, equipment names, ticket subjects, descriptions and comments are kept in their original language; stored form values and API v1 schemas remain unchanged. Existing Excel/CSV export columns and import templates remain unchanged.

`public/js/preferences.js` applies the saved `helpdeskTheme` before the stylesheet paints, using the OS preference when there is no explicit choice. Theme changes persist in a cookie and local storage, with cookie fallback when storage is blocked. CSS semantic color variables provide light and dark palettes, including forms, notifications and authentication screens. `public/locales/en-*.json` contains the English catalogs and `public/js/translation.js` shares interpolation logic between server and browser.

`test/preferences.test.js` verifies both languages against a temporary database, preserves user content and stored option values, checks invalid preferences and login errors, and exercises theme/language persistence and notification translation.

### Persistence

`src/config/database.js` owns the `node:sqlite` `DatabaseSync` connection. It enables foreign keys and WAL mode and provides an idempotent `initializeDatabase()` function for the current schema, indexes, additive legacy columns and initial local accounts.

Database selection is centralized through `HELPDESK_ENV` and `HELPDESK_DB_PATH`. Only the backend may access a database.

### Database environments

**DEFAULT / LEGACY**

- Environment: `HELPDESK_ENV` unset or `default`.
- Database: `data/helpdesk.db`.
- Commands: `npm start` or `npm run start:local`.
- This is the preserved local production-like reference database. Development seed data is forbidden in this mode.

**DEVELOPMENT**

- Environment: `development`, selected automatically by the development scripts.
- Database: `data/helpdesk-dev.db`.
- Commands: `npm run start:dev` or `npm run dev` for watch mode.
- `npm run db:dev:init` initializes and seeds the development database without starting the HTTP server.
- Normal development startup initializes the schema and applies the idempotent development seed before listening.

Development-only credentials:

| Role | Username | Password |
| --- | --- | --- |
| Administrator | `dev-admin` | `DevAdmin123!` |
| IT specialist | `dev-it` | `DevIt123!` |
| User 1 | `dev-user1` | `DevUser123!` |
| User 2 | `dev-user2` | `DevUser123!` |

These accounts and their data are strictly for development and must never be used as production credentials.

**TEST**

- Environment: `HELPDESK_ENV=test`.
- Database: a unique file under the operating system's temporary directory.
- Tests must provide `HELPDESK_DB_PATH`; startup fails if it is missing or targets either persistent database.
- The test closes SQLite and removes its entire temporary directory when finished.

`data/helpdesk.db`, `data/helpdesk-dev.db`, any test database, and SQLite WAL/SHM files are ignored by Git. `data/.gitkeep` keeps the directory in a fresh clone. Development and test databases contain disposable non-production data and must not be committed.

The current data model includes users, tickets, comments, ticket history, ticket attachments, equipment and notifications. Module repositories now contain runtime SQL. There is not yet a versioned migration system.

### Additional business roles

Permissions are centralized in `src/config/permissions.js` and enforced on both
web and API routes; hiding UI controls is not the access-control boundary.

| Role | Tickets | Equipment and inventory | Ticket reports | Users |
| --- | --- | --- | --- | --- |
| accounting (Бухгалтерія) | Create/read/comment own | Manage, import, export | Denied | Denied |
| procurement (Забезпечення) | Create/read/comment own | Manage, import, export | Denied | Denied |
| director (Дирекція) | Read all | Read and export | Read and export | Read only |

Director cannot create tickets, comment, change assignments/statuses, reset other
users' passwords or mutate inventory/users. Personal password changes, logout
and marking their own notifications read remain available. Inventory balances
mean existing equipment with status `reserve`, not a separate consumables ledger.
`GET /equipment/export.xlsx` exports inventory using the current list filters;
the export uses import-compatible column headers and type/status codes.

Existing SQLite role constraints are updated on startup by
`src/config/migrations/userRoles.js`. Before rebuilding an old users table in a
non-test environment, a consistent `*.before-roles-<UUID>.db` backup is created
next to the database. The transaction preserves user IDs, password hashes, extra
columns, indexes/triggers and foreign-key links; failures roll back. New or
already updated databases do not need rebuilding. Tests use disposable databases
and do not migrate either persistent database.

### Server-rendered frontend

- `views` contains EJS pages grouped by authentication, administration, tickets, equipment, reports and errors.
- `views/partials` contains the shared document head, navigation, flash output and footer.
- `public/css` contains the current visual design.
- `public/js` contains browser behavior for navigation, ticket attachment selection, notification UI, sound, Socket.IO and the 30-second notification polling fallback.

There is no separate frontend build or framework. Existing URLs and EJS rendering remain part of the supported application during the transition.

### Realtime notifications

Socket.IO authenticates connections through the same server-side session used by Express. Each connection joins `user:<id>`; IT and administrator connections also join role and staff rooms.

Notification records are written to SQLite by `notificationService`. The service then emits `notification:new` to the target user's room. New tickets and requester comments notify active staff; staff comments and ticket changes notify the ticket owner. The browser refreshes notification state through the JSON endpoints and retains polling as a fallback when realtime delivery is unavailable.

## Target architecture

The intended long-term dependency direction is:

```text
frontend
   |
   v
REST API + Socket.IO
   |
   v
backend
   |
   v
PostgreSQL
```

This is a gradual migration, not a big-bang rewrite. The legacy EJS application will remain operational while backend modules and versioned API contracts are introduced. Pages can then move to the frontend one vertical slice at a time, with the existing URLs preserved or proxied. SQLite remains the active database until a separately planned, tested and reversible PostgreSQL migration phase.

Phase 4.2 modularizes the backend inside the existing process. It does not introduce PostgreSQL, Prisma, a frontend framework, new URL contracts, schema changes or changes to roles and session-based authorization. EJS controllers and the future REST API are expected to share these application services.
