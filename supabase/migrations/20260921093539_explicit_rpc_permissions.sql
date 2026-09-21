-- Supabase may grant EXECUTE directly to API roles through default privileges.
-- Revoking PUBLIC alone does not remove those direct grants.
begin;
revoke all on function public.lookup_invitation(text), public.claim_invitation(text), public.guest_home() from anon, authenticated;
revoke all on function wedding_private.lookup_invitation(text), wedding_private.claim_invitation(text), wedding_private.guest_home() from anon, authenticated;
grant execute on function public.lookup_invitation(text), wedding_private.lookup_invitation(text) to anon, authenticated;
grant execute on function public.claim_invitation(text), public.guest_home(), wedding_private.claim_invitation(text), wedding_private.guest_home() to authenticated;
commit;
