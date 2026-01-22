# Fix Analysis - Iteration 1

## Problem Description
User reports:
- "Whole project" rechecked.
- "Modules are showing" (UI is visible).
- "None of the feature or button is working".
- "No response on any button".

## Identified Issues

1.  **Emergency Stop Button (Critical)**:
    - In `DashboardLayout.tsx`, the "EMERGENCY STOP" button exists but has **NO `onClick` handler**. It does absolutely nothing when clicked.
    
2.  **Mobile Navigation (Critical)**:
    - Both `DashboardLayout.tsx` and `SuperAdminLayout.tsx` hide the sidebar on mobile (`hidden md:flex`) but **do not provide a mobile hamburger menu**.
    - On mobile devices, users cannot navigate between pages.

3.  **Super Admin Routing**:
    - The root path `/` redirects to `/dashboard`.
    - `DashboardLayout` works for Super Admins but shows empty data in `Overview` because `schoolId` is null.
    - Super Admins should be redirected to `/super-admin`.

4.  **Form Interactions**:
    - If form inputs in `SchoolManagement` are not working, it might be an overlay issue, but fixing the above critical UI bugs is the priority.

## Action Plan

1.  **Fix `DashboardLayout.tsx`**:
    - Add `onClick` handler to Emergency Stop button (trigger a confirmation modal or alert).
    - Add Mobile Navigation (Hamburger menu).

2.  **Fix `SuperAdminLayout.tsx`**:
    - Add Mobile Navigation.

3.  **Fix Routing**:
    - Update `App.tsx` to redirect `/` based on role (Super Admin -> `/super-admin`, others -> `/dashboard`).

4.  **Verify**:
    - Ensure buttons respond.
    - Ensure navigation works on all screen sizes.
