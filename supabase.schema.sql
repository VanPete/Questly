-- Enable extension used by gen_random_uuid()
create extension if not exists pgcrypto;

-- Conversations & messages schema for Supabase
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
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
      for select using (auth.uid() = user_id);
  exception when duplicate_object then null; end;
  begin
    create policy "Users manage their conversations" on public.conversations
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  exception when duplicate_object then null; end;
  begin
    create policy "Users see their messages" on public.messages
      for select using (exists (select 1 from public.conversations c where c.id = conversation_id and c.user_id = auth.uid()));
  exception when duplicate_object then null; end;
  begin
    create policy "Users manage their messages" on public.messages
      for all using (exists (select 1 from public.conversations c where c.id = conversation_id and c.user_id = auth.uid()))
      with check (exists (select 1 from public.conversations c where c.id = conversation_id and c.user_id = auth.uid()));
  exception when duplicate_object then null; end;
end$$;

-- Profiles for streaks and join date
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  join_date date default current_date,
  display_name text,
  prefs jsonb default '{}'::jsonb,
  streak_count integer default 0,
  last_active_date date
);

alter table public.profiles enable row level security;
-- Replace broad ALL policy with scoped policies (no deletes by default)
drop policy if exists "Users manage their profiles" on public.profiles;
do $$
begin
  begin
    create policy "Users read their profiles" on public.profiles for select using (auth.uid() = id);
  exception when duplicate_object then null; end;
  begin
    create policy "Users update their profiles" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
  exception when duplicate_object then null; end;
  begin
    create policy "Users insert their profiles" on public.profiles for insert with check (auth.uid() = id);
  exception when duplicate_object then null; end;
end$$;

-- Enforce display_name rules: case-insensitive uniqueness and 3–24 chars (null allowed)
-- Extension for case-insensitive ops
create extension if not exists citext;
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

-- Quiz attempts and answers
create table if not exists public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
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
    create policy "Users see their attempts" on public.quiz_attempts for select using (auth.uid() = user_id);
  exception when duplicate_object then null; end;
  begin
    create policy "Users insert attempts" on public.quiz_attempts for insert with check (user_id is null or auth.uid() = user_id);
  exception when duplicate_object then null; end;
  begin
    create policy "Users see their answers" on public.quiz_answers for select using (
      exists (select 1 from public.quiz_attempts a where a.id = attempt_id and a.user_id = auth.uid())
    );
  exception when duplicate_object then null; end;
  begin
    create policy "Users insert answers" on public.quiz_answers for insert with check (
      exists (select 1 from public.quiz_attempts a where a.id = attempt_id and (a.user_id is null or a.user_id = auth.uid()))
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

-- Daily topics (global rotation per day)
create table if not exists public.daily_topics (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  beginner_id text not null,
  intermediate_id text not null,
  advanced_id text not null,
  premium_extra_ids jsonb default '[]'::jsonb,
  created_at timestamp with time zone default now()
);
alter table public.daily_topics enable row level security;
do $$
begin
  begin
    create policy "Public read daily_topics" on public.daily_topics for select using (true);
  exception when duplicate_object then null; end;
end$$;

-- Ensure foreign keys reference topics(id) as text
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'fk_daily_topics_beginner_id'
  ) then
    alter table public.daily_topics
      add constraint fk_daily_topics_beginner_id
      foreign key (beginner_id) references public.topics(id) on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'fk_daily_topics_intermediate_id'
  ) then
    alter table public.daily_topics
      add constraint fk_daily_topics_intermediate_id
      foreign key (intermediate_id) references public.topics(id) on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'fk_daily_topics_advanced_id'
  ) then
    alter table public.daily_topics
      add constraint fk_daily_topics_advanced_id
      foreign key (advanced_id) references public.topics(id) on delete restrict;
  end if;
end$$;

-- User progress per topic/day
create table if not exists public.user_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  topic_id text not null,
  quick_correct boolean,
  quiz_score integer,
  quiz_total integer,
  completed boolean default false,
  created_at timestamp with time zone default now(),
  unique (user_id, date, topic_id)
);
alter table public.user_progress enable row level security;
do $$
begin
  begin
    create policy "Users manage their progress" on public.user_progress for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  exception when duplicate_object then null; end;
end$$;
create index if not exists idx_user_progress_user_date on public.user_progress(user_id, date);

-- User points and streaks (single source of truth for totals)
create table if not exists public.user_points (
  user_id uuid primary key references auth.users(id) on delete cascade,
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
    create policy "Users manage their points" on public.user_points for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  exception when duplicate_object then null; end;
end$$;

-- Daily leaderboard snapshot (public read)
create table if not exists public.leaderboard_daily (
  date date not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  points integer not null,
  rank integer,
  snapshot_at timestamp with time zone default now(),
  primary key (date, user_id)
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

-- Subscriptions (Stripe)
-- Create enum plan_t if missing (no IF NOT EXISTS support for CREATE TYPE)
do $$
begin
  if not exists (select 1 from pg_type where typname = 'plan_t') then
    create type plan_t as enum ('free','premium');
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
  user_id uuid primary key references auth.users(id) on delete cascade,
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
    create policy "Users read their subscription" on public.user_subscriptions for select using (auth.uid() = user_id);
  exception when duplicate_object then null; end;
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

-- Helpful indexes for performance
create index if not exists idx_conversations_user_created on public.conversations(user_id, created_at desc);
create index if not exists idx_messages_conversation_created on public.messages(conversation_id, created_at);
create index if not exists idx_quiz_attempts_user_created on public.quiz_attempts(user_id, created_at desc);
create index if not exists idx_quiz_answers_attempt on public.quiz_answers(attempt_id);
create index if not exists idx_leaderboard_daily_date_points on public.leaderboard_daily(date, points desc);
create index if not exists idx_question_cache_date on public.question_cache(date);
create index if not exists idx_user_points_updated on public.user_points(updated_at desc);
create index if not exists idx_user_subscriptions_stripe_customer on public.user_subscriptions(stripe_customer_id);

-- Daily chat usage quota per user (resets per day)
create table if not exists public.user_chat_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  used int not null default 0,
  primary key (user_id, date)
);
alter table public.user_chat_usage enable row level security;
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'user_chat_usage' and policyname = 'Users manage their chat usage'
  ) then
    create policy "Users manage their chat usage" on public.user_chat_usage for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;
create index if not exists idx_user_chat_usage_user_date on public.user_chat_usage(user_id, date);

-- Safe increment function for chat usage
create or replace function public.increment_chat_usage(p_user_id uuid, p_date date)
returns void as $$
begin
  insert into public.user_chat_usage (user_id, date, used)
  values (p_user_id, p_date, 1)
  on conflict (user_id, date)
  do update set used = public.user_chat_usage.used + 1;
end;
$$ language plpgsql security definer;

-- Keep updated_at fresh automatically
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

-- Bootstrap profiles and points on signup
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, join_date)
  values (new.id, current_date)
  on conflict (id) do nothing;

  insert into public.user_points (user_id, total_points, streak, longest_streak, last_active_date)
  values (new.id, 0, 0, 0, null)
  on conflict (user_id) do nothing;

  return new;
end$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'on_auth_user_created') then
    create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();
  end if;
end$$;

-- Backfill for existing users (in case trigger was added after signups)
do $$
begin
  insert into public.user_points (user_id, total_points, streak, longest_streak, last_active_date)
  select u.id, 0, 0, 0, null
  from auth.users u
  where not exists (select 1 from public.user_points p where p.user_id = u.id);

  insert into public.profiles (id, join_date)
  select u.id, current_date
  from auth.users u
  where not exists (select 1 from public.profiles p where p.id = u.id);
end$$;
