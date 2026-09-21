-- Household data is private. Only narrowly scoped RPCs are exposed to guests.
begin;
create schema wedding_private;
revoke all on schema wedding_private from public;
grant usage on schema wedding_private to anon, authenticated;
create table public.wedding_households (
  id uuid primary key default gen_random_uuid(),
  label text not null check (length(label) between 1 and 160),
  guest_type text not null check (guest_type in ('day', 'evening', 'weddingParty'))
);
create table public.wedding_guests (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.wedding_households on delete cascade,
  name text not null check (length(name) between 1 and 160)
);
create table public.wedding_invitations (
  code_hash text primary key check (length(code_hash) = 64),
  household_id uuid not null references public.wedding_households on delete cascade,
  expires_at timestamptz not null default '2027-07-26T00:00:00Z',
  revoked_at timestamptz
);
create table public.wedding_memberships (
  user_id uuid primary key references auth.users on delete cascade,
  household_id uuid not null references public.wedding_households on delete cascade,
  created_at timestamptz not null default now()
);
create index on public.wedding_guests(household_id);
create index on public.wedding_memberships(household_id);
create index on public.wedding_invitations(household_id);
alter table public.wedding_households enable row level security;
alter table public.wedding_guests enable row level security;
alter table public.wedding_invitations enable row level security;
alter table public.wedding_memberships enable row level security;
revoke all on public.wedding_households, public.wedding_guests, public.wedding_invitations, public.wedding_memberships from anon, authenticated;

-- Codes contain 128 random bits. Never seed short/shared production passwords.
create function wedding_private.lookup_invitation(invitation_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare found_household uuid; result jsonb; code text;
begin
  code := upper(regexp_replace(invitation_code, '[[:space:]-]', '', 'g'));
  if code is null or length(code) <> 32 or code !~ '^[0-9A-F]+$' then
    raise exception 'INVITATION_INVALID';
  end if;
  select i.household_id into found_household from public.wedding_invitations i
  where i.code_hash = encode(sha256(convert_to(code, 'UTF8')), 'hex')
    and i.revoked_at is null and i.expires_at > now();
  if found_household is null then raise exception 'INVITATION_INVALID'; end if;
  select jsonb_build_object('label', h.label, 'guest_type', h.guest_type,
    'guests', coalesce((select jsonb_agg(jsonb_build_object('name', g.name) order by g.name)
       from public.wedding_guests g where g.household_id = h.id), '[]'::jsonb))
  into result from public.wedding_households h where h.id = found_household;
  return result;
end $$;

create function wedding_private.claim_invitation(invitation_code text) returns void
language plpgsql security definer set search_path = '' as $$
declare target_household uuid; existing_household uuid; current_user_id uuid := auth.uid();
begin
  if current_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists (select 1 from auth.users u where u.id = current_user_id and u.email_confirmed_at is not null) then
    raise exception 'EMAIL_CONFIRMATION_REQUIRED';
  end if;
  perform wedding_private.lookup_invitation(invitation_code);
  select i.household_id into target_household from public.wedding_invitations i
    where i.code_hash = encode(sha256(convert_to(upper(regexp_replace(invitation_code, '[[:space:]-]', '', 'g')), 'UTF8')), 'hex')
      and i.revoked_at is null and i.expires_at > now();
  if target_household is null then raise exception 'INVITATION_INVALID'; end if;
  insert into public.wedding_memberships(user_id, household_id) values (current_user_id, target_household)
    on conflict (user_id) do nothing;
  select m.household_id into existing_household from public.wedding_memberships m where m.user_id = current_user_id;
  if existing_household <> target_household then raise exception 'ALREADY_LINKED'; end if;
end $$;

create function wedding_private.guest_home() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('label', h.label, 'guest_type', h.guest_type,
    'display_name', coalesce(nullif(left(btrim(u.raw_user_meta_data->>'full_name'), 100), ''), 'guest'),
    'guests', coalesce((select jsonb_agg(jsonb_build_object('name', g.name) order by g.name)
      from public.wedding_guests g where g.household_id = h.id), '[]'::jsonb))
  from public.wedding_memberships m
    join public.wedding_households h on h.id = m.household_id
    join auth.users u on u.id = m.user_id
  where m.user_id = auth.uid() and u.email_confirmed_at is not null;
$$;
-- Explicit grants: the anonymous lookup is a bearer-code capability. It reveals
-- only the named household before signup, never a searchable guest directory.
revoke all on function wedding_private.lookup_invitation(text), wedding_private.claim_invitation(text), wedding_private.guest_home() from public;
grant execute on function wedding_private.lookup_invitation(text) to anon, authenticated;
grant execute on function wedding_private.claim_invitation(text), wedding_private.guest_home() to authenticated;

-- Exposed functions have no elevated privileges; private helpers enforce access.
create function public.lookup_invitation(invitation_code text) returns jsonb
language sql security invoker set search_path = '' as $$
  select wedding_private.lookup_invitation(invitation_code);
$$;
create function public.claim_invitation(invitation_code text) returns void
language sql security invoker set search_path = '' as $$
  select wedding_private.claim_invitation(invitation_code);
$$;
create function public.guest_home() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select wedding_private.guest_home();
$$;
revoke all on function public.lookup_invitation(text), public.claim_invitation(text), public.guest_home() from public;
grant execute on function public.lookup_invitation(text) to anon, authenticated;
grant execute on function public.claim_invitation(text), public.guest_home() to authenticated;
commit;
