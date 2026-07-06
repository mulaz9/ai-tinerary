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

-- Insert also verifies the user actually owns the trip being shared, so a
-- crafted client can't attach share rows to someone else's trip.
drop policy if exists "owner can create shares" on public.trip_shares;
create policy "owner can create shares"
  on public.trip_shares for insert
  with check (
    auth.uid() = owner_id
    and exists (
      select 1 from public.trips
      where trips.id = trip_shares.trip_id
        and trips.user_id = auth.uid()
    )
  );

drop policy if exists "owner can delete shares" on public.trip_shares;
create policy "owner can delete shares"
  on public.trip_shares for delete
  using (auth.uid() = owner_id);

-- ─── Token-scoped shared access ────────────────────────────────────────────
--
-- Access to shared trips goes exclusively through SECURITY DEFINER functions
-- keyed on the share token. This replaces the old broad policies ("anyone can
-- resolve token", "shared trip readable/writable") that let ANY authenticated
-- user enumerate all share tokens and read/write every shared trip.

drop policy if exists "anyone can resolve token" on public.trip_shares;
drop policy if exists "shared trip readable" on public.trips;
drop policy if exists "shared trip writable" on public.trips;

create or replace function public.resolve_share_token(p_token text)
returns table (trip_id text, permission text)
language sql
security definer
set search_path = public
stable
as $$
  select s.trip_id, s.permission
  from public.trip_shares s
  where s.share_token = p_token;
$$;

create or replace function public.fetch_shared_trip(p_token text)
returns table (id text, data jsonb)
language sql
security definer
set search_path = public
stable
as $$
  select t.id, t.data
  from public.trips t
  join public.trip_shares s on s.trip_id = t.id
  where s.share_token = p_token;
$$;

create or replace function public.fetch_shared_trips(p_tokens text[])
returns table (share_token text, permission text, id text, data jsonb)
language sql
security definer
set search_path = public
stable
as $$
  select s.share_token, s.permission, t.id, t.data
  from public.trip_shares s
  join public.trips t on t.id = s.trip_id
  where s.share_token = any(p_tokens);
$$;

create or replace function public.update_shared_trip(p_token text, p_data jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip_id text;
begin
  select s.trip_id into v_trip_id
  from public.trip_shares s
  where s.share_token = p_token
    and s.permission = 'write';
  if v_trip_id is null then
    return false;
  end if;
  update public.trips
    set data = p_data, updated_at = now()
    where id = v_trip_id;
  return true;
end;
$$;

-- Shared links still require being signed in (same behavior as before).
revoke all on function public.resolve_share_token(text) from public, anon;
revoke all on function public.fetch_shared_trip(text) from public, anon;
revoke all on function public.fetch_shared_trips(text[]) from public, anon;
revoke all on function public.update_shared_trip(text, jsonb) from public, anon;
grant execute on function public.resolve_share_token(text) to authenticated;
grant execute on function public.fetch_shared_trip(text) to authenticated;
grant execute on function public.fetch_shared_trips(text[]) to authenticated;
grant execute on function public.update_shared_trip(text, jsonb) to authenticated;
