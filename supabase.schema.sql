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
  streak_count integer default 0,
  last_active_date date
);

alter table public.profiles enable row level security;
create policy "Users manage their profiles" on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);
