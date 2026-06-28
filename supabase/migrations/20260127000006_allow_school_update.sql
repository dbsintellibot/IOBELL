-- Allow School Admins to update their own school details
DROP POLICY IF EXISTS "Admins can update their own school" ON "public"."schools";
CREATE POLICY "Admins can update their own school" ON "public"."schools"
FOR UPDATE 
TO public
USING (
  id = get_my_school_id()
);
