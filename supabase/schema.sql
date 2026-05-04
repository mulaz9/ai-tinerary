-- ai-tinerary — Supabase schema
-- Run this once in the Supabase SQL editor (Dashboard → SQL → New query).
-- Subsequent runs are idempotent.

create table if not exists public.trips (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists trips_user_updated_idx
  on public.trips (user_id, updated_at desc);

alter table public.trips enable row level security;

drop policy if exists "trips are readable by owner" on public.trips;
create policy "trips are readable by owner"
  on public.trips for select
  using (auth.uid() = user_id);

drop policy if exists "owner can insert" on public.trips;
create policy "owner can insert"
  on public.trips for insert
  with check (auth.uid() = user_id);

drop policy if exists "owner can update" on public.trips;
create policy "owner can update"
  on public.trips for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "owner can delete" on public.trips;
create policy "owner can delete"
  on public.trips for delete
  using (auth.uid() = user_id);

-- Enable realtime so the client hook receives live updates across devices.
alter publication supabase_realtime add table public.trips;

-- ─── Trip sharing via link ──────────────────────────────────────────────────

create table if not exists public.trip_shares (
  id uuid primary key default gen_random_uuid(),
  trip_id text not null references public.trips(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  share_token text not null unique default encode(gen_random_bytes(16), 'hex'),
  permission text not null check (permission in ('read', 'write')),
  created_at timestamptz not null default now()
);

create index if not exists trip_shares_token_idx
  on public.trip_shares (share_token);
create index if not exists trip_shares_trip_idx
  on public.trip_shares (trip_id);

alter table public.trip_shares enable row level security;

-- Owner can manage their own shares
drop policy if exists "owner can read shares" on public.trip_shares;
create policy "owner can read shares"
  on public.trip_shares for select
  using (auth.uid() = owner_id);

drop policy if exists "owner can create shares" on public.trip_shares;
create policy "owner can create shares"
  on public.trip_shares for insert
  with check (auth.uid() = owner_id);

drop policy if exists "owner can delete shares" on public.trip_shares;
create policy "owner can delete shares"
  on public.trip_shares for delete
  using (auth.uid() = owner_id);

-- Any authenticated user can resolve a share token (needed to open shared links)
drop policy if exists "anyone can resolve token" on public.trip_shares;
create policy "anyone can resolve token"
  on public.trip_shares for select
  using (auth.role() = 'authenticated');

-- Allow reading trips that have been shared (via trip_shares)
drop policy if exists "shared trip readable" on public.trips;
create policy "shared trip readable"
  on public.trips for select
  using (
    exists (
      select 1 from public.trip_shares
      where trip_shares.trip_id = trips.id
        and auth.role() = 'authenticated'
    )
  );

-- Allow updating trips with write permission shares
drop policy if exists "shared trip writable" on public.trips;
create policy "shared trip writable"
  on public.trips for update
  using (
    exists (
      select 1 from public.trip_shares
      where trip_shares.trip_id = trips.id
        and trip_shares.permission = 'write'
        and auth.role() = 'authenticated'
    )
  );
