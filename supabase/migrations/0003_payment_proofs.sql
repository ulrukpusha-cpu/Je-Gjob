-- ============================================================================
-- Je Gjobe - Preuves de paiement Wave/Djamo (Phase 4 manuelle admin)
-- A appliquer dans Supabase Dashboard > SQL Editor
-- ============================================================================

create type payment_method as enum ('wave', 'djamo');
create type proof_status  as enum ('pending', 'approved', 'rejected');

create table public.payment_proofs (
  id            uuid primary key default uuid_generate_v4(),
  applicant_id  uuid not null references public.profiles(id) on delete cascade,
  method        payment_method not null,
  image_url     text not null,
  status        proof_status not null default 'pending',
  reject_reason text,
  created_at    timestamptz not null default now(),
  processed_at  timestamptz,
  processed_by  bigint  -- telegram_id de l'admin qui a traite
);

create index payment_proofs_applicant_idx on public.payment_proofs(applicant_id);
create index payment_proofs_status_idx    on public.payment_proofs(status, created_at desc);

-- ============================================================================
-- BUCKET payment-proofs (PRIVE, contrairement aux avatars/job-photos)
-- ============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-proofs', 'payment-proofs', false, 5242880,
  array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- Policies storage : un user upload SOUS {auth.uid()}/, lecture interdite cote
-- public (les admins / service_role lisent via la table payment_proofs.image_url
-- qui est en fait un signed URL genere a la demande).

drop policy if exists "payment_proofs_owner_write"  on storage.objects;
drop policy if exists "payment_proofs_owner_read"   on storage.objects;
drop policy if exists "payment_proofs_owner_delete" on storage.objects;

create policy "payment_proofs_owner_write"
  on storage.objects for insert
  with check (
    bucket_id = 'payment-proofs'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "payment_proofs_owner_read"
  on storage.objects for select
  using (
    bucket_id = 'payment-proofs'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "payment_proofs_owner_delete"
  on storage.objects for delete
  using (
    bucket_id = 'payment-proofs'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ============================================================================
-- RLS sur la table payment_proofs
-- ============================================================================
alter table public.payment_proofs enable row level security;

-- L'user voit ses propres preuves
create policy "payment_proofs_select_own"
  on public.payment_proofs for select
  using (auth.uid() = applicant_id);

-- L'user insere ses propres preuves
create policy "payment_proofs_insert_own"
  on public.payment_proofs for insert
  with check (auth.uid() = applicant_id);

-- UPDATE / DELETE : reserve au service_role (l'admin via le bot Telegram)
-- aucune policy = bloque cote user.

-- ============================================================================
-- TRIGGER : updated_at non utilise ici (status passe via service_role uniquement)
-- ============================================================================
