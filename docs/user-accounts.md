# User accounts — pre-Milestone 6 amendment

Status: implemented on `abrar-dev` following the user's September 4, 2026 request. This amendment replaces the shared configured workspace password with individual email/password accounts before Milestone 6. No deployment.

## Behavior

- The login screen provides **Sign in** and **Create account** options. Registration requires a valid email, a password of 8–128 characters and matching confirmation. Email addresses are trimmed and normalized to lowercase.
- Passwords are hashed server-side with Argon2id and stored only as hashes. Registration signs the new user in. Later sessions use the normalized email and password.
- Projects have one immutable owner. Project lists and every project/request/estimate/offer workspace route are scoped to the signed-in owner. Foreign and unknown resource IDs return the same 404.
- The first account registered after upgrading claims every existing project whose installation predates accounts. A database advisory lock makes concurrent first registrations deterministic. Later accounts begin with no projects and cannot see another account's data.
- Sessions remain sealed in HttpOnly, SameSite=Lax cookies and expire after eight hours. Server-side session rows bind each session to one user. The migration invalidates legacy shared-password sessions because they have no user identity.
- Client intake and offer links remain resource-scoped capabilities. They do not grant access to the owner's workspace or other project records.

The current account feature has no email verification, password reset, project sharing, account deletion or administrator roles. Use an email address the user controls and retain the password securely. The first-registration claim mechanism assumes the operator controls the installation when accounts are enabled.

## Upgrade

Migration `202609040006_user_accounts` creates users, adds project ownership and binds sessions to users without rewriting project content. Existing projects temporarily have no owner until the first successful registration, which assigns them atomically. New projects cannot be created without an owner, and assigned ownership cannot be changed.

After pulling the code, run `npm run db:migrate`, restart ScopeFree, open `/login`, select **Create account**, and register the first account. The old `FREELANCER_PASSWORD_HASH` setting and password-hash helper are no longer used. `SESSION_SECRET` and exact `APP_ORIGIN` remain required.

## Verification

The account amendment passes lint, TypeScript checking, the production build, 68 offline tests, all 51 browser/API integration tests, and the production-restart runtime checks. The integration suite covers registration, normalized email login, logout and revocation, expiry and tampering, origin validation, throttling, cross-account resource hiding, first-account migration behavior, and preservation of existing project content.
