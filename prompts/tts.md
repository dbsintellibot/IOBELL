# Feature: Managed TTS/Voice Note Access

## Objective
Implement a permission-controlled Text-to-Speech (TTS) / Voice Note feature.
- **Super Admin**: Can enable/disable TTS access for specific users via the User Management dashboard.
- **Users**: Can only access/use TTS features on Web and Mobile if authorized.
- **Security**: Ensure enforcement of permissions (UI + Backend).

## Implementation Steps

### 1. Database Schema Changes
**File:** `supabase/migrations/YYYYMMDD000000_add_tts_permission.sql`

1.  **Add `tts_enabled` column to `users` table:**
    ```sql
    ALTER TABLE public.users 
    ADD COLUMN IF NOT EXISTS tts_enabled boolean DEFAULT false;
    ```

2.  **Security (RLS):**
    - Ensure `super_admin` can UPDATE this column.
    - Ensure `users` can READ their own `tts_enabled` status.

### 2. Backend Logic (RPC)
**File:** `supabase/migrations/YYYYMMDD000000_add_tts_permission.sql` (same file)

Create a Secure RPC `toggle_user_tts`:
- **Inputs:** `target_user_id` (UUID), `enabled` (boolean).
- **Logic:**
  1.  Check if executing user is `super_admin`. If not, raise exception 'Access Denied'.
  2.  Update `public.users` setting `tts_enabled = enabled` where `id = target_user_id`.

### 3. Super Admin Dashboard (Web)
**File:** `web-dashboard/src/pages/super-admin/UserManagement.tsx`

1.  **Update Data Fetching:**
    - Include `tts_enabled` in the `users` query.
2.  **UI Updates:**
    - Add a "Voice/TTS" column to the user table.
    - Add a Switch/Toggle component for each user.
    - Connect the toggle to the `toggle_user_tts` RPC.
    - Add optimistic UI updates or invalidation to reflect changes immediately.

### 4. Client-Side Permission Check (Web & Mobile)

#### Web Dashboard
**Files:** 
- `web-dashboard/src/context/AuthContext.tsx`
- `web-dashboard/src/pages/AudioManager.tsx` (or relevant pages)

1.  **Auth Context:**
    - Fetch `tts_enabled` from `users` table on load.
    - Expose `ttsEnabled` in context.
2.  **UI Enforcement:**
    - In TTS interfaces, check `useAuth().ttsEnabled`.
    - If false, hide the "Generate Audio" button or show a "Contact Admin to Enable" tooltip.

#### Mobile App
**Files:**
- `mobile-app/src/context/AuthContext.tsx`
- `mobile-app/src/screens/AudioManagerScreen.tsx`

1.  **Auth Context:**
    - Fetch `tts_enabled` and expose it.
2.  **UI Enforcement:**
    - Conditionally render TTS controls based on the flag.

### 5. Secure Backend Generation (Edge Function) - *Recommended*
Currently, `tts.ts` might be using client-side keys. To strictly enforce "run for only those who are authorized", we should move the generation logic to the backend.

1.  **Create Edge Function `generate-speech`:**
    - **Logic:**
        1.  Verify User Auth.
        2.  **Check Permission:** `SELECT tts_enabled FROM public.users WHERE id = auth.uid()`.
        3.  If `false`, return 403 Forbidden.
        4.  If `true`, call OpenAI/Camb.ai API.
    - **Return:** Audio binary.

2.  **Refactor Client `tts.ts`:**
    - Instead of calling OpenAI directly, call `supabase.functions.invoke('generate-speech', { body: { text, ... } })`.

## Task Checklist
- [ ] Create Migration: Add `tts_enabled` and `toggle_user_tts` RPC.
- [ ] Update Super Admin Web UI to toggle permission.
- [ ] Update Web `AuthContext` and TTS UI.
- [ ] Update Mobile `AuthContext` and TTS UI.
- [ ] (Optional) Implement Edge Function for strict enforcement.
