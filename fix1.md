# Fix 1: Core Auth & Basic Dashboard Features

This is the first step in fixing the Web Dashboard. We need to enable `school_id` awareness in the app so that database operations (which are protected by RLS) succeed.

## 1. Update `src/context/AuthContext.tsx`
The app needs to know which school the logged-in user belongs to.
- **Goal**: Fetch `school_id` from the `users` table when a session starts.
- **Changes**:
  - Add `schoolId` to the `AuthContextType` interface.
  - Add `schoolId` state to the `AuthProvider`.
  - Create a `fetchSchoolId(userId)` function that queries `supabase.from('users').select('school_id')`.
  - Call this function inside the `useEffect` whenever a session is found or updates.
  - Expose `schoolId` in the context value.

## 2. Update `src/pages/Overview.tsx`
The overview is currently generic. It needs to show specific school and device details.
- **Goal**: Display School Name and Primary Device info.
- **Changes**:
  - Use `useAuth` to get the `schoolId`.
  - Add a query to fetch the user's school details (or use the user's metadata if the school name is stored there). *Assumption: School Name might need to be fetched from a `schools` table or `users` table if available. If not, just display the `school_id` for now or "My School".*
  - Add a query to fetch the "Online" or "First" device to display its Name, MAC Address, and Location (if available).
  - Update the UI header to show the School Name instead of just "Overview" or generic text.
  - Update the "Active Bells" card or add a section to show the specific details of the main bell.

## 3. Update `src/pages/BellManagement.tsx`
Device registration is failing because it doesn't send the `school_id`.
- **Goal**: Fix "Register New Device".
- **Changes**:
  - Get `schoolId` from `useAuth`.
  - In `registerDeviceMutation`, add `school_id: schoolId` to the object being inserted into `bell_devices`.
  - This ensures the row is associated with the correct school and passes RLS policies.