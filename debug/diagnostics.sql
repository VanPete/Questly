-- Questly Supabase Diagnostics
-- Usage: paste into Supabase SQL editor, run all, copy results.

-- 1. Date context
select current_date as today, now() as now_utc;

-- 2. Raw daily_topics row for today
select * from daily_topics where date = current_date;

-- 3. Daily topic ids via function
select
  public.get_daily_topic_ids(current_date, false) as free_ids,
  public.get_daily_topic_ids(current_date, true)  as premium_ids;

-- 4. Table counts (profile linkage)
select count(*) as profiles_count from profiles;
select count(*) as user_points_count from user_points;
select count(*) as subscriptions_count from user_subscriptions;

-- 5. Check for any NULL free columns today (would break function ordering)
select date, free_beginner_id, free_intermediate_id, free_advanced_id,
       premium_beginner_id, premium_intermediate_id, premium_advanced_id
from daily_topics where date = current_date;

-- 6. Simulate bootstrap for a throwaway id (should succeed, then cleanup)
insert into profiles (id) values ('BOOTSTRAP_TEST_ID') on conflict (id) do nothing;
insert into user_points (clerk_user_id) values ('BOOTSTRAP_TEST_ID') on conflict (clerk_user_id) do nothing;
select (select exists(select 1 from profiles where id='BOOTSTRAP_TEST_ID')) as profile_created,
       (select exists(select 1 from user_points where clerk_user_id='BOOTSTRAP_TEST_ID')) as user_points_created;
delete from profiles where id='BOOTSTRAP_TEST_ID';
delete from user_points where clerk_user_id='BOOTSTRAP_TEST_ID';

-- 7. Premium function smoke test (replace YOUR_CLERK_ID if you want)
-- select public.is_premium('YOUR_CLERK_ID') as is_premium_for_user;

-- 8. Service role presence (metadata)
select exists (
  select 1 from pg_roles r where r.rolname = 'service_role'
) as service_role_exists;

-- 9. Security advisor noisy functions (ensure search_path pinned)
-- (Apply only once if needed)
-- alter function public.current_clerk_id() set search_path = public;
-- alter function public.slugify(text) set search_path = public;
-- alter function public.increment_chat_usage(p_user_id text, p_date date) set search_path = public;
