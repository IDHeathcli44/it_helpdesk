# IT HelpDesk architecture

## Current architecture

IT HelpDesk is currently a single Node.js process and a single deployable server-rendered application.

### Runtime bootstrap

`src/server.js` is the process entry point. It initializes SQLite before loading the Express application, creates the HTTP server, attaches Socket.IO, shares the Express session middleware with Socket.IO, registers user and staff rooms, and starts listening on `PORT` or port 3000.

`src/app.js` configures Express, EJS, request body parsing, static assets, ticket uploads, sessions, view locals, the forced-password-change guard, route modules, error handling and the HTML 404 response. The public `GET /api/health` route is mounted before the password-change guard and does not require authentication.

### HTTP application

- `src/routes` maps the existing URLs to middleware and controllers.
- `src/controllers` handles request validation, authorization checks, synchronous SQLite queries, redirects, flash messages, EJS rendering and JSON/CSV responses.
- `src/services` contains shared ticket history/duration helpers and notification creation/delivery logic.
- `src/middleware` contains role/authentication guards and Multer configuration for ticket images.
- `src/utils` contains the session-backed flash-message helper.
- `src/api/routes` currently contains the health endpoint. The existing notification JSON endpoints remain mounted through the legacy route module.

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

The current data model includes users, tickets, comments, ticket history, ticket attachments, equipment and notifications. Controllers currently contain most SQL; there is not yet a repository layer or a versioned migration system.

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

Phase 4.1 does not introduce PostgreSQL, Prisma, a frontend framework, new URL contracts or changes to roles and session-based authorization.
