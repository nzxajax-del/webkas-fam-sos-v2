create index if not exists dues_rate_history_created_by_idx
on public.dues_rate_history(created_by)
where created_by is not null;
