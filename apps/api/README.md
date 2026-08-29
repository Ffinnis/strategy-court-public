# Strategy Court API

## Authentication and audit provenance

Better Auth is mounted at `/api/auth/*`. Every case, version, run, replay, report, and custom indicator route resolves the signed-in user from the session cookie and applies owner-scoped PostgreSQL queries. Built-in indicators and health remain public.

Requests default to the `user` audit actor. Browser-agent calls may send `X-Actor: agent`; this is client-declared provenance, not identity or authorization. The session user remains the authority.

The API ignores `X-Actor: system`. Only server-owned lifecycle code writes `system` audit events, such as Court completion, failure, or recovery after a restart.
