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
