-- Create news table for homepage notices/announcements
create table public.news (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null default '',
  is_published boolean not null default false,
  sort_order integer not null default 0,
  created_by uuid references public.admins(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for homepage query: published items sorted by sort_order, created_at
create index idx_news_published on public.news (is_published, sort_order, created_at desc);

-- RLS policies
alter table public.news enable row level security;

-- Public can read published news items
create policy "Public can read published news"
  on public.news for select
  using (is_published = true);

-- Service role (admin) can do everything (bypasses RLS via supabase-server.ts)
