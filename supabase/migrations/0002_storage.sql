-- ============================================================================
-- Je Gjobe - Storage : avatars + photos d'annonces
-- A appliquer dans Supabase Dashboard > SQL Editor > New query > Run
-- ============================================================================

-- ============================================================================
-- BUCKETS
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars',    'avatars',    true, 2097152,  array['image/jpeg','image/png','image/webp']),  -- 2 Mo
  ('job-photos', 'job-photos', true, 5242880,  array['image/jpeg','image/png','image/webp'])   -- 5 Mo
on conflict (id) do nothing;

-- ============================================================================
-- POLICIES STORAGE
-- ============================================================================
-- Convention : tous les fichiers sont stockés dans un sous-dossier {auth.uid()}/...
-- Ainsi un user ne peut écrire / supprimer que SOUS son propre dossier.
-- La lecture est publique (les buckets sont marqués public).

-- ---------- avatars ----------

drop policy if exists "avatars_public_read"   on storage.objects;
drop policy if exists "avatars_owner_write"   on storage.objects;
drop policy if exists "avatars_owner_update"  on storage.objects;
drop policy if exists "avatars_owner_delete"  on storage.objects;

create policy "avatars_public_read"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "avatars_owner_write"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "avatars_owner_update"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "avatars_owner_delete"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ---------- job-photos ----------

drop policy if exists "job_photos_public_read"  on storage.objects;
drop policy if exists "job_photos_owner_write"  on storage.objects;
drop policy if exists "job_photos_owner_update" on storage.objects;
drop policy if exists "job_photos_owner_delete" on storage.objects;

create policy "job_photos_public_read"
  on storage.objects for select
  using (bucket_id = 'job-photos');

create policy "job_photos_owner_write"
  on storage.objects for insert
  with check (
    bucket_id = 'job-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "job_photos_owner_update"
  on storage.objects for update
  using (
    bucket_id = 'job-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "job_photos_owner_delete"
  on storage.objects for delete
  using (
    bucket_id = 'job-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
