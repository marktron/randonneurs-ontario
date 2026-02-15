-- Add optional teaser column and remove sort_order from news table

-- Add teaser column (optional one-line summary for homepage display)
alter table public.news add column teaser text;

-- Remove sort_order column (now using reverse chronological only)
alter table public.news drop column sort_order;

-- Replace index: was (is_published, sort_order, created_at desc), now just (is_published, created_at desc)
drop index if exists idx_news_published;
create index idx_news_published on public.news (is_published, created_at desc);
