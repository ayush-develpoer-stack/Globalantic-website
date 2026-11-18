# User management and roles

Admin portal → **Users & roles** (`/users`). Everything is enforced by the API; the UI only
hides what you can't do.

## Roles

| Role | Portal | Notes |
|---|---|---|
| **Super Admin** | admin | An ADMIN account with the individual `admins.manage` grant. Not a separate role in the database. |
| ADMIN | admin | Every admin permission (users, money rules, CMS, training, HR, audit). Cannot manage other ADMIN accounts unless Super Admin. |
| HR | admin | Employees, leave, projects, HR requests, company announcements, intern exams. Can create **employee** accounts. |
| EDITOR / FINANCE / SALES | admin | Content / payments & finance documents / leads & sales documents. Can receive individual extra permissions. |
| TRAINER | trainer | Only assigned batches and their students. |
| EMPLOYEE | employee | Own profile, attendance, leave, tasks. |
| STUDENT (intern) | intern | Own applications, learning, exams. Interns can also self-register on the training site. |

Partner accounts don't exist yet (no partner portal or partner role in the codebase).

## Who can create which accounts

`POST /api/platform/users` — the API decides from the caller's permissions:

| Caller | May create |
|---|---|
| Super Admin | everything below **plus ADMIN** |
| ADMIN (`users.manage`) | EMPLOYEE, STUDENT (intern), TRAINER, HR, SALES, FINANCE, EDITOR |
| HR (`employees.manage`) | EMPLOYEE |
| `training.students.manage` holder | STUDENT (intern) |
| anyone else | nothing (403) |

`GET /api/platform/roles` returns `creatable` and `assignable` per role for the caller, which the
**Add user** dialog uses.

- Employees get an employee record (department/team, designation, employment type, joining
  date, manager). Other staff roles can optionally get one too.
- Interns get a student profile (institution, qualification, city).
- The admin never sets or sees a password. The new user receives a single-use set-password link
  (valid 24 h). If the email could not be sent (email not configured, or delivery failed), the
  API returns that link once and the dialog shows it so it can be handed over privately.

## Managing accounts

| Action | Endpoint | Rule |
|---|---|---|
| List / search / filter (role, status) | `GET /api/platform/users` | `users.manage` |
| Details, effective permissions, activity | `GET /api/platform/users/:id` | `users.manage` |
| Edit name / phone | `PUT /api/platform/users/:id` | reason required; other ADMINs: Super Admin only |
| Change role | `PATCH /api/platform/users/:id/role` | not yourself; ADMIN role or ADMIN targets: Super Admin only; students are not converted to staff; signs the user out |
| Suspend / reactivate | `PATCH /api/platform/users/:id/status` | not yourself; ADMIN targets: Super Admin only; suspension signs the user out everywhere |
| Send password reset link | `POST /api/platform/users/:id/password-reset` | other ADMINs: Super Admin only |
| Extra permissions | `POST/DELETE /api/platform/users/:id/permissions` | EDITOR/FINANCE/HR/SALES only; access-control permissions can't be granted |

**Super Admin accounts can't be changed through the API by anyone** (no suspend, role change,
edit, reset or revoke). That prevents admins from locking each other out. Every action above is
written to the audit log.

## Making someone a Super Admin

Done from a machine with database access, never from the web UI:

```powershell
cd "$env:USERPROFILE\OneDrive\Desktop\Globalantic"
npm --workspace backend run super-admin -- list
npm --workspace backend run super-admin -- grant owner@yourdomain.com   # must be an existing ADMIN
npm --workspace backend run super-admin -- revoke someone@yourdomain.com
```

The script uses `DATABASE_URL` from `backend/.env`, which is **production** today. It only
inserts or deletes one row in `user_permission_grants` and writes an audit entry. No migration is
needed: the grants table already exists. The change applies on the user's next request.

Until someone is granted Super Admin in production, admins can create every account type
except administrators, and existing admin accounts stay protected exactly as before.

## Temporary administrator accounts

For contractors or short-term help. The account switches itself off after 1–72 hours.

```powershell
cd "$env:USERPROFILE\OneDrive\Desktop\Globalantic"
$env:TEMP_ADMIN_PASSWORD = "<temporary password>"   # min 8 chars, a letter and a number
npm --workspace backend run temp-admin -- grant person@example.com --hours 48 --name "Full Name"
Remove-Item Env:TEMP_ADMIN_PASSWORD

npm --workspace backend run temp-admin -- list                        # who, until when
npm --workspace backend run temp-admin -- grant person@example.com --hours 24   # extend (no password needed)
npm --workspace backend run temp-admin -- revoke person@example.com   # end access now
```

- The account gets the ADMIN role (everything except managing other admins). The password is
  stored only as a bcrypt hash.
- Once the expiry passes, the next login or request suspends the account and signs it out
  everywhere (audited as `user.access_expired`). Reactivating it in the admin portal does not
  bring access back; only `grant` (extend) does.
- The expiry is a marker row in `user_permission_grants` (`account.expires_at:<date>`), so no
  database migration was needed. It can't be set or removed through the website.
- The script refuses to touch permanent accounts. Running `grant` again never creates a duplicate.
- Without a running API nothing is enforced, but the moment anyone uses the account the check
  runs first.
