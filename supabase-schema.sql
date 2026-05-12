-- ══════════════════════════════════════════════════════════
-- SCHÉMA SUPABASE — Clôture Impress CRM
-- À exécuter dans : Supabase Dashboard > SQL Editor > New query
-- ══════════════════════════════════════════════════════════

-- 1. TABLE PROFILES (liée aux comptes auth)
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text,
  full_name text not null,
  role text not null default 'vendeur'
    check (role in ('admin', 'directeur', 'vendeur', 'installateur')),
  team_id uuid,
  active boolean default true,
  created_at timestamptz default now()
);

-- 2. TABLE TEAMS
create table public.teams (
  id uuid default gen_random_uuid() primary key,
  nom text not null,
  type text not null check (type in ('ventes', 'installation')),
  chef_id uuid references public.profiles(id),
  notes text,
  created_at timestamptz default now()
);

-- Clé étrangère team_id sur profiles
alter table public.profiles
  add constraint profiles_team_id_fkey
  foreign key (team_id) references public.teams(id);

-- 3. TABLE LEADS
create table public.leads (
  id uuid default gen_random_uuid() primary key,
  source text default 'web'
    check (source in ('web', 'intimura', 'référence', 'publicité', 'autre')),
  prenom text,
  nom text not null,
  telephone text,
  email text,
  adresse text,
  ville text,
  secteur text,
  lat numeric,
  lng numeric,
  type_cloture text,
  statut text default 'nouveau'
    check (statut in ('nouveau','contacté','visite planifiée','soumission envoyée','gagné','perdu','fermé')),
  vendeur_id uuid references public.profiles(id),
  notes text,
  last_update timestamptz default now(),
  created_at timestamptz default now()
);

-- 4. TABLE SOUMISSIONS
create table public.soumissions (
  id uuid default gen_random_uuid() primary key,
  lead_id uuid references public.leads(id) on delete cascade,
  numero text,
  montant numeric default 0,
  statut text default 'brouillon'
    check (statut in ('brouillon','envoyée','acceptée','refusée','expirée')),
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

-- 5. TABLE ÉTAPES TIMELINE
create table public.timeline_steps (
  id uuid default gen_random_uuid() primary key,
  lead_id uuid references public.leads(id) on delete cascade,
  etape text not null,
  ordre integer not null,
  complete boolean default false,
  complete_at timestamptz,
  complete_by uuid references public.profiles(id)
);

-- 6. TABLE ÉVÉNEMENTS CALENDRIER
create table public.calendar_events (
  id uuid default gen_random_uuid() primary key,
  titre text not null,
  type text default 'visite'
    check (type in ('visite','installation','suivi','réunion','autre')),
  lead_id uuid references public.leads(id),
  assignee_id uuid references public.profiles(id),
  date_debut timestamptz not null,
  date_fin timestamptz,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

-- 7. TABLE MEMBRES D'ÉQUIPE
create table public.team_members (
  team_id uuid references public.teams(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete cascade,
  primary key (team_id, profile_id)
);

-- ══ TRIGGER : créer profil automatiquement à l'inscription ══
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'vendeur')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ══ ROW LEVEL SECURITY (RLS) ══
alter table public.profiles enable row level security;
alter table public.leads enable row level security;
alter table public.soumissions enable row level security;
alter table public.timeline_steps enable row level security;
alter table public.calendar_events enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;

-- Profiles: lecture par tous les auth, écriture par admin ou soi-même
create policy "profiles_select" on public.profiles for select
  using (auth.role() = 'authenticated');

create policy "profiles_update_own" on public.profiles for update
  using (auth.uid() = id);

create policy "profiles_admin_all" on public.profiles for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- Leads: tous les auth peuvent lire/créer/modifier
create policy "leads_select" on public.leads for select using (auth.role() = 'authenticated');
create policy "leads_insert" on public.leads for insert with check (auth.role() = 'authenticated');
create policy "leads_update" on public.leads for update using (auth.role() = 'authenticated');
create policy "leads_delete" on public.leads for delete
  using (exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','directeur')));

-- Soumissions
create policy "soum_all" on public.soumissions for all using (auth.role() = 'authenticated');

-- Timeline
create policy "timeline_all" on public.timeline_steps for all using (auth.role() = 'authenticated');

-- Calendrier
create policy "calendar_all" on public.calendar_events for all using (auth.role() = 'authenticated');

-- Teams
create policy "teams_select" on public.teams for select using (auth.role() = 'authenticated');
create policy "teams_manage" on public.teams for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','directeur')));

-- Team members
create policy "team_members_select" on public.team_members for select using (auth.role() = 'authenticated');
create policy "team_members_manage" on public.team_members for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','directeur')));

-- ══ INDEX pour performance ══
create index leads_vendeur_idx on public.leads(vendeur_id);
create index leads_statut_idx on public.leads(statut);
create index leads_last_update_idx on public.leads(last_update);
create index soum_lead_idx on public.soumissions(lead_id);
create index events_date_idx on public.calendar_events(date_debut);
create index timeline_lead_idx on public.timeline_steps(lead_id);
