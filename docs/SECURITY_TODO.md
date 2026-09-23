# Security follow-up

The application now includes several baseline safeguards added during the Phase 4 review. The remaining items require dedicated implementation, migration and regression testing before a production rollout.

## Session configuration

- Require a strong production `SESSION_SECRET`; do not use the development fallback in production.
- Replace the default in-memory session store with a persistent store. If the application runs in multiple processes or instances, the store must be shared.
- Define an administrative sign-out/revoke-all-sessions workflow if production operations require it.
- Review cookie lifetime, domain and proxy settings for the production deployment. `httpOnly` and `sameSite=lax` are enabled; `secure` is controlled by `SESSION_COOKIE_SECURE=true`.

Implemented baseline safeguards:

- Successful login and registration regenerate the session identifier.
- Every authenticated HTTP request refreshes the user role, active state and forced-password-change state from the database. Disabled or deleted users lose access on their next request.
- Password resets immediately force already-open user sessions into the password-change flow.

## Request protection

- Add CSRF protection to state-changing form and JSON endpoints without breaking the existing EJS forms.
- Add rate limiting and abuse monitoring to login, public registration and forgot-password requests.
- Decide whether public self-registration remains an intended production feature.

## Upload security

- Validate file content instead of trusting the client-provided MIME type.
- Serve ticket attachments through an authorization-aware download endpoint instead of unrestricted static hosting.
- Add malware scanning, retention limits and storage isolation appropriate to the deployment.

Stored ticket filenames now use an extension selected from the allowed MIME-type map, rather than the client-provided extension. File-signature validation is still required.

## Credentials

- Remove documented/default production credentials from the deployment workflow.
- Provision the first administrator through a controlled setup procedure or deployment secret.
- Keep forced password change behavior until the replacement provisioning flow is tested.
