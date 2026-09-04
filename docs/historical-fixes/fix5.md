You are an expert full-stack engineer and database architect working on the AutoBell system. Your job is to **analyze the existing codebase and database**, then **fix all issues** described below. Apply the instructions carefully and consistently across the entire app.

---

## 1. Absolutely Separate Super Admin vs School Admin Logins

- Treat **Super Admin** and **School Admin** as **completely separate identities and sessions**.
- Never reuse or mix authentication state, cookies, tokens, or local/session storage between them.
- Never log in as one role in one tab and another role in a different tab using the same stored session.
- Do **not** implement any "switch account" that silently reuses the same underlying auth/session.
- If there is any ambiguity about role → force explicit logout and fresh login.

### Required checks and fixes

- Review the **authentication flow** (backend and frontend):
  - Identify where tokens/sessions are created, stored, and validated.
  - Ensure user records and roles explicitly distinguish **Super Admin** vs **School Admin**.
  - Ensure role is always derived from a secure backend claim (e.g., DB/user record, JWT claim), not from frontend flags.
- Frontend:
  - Use **separate storage keys** for auth data if both roles can ever exist on the same browser, or simply enforce **one role per browser session**.
  - After login, **clear all role-related caches** (Redux, Zustand, Vuex, etc.) before setting the current user state.
  - On logout, **fully clear** auth tokens, role flags, and cached API data.
- Backend:
  - Use role-based authorization everywhere; routes and queries must verify:
    - Super Admin: can access **cross-school/global** data.
    - School Admin: restricted to **their own school** and associated resources.
  - Do not infer role from “which endpoint was used to log in”; always check DB/claims.

### Testing rules

- Test scenarios:
  - Log in as Super Admin → verify all screens and data show super admin context only.
  - Logout, then log in as School Admin → verify only that school’s data is visible.
  - Try logging in with two roles in different tabs → ensure **no cross contamination** of sessions or cached data.
- Never use the same browser session with mixed logins, even for testing or debugging.

> **Non‑negotiable rule:** Next time, **never mix logins** of different roles in one browser/session, even for testing or correction purposes.

---

## 2. Fix Super Admin Inventory: Assigned/Unassigned Devices Across All Schools

Problem: Super Admin inventory view shows:

> “Super Admin diagnostics: no devices or inventory records found. If you expect devices, verify migrations and that your super admin role is configured for this account.”

Your task is to ensure that a valid Super Admin can see **all devices across all schools**, clearly separated into **Assigned** and **Unassigned**.

### Data model expectations (adjust to actual schema)

- There should be:
  - A **devices** (or similar) table with each device’s unique identifier and status.
  - A **school** (or similar) table.
  - A **relationship** that indicates when a device is assigned to a school and/or user (e.g., `school_id` on device or a join table).
- For Super Admin:
  - Query must **not** filter by a single school.
  - Query must include **all devices**, with a clear way to distinguish assigned vs unassigned.

### Backend fixes

1. Locate the code that serves the **Super Admin inventory API** (devices list).
2. Ensure the query:
   - Uses Super Admin role verification.
   - Selects devices across **all schools**.
   - Computes or returns fields like:
     - `assigned` (boolean)
     - `assigned_to_school` (school name/id if assigned)
3. If the current API returns “no devices” incorrectly:
   - Check DB migrations to confirm devices and inventory tables exist and are populated.
   - Fix any incorrect `WHERE` clauses that filter by a single school or by the current user’s school.
   - Fix joins that may be turning the query into an inner join that drops unassigned devices. Use **LEFT JOIN** if needed.
4. Update any diagnostics message:
   - Only show “no devices or inventory records found” when the **actual query** returns zero rows.
   - Log detailed internal errors (for developers) when a query fails, but do **not** expose stack traces or raw SQL to users.

### Frontend fixes

1. Locate the **Super Admin inventory UI**.
2. Ensure it:
   - Calls the correct Super Admin inventory endpoint.
   - Does **not** filter by a single school unless explicitly chosen in the UI.
   - Renders:
     - **Assigned devices**: devices tied to a school/user.
     - **Unassigned devices**: devices with no school/user link.
3. Implement clear tabs or filters:
   - “All Devices”
   - “Assigned”
   - “Unassigned”
4. Show meaningful empty states:
   - If there truly are 0 total devices, show a clear message that no devices exist in the system.
   - If there are devices but no unassigned ones, explain that all devices are currently assigned.

---

## 3. Diagnose and Fix Database Issues

Your responsibility is to **actively search for and fix** database-level problems that break or confuse Super Admin / School Admin behavior, especially around devices and inventory.

### Required analysis

- Inspect schema:
  - Check tables related to users, roles, schools, devices, inventory, assignments.
  - Confirm foreign keys, indexes, and constraints are consistent with the intended domain model.
- Inspect queries:
  - Search for all queries involving super admin inventory, device listing, and school-device relationships.
  - Look for:
    - Hard-coded school filters applied even for Super Admin.
    - Missing joins or incorrect join conditions.
    - Queries that silently fail and are caught but not surfaced properly.
- Inspect migrations:
  - Ensure latest migrations have been applied.
  - Confirm that production and development schemas match expectations.
  - Fix any inconsistent/missing columns that would cause null results or failed joins.

### Fixes to implement

- Correct any SQL or ORM queries that:
  - Filter out devices globally for Super Admin.
  - Use the wrong role/tenant context.
  - Use inner joins that inadvertently drop rows (convert to left joins where appropriate).
- Add or adjust indexes for frequently queried fields (e.g., `school_id`, `device_id`, `status`) to maintain good performance.
- Standardize how roles are stored and checked in the database (e.g., `role` column or role mapping table).
- Ensure that device assignment logic:
  - Updates both assignment tables and device status fields consistently.
  - Does not leave orphan records or dangling foreign keys.

---

## 4. Diagnose and Fix Frontend Issues

Your job is to **review the existing frontend code** (especially around auth and inventory) and fix anything that can cause:
- Role confusion (Super Admin vs School Admin).
- Incorrect or missing data on the Super Admin inventory page.

### Frontend analysis

- Locate:
  - Super Admin login and dashboard components.
  - School Admin login and dashboard components.
  - Shared auth utilities (token handling, role storage).
  - Inventory / devices components.
- Check for:
  - Shared global state that incorrectly persists when switching users.
  - Role detection based on fragile conditions (e.g. string checks on URLs) instead of secure backend data.
  - Caching or memoization that doesn’t invalidate when user or role changes.
  - Hard-coded filters that restrict data to a single school even when Super Admin is logged in.

### Frontend fixes

- Auth handling:
  - On login:
    - Clear all prior user state, cached data, and role flags.
    - Store role in a **single source of truth** (e.g., auth store) derived from the backend.
  - On logout:
    - Remove tokens, user info, and any persisted role caches (localStorage, sessionStorage, cookies).
  - Prevent the UI from rendering stale role or inventory data after role changes.
- Inventory UI:
  - Ensure the Super Admin screens use the correct API endpoints.
  - Validate that filters and pagination work across all schools.
  - Ensure error states differentiate between:
    - “No data” (0 devices in DB).
    - “Cannot load data” (API error).
    - “Unauthorized” (role issue).

---

## 5. Safety and Testing Requirements

- Do **not** introduce any debug paths that mix roles in the same browser/session.
- Add or update tests to cover:
  - Super Admin vs School Admin login flows.
  - Super Admin device and inventory listing across schools.
  - Assigned vs unassigned device display.
  - Behavior when there truly are zero devices.
- Manually test all critical flows:
  - Super Admin login → inventory across schools.
  - School Admin login → inventory limited to their school.
  - Logout and re-login with the other role.

If you find any additional database or frontend issues while analyzing the app, **fix them consistently**, always respecting:

- Strict separation of roles and sessions.
- Correct, complete inventory visibility for Super Admin across all schools.
- Clear, honest error states and diagnostics for users.

