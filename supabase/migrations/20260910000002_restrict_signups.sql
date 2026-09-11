-- Single-tenant lockdown.
--
-- The public login page no longer offers magic-link / self-serve signup (see
-- src/app/(auth)/login/page.tsx), but the anon key ships in the browser bundle,
-- so anyone could still POST /auth/v1/signup directly and create an account.
-- This trigger closes that door at the database level: only allowlisted emails
-- may create an auth.users row.
--
-- Existing users are untouched (this is a BEFORE INSERT trigger), and admin-API
-- creates for the allowlisted addresses still succeed, which is what
-- /api/auth/password-login relies on.
--
-- To allow another account, add its lowercase email to the array below and run
-- `npx supabase db push`.

create or replace function public.jp_restrict_signups()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed constant text[] := array[
    'jxjwilliam@gmail.com',
    'demo@jobpilot.local'
  ];
begin
  if new.email is null or not (lower(new.email) = any (allowed)) then
    raise exception 'Sign-ups are disabled. This workspace is private.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

drop trigger if exists jp_restrict_signups on auth.users;

create trigger jp_restrict_signups
  before insert on auth.users
  for each row execute function public.jp_restrict_signups();
