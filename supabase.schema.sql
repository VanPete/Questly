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

create policy "Users see their conversations" on public.conversations
  for select using (auth.uid() = user_id);
create policy "Users manage their conversations" on public.conversations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users see their messages" on public.messages
  for select using (exists (select 1 from public.conversations c where c.id = conversation_id and c.user_id = auth.uid()));
create policy "Users manage their messages" on public.messages
  for all using (exists (select 1 from public.conversations c where c.id = conversation_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.conversations c where c.id = conversation_id and c.user_id = auth.uid()));

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
create policy "Users manage their profiles" on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);

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

create policy "Users see their attempts" on public.quiz_attempts for select using (user_id is null or auth.uid() = user_id);
create policy "Users insert attempts" on public.quiz_attempts for insert with check (true);

create policy "Users see their answers" on public.quiz_answers for select using (
  exists (select 1 from public.quiz_attempts a where a.id = attempt_id and (a.user_id is null or a.user_id = auth.uid()))
);
create policy "Users insert answers" on public.quiz_answers for insert with check (
  exists (select 1 from public.quiz_attempts a where a.id = attempt_id and (a.user_id is null or a.user_id = auth.uid()))
);

-- Learning plans
create table if not exists public.learning_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  topic_id text not null,
  title text not null,
  start_date date default current_date,
  created_at timestamp with time zone default now()
);

create table if not exists public.plan_tasks (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.learning_plans(id) on delete cascade,
  day_index integer not null,
  task text not null,
  completed boolean default false,
  completed_at timestamp with time zone
);

alter table public.learning_plans enable row level security;
alter table public.plan_tasks enable row level security;

create policy "Users manage their plans" on public.learning_plans for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage their tasks" on public.plan_tasks for all using (
  exists (select 1 from public.learning_plans p where p.id = plan_id and p.user_id = auth.uid())
) with check (
  exists (select 1 from public.learning_plans p where p.id = plan_id and p.user_id = auth.uid())
);

-- Content expansion seeds
create table if not exists public.topics_raw (
  id uuid primary key default gen_random_uuid(),
  domain text not null,
  idea text not null,
  created_at timestamp with time zone default now()
);
alter table public.topics_raw enable row level security;
create policy "Public read topics_raw" on public.topics_raw for select using (true);

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
create policy "Public read daily_topics" on public.daily_topics for select using (true);

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
create policy "Users manage their progress" on public.user_progress for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
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
create policy "Users manage their points" on public.user_points for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

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
create policy "Public read leaderboard_daily" on public.leaderboard_daily for select using (true);
-- Allow upserts by serverless anon key (dev). In production use a service role.
create policy if not exists "Public insert leaderboard_daily" on public.leaderboard_daily for insert with check (true);
create policy if not exists "Public update leaderboard_daily" on public.leaderboard_daily for update using (true) with check (true);

-- Subscriptions (Stripe)
create type if not exists plan_t as enum ('free','premium');
create table if not exists public.user_subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan plan_t not null default 'free',
  stripe_customer_id text,
  current_period_end timestamp with time zone,
  status text,
  updated_at timestamp with time zone default now()
);
alter table public.user_subscriptions enable row level security;
create policy "Users read their subscription" on public.user_subscriptions for select using (auth.uid() = user_id);

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
create policy "Public read question_cache" on public.question_cache for select using (true);
-- Allow inserts/updates by anyone for now (server uses anon key). Consider restricting with service role in prod.
create policy "Public write question_cache" on public.question_cache for insert with check (true);
create policy "Public update question_cache" on public.question_cache for update using (true) with check (true);
