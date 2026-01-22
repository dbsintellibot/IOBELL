# Fix 2: Advanced Features (Profiles & Audio)

This step fixes the content management sections of the dashboard. These fixes depend on the `school_id` being available from Fix 1.

## 1. Update `src/pages/ProfileEditor.tsx`
Users cannot save profile names or schedules because the database requires `school_id`.
- **Goal**: Enable Saving and Renaming of profiles.
- **Changes**:
  - Get `schoolId` from `useAuth`.
  - In `saveMutation`:
    - When upserting into `bell_profiles`, include `school_id: schoolId`.
    - When inserting into `bell_schedules` (the `itemsToInsert` array), include `school_id: schoolId` in every object.
  - This ensures that profiles and schedules are correctly linked to the user's school.

## 2. Update `src/pages/AudioManager.tsx`
Audio management is broken. Uploads fail due to permissions, and Delete is not implemented.
- **Goal**: Fix Uploads and Implement Deletion.
- **Changes**:
  - **Uploads**:
    - Get `schoolId` from `useAuth`.
    - In `uploadMutation`:
      - **Storage**: Change the upload path from just `fileName` to `${schoolId}/${fileName}`. The storage RLS policy requires files to be in a folder named after the school ID.
      - **Database**: Include `school_id: schoolId` in the `audio_files` insert payload.
  - **Deletion**:
    - Create a new `deleteMutation` using `useMutation`.
    - **Logic**:
      1. Delete the file from Supabase Storage: `supabase.storage.from('audio_files').remove([path])`. *Note: You'll need to store/retrieve the full path (including folder) or reconstruct it.*
      2. Delete the record from the database: `supabase.from('audio_files').delete().eq('id', fileId)`.
    - Attach this mutation to the "Trash"/Delete button in the UI.