-- Questly Supabase FULL Diagnostics
-- Copy entire output. Safe (read-only except explicit test inserts cleaned up).
-- Sections 0..15

--------------------------------------------------------------------
-- 0. Instance + session context
--------------------------------------------------------------------
select current_date as today, now() as now_utc;
select current_user, current_setting('server_version') as server_version, current_setting('search_path') as search_path;

--------------------------------------------------------------------
-- 1. Raw daily_topics row for today (expected single row)
--------------------------------------------------------------------
select * from daily_topics where date = current_date;

--------------------------------------------------------------------
-- 2. Ordered topic id arrays from function (free vs premium)
--------------------------------------------------------------------
select
  public.get_daily_topic_ids(current_date, false) as free_ids,
  public.get_daily_topic_ids(current_date, true)  as premium_ids;

-- Expanded with ordinality (positions)
select id, ordinality as position, 'free-call' as variant
from unnest(public.get_daily_topic_ids(current_date,false)) with ordinality as t(id, ordinality)
union all
select id, ordinality, 'premium-call'
from unnest(public.get_daily_topic_ids(current_date,true)) with ordinality as t(id, ordinality)
order by variant, position;

--------------------------------------------------------------------
-- 3. Join function results back to topics (titles) for visual check
--------------------------------------------------------------------
with fn as (
  select id, ordinality
  from unnest(public.get_daily_topic_ids(current_date,true)) with ordinality as t(id, ordinality)
)
select fn.ordinality as position, t.id, t.title, t.difficulty
from fn join topics t on t.id = fn.id
order by position;

--------------------------------------------------------------------
-- 4. Table counts (profile linkage health)
--------------------------------------------------------------------
select count(*) as profiles_count from profiles;
select count(*) as user_points_count from user_points;
select count(*) as subscriptions_count from user_subscriptions;

--------------------------------------------------------------------
-- 5. Today row columns (NULLs here = function will output NULL entries)
--------------------------------------------------------------------
select date, free_beginner_id, free_intermediate_id, free_advanced_id,
       premium_beginner_id, premium_intermediate_id, premium_advanced_id
from daily_topics where date = current_date;

--------------------------------------------------------------------
-- 6. Null distribution over next 7 days (should all be NOT NULL)
--------------------------------------------------------------------
select
  count(*) filter (where free_beginner_id is null) as free_beginner_nulls,
  count(*) filter (where free_intermediate_id is null) as free_intermediate_nulls,
  count(*) filter (where free_advanced_id is null) as free_advanced_nulls,
  count(*) filter (where premium_beginner_id is null) as premium_beginner_nulls,
  count(*) filter (where premium_intermediate_id is null) as premium_intermediate_nulls,
  count(*) filter (where premium_advanced_id is null) as premium_advanced_nulls
from daily_topics
where date between current_date and current_date + 7;

--------------------------------------------------------------------
-- 7. Upcoming schedule snapshot (next 5 days)
--------------------------------------------------------------------
select date, free_beginner_id, free_intermediate_id, free_advanced_id,
       premium_beginner_id, premium_intermediate_id, premium_advanced_id
from daily_topics
where date between current_date and current_date + 4
order by date;

--------------------------------------------------------------------
-- 8. Bootstrap simulation (test idempotent creation) + cleanup
--------------------------------------------------------------------
insert into profiles (id) values ('BOOTSTRAP_TEST_ID') on conflict (id) do nothing;
insert into user_points (clerk_user_id) values ('BOOTSTRAP_TEST_ID') on conflict (clerk_user_id) do nothing;
select (select exists(select 1 from profiles where id='BOOTSTRAP_TEST_ID')) as profile_created,
       (select exists(select 1 from user_points where clerk_user_id='BOOTSTRAP_TEST_ID')) as user_points_created;
delete from profiles where id='BOOTSTRAP_TEST_ID';
delete from user_points where clerk_user_id='BOOTSTRAP_TEST_ID';

--------------------------------------------------------------------
-- 9. Premium helper smoke test (UNCOMMENT and replace YOUR_CLERK_ID if needed)
--------------------------------------------------------------------
-- select public.is_premium('YOUR_CLERK_ID') as is_premium_for_user;

--------------------------------------------------------------------
-- 10. Function definitions (confirm search_path & volatility)
--------------------------------------------------------------------
select p.proname,
       l.lanname,
       p.provolatile,
       p.prosecdef as security_definer,
       pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on p.pronamespace = n.oid
join pg_language l on p.prolang = l.oid
where n.nspname='public'
  and p.proname in ('get_daily_topic_ids','is_premium','current_clerk_id','increment_chat_usage')
order by p.proname;

--------------------------------------------------------------------
-- 11. RLS policies of key tables
--------------------------------------------------------------------
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where tablename in ('profiles','user_points','daily_topics','user_subscriptions','topics','user_progress')
order by tablename, policyname;

--------------------------------------------------------------------
-- 12. Does service_role exist (metadata) - already shown but kept
--------------------------------------------------------------------
select exists (select 1 from pg_roles r where r.rolname='service_role') as service_role_exists;

--------------------------------------------------------------------
-- 13. Daily vs Function cross-check (positions -> actual ids)
--------------------------------------------------------------------
with dt as (
  select * from daily_topics where date=current_date
), expected as (
  select 1 as position, free_beginner_id as id from dt union all
  select 2, free_intermediate_id from dt union all
  select 3, free_advanced_id from dt union all
  select 4, premium_beginner_id from dt union all
  select 5, premium_intermediate_id from dt union all
  select 6, premium_advanced_id from dt
), fn as (
  select id as id, ordinality as position
  from unnest(public.get_daily_topic_ids(current_date,true)) with ordinality as t(id, ordinality)
)
select e.position, e.id as daily_topics_id, fn.id as function_id, (e.id = fn.id) as matches
from expected e left join fn on e.position = fn.position
order by e.position;

--------------------------------------------------------------------
-- 14. Topic existence check for today's ids (detect orphaned references)
--------------------------------------------------------------------
with ids as (
  select unnest(public.get_daily_topic_ids(current_date,true)) as id
)
select i.id, t.id is not null as exists_in_topics
from ids i left join topics t on t.id = i.id;

--------------------------------------------------------------------
-- 15. (Optional) Remove NULL-only rows diagnostic (should be 0)
--------------------------------------------------------------------
select count(*) as rows_with_any_null
from daily_topics
where date between current_date and current_date + 30
  and (
    free_beginner_id is null or free_intermediate_id is null or free_advanced_id is null
    or premium_beginner_id is null or premium_intermediate_id is null or premium_advanced_id is null
  );

-- END
