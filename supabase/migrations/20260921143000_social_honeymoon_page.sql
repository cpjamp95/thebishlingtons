create table public.wedding_guest_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid not null references public.wedding_households(id) on delete cascade,
  author_name text not null check (length(author_name) between 1 and 160),
  message text not null check (length(message) between 1 and 600),
  created_at timestamptz not null default now()
);

create index wedding_guest_messages_created_at_idx
  on public.wedding_guest_messages (created_at desc);

alter table public.wedding_guest_messages enable row level security;
revoke all on public.wedding_guest_messages from anon, authenticated;

create table public.wedding_honeymoon_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid not null references public.wedding_households(id) on delete cascade,
  author_name text not null check (length(author_name) between 1 and 160),
  destination text not null check (length(destination) between 1 and 120),
  story text not null check (length(story) between 1 and 700),
  photo_path text,
  created_at timestamptz not null default now()
);

create index wedding_honeymoon_suggestions_created_at_idx
  on public.wedding_honeymoon_suggestions (created_at desc);

alter table public.wedding_honeymoon_suggestions enable row level security;
revoke all on public.wedding_honeymoon_suggestions from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'honeymoon-suggestions',
  'honeymoon-suggestions',
  true,
  5242880,
  array['image/jpeg','image/png','image/webp']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Wedding guests upload honeymoon photos" on storage.objects;
create policy "Wedding guests upload honeymoon photos"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'honeymoon-suggestions'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create function wedding_private.social_feed() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  current_user_id uuid := auth.uid();
  current_household uuid;
  result jsonb;
begin
  if current_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  select m.household_id into current_household
  from public.wedding_memberships m
  join auth.users u on u.id = m.user_id
  where m.user_id = current_user_id and u.email_confirmed_at is not null
  limit 1;
  if current_household is null then raise exception 'HOUSEHOLD_REQUIRED'; end if;

  select jsonb_build_object(
    'messages',
    coalesce((select jsonb_agg(jsonb_build_object(
      'id', m.id, 'author_name', m.author_name, 'message', m.message, 'created_at', m.created_at
    ) order by m.created_at desc)
    from (select id, author_name, message, created_at from public.wedding_guest_messages order by created_at desc limit 40) m), '[]'::jsonb),
    'suggestions',
    coalesce((select jsonb_agg(jsonb_build_object(
      'id', s.id, 'author_name', s.author_name, 'destination', s.destination,
      'story', s.story, 'photo_path', s.photo_path, 'created_at', s.created_at
    ) order by s.created_at desc)
    from (select id, author_name, destination, story, photo_path, created_at from public.wedding_honeymoon_suggestions order by created_at desc limit 40) s), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

create function wedding_private.add_guest_message(message_text text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  current_user_id uuid := auth.uid();
  current_household uuid;
  current_name text;
  new_row public.wedding_guest_messages;
begin
  if current_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if message_text is null or length(trim(message_text)) < 1 or length(trim(message_text)) > 600 then
    raise exception 'MESSAGE_INVALID';
  end if;
  select m.household_id, coalesce(nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''), h.label)
  into current_household, current_name
  from public.wedding_memberships m
  join auth.users u on u.id = m.user_id
  join public.wedding_households h on h.id = m.household_id
  where m.user_id = current_user_id and u.email_confirmed_at is not null
  limit 1;
  if current_household is null then raise exception 'HOUSEHOLD_REQUIRED'; end if;
  insert into public.wedding_guest_messages (user_id, household_id, author_name, message)
  values (current_user_id, current_household, current_name, trim(message_text))
  returning * into new_row;
  return jsonb_build_object('id',new_row.id,'author_name',new_row.author_name,'message',new_row.message,'created_at',new_row.created_at);
end;
$$;

create function wedding_private.add_honeymoon_suggestion(
  destination_text text,
  story_text text,
  photo_path_text text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  current_user_id uuid := auth.uid();
  current_household uuid;
  current_name text;
  new_row public.wedding_honeymoon_suggestions;
begin
  if current_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if destination_text is null or length(trim(destination_text)) < 1 or length(trim(destination_text)) > 120 then raise exception 'DESTINATION_INVALID'; end if;
  if story_text is null or length(trim(story_text)) < 1 or length(trim(story_text)) > 700 then raise exception 'STORY_INVALID'; end if;
  if photo_path_text is not null and photo_path_text !~ ('^' || current_user_id::text || '/[A-Za-z0-9._-]+$') then raise exception 'PHOTO_PATH_INVALID'; end if;
  select m.household_id, coalesce(nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''), h.label)
  into current_household, current_name
  from public.wedding_memberships m
  join auth.users u on u.id = m.user_id
  join public.wedding_households h on h.id = m.household_id
  where m.user_id = current_user_id and u.email_confirmed_at is not null
  limit 1;
  if current_household is null then raise exception 'HOUSEHOLD_REQUIRED'; end if;
  insert into public.wedding_honeymoon_suggestions (user_id, household_id, author_name, destination, story, photo_path)
  values (current_user_id,current_household,current_name,trim(destination_text),trim(story_text),photo_path_text)
  returning * into new_row;
  return jsonb_build_object(
    'id',new_row.id,'author_name',new_row.author_name,'destination',new_row.destination,
    'story',new_row.story,'photo_path',new_row.photo_path,'created_at',new_row.created_at
  );
end;
$$;

revoke all on function wedding_private.social_feed() from public;
revoke all on function wedding_private.add_guest_message(text) from public;
revoke all on function wedding_private.add_honeymoon_suggestion(text,text,text) from public;
grant execute on function wedding_private.social_feed() to authenticated;
grant execute on function wedding_private.add_guest_message(text) to authenticated;
grant execute on function wedding_private.add_honeymoon_suggestion(text,text,text) to authenticated;

create function public.social_feed() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select wedding_private.social_feed();
$$;

create function public.add_guest_message(message_text text) returns jsonb
language sql security invoker set search_path = '' as $$
  select wedding_private.add_guest_message(message_text);
$$;

create function public.add_honeymoon_suggestion(
  destination_text text,
  story_text text,
  photo_path_text text default null
) returns jsonb
language sql security invoker set search_path = '' as $$
  select wedding_private.add_honeymoon_suggestion(destination_text,story_text,photo_path_text);
$$;

revoke all on function public.social_feed() from public;
revoke all on function public.add_guest_message(text) from public;
revoke all on function public.add_honeymoon_suggestion(text,text,text) from public;
grant execute on function public.social_feed() to authenticated;
grant execute on function public.add_guest_message(text) to authenticated;
grant execute on function public.add_honeymoon_suggestion(text,text,text) to authenticated;
