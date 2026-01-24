# AutoBell Mobile & Web Fixes and Improvements

This document outlines the tasks to fix performance issues, resolve login problems for specific users, and improve the professional appearance of the Mobile App.

## 1. Mobile App Login Fixes
**Issue:** User `digitapbs@gmail.com` (School Admin/Customer) cannot log in or experiences issues, while `muddasirh@gmail.com` (Super Admin) works fine.
**Root Cause Analysis:** Likely related to `AuthContext` not handling users without `school_id` correctly, or RLS policies preventing the fetch of `school_id` for non-super-admins.
**Tasks:**
- [ ] **Update `mobile-app/src/context/AuthContext.tsx`**:
  - Add better error logging in `fetchSchoolId`.
  - Ensure `fetchSchoolId` handles the case where `data` is null (user exists in Auth but not in `public.users` or RLS blocks it).
  - **CRITICAL:** Verify RLS policies on `public.users` allow users to read their OWN `school_id`.
- [ ] **Update `mobile-app/src/screens/LoginScreen.tsx`**:
  - Show specific error messages if login fails.
  - If login succeeds but `school_id` is missing, show a specific alert ("No School Assigned").

## 2. Performance Optimization (Both Apps)
**Issue:** Apps are "too slow" and "unable to refresh" after a while.
**Root Cause Analysis:** Likely due to unoptimized data fetching, lack of caching, or blocking UI threads.
**Tasks:**
- [ ] **Mobile App (`mobile-app/src/screens/DashboardScreen.tsx`)**:
  - Optimize `fetchDashboardData` to run independent queries in parallel using `Promise.all`.
  - Implement a simple in-memory cache or use `react-query` (if available/installed) to avoid fetching if data is fresh (e.g., < 1 minute old).
  - Ensure `refreshing` state is ALWAYS set to false in `finally` block (already present, but verify logic flow).
  - Add a timeout to Supabase calls to prevent infinite hanging.
- [ ] **Web Dashboard (`web-dashboard/src`)**:
  - Check `QueryProvider` configuration. Ensure `staleTime` is set to a reasonable value (e.g., 30 seconds) to prevent over-fetching on window focus.
  - Optimize `Overview.tsx` to use parallel queries.

## 3. UI/UX Improvements (Mobile App)
**Issue:** Mobile app needs logos and pictures to look professional.
**Tasks:**
- [ ] **Add Logo**:
  - Add an AutoBell logo (or a placeholder professional bell icon) to the Login Screen and Dashboard Header.
  - Use `lucide-react-native` icons with larger sizes and brand colors (#2563EB - Blue) for a polished look.
- [ ] **Styling**:
  - Improve `DashboardScreen` cards with better shadows, padding, and maybe a gradient or header image.
  - Add a "Welcome, [School Name]" header if available.

## 4. Implementation Steps
1.  **Apply Mobile Auth Fixes** first to ensure `digitapbs@gmail.com` can access the app.
2.  **Apply Performance Fixes** to `DashboardScreen` (Mobile) and `Overview` (Web).
3.  **Enhance UI** on Mobile.
4.  **Build & Test** (locally or via EAS Update).
