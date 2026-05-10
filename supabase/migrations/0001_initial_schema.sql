-- ============================================================================
-- Je Gjobe - Initial schema
-- A appliquer dans Supabase Dashboard > SQL Editor > New query > Run
-- ============================================================================

-- Extensions
create extension if not exists "uuid-ossp";

-- ============================================================================
-- 1. PROFILES (1 ligne par utilisateur, lié a auth.users)
-- ============================================================================
create table public.profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  telegram_id         bigint unique,
  name                text,
  email               text,
  job_title           text,
  bio                 text,
  skills              text[] default '{}',
  location_preference text,
  availability        text,
  profile_picture_url text,
  is_created          boolean not null default false,
  completed_missions  integer not null default 0,
  -- Premium : ecrit UNIQUEMENT par le bot Railway via service_role
  is_premium          boolean not null default false,
  premium_until       timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index profiles_telegram_id_idx on public.profiles(telegram_id);

-- ============================================================================
-- 2. JOBS (missions postees)
-- ============================================================================
create type job_status as enum ('open', 'in_progress', 'completed', 'cancelled');

create table public.jobs (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  title         text not null,
  description   text,
  category      text not null,
  city          text,
  address       text,
  -- Prix toujours stocke en EUR base, conversion XOF/USD/GBP a l'affichage
  price_eur     numeric(10,2) not null check (price_eur >= 0),
  availability  text,
  status        job_status not null default 'open',
  lat           double precision,
  lng           double precision,
  tags          text[] default '{}',
  photos        text[] default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index jobs_category_idx on public.jobs(category);
create index jobs_city_idx     on public.jobs(city);
create index jobs_status_idx   on public.jobs(status);
create index jobs_created_idx  on public.jobs(created_at desc);

-- ============================================================================
-- 3. APPLICATIONS (candidatures)
-- ============================================================================
create type application_status as enum ('pending', 'accepted', 'rejected', 'withdrawn');

create table public.applications (
  id            uuid primary key default uuid_generate_v4(),
  job_id        uuid not null references public.jobs(id) on delete cascade,
  applicant_id  uuid not null references public.profiles(id) on delete cascade,
  message       text,
  status        application_status not null default 'pending',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (job_id, applicant_id)
);

create index applications_job_idx       on public.applications(job_id);
create index applications_applicant_idx on public.applications(applicant_id);

-- ============================================================================
-- 4. REVIEWS (avis post-mission)
-- ============================================================================
create table public.reviews (
  id            uuid primary key default uuid_generate_v4(),
  job_id        uuid not null references public.jobs(id) on delete cascade,
  reviewer_id   uuid not null references public.profiles(id) on delete cascade,
  reviewee_id   uuid not null references public.profiles(id) on delete cascade,
  rating        smallint not null check (rating between 1 and 5),
  comment       text,
  created_at    timestamptz not null default now(),
  unique (job_id, reviewer_id),
  check (reviewer_id <> reviewee_id)
);

create index reviews_reviewee_idx on public.reviews(reviewee_id);
create index reviews_job_idx      on public.reviews(job_id);

-- ============================================================================
-- 5. NOTIFICATIONS
-- ============================================================================
create table public.notifications (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  type        text not null,  -- 'application' | 'message' | 'review' | 'job_update' | 'premium' | 'system'
  title       text not null,
  body        text,
  link        text,
  related_id  uuid,
  is_read     boolean not null default false,
  created_at  timestamptz not null default now()
);

create index notifications_user_unread_idx on public.notifications(user_id, is_read, created_at desc);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at     before update on public.profiles     for each row execute function public.set_updated_at();
create trigger jobs_set_updated_at         before update on public.jobs         for each row execute function public.set_updated_at();
create trigger applications_set_updated_at before update on public.applications for each row execute function public.set_updated_at();

-- Empeche un user de modifier ses propres champs Premium
-- (le bot Railway utilise service_role qui bypass RLS et donc ce trigger via session_user)
create or replace function public.protect_premium_columns()
returns trigger language plpgsql security definer as $$
begin
  -- service_role bypass tout ce qui suit
  if (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role' then
    return new;
  end if;
  -- sinon, on force la conservation des valeurs Premium existantes
  new.is_premium    = old.is_premium;
  new.premium_until = old.premium_until;
  return new;
end;
$$;

create trigger profiles_protect_premium
  before update on public.profiles
  for each row execute function public.protect_premium_columns();

-- Auto-creation d'un profil a la creation d'un user auth
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, telegram_id, name)
  values (
    new.id,
    (new.raw_user_meta_data ->> 'telegram_id')::bigint,
    new.raw_user_meta_data ->> 'name'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

alter table public.profiles      enable row level security;
alter table public.jobs          enable row level security;
alter table public.applications  enable row level security;
alter table public.reviews       enable row level security;
alter table public.notifications enable row level security;

-- ---------- profiles ----------
-- Tout le monde peut lire les profils (marketplace publique)
create policy "profiles_select_all"
  on public.profiles for select
  using (true);

-- Un user peut update SON profil (les colonnes Premium sont protegees par trigger)
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- INSERT n'est pas expose : passe par le trigger handle_new_user

-- ---------- jobs ----------
-- Tout le monde peut voir les jobs ouverts
create policy "jobs_select_open_or_own"
  on public.jobs for select
  using (status = 'open' or user_id = auth.uid());

-- Un user authentifie peut creer un job (en son nom)
create policy "jobs_insert_own"
  on public.jobs for insert
  with check (auth.uid() = user_id);

-- Un user peut modifier/supprimer ses propres jobs
create policy "jobs_update_own"
  on public.jobs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "jobs_delete_own"
  on public.jobs for delete
  using (auth.uid() = user_id);

-- ---------- applications ----------
-- Visibles par le candidat ET le proprietaire du job
create policy "applications_select_own_or_job_owner"
  on public.applications for select
  using (
    auth.uid() = applicant_id
    or auth.uid() = (select user_id from public.jobs where id = job_id)
  );

-- Le candidat cree sa candidature
create policy "applications_insert_self"
  on public.applications for insert
  with check (auth.uid() = applicant_id);

-- Le candidat peut withdraw, le proprietaire du job peut accept/reject
create policy "applications_update_self_or_owner"
  on public.applications for update
  using (
    auth.uid() = applicant_id
    or auth.uid() = (select user_id from public.jobs where id = job_id)
  );

-- ---------- reviews ----------
-- Tout le monde lit les avis
create policy "reviews_select_all"
  on public.reviews for select
  using (true);

-- Un user peut ecrire un avis SUR UN JOB qui le concerne et est completed
create policy "reviews_insert_participant"
  on public.reviews for insert
  with check (
    auth.uid() = reviewer_id
    and exists (
      select 1 from public.jobs j
      left join public.applications a on a.job_id = j.id and a.status = 'accepted'
      where j.id = job_id
        and j.status = 'completed'
        and (j.user_id = auth.uid() or a.applicant_id = auth.uid())
    )
  );

-- ---------- notifications ----------
-- Le destinataire seul lit ses notifs
create policy "notifications_select_own"
  on public.notifications for select
  using (auth.uid() = user_id);

-- Le destinataire peut marquer comme lu
create policy "notifications_update_own"
  on public.notifications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- INSERT : reserve au service_role (bot, edge functions)
-- aucune policy = personne ne peut inserer en RLS = OK
