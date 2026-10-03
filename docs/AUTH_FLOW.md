# Sign-in, step tokens and admin account management

How a login finishes, which tokens exist, and how admin-created accounts are
activated. Code: `services/login-flow.service.js`, `services/activation.service.js`,
`utils/token-scope.js`, `middlewares/auth.middleware.js`,
`controllers/auth.controller.js`, `controllers/mfa.controller.js`,
`controllers/admin.controller.js`.

## One pipeline, every way in

Whichever way someone proves who they are — password, authenticator/email/backup
code (MFA), the emailed new-IP code, Google or Apple — the same steps run before
a session is issued:

```
password (or MFA code, or verified Google/Apple identity)
   │
   ├─ 1. account locked?        status suspended/inactive or isActive:false  → 403 ACCOUNT_SUSPENDED / ACCOUNT_INACTIVE
   ├─ 2. second factor          admins: TOTP, else emailed code            → { mfaRequired, mfaSessionToken }
   ├─ 3. must change password?  requirePasswordChange                       → { requirePasswordChange, token }
   ├─ 4. new IP for admin?      role admin/super_admin, IP not in knownIps  → { requireIpVerification, ipSessionToken }
   └─ 5. issue session          record IP, lastLogin, access + refresh token
```

Password login runs 1–5; finishing MFA re-enters at 1 then 3–5; finishing the
new-IP code and OAuth call the same helpers. Google/Apple **refuse admin-level
accounts** (`403 OAUTH_NOT_ALLOWED_FOR_STAFF`) so OAuth can never bypass steps 2–4,
and they never link to a staff account by email.

Every attempt writes a `LoginAudit` row (`reason`, `method`, `ip`, `userAgent`),
shown in the admin login audit.

## Tokens

| Token | Issued by | Valid for | Claim |
|---|---|---|---|
| access | login / MFA / verify-ip / OAuth | the API | `userId`, `iss`, `aud` |
| refresh | same | `POST /auth/refresh` only | `type: 'refresh'` |
| password-change (10 min) | login, MFA | `POST /auth/change-password` only | `purpose: 'password-change'` |
| new-IP session (5 min) | login, MFA | `POST /auth/verify-ip` only | `purpose: 'ip-verification'` |
| MFA session (5 min) | login | `POST /auth/mfa/verify-login`, `/mfa/send-login-otp` | `purpose: 'mfa-step-up'` |

All are signed with the same secret, so **`authenticate()` rejects any token that
carries `purpose` or `type`** unless the route opts in
(`authenticate(roles, { allowPurposes: [...] })` / `requireAuthAllowing(...)`), and
a step token never satisfies a route that requires a role. The websocket handshake
and `optionalAuth` apply the same rule. (Before this, the step tokens worked as
full bearer tokens, which let anyone holding only a correct password skip MFA,
the new-IP check and the forced password change.)

Setting `JWT_MFA_SECRET` to a value different from `JWT_SECRET` is still a sensible
second layer for the MFA session token, but is no longer what keeps it from being
used as an access token.

Changing a password, or an admin setting someone's password or suspending them,
sets `tokenValidAfter`, which revokes every earlier token including step tokens.

## New-IP verification

Admins (`admin`, `super_admin`, including accounts that hold that role among
several) signing in from an address not in `knownIps` get a 6-digit code by email
and an `ipSessionToken`. At most **5 wrong guesses** are allowed per code, after
which the code is burned (`429`) and they must sign in again; comparison is
constant-time. A verified IP is remembered (last 20); the last 10 sign-in IPs are
kept in `loginIps`.

## Admin-created accounts

`POST /admin/users` creates the account with `isAdminProvisioned`,
`requirePasswordChange`, `emailVerified:false`, `createdBy`, and emails a
single-use 24-hour activation link (`FRONTEND_URL/activate?token=…`; only the
sha256 is stored). The response says whether the email was accepted
(`activationEmailSent`). Confirming the email does not gate sign-in; the person
signs in with the temporary password and is sent to choose their own.

- `POST /auth/activate { token }` — confirm the email.
- `POST /auth/resend-activation { email }` — public; the answer is identical for
  unknown, active and pending addresses, one email per account per 60 s.
- `POST /admin/users/:id/resend-activation` — admin / super admin; `409` if already
  activated, `429` with `retryAfterSeconds` during the cool-down.

An admin who sets someone's password in `PATCH /admin/users/:id` makes them
change it at next sign-in and ends their sessions.

## Status changes

`status` (`active` / `inactive` / `suspended`) really locks an account:
`isActive` mirrors it, sessions are revoked immediately, and login, MFA, new-IP,
OAuth, refresh, the websocket and every authenticated route refuse it.
Guards: nobody can change their own role or deactivate themselves; only a super
admin can modify admin-level accounts; email/phone collisions are `409`.

`POST /admin/users/bulk-status { userIds (1–100), action: suspend | unsuspend |
activate | deactivate }` applies those same checks per account and returns
`{ updated, skipped: [{ id, reason }] }` (`self`, `admin_account`, `not_found`,
`already_<status>`).

`GET /admin/users` accepts `status`, `role`, `search`, and returns real field names
plus `lastLoginIp`, `knownIps`, `knownIpCount`, `ipVerificationPending`,
`activationPending` — never secrets or token hashes.

## Configuration

| Variable | Used for |
|---|---|
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | access / step tokens, refresh tokens |
| `JWT_MFA_SECRET` | optional separate secret for the MFA session token |
| `FRONTEND_URL` | the activation link |
| `GOOGLE_CLIENT_ID` (+ `google-auth-library`, now a declared dependency) | Google sign-in |
| `APPLE_CLIENT_ID` | Apple sign-in |
| `SENDGRID_API_KEY` or `EMAIL_USER`/`EMAIL_PASSWORD` | activation and new-IP emails |

## Tests

```bash
npx jest tests/security/token-scope.test.js    # step/refresh tokens, locked accounts (unit)
npx jest tests/security/login-gates.test.js    # login, MFA, new-IP, password change, OAuth (in-memory MongoDB)
npx jest tests/security/admin-users.test.js    # list/create/activate/resend/status/bulk
```

The whole suite passes (`npx jest --runInBand`). Tokens carry a millisecond-precision
`iat` so that a token issued just after a revoke (password change, suspension) is
never mistaken for an older one.
