create function wedding_private.profile_summary() returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_household uuid;
  display_name text;
  household_label text;
  guest_type text;
  result jsonb;
begin
  if current_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select
    m.household_id,
    coalesce(nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''), h.label),
    h.label,
    h.guest_type
  into
    current_household,
    display_name,
    household_label,
    guest_type
  from public.wedding_memberships m
  join auth.users u on u.id = m.user_id
  join public.wedding_households h on h.id = m.household_id
  where m.user_id = current_user_id
    and u.email_confirmed_at is not null
  limit 1;

  if current_household is null then
    raise exception 'HOUSEHOLD_REQUIRED';
  end if;

  select jsonb_build_object(
    'display_name', display_name,
    'household_label', household_label,
    'guest_type', guest_type,
    'guests',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', g.id,
            'name', g.name,
            'starter', c.starter_choice,
            'main', c.main_choice,
            'dessert', c.dessert_choice,
            'menu_complete',
              c.starter_choice is not null
              and c.main_choice is not null
              and c.dessert_choice is not null
          )
          order by g.name, g.id
        )
        from public.wedding_guests g
        left join public.wedding_meal_choices c on c.guest_id = g.id
        where g.household_id = current_household
      ),
      '[]'::jsonb
    ),
    'tasks',
    jsonb_build_object(
      'meals_complete',
        not exists (
          select 1
          from public.wedding_guests g
          left join public.wedding_meal_choices c on c.guest_id = g.id
          where g.household_id = current_household
            and (
              c.guest_id is null
              or c.starter_choice is null
              or c.main_choice is null
              or c.dessert_choice is null
            )
        ),
      'meal_guests_remaining',
        (
          select count(*)::int
          from public.wedding_guests g
          left join public.wedding_meal_choices c on c.guest_id = g.id
          where g.household_id = current_household
            and (
              c.guest_id is null
              or c.starter_choice is null
              or c.main_choice is null
              or c.dessert_choice is null
            )
        ),
      'message_complete',
        exists (
          select 1
          from public.wedding_guest_messages m
          where m.user_id = current_user_id
        ),
      'suggestion_complete',
        exists (
          select 1
          from public.wedding_honeymoon_suggestions s
          where s.user_id = current_user_id
        )
    )
  )
  into result;

  return result;
end;
$$;

revoke all on function wedding_private.profile_summary() from public;
grant execute on function wedding_private.profile_summary() to authenticated;

create function public.profile_summary() returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select wedding_private.profile_summary();
$$;

revoke all on function public.profile_summary() from public;
grant execute on function public.profile_summary() to authenticated;
