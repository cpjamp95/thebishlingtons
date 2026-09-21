-- Production readiness: per-guest RSVP, dietary/allergy capture,
-- menu versioning, private social photos, owner editing, profile tasks,
-- admin groundwork and supporting indexes.

alter table public.wedding_guests
  add column if not exists attendance_status text
    check (attendance_status is null or attendance_status in ('attending','declined')),
  add column if not exists dietary_requirements text
    check (dietary_requirements is null or length(dietary_requirements) <= 500),
  add column if not exists allergies text
    check (allergies is null or length(allergies) <= 500),
  add column if not exists rsvp_updated_at timestamptz,
  add column if not exists rsvp_updated_by uuid references auth.users(id) on delete set null;

alter table public.wedding_meal_choices
  add column if not exists menu_version integer not null default 1
    check (menu_version > 0);

create index if not exists wedding_guests_rsvp_updated_by_idx
  on public.wedding_guests(rsvp_updated_by);
create index if not exists wedding_meal_choices_updated_by_idx
  on public.wedding_meal_choices(updated_by);
create index if not exists wedding_guest_messages_user_id_idx
  on public.wedding_guest_messages(user_id);
create index if not exists wedding_guest_messages_household_id_idx
  on public.wedding_guest_messages(household_id);
create index if not exists wedding_honeymoon_suggestions_user_id_idx
  on public.wedding_honeymoon_suggestions(user_id);
create index if not exists wedding_honeymoon_suggestions_household_id_idx
  on public.wedding_honeymoon_suggestions(household_id);

create table if not exists public.wedding_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.wedding_admins enable row level security;
revoke all on public.wedding_admins from anon, authenticated;

CREATE OR REPLACE FUNCTION wedding_private.admin_dashboard()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  result jsonb;
begin
  if not wedding_private.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;

  select jsonb_build_object(
    'households',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', h.id,
          'label', h.label,
          'guest_type', h.guest_type,
          'guests', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', g.id,
                'name', g.name,
                'attendance_status', g.attendance_status,
                'dietary_requirements', g.dietary_requirements,
                'allergies', g.allergies,
                'starter', case when c.menu_version = 1 then c.starter_choice end,
                'main', case when c.menu_version = 1 then c.main_choice end,
                'dessert', case when c.menu_version = 1 then c.dessert_choice end
              )
              order by g.name, g.id
            )
            from public.wedding_guests g
            left join public.wedding_meal_choices c on c.guest_id = g.id
            where g.household_id = h.id
          ), '[]'::jsonb)
        )
        order by h.label
      )
      from public.wedding_households h
    ), '[]'::jsonb),
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'author_name', m.author_name, 'message', m.message, 'created_at', m.created_at
      ) order by m.created_at desc)
      from public.wedding_guest_messages m
    ), '[]'::jsonb),
    'suggestions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'author_name', s.author_name, 'destination', s.destination,
        'story', s.story, 'photo_path', s.photo_path, 'created_at', s.created_at
      ) order by s.created_at desc)
      from public.wedding_honeymoon_suggestions s
    ), '[]'::jsonb)
  )
  into result;

  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION wedding_private.delete_guest_message(target_message_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  current_user_id uuid := auth.uid();
  affected integer;
begin
  if current_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  delete from public.wedding_guest_messages
  where id = target_message_id and user_id = current_user_id;
  get diagnostics affected = row_count;
  if affected = 0 then raise exception 'MESSAGE_ACCESS_DENIED'; end if;
  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION wedding_private.delete_honeymoon_suggestion(target_suggestion_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  current_user_id uuid := auth.uid();
  row_data public.wedding_honeymoon_suggestions;
begin
  if current_user_id is null then raise exception 'AUTH_REQUIRED'; end if;

  delete from public.wedding_honeymoon_suggestions
  where id = target_suggestion_id and user_id = current_user_id
  returning * into row_data;

  if row_data.id is null then raise exception 'SUGGESTION_ACCESS_DENIED'; end if;

  return jsonb_build_object('photo_path', row_data.photo_path);
end;
$function$;

CREATE OR REPLACE FUNCTION wedding_private.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select auth.uid() is not null
    and exists (
      select 1 from public.wedding_admins a where a.user_id = auth.uid()
    );
$function$;

CREATE OR REPLACE FUNCTION wedding_private.menu_choices()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with current_household as (
    select m.household_id
    from public.wedding_memberships m
    join auth.users u on u.id = m.user_id
    where m.user_id = auth.uid()
      and u.email_confirmed_at is not null
    limit 1
  )
  select jsonb_build_object(
    'menu_version', 1,
    'guests',
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', g.id,
          'name', g.name,
          'attendance_status', g.attendance_status,
          'starter', case when c.menu_version = 1 then c.starter_choice end,
          'main', case when c.menu_version = 1 then c.main_choice end,
          'dessert', case when c.menu_version = 1 then c.dessert_choice end,
          'updated_at', case when c.menu_version = 1 then c.updated_at end
        )
        order by g.name, g.id
      ),
      '[]'::jsonb
    )
  )
  from public.wedding_guests g
  join current_household h on h.household_id = g.household_id
  left join public.wedding_meal_choices c on c.guest_id = g.id;
$function$;

CREATE OR REPLACE FUNCTION wedding_private.profile_summary()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  current_user_id uuid := auth.uid();
  current_household uuid;
  display_name text;
  household_label text;
  guest_type text;
  result jsonb;
begin
  if current_user_id is null then raise exception 'AUTH_REQUIRED'; end if;

  select
    m.household_id,
    coalesce(nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''), h.label),
    h.label,
    h.guest_type
  into current_household, display_name, household_label, guest_type
  from public.wedding_memberships m
  join auth.users u on u.id = m.user_id
  join public.wedding_households h on h.id = m.household_id
  where m.user_id = current_user_id
    and u.email_confirmed_at is not null
  limit 1;

  if current_household is null then raise exception 'HOUSEHOLD_REQUIRED'; end if;

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
            'attendance_status', g.attendance_status,
            'dietary_requirements', g.dietary_requirements,
            'allergies', g.allergies,
            'starter', case when c.menu_version = 1 then c.starter_choice end,
            'main', case when c.menu_version = 1 then c.main_choice end,
            'dessert', case when c.menu_version = 1 then c.dessert_choice end,
            'menu_complete',
              g.attendance_status = 'attending'
              and c.menu_version = 1
              and c.starter_choice is not null
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
      'rsvp_complete',
        not exists (
          select 1 from public.wedding_guests g
          where g.household_id = current_household
            and g.attendance_status is null
        ),
      'rsvp_guests_remaining',
        (
          select count(*)::int from public.wedding_guests g
          where g.household_id = current_household
            and g.attendance_status is null
        ),
      'meals_complete',
        (
          not exists (
            select 1 from public.wedding_guests g
            where g.household_id = current_household
              and g.attendance_status is null
          )
          and not exists (
            select 1
            from public.wedding_guests g
            left join public.wedding_meal_choices c on c.guest_id = g.id
            where g.household_id = current_household
              and g.attendance_status = 'attending'
              and (
                c.guest_id is null
                or c.menu_version <> 1
                or c.starter_choice is null
                or c.main_choice is null
                or c.dessert_choice is null
              )
          )
        ),
      'meal_guests_remaining',
        (
          select count(*)::int
          from public.wedding_guests g
          left join public.wedding_meal_choices c on c.guest_id = g.id
          where g.household_id = current_household
            and g.attendance_status = 'attending'
            and (
              c.guest_id is null
              or c.menu_version <> 1
              or c.starter_choice is null
              or c.main_choice is null
              or c.dessert_choice is null
            )
        ),
      'message_complete',
        exists (
          select 1 from public.wedding_guest_messages m
          where m.household_id = current_household
        ),
      'suggestion_complete',
        exists (
          select 1 from public.wedding_honeymoon_suggestions s
          where s.household_id = current_household
        )
    )
  )
  into result;

  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION wedding_private.rsvp_details()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  current_user_id uuid := auth.uid();
  current_household uuid;
  result jsonb;
begin
  if current_user_id is null then raise exception 'AUTH_REQUIRED'; end if;

  select m.household_id into current_household
  from public.wedding_memberships m
  join auth.users u on u.id = m.user_id
  where m.user_id = current_user_id
    and u.email_confirmed_at is not null
  limit 1;

  if current_household is null then raise exception 'HOUSEHOLD_REQUIRED'; end if;

  select jsonb_build_object(
    'guests',
    coalesce(jsonb_agg(
      jsonb_build_object(
        'id', g.id,
        'name', g.name,
        'attendance_status', g.attendance_status,
        'dietary_requirements', g.dietary_requirements,
        'allergies', g.allergies,
        'updated_at', g.rsvp_updated_at
      )
      order by g.name, g.id
    ), '[]'::jsonb)
  )
  into result
  from public.wedding_guests g
  where g.household_id = current_household;

  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION wedding_private.save_guest_rsvp(target_guest_id uuid, attendance text, dietary_text text DEFAULT NULL::text, allergies_text text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  current_user_id uuid := auth.uid();
  current_household uuid;
  result jsonb;
begin
  if current_user_id is null then raise exception 'AUTH_REQUIRED'; end if;

  if attendance not in ('attending','declined') then
    raise exception 'RSVP_INVALID';
  end if;

  if dietary_text is not null and length(trim(dietary_text)) > 500 then
    raise exception 'DIETARY_TOO_LONG';
  end if;

  if allergies_text is not null and length(trim(allergies_text)) > 500 then
    raise exception 'ALLERGIES_TOO_LONG';
  end if;

  select m.household_id into current_household
  from public.wedding_memberships m
  join auth.users u on u.id = m.user_id
  where m.user_id = current_user_id
    and u.email_confirmed_at is not null
  limit 1;

  if current_household is null then raise exception 'HOUSEHOLD_REQUIRED'; end if;

  if not exists (
    select 1 from public.wedding_guests g
    where g.id = target_guest_id
      and g.household_id = current_household
  ) then
    raise exception 'GUEST_ACCESS_DENIED';
  end if;

  update public.wedding_guests
  set attendance_status = attendance,
      dietary_requirements =
        case when attendance = 'attending' then nullif(trim(dietary_text), '') else null end,
      allergies =
        case when attendance = 'attending' then nullif(trim(allergies_text), '') else null end,
      rsvp_updated_at = now(),
      rsvp_updated_by = current_user_id
  where id = target_guest_id;

  select jsonb_build_object(
    'id', g.id,
    'name', g.name,
    'attendance_status', g.attendance_status,
    'dietary_requirements', g.dietary_requirements,
    'allergies', g.allergies,
    'updated_at', g.rsvp_updated_at
  )
  into result
  from public.wedding_guests g
  where g.id = target_guest_id;

  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION wedding_private.save_menu_choices(target_guest_id uuid, starter_choice text, main_choice text, dessert_choice text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  current_user_id uuid := auth.uid();
  current_household uuid;
  result jsonb;
begin
  if current_user_id is null then raise exception 'AUTH_REQUIRED'; end if;

  select m.household_id into current_household
  from public.wedding_memberships m
  join auth.users u on u.id = m.user_id
  where m.user_id = current_user_id
    and u.email_confirmed_at is not null
  limit 1;

  if current_household is null then raise exception 'HOUSEHOLD_REQUIRED'; end if;

  if not exists (
    select 1
    from public.wedding_guests g
    where g.id = target_guest_id
      and g.household_id = current_household
      and g.attendance_status = 'attending'
  ) then
    raise exception 'GUEST_NOT_ATTENDING';
  end if;

  if starter_choice is null or starter_choice <> all (
    array['butternut-squash-soup','seared-scallops','chicken-liver-parfait']::text[]
  ) then raise exception 'MENU_CHOICE_INVALID'; end if;

  if main_choice is null or main_choice <> all (
    array['wild-mushroom-risotto','roasted-sea-bass','slow-braised-beef-cheek']::text[]
  ) then raise exception 'MENU_CHOICE_INVALID'; end if;

  if dessert_choice is null or dessert_choice <> all (
    array['chocolate-fondant','summer-berry-panna-cotta']::text[]
  ) then raise exception 'MENU_CHOICE_INVALID'; end if;

  insert into public.wedding_meal_choices (
    guest_id, starter_choice, main_choice, dessert_choice,
    updated_by, updated_at, menu_version
  )
  values (
    target_guest_id, starter_choice, main_choice, dessert_choice,
    current_user_id, now(), 1
  )
  on conflict (guest_id) do update
  set starter_choice = excluded.starter_choice,
      main_choice = excluded.main_choice,
      dessert_choice = excluded.dessert_choice,
      updated_by = current_user_id,
      updated_at = now(),
      menu_version = 1;

  select jsonb_build_object(
    'id', g.id,
    'name', g.name,
    'attendance_status', g.attendance_status,
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
$function$;

CREATE OR REPLACE FUNCTION wedding_private.social_feed()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  current_user_id uuid := auth.uid();
  current_household uuid;
  result jsonb;
begin
  if current_user_id is null then raise exception 'AUTH_REQUIRED'; end if;

  select m.household_id into current_household
  from public.wedding_memberships m
  join auth.users u on u.id = m.user_id
  where m.user_id = current_user_id
    and u.email_confirmed_at is not null
  limit 1;

  if current_household is null then raise exception 'HOUSEHOLD_REQUIRED'; end if;

  select jsonb_build_object(
    'messages',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', m.id,
            'author_name', m.author_name,
            'message', m.message,
            'created_at', m.created_at,
            'is_owner', m.user_id = current_user_id
          )
          order by m.created_at desc
        )
        from (
          select id, user_id, author_name, message, created_at
          from public.wedding_guest_messages
          order by created_at desc
          limit 40
        ) m
      ),
      '[]'::jsonb
    ),
    'suggestions',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', s.id,
            'author_name', s.author_name,
            'destination', s.destination,
            'story', s.story,
            'photo_path', s.photo_path,
            'created_at', s.created_at,
            'is_owner', s.user_id = current_user_id
          )
          order by s.created_at desc
        )
        from (
          select id, user_id, author_name, destination, story, photo_path, created_at
          from public.wedding_honeymoon_suggestions
          order by created_at desc
          limit 40
        ) s
      ),
      '[]'::jsonb
    )
  )
  into result;

  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION wedding_private.update_guest_message(target_message_id uuid, message_text text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  current_user_id uuid := auth.uid();
  row_data public.wedding_guest_messages;
begin
  if current_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if message_text is null or length(trim(message_text)) < 1 or length(trim(message_text)) > 600 then
    raise exception 'MESSAGE_INVALID';
  end if;

  update public.wedding_guest_messages
  set message = trim(message_text)
  where id = target_message_id and user_id = current_user_id
  returning * into row_data;

  if row_data.id is null then raise exception 'MESSAGE_ACCESS_DENIED'; end if;

  return jsonb_build_object(
    'id', row_data.id,
    'author_name', row_data.author_name,
    'message', row_data.message,
    'created_at', row_data.created_at,
    'is_owner', true
  );
end;
$function$;

CREATE OR REPLACE FUNCTION wedding_private.update_honeymoon_suggestion(target_suggestion_id uuid, destination_text text, story_text text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  current_user_id uuid := auth.uid();
  row_data public.wedding_honeymoon_suggestions;
begin
  if current_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if destination_text is null or length(trim(destination_text)) < 1 or length(trim(destination_text)) > 120 then
    raise exception 'DESTINATION_INVALID';
  end if;
  if story_text is null or length(trim(story_text)) < 1 or length(trim(story_text)) > 700 then
    raise exception 'STORY_INVALID';
  end if;

  update public.wedding_honeymoon_suggestions
  set destination = trim(destination_text),
      story = trim(story_text)
  where id = target_suggestion_id and user_id = current_user_id
  returning * into row_data;

  if row_data.id is null then raise exception 'SUGGESTION_ACCESS_DENIED'; end if;

  return jsonb_build_object(
    'id', row_data.id,
    'author_name', row_data.author_name,
    'destination', row_data.destination,
    'story', row_data.story,
    'photo_path', row_data.photo_path,
    'created_at', row_data.created_at,
    'is_owner', true
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_dashboard()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select wedding_private.admin_dashboard();
$function$;

CREATE OR REPLACE FUNCTION public.admin_status()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select wedding_private.is_admin();
$function$;

CREATE OR REPLACE FUNCTION public.delete_guest_message(target_message_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select wedding_private.delete_guest_message(target_message_id);
$function$;

CREATE OR REPLACE FUNCTION public.delete_honeymoon_suggestion(target_suggestion_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select wedding_private.delete_honeymoon_suggestion(target_suggestion_id);
$function$;

CREATE OR REPLACE FUNCTION public.menu_choices()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select wedding_private.menu_choices();
$function$;

CREATE OR REPLACE FUNCTION public.profile_summary()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select wedding_private.profile_summary();
$function$;

CREATE OR REPLACE FUNCTION public.rsvp_details()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select wedding_private.rsvp_details();
$function$;

CREATE OR REPLACE FUNCTION public.save_guest_rsvp(target_guest_id uuid, attendance text, dietary_text text DEFAULT NULL::text, allergies_text text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select wedding_private.save_guest_rsvp(
    target_guest_id, attendance, dietary_text, allergies_text
  );
$function$;

CREATE OR REPLACE FUNCTION public.save_menu_choices(target_guest_id uuid, starter_choice text, main_choice text, dessert_choice text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select wedding_private.save_menu_choices(
    target_guest_id,
    starter_choice,
    main_choice,
    dessert_choice
  );
$function$;

CREATE OR REPLACE FUNCTION public.social_feed()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select wedding_private.social_feed();
$function$;

CREATE OR REPLACE FUNCTION public.update_guest_message(target_message_id uuid, message_text text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select wedding_private.update_guest_message(target_message_id, message_text);
$function$;

CREATE OR REPLACE FUNCTION public.update_honeymoon_suggestion(target_suggestion_id uuid, destination_text text, story_text text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select wedding_private.update_honeymoon_suggestion(
    target_suggestion_id, destination_text, story_text
  );
$function$;


revoke all on function wedding_private.rsvp_details() from public;
revoke all on function wedding_private.save_guest_rsvp(uuid,text,text,text) from public;
grant execute on function wedding_private.rsvp_details() to authenticated;
grant execute on function wedding_private.save_guest_rsvp(uuid,text,text,text) to authenticated;
revoke all on function public.rsvp_details() from public;
revoke all on function public.save_guest_rsvp(uuid,text,text,text) from public;
grant execute on function public.rsvp_details() to authenticated;
grant execute on function public.save_guest_rsvp(uuid,text,text,text) to authenticated;

revoke all on function wedding_private.update_guest_message(uuid,text) from public;
revoke all on function wedding_private.delete_guest_message(uuid) from public;
revoke all on function wedding_private.update_honeymoon_suggestion(uuid,text,text) from public;
revoke all on function wedding_private.delete_honeymoon_suggestion(uuid) from public;
grant execute on function wedding_private.update_guest_message(uuid,text) to authenticated;
grant execute on function wedding_private.delete_guest_message(uuid) to authenticated;
grant execute on function wedding_private.update_honeymoon_suggestion(uuid,text,text) to authenticated;
grant execute on function wedding_private.delete_honeymoon_suggestion(uuid) to authenticated;

revoke all on function public.update_guest_message(uuid,text) from public;
revoke all on function public.delete_guest_message(uuid) from public;
revoke all on function public.update_honeymoon_suggestion(uuid,text,text) from public;
revoke all on function public.delete_honeymoon_suggestion(uuid) from public;
grant execute on function public.update_guest_message(uuid,text) to authenticated;
grant execute on function public.delete_guest_message(uuid) to authenticated;
grant execute on function public.update_honeymoon_suggestion(uuid,text,text) to authenticated;
grant execute on function public.delete_honeymoon_suggestion(uuid) to authenticated;

revoke all on function wedding_private.is_admin() from public;
revoke all on function wedding_private.admin_dashboard() from public;
grant execute on function wedding_private.is_admin() to authenticated;
grant execute on function wedding_private.admin_dashboard() to authenticated;
revoke all on function public.admin_status() from public;
revoke all on function public.admin_dashboard() from public;
grant execute on function public.admin_status() to authenticated;
grant execute on function public.admin_dashboard() to authenticated;

update storage.buckets
set public = false,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg','image/webp']::text[]
where id = 'honeymoon-suggestions';

drop policy if exists "Wedding guests view honeymoon photos" on storage.objects;
create policy "Wedding guests view honeymoon photos"
on storage.objects for select to authenticated
using (bucket_id = 'honeymoon-suggestions');

drop policy if exists "Wedding guests delete honeymoon photos" on storage.objects;
create policy "Wedding guests delete honeymoon photos"
on storage.objects for delete to authenticated
using (
  bucket_id = 'honeymoon-suggestions'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
