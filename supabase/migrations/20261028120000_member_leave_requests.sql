create table public.member_leave_requests (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.member_profiles(id) on delete restrict,
  leave_type text not null check (leave_type in ('offline', 'not_wb')),
  offline_days integer,
  reason text not null check (length(btrim(reason)) between 1 and 1000),
  status text not null default 'submitted' check (status = 'submitted'),
  created_at timestamptz not null default now(),
  constraint member_leave_requests_type_fields check (
    (leave_type = 'offline' and offline_days between 1 and 365)
    or (leave_type = 'not_wb' and offline_days is null)
  )
);

create index member_leave_requests_member_created_idx
  on public.member_leave_requests (member_id, created_at desc);
create index member_leave_requests_created_idx
  on public.member_leave_requests (created_at desc);

alter table public.member_leave_requests enable row level security;

create policy member_leave_requests_select_self_or_admin
  on public.member_leave_requests
  for select to authenticated
  using (member_id = auth.uid() or public.is_admin());

create policy member_leave_requests_insert_self_active
  on public.member_leave_requests
  for insert to authenticated
  with check (
    member_id = auth.uid()
    and exists (
      select 1 from public.member_profiles p
      where p.id = auth.uid()
        and p.status = 'active'
    )
  );

create or replace function public.get_member_leave_requests()
returns table (
  id uuid,
  member_id uuid,
  display_name text,
  rank_code text,
  role text,
  leave_type text,
  offline_days integer,
  reason text,
  created_at timestamptz,
  status text
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  caller_role text;
begin
  select p.role into caller_role
  from public.member_profiles p
  where p.id = auth.uid() and p.status = 'active';

  if caller_role is null then
    raise exception 'Akun aktif diperlukan untuk melihat pengajuan izin.';
  end if;

  return query
  select r.id, r.member_id, p.display_name, p.rank_code, p.role,
         r.leave_type, r.offline_days, r.reason, r.created_at, r.status
  from public.member_leave_requests r
  join public.member_profiles p on p.id = r.member_id
  where r.member_id = auth.uid()
     or caller_role in ('admin', 'admin_assistant')
  order by r.created_at desc
  limit 200;
end;
$$;

revoke all on function public.get_member_leave_requests() from public, anon;
grant execute on function public.get_member_leave_requests() to authenticated;
