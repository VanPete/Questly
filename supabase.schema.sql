-- Questly master schema
-- Fresh install script (idempotent / safe to re-run) for Clerk-native IDs (no auth.users FKs)
-- Includes:
--   * Core content & user tables
--   * RLS policies scoped to current_clerk_id()
--   * Premium gating via user_subscriptions + is_premium()
--   * Daily topics rotation storage (3 primaries + exactly 3 premium extras)
--   * Chat usage quota tracking
--   * Helper functions: slug generation, premium grant/revoke, daily topic id retrieval
--   * Deterministic constraints & indexes
-- NOTE: After deploying this schema run the rotation endpoint /api/admin/rotate-daily (or cron) to populate today's daily_topics row.
create extension if not exists pgcrypto;
create extension if not exists citext;

-- Helper to read Clerk user id from JWT (for future client-side RLS)
create or replace function public.current_clerk_id()
returns text
language sql
stable
as $$
  select (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')::text;
$$;

-- Conversations & messages schema for Supabase
-- Conversations & messages (optional history store)
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text not null,
  topic_id text not null,
  title text not null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null check (role in ('system','user','assistant')),
  content text not null,
  created_at timestamp with time zone default now()
);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;
do $$
begin
  begin
    create policy "Users see their conversations" on public.conversations
      for select using (public.current_clerk_id() = clerk_user_id);
  exception when duplicate_object then null; end;
  begin
    create policy "Users manage their conversations" on public.conversations
      for all using (public.current_clerk_id() = clerk_user_id) with check (public.current_clerk_id() = clerk_user_id);
  exception when duplicate_object then null; end;
  begin
    create policy "Users see their messages" on public.messages
      for select using (exists (select 1 from public.conversations c where c.id = conversation_id and c.clerk_user_id = public.current_clerk_id()));
  exception when duplicate_object then null; end;
  begin
    create policy "Users manage their messages" on public.messages
      for all using (exists (select 1 from public.conversations c where c.id = conversation_id and c.clerk_user_id = public.current_clerk_id()))
      with check (exists (select 1 from public.conversations c where c.id = conversation_id and c.clerk_user_id = public.current_clerk_id()));
  exception when duplicate_object then null; end;
end$$;

-- Profiles keyed by Clerk user id
create table if not exists public.profiles (
  id text primary key, -- Clerk user id
  join_date date default current_date,
  display_name text,
  prefs jsonb default '{}'::jsonb
);

alter table public.profiles enable row level security;
-- Replace broad ALL policy with scoped policies (no deletes by default)
drop policy if exists "Users manage their profiles" on public.profiles;
do $$
begin
  begin
  create policy "Users read their profiles" on public.profiles for select using (public.current_clerk_id() = id);
  exception when duplicate_object then null; end;
  begin
  create policy "Users update their profiles" on public.profiles for update using (public.current_clerk_id() = id) with check (public.current_clerk_id() = id);
  exception when duplicate_object then null; end;
  begin
  create policy "Users insert their profiles" on public.profiles for insert with check (public.current_clerk_id() = id);
  exception when duplicate_object then null; end;
end$$;

-- Enforce display_name rules: case-insensitive uniqueness and 3–24 chars (null allowed)
-- Length constraint (idempotent)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chk_profiles_display_name_length') then
    alter table public.profiles
      add constraint chk_profiles_display_name_length
      check (display_name is null or char_length(display_name) between 3 and 24);
  end if;
end$$;
-- Unique index on lower(display_name), ignoring nulls
create unique index if not exists uq_profiles_display_name_ci
  on public.profiles ((lower(display_name)))
  where display_name is not null;

-- Quiz attempts and answers (guests allowed so user id can be null)
create table if not exists public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text,
  topic_id text not null,
  total integer not null,
  score integer default 0,
  created_at timestamp with time zone default now()
);

create table if not exists public.quiz_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.quiz_attempts(id) on delete cascade,
  question text not null,
  options jsonb not null,
  correct_index integer not null,
  chosen_index integer not null,
  is_correct boolean not null,
  created_at timestamp with time zone default now()
);

alter table public.quiz_attempts enable row level security;
alter table public.quiz_answers enable row level security;
-- Ensure secure insert semantics: only self or anonymous
drop policy if exists "Users insert attempts" on public.quiz_attempts;
-- Tighten visibility: remove anonymous read access to quiz attempts/answers
drop policy if exists "Users see their attempts" on public.quiz_attempts;
drop policy if exists "Users see their answers" on public.quiz_answers;
do $$
begin
  begin
    create policy "Users see their attempts" on public.quiz_attempts for select using (public.current_clerk_id() = clerk_user_id);
  exception when duplicate_object then null; end;
  begin
    create policy "Users insert attempts" on public.quiz_attempts for insert with check (clerk_user_id is null or public.current_clerk_id() = clerk_user_id);
  exception when duplicate_object then null; end;
  begin
    create policy "Users see their answers" on public.quiz_answers for select using (
      exists (select 1 from public.quiz_attempts a where a.id = attempt_id and a.clerk_user_id = public.current_clerk_id())
    );
  exception when duplicate_object then null; end;
  begin
    create policy "Users insert answers" on public.quiz_answers for insert with check (
      exists (select 1 from public.quiz_attempts a where a.id = attempt_id and (a.clerk_user_id is null or a.clerk_user_id = public.current_clerk_id()))
    );
  exception when duplicate_object then null; end;
end$$;

-- Data validity checks for quiz data
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chk_quiz_answers_chosen_in_range') then
    alter table public.quiz_answers
      add constraint chk_quiz_answers_chosen_in_range
      check (chosen_index >= 0 and chosen_index < coalesce(jsonb_array_length(options), 0));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_quiz_answers_correct_in_range') then
    alter table public.quiz_answers
      add constraint chk_quiz_answers_correct_in_range
      check (correct_index >= 0 and correct_index < coalesce(jsonb_array_length(options), 0));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_quiz_attempts_score_range') then
    alter table public.quiz_attempts
      add constraint chk_quiz_attempts_score_range
      check (score >= 0 and score <= total);
  end if;
end$$;

-- Learning plans feature removed. Clean up any leftover tables/policies/indexes.
do $$
begin
  -- Drop policies if they exist
  begin execute 'drop policy if exists "Users manage their plans" on public.learning_plans'; exception when others then null; end;
  begin execute 'drop policy if exists "Users manage their tasks" on public.plan_tasks'; exception when others then null; end;
  -- Drop unique index (if it still exists)
  begin execute 'drop index if exists uq_plan_tasks_plan_day'; exception when others then null; end;
  -- Drop tables
  begin execute 'drop table if exists public.plan_tasks cascade'; exception when others then null; end;
  begin execute 'drop table if exists public.learning_plans cascade'; exception when others then null; end;
end$$;

-- Content expansion seeds (kept for future seeding)
create table if not exists public.topics_raw (
  id uuid primary key default gen_random_uuid(),
  -- Match CSV columns for easy import; all are nullable staging fields
  title text,
  domain text,
  difficulty text,
  blurb text,
  angles text,         -- JSON text (e.g. ["Angle A","Angle B"]) in CSV
  seed_context text,
  tags text,           -- comma-separated list in CSV
  created_at timestamp with time zone default now()
);
alter table public.topics_raw enable row level security;
do $$
begin
  begin
    create policy "Public read topics_raw" on public.topics_raw for select using (true);
  exception when duplicate_object then null; end;
end$$;

-- Canonical topics table (source of truth)
create table if not exists public.topics (
  id text primary key, -- stable slug id
  title text not null,
  domain text not null,
  difficulty text not null check (difficulty in ('Beginner','Intermediate','Advanced')),
  blurb text,
  angles jsonb default '[]'::jsonb,
  seed_context text,
  tags text[] default '{}',
  is_active boolean default true,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);
alter table public.topics enable row level security;
do $$
begin
  begin
    create policy "Public read topics" on public.topics for select using (true);
  exception when duplicate_object then null; end;
end$$;
-- Migrate existing installs: ensure topics table has expected columns
do $$
begin
  -- Add missing columns if the table pre-existed without them
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'topics' and column_name = 'is_active'
  ) then
    alter table public.topics add column is_active boolean default true;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'topics' and column_name = 'angles'
  ) then
    alter table public.topics add column angles jsonb default '[]'::jsonb;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'topics' and column_name = 'seed_context'
  ) then
    alter table public.topics add column seed_context text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'topics' and column_name = 'tags'
  ) then
    alter table public.topics add column tags text[] default '{}';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'topics' and column_name = 'created_at'
  ) then
    alter table public.topics add column created_at timestamp with time zone default now();
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'topics' and column_name = 'updated_at'
  ) then
    alter table public.topics add column updated_at timestamp with time zone default now();
  end if;
end$$;
-- Uniqueness: avoid duplicates by normalized title + domain + difficulty
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'uq_topics_domain_diff_title'
  ) then
    alter table public.topics add constraint uq_topics_domain_diff_title unique (domain, difficulty, title);
  end if;
end$$;
create index if not exists idx_topics_domain_difficulty on public.topics(domain, difficulty) where is_active = true;

-- Auto-generate slug id on direct inserts when id is missing
create or replace function public.slugify(txt text)
returns text
language sql
immutable
as $$
  select trim(both '-' from regexp_replace(lower(coalesce(trim(txt), '')), '[^a-z0-9]+', '-', 'g'));
$$;

create or replace function public.set_topic_id_if_missing()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.id is null or btrim(new.id) = '' then
    new.id := public.slugify(coalesce(new.domain,'') || ' ' || coalesce(new.title,'') || ' ' || coalesce(new.difficulty,''));
  end if;
  return new;
end$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_topics_set_id') then
    create trigger trg_topics_set_id
    before insert on public.topics
    for each row execute function public.set_topic_id_if_missing();
  end if;
end$$;

-- Daily topics (global rotation per day) now store explicit free + premium variant per difficulty
-- 6 total topic ids per day: free_beginner_id, free_intermediate_id, free_advanced_id,
--                            premium_beginner_id, premium_intermediate_id, premium_advanced_id
create table if not exists public.daily_topics (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  free_beginner_id text not null,
  free_intermediate_id text not null,
  free_advanced_id text not null,
  premium_beginner_id text not null,
  premium_intermediate_id text not null,
  premium_advanced_id text not null,
  created_at timestamp with time zone default now()
);
alter table public.daily_topics enable row level security;
do $$
begin
  begin
    create policy "Public read daily_topics" on public.daily_topics for select using (true);
  exception when duplicate_object then null; end;
end$$;

-- Fast lookup index (unique already on date but explicit for clarity / planner hints)
create index if not exists idx_daily_topics_date on public.daily_topics(date);

-- (Removed legacy premium_extra_ids JSON array; replaced by explicit premium_* columns.)

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'fk_daily_topics_free_beginner'
  ) then
    alter table public.daily_topics
      add constraint fk_daily_topics_free_beginner
      foreign key (free_beginner_id) references public.topics(id) on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'fk_daily_topics_free_intermediate'
  ) then
    alter table public.daily_topics
      add constraint fk_daily_topics_free_intermediate
      foreign key (free_intermediate_id) references public.topics(id) on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'fk_daily_topics_free_advanced'
  ) then
    alter table public.daily_topics
      add constraint fk_daily_topics_free_advanced
      foreign key (free_advanced_id) references public.topics(id) on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'fk_daily_topics_premium_beginner'
  ) then
    alter table public.daily_topics
      add constraint fk_daily_topics_premium_beginner
      foreign key (premium_beginner_id) references public.topics(id) on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'fk_daily_topics_premium_intermediate'
  ) then
    alter table public.daily_topics
      add constraint fk_daily_topics_premium_intermediate
      foreign key (premium_intermediate_id) references public.topics(id) on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'fk_daily_topics_premium_advanced'
  ) then
    alter table public.daily_topics
      add constraint fk_daily_topics_premium_advanced
      foreign key (premium_advanced_id) references public.topics(id) on delete restrict;
  end if;
end$$;

-- Helper: ordered topic ids: free trio then premium trio (if p_is_premium)
create or replace function public.get_daily_topic_ids(p_date date, p_is_premium boolean default false)
returns text[]
language sql
stable
set search_path = public
as $$
  with dt as (
    select * from public.daily_topics where date = p_date
  )
  select coalesce(
    case
      when not exists (select 1 from dt) then array[]::text[]
      when p_is_premium then array[
        (select free_beginner_id from dt),
        (select free_intermediate_id from dt),
        (select free_advanced_id from dt),
        (select premium_beginner_id from dt),
        (select premium_intermediate_id from dt),
        (select premium_advanced_id from dt)
      ]
      else array[
        (select free_beginner_id from dt),
        (select free_intermediate_id from dt),
        (select free_advanced_id from dt)
      ]
    end,
    array[]::text[]
  );
$$;

-- Optional: expanded view for querying positions (1..3 primaries, 4.. extras)
create or replace view public.daily_topics_expanded as
  select date, 1 as position, free_beginner_id as topic_id from public.daily_topics
  union all
  select date, 2 as position, free_intermediate_id as topic_id from public.daily_topics
  union all
  select date, 3 as position, free_advanced_id as topic_id from public.daily_topics
  union all
  select date, 4 as position, premium_beginner_id as topic_id from public.daily_topics
  union all
  select date, 5 as position, premium_intermediate_id as topic_id from public.daily_topics
  union all
  select date, 6 as position, premium_advanced_id as topic_id from public.daily_topics;

create table if not exists public.user_progress (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text not null,
  date date not null,
  topic_id text not null,
  quick_correct boolean,
  quiz_score integer,
  quiz_total integer,
  completed boolean default false,
  created_at timestamp with time zone default now(),
  unique (clerk_user_id, date, topic_id)
);
alter table public.user_progress enable row level security;
do $$
begin
  begin
    create policy "Users manage their progress" on public.user_progress for all using (public.current_clerk_id() = clerk_user_id) with check (public.current_clerk_id() = clerk_user_id);
  exception when duplicate_object then null; end;
end$$;
create index if not exists idx_user_progress_user_date on public.user_progress(clerk_user_id, date);

create table if not exists public.user_points (
  clerk_user_id text primary key,
  total_points integer default 0,
  streak integer default 0,
  longest_streak integer default 0,
  last_active_date date,
  updated_at timestamp with time zone default now()
);
alter table public.user_points enable row level security;
do $$
begin
  begin
    create policy "Users manage their points" on public.user_points for all using (public.current_clerk_id() = clerk_user_id) with check (public.current_clerk_id() = clerk_user_id);
  exception when duplicate_object then null; end;
end$$;

create table if not exists public.leaderboard_daily (
  date date not null,
  clerk_user_id text not null,
  points integer not null,
  rank integer,
  snapshot_at timestamp with time zone default now(),
  primary key (date, clerk_user_id)
);
alter table public.leaderboard_daily enable row level security;
-- Lock down writes in production: only select is public
drop policy if exists "Public insert leaderboard_daily" on public.leaderboard_daily;
drop policy if exists "Public update leaderboard_daily" on public.leaderboard_daily;
do $$
begin
  begin
    create policy "Public read leaderboard_daily" on public.leaderboard_daily for select using (true);
  exception when duplicate_object then null; end;
end$$;

-- Create enum plan_t if missing (no IF NOT EXISTS support for CREATE TYPE)
do $$
begin
  if not exists (select 1 from pg_type where typname = 'plan_t') then
    create type plan_t as enum ('free','premium');
  end if;
end$$;

-- Validation trigger: ensure difficulty matches and free vs premium differ per difficulty
create or replace function public.validate_daily_topics_pair()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  fb text; fi text; fa text; pb text; pi text; pa text;
begin
  select difficulty into fb from public.topics where id = NEW.free_beginner_id;
  select difficulty into fi from public.topics where id = NEW.free_intermediate_id;
  select difficulty into fa from public.topics where id = NEW.free_advanced_id;
  select difficulty into pb from public.topics where id = NEW.premium_beginner_id;
  select difficulty into pi from public.topics where id = NEW.premium_intermediate_id;
  select difficulty into pa from public.topics where id = NEW.premium_advanced_id;
  if fb <> 'Beginner' or pb <> 'Beginner' then
    raise exception 'Beginner columns must reference Beginner topics'; end if;
  if fi <> 'Intermediate' or pi <> 'Intermediate' then
    raise exception 'Intermediate columns must reference Intermediate topics'; end if;
  if fa <> 'Advanced' or pa <> 'Advanced' then
    raise exception 'Advanced columns must reference Advanced topics'; end if;
  if NEW.free_beginner_id = NEW.premium_beginner_id then
    raise exception 'free_beginner_id and premium_beginner_id must differ'; end if;
  if NEW.free_intermediate_id = NEW.premium_intermediate_id then
    raise exception 'free_intermediate_id and premium_intermediate_id must differ'; end if;
  if NEW.free_advanced_id = NEW.premium_advanced_id then
    raise exception 'free_advanced_id and premium_advanced_id must differ'; end if;
  return NEW;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_daily_topics_validate_pairs') then
    create trigger trg_daily_topics_validate_pairs
    before insert or update on public.daily_topics
    for each row execute function public.validate_daily_topics_pair();
  end if;
end$$;

-- Ensure enum values exist (safe to re-run)
do $$
begin
  if not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'plan_t' and e.enumlabel = 'free'
  ) then
    alter type plan_t add value 'free';
  end if;
  if not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'plan_t' and e.enumlabel = 'premium'
  ) then
    alter type plan_t add value 'premium';
  end if;
end$$;

create table if not exists public.user_subscriptions (
  clerk_user_id text primary key,
  plan plan_t not null default 'free',
  stripe_customer_id text,
  current_period_end timestamp with time zone,
  status text,
  updated_at timestamp with time zone default now()
);
alter table public.user_subscriptions enable row level security;
do $$
begin
  begin
    create policy "Users read their subscription" on public.user_subscriptions for select using (public.current_clerk_id() = clerk_user_id);
  exception when duplicate_object then null; end;
end$$;

-- Auto-create a free subscription row whenever a new profile is inserted (idempotent)
create or replace function public.ensure_user_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Insert default free subscription if missing
  insert into public.user_subscriptions (clerk_user_id, plan, status)
  values (NEW.id, 'free', coalesce(NEW.display_name, 'active')) -- status 'active' (display_name value ignored; just placeholder if needed)
  on conflict (clerk_user_id) do nothing;
  return NEW;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_profiles_ensure_subscription') then
    create trigger trg_profiles_ensure_subscription
    after insert on public.profiles
    for each row execute function public.ensure_user_subscription();
  end if;
end$$;

-- Generated questions cache (per day per topic)
create table if not exists public.question_cache (
  date date not null,
  topic_id text not null,
  payload jsonb not null,
  updated_at timestamp with time zone default now(),
  primary key (date, topic_id)
);
alter table public.question_cache enable row level security;
-- Public read is fine (content is generic and not user-specific)
-- Lock down writes in production: only select is public
drop policy if exists "Public write question_cache" on public.question_cache;
drop policy if exists "Public update question_cache" on public.question_cache;
do $$
begin
  begin
    create policy "Public read question_cache" on public.question_cache for select using (true);
  exception when duplicate_object then null; end;
end$$;

-- Migrations for existing installs: ensure user_points has expected columns
do $$
begin
  -- Add last_active_date if missing (older installs)
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_points' and column_name = 'last_active_date'
  ) then
    alter table public.user_points add column last_active_date date;
  end if;

  -- Add updated_at if missing (required by set_updated_at trigger and indexes)
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_points' and column_name = 'updated_at'
  ) then
    alter table public.user_points add column updated_at timestamp with time zone default now();
  end if;

  -- Ensure user_subscriptions has updated_at for its trigger
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_subscriptions' and column_name = 'updated_at'
  ) then
    alter table public.user_subscriptions add column updated_at timestamp with time zone default now();
  end if;
end$$;

create index if not exists idx_conversations_user_created on public.conversations(clerk_user_id, created_at desc);
create index if not exists idx_messages_conversation_created on public.messages(conversation_id, created_at);
create index if not exists idx_quiz_attempts_user_created on public.quiz_attempts(clerk_user_id, created_at desc);
create index if not exists idx_quiz_answers_attempt on public.quiz_answers(attempt_id);
create index if not exists idx_leaderboard_daily_date_points on public.leaderboard_daily(date, points desc);
create index if not exists idx_question_cache_date on public.question_cache(date);
create index if not exists idx_user_points_updated on public.user_points(updated_at desc);
create index if not exists idx_user_subscriptions_stripe_customer on public.user_subscriptions(stripe_customer_id);

create table if not exists public.user_chat_usage (
  clerk_user_id text not null,
  date date not null,
  used int not null default 0,
  primary key (clerk_user_id, date)
);
alter table public.user_chat_usage enable row level security;
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'user_chat_usage' and policyname = 'Users manage their chat usage'
  ) then
    create policy "Users manage their chat usage" on public.user_chat_usage for all
      using (public.current_clerk_id() = clerk_user_id)
      with check (public.current_clerk_id() = clerk_user_id);
  end if;
end $$;
create index if not exists idx_user_chat_usage_user_date on public.user_chat_usage(clerk_user_id, date);

create or replace function public.increment_chat_usage(p_user_id text, p_date date)
returns void as $$
begin
  insert into public.user_chat_usage (clerk_user_id, date, used)
  values (p_user_id, p_date, 1)
  on conflict (clerk_user_id, date)
  do update set used = public.user_chat_usage.used + 1;
end;
$$ language plpgsql security definer;

create or replace function public.set_updated_at() returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_conversations_updated_at') then
    create trigger trg_conversations_updated_at
    before update on public.conversations
    for each row execute function public.set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_user_points_updated_at') then
    create trigger trg_user_points_updated_at
    before update on public.user_points
    for each row execute function public.set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_question_cache_updated_at') then
    create trigger trg_question_cache_updated_at
    before update on public.question_cache
    for each row execute function public.set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_user_subscriptions_updated_at') then
    create trigger trg_user_subscriptions_updated_at
    before update on public.user_subscriptions
    for each row execute function public.set_updated_at();
  end if;
end$$;

-- Helper: fast premium check by clerk user id
create or replace function public.is_premium(p_user_id text)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1 from public.user_subscriptions s
    where s.clerk_user_id = p_user_id
      and s.plan = 'premium'
      and coalesce(s.status, 'active') in ('active','trialing','past_due')
      and (s.current_period_end is null or s.current_period_end > now())
  );
$$;

-- Convenience: grant premium (upsert) for local testing / manual promotion
create or replace function public.grant_premium(p_user_id text, p_days integer default 30)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_until timestamp with time zone := (now() + make_interval(days => greatest(p_days,1)));
begin
  insert into public.user_subscriptions (clerk_user_id, plan, current_period_end, status)
  values (p_user_id, 'premium', v_until, 'active')
  on conflict (clerk_user_id) do update
    set plan = 'premium', current_period_end = excluded.current_period_end, status = 'active', updated_at = now();
end;
$$;

create or replace function public.revoke_premium(p_user_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_subscriptions (clerk_user_id, plan, status)
  values (p_user_id, 'free', 'inactive')
  on conflict (clerk_user_id) do update
    set plan = 'free', status = 'inactive', current_period_end = null, updated_at = now();
end;
$$;

-- Seed a minimal topic set if empty (3 primaries + extra pool) -- idempotent
do $$
begin
  if not exists (select 1 from public.topics) then
    insert into public.topics (id,title,domain,difficulty,blurb,angles,seed_context) values
      ('tides','Why the tides rise and fall','Science','Beginner','A short tour of gravity, the moon, and coastal rhythms.', '["Moon vs sun influence","Spring vs neap tides","Safety tips"]','We explore the physics and daily patterns of tides.'),
      ('maps','How maps distort the world','Ideas','Intermediate','Projections, tradeoffs, and what distances really mean.', '["Mercator vs equal-area","Navigation history","Modern GIS"]','Compare map projections and why no map is perfect.'),
      ('roman-legions','Inside a Roman legion','History','Advanced','Organization, training, and battle tactics of Rome’s army.', '["Maniples to cohorts","Logistics","Legacy"]','From Republic to Empire, legions shaped history.'),
      -- Extra pool (at least one per difficulty for premium extras)
      ('gravity','Gravity basics','Science','Beginner','Mass, attraction, and everyday phenomena.','["Newton","Einstein","Microgravity"]','Core concepts of gravity.'),
      ('perspective-drawing','Perspective drawing fundamentals','Arts & Culture','Beginner','Vanishing points and depth illusion.','["One-point","Two-point","Foreshortening"]','Learn perspective basics.'),
      ('cryptography-intro','Intro to cryptography','Technology','Intermediate','Ciphers, keys, and modern encryption.','["Caesar to AES","Public key","Hashes"]','Foundations of secure communication.'),
      ('climate-models','How climate models work','Science','Intermediate','Simulating earth systems for projections.','["Grid cells","Parameterization","Uncertainty"]','Overview of climate modeling.'),
      ('napoleonic-wars','Napoleonic warfare evolution','Military History','Advanced','Operational art and coalition responses.','["Corps system","Logistics","Legacy"]','Transformation of European warfare.'),
      ('quantum-bits','Understanding qubits','Science','Advanced','Superposition, entanglement, and computation.','["Spin","Decoherence","Algorithms"]','Conceptual intro to qubits.');
  end if;
end$$;

-- Supporting index for is_premium lookups
create index if not exists idx_user_subscriptions_user_status_end
  on public.user_subscriptions(clerk_user_id, status, current_period_end);

-- (Removed legacy uuid-based is_premium and index; Clerk-native text IDs are canonical.)
