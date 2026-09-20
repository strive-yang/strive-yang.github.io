-- Run once in the Supabase SQL editor before enabling cloud sync.
create table if not exists public.reader_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id text not null,
  position jsonb not null default '{}'::jsonb,
  bookmarks jsonb not null default '[]'::jsonb,
  bookmarks_updated_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, book_id)
);

alter table public.reader_state enable row level security;

grant select, insert, update, delete on table public.reader_state to authenticated;

drop policy if exists "Readers can view their own state" on public.reader_state;
create policy "Readers can view their own state"
on public.reader_state for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Readers can create their own state" on public.reader_state;
create policy "Readers can create their own state"
on public.reader_state for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Readers can update their own state" on public.reader_state;
create policy "Readers can update their own state"
on public.reader_state for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Readers can delete their own state" on public.reader_state;
create policy "Readers can delete their own state"
on public.reader_state for delete
to authenticated
using ((select auth.uid()) = user_id);
