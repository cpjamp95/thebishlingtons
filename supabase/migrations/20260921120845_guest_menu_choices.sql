create table public.wedding_meal_choices (
  guest_id uuid primary key references public.wedding_guests(id) on delete cascade,
  starter_choice text not null check (length(starter_choice) between 1 and 80),
  main_choice text not null check (length(main_choice) between 1 and 80),
  dessert_choice text not null check (length(dessert_choice) between 1 and 80),
  updated_by uuid not null references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now()
);

alter table public.wedding_meal_choices enable row level security;
revoke all on public.wedding_meal_choices from anon, authenticated;

create function wedding_private.menu_choices() returns jsonb
language sql stable security definer set search_path = '' as $$
  with current_household as (
    select m.household_id
    from public.wedding_memberships m
    join auth.users u on u.id = m.user_id
    where m.user_id = auth.uid()
      and u.email_confirmed_at is not null
    limit 1
  )
  select jsonb_build_object(
    'guests',
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', g.id,
          'name', g.name,
          'starter', c.starter_choice,
          'main', c.main_choice,
          'dessert', c.dessert_choice,
          'updated_at', c.updated_at
        )
        order by g.name, g.id
      ),
      '[]'::jsonb
    )
  )
  from public.wedding_guests g
  join current_household h on h.household_id = g.household_id
  left join public.wedding_meal_choices c on c.guest_id = g.id;
$$;

create function wedding_private.save_menu_choices(
  target_guest_id uuid,
  starter_choice text,
  main_choice text,
  dessert_choice text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  current_user_id uuid := auth.uid();
  current_household uuid;
  result jsonb;
begin
  if current_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select m.household_id
  into current_household
  from public.wedding_memberships m
  join auth.users u on u.id = m.user_id
  where m.user_id = current_user_id
    and u.email_confirmed_at is not null
  limit 1;

  if current_household is null then
    raise exception 'HOUSEHOLD_REQUIRED';
  end if;

  if not exists (
    select 1
    from public.wedding_guests g
    where g.id = target_guest_id
      and g.household_id = current_household
  ) then
    raise exception 'GUEST_ACCESS_DENIED';
  end if;

  if starter_choice is null or starter_choice <> all (
    array[
      'butternut-squash-soup',
      'seared-scallops',
      'chicken-liver-parfait'
    ]::text[]
  ) then
    raise exception 'MENU_CHOICE_INVALID';
  end if;

  if main_choice is null or main_choice <> all (
    array[
      'wild-mushroom-risotto',
      'roasted-sea-bass',
      'slow-braised-beef-cheek'
    ]::text[]
  ) then
    raise exception 'MENU_CHOICE_INVALID';
  end if;

  if dessert_choice is null or dessert_choice <> all (
    array[
      'chocolate-fondant',
      'summer-berry-panna-cotta'
    ]::text[]
  ) then
    raise exception 'MENU_CHOICE_INVALID';
  end if;

  insert into public.wedding_meal_choices (
    guest_id,
    starter_choice,
    main_choice,
    dessert_choice,
    updated_by,
    updated_at
  )
  values (
    target_guest_id,
    starter_choice,
    main_choice,
    dessert_choice,
    current_user_id,
    now()
  )
  on conflict (guest_id) do update
  set starter_choice = excluded.starter_choice,
      main_choice = excluded.main_choice,
      dessert_choice = excluded.dessert_choice,
      updated_by = current_user_id,
      updated_at = now();

  select jsonb_build_object(
    'id', g.id,
    'name', g.name,
    'starter', c.starter_choice,
    'main', c.main_choice,
    'dessert', c.dessert_choice,
    'updated_at', c.updated_at
  )
  into result
  from public.wedding_guests g
  join public.wedding_meal_choices c on c.guest_id = g.id
  where g.id = target_guest_id;

  return result;
end;
$$;

revoke all on function wedding_private.menu_choices() from public;
revoke all on function wedding_private.save_menu_choices(uuid, text, text, text) from public;
grant execute on function wedding_private.menu_choices() to authenticated;
grant execute on function wedding_private.save_menu_choices(uuid, text, text, text) to authenticated;

create function public.menu_choices() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select wedding_private.menu_choices();
$$;

create function public.save_menu_choices(
  target_guest_id uuid,
  starter_choice text,
  main_choice text,
  dessert_choice text
) returns jsonb
language sql security invoker set search_path = '' as $$
  select wedding_private.save_menu_choices(
    target_guest_id,
    starter_choice,
    main_choice,
    dessert_choice
  );
$$;

revoke all on function public.menu_choices() from public;
revoke all on function public.save_menu_choices(uuid, text, text, text) from public;
grant execute on function public.menu_choices() to authenticated;
grant execute on function public.save_menu_choices(uuid, text, text, text) to authenticated;
