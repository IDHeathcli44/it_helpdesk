# Security follow-up

Phase 4.1 intentionally keeps the current authentication and authorization behavior. The following items require dedicated implementation, migration and regression testing in a later controlled phase.

## Session configuration

- Require a strong production `SESSION_SECRET`; do not use the development fallback in production.
- Replace the default in-memory session store with a persistent store. If the application runs in multiple processes or instances, the store must be shared.
- Regenerate the session identifier after successful login and other privilege changes to prevent session fixation.
- Define a session revocation strategy for disabled users, role changes, password resets and administrative sign-out.
- Review cookie lifetime and `secure`, `sameSite`, domain and proxy settings for the production deployment.

## Request protection

- Add CSRF protection to state-changing form and JSON endpoints without breaking the existing EJS forms.
- Add rate limiting and abuse monitoring to login and public registration.
- Decide whether public self-registration remains an intended production feature.

## Upload security

- Validate file content instead of trusting the client-provided MIME type.
- Enforce an allowlist for both content type and stored extension.
- Serve ticket attachments through an authorization-aware download endpoint instead of unrestricted static hosting.
- Add malware scanning, retention limits and storage isolation appropriate to the deployment.

## Credentials

- Remove documented/default production credentials from the deployment workflow.
- Provision the first administrator through a controlled setup procedure or deployment secret.
- Keep forced password change behavior until the replacement provisioning flow is tested.
