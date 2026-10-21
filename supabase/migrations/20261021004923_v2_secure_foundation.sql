-- WEBKAS FAM SOS V2 foundation schema.
-- No legacy data is imported and no daily billing/settlement automation is enabled by this migration.

create table public.member_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null default 'member' check (role in ('member','admin')),
  status text not null default 'pending' check (status in ('pending','active','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint member_profiles_display_name_nonempty check (length(btrim(display_name)) between 1 and 80)
);
create unique index member_profiles_display_name_lower_uidx on public.member_profiles (lower(display_name));

create table public.dues_settings (
  id smallint primary key default 1 check (id = 1),
  report_date date not null default (now() at time zone 'Asia/Jakarta')::date,
  daily_amount numeric(12,2) not null default 1000 check (daily_amount >= 0),
  adm_default numeric(12,2) not null default 10000 check (adm_default >= 0),
  updated_at timestamptz not null default now()
);
insert into public.dues_settings (id) values (1) on conflict (id) do nothing;

create table public.member_wallets (
  member_id uuid primary key references public.member_profiles(id) on delete cascade,
  balance numeric(12,2) not null default 0 check (balance >= 0),
  arrears numeric(12,2) not null default 0 check (arrears >= 0),
  next_pay date,
  unpaid_from date,
  adm_due numeric(12,2) not null default 10000 check (adm_due >= 0),
  exempt_kas boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.member_profiles(id) on delete restrict,
  transaction_type text not null check (transaction_type in ('payment_credit','daily_deduction','arrears_accrual','admin_adjustment','adm_payment')),
  amount numeric(12,2) not null check (amount > 0),
  reference_id uuid,
  description text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index wallet_transactions_member_created_idx on public.wallet_transactions (member_id, created_at desc);

create table public.daily_dues_log (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.member_profiles(id) on delete restrict,
  due_date date not null,
  daily_amount numeric(12,2) not null check (daily_amount >= 0),
  balance_deducted numeric(12,2) not null default 0 check (balance_deducted >= 0),
  arrears_added numeric(12,2) not null default 0 check (arrears_added >= 0),
  outcome text not null check (outcome in ('deducted','arrears','exempt','skipped')),
  created_at timestamptz not null default now(),
  unique (member_id, due_date)
);

create table public.payment_submissions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.member_profiles(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  proof_path text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  review_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint payment_review_fields_consistent check (
    (status = 'pending' and reviewed_by is null and reviewed_at is null)
    or (status in ('approved','rejected') and reviewed_by is not null and reviewed_at is not null)
  )
);
create index payment_submissions_status_created_idx on public.payment_submissions (status, created_at);

create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.member_profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and p.status = 'active'
  );
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  requested_name text;
begin
  requested_name := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '');
  if requested_name is null then
    requested_name := 'member-' || left(new.id::text, 8);
  end if;

  insert into public.member_profiles (id, display_name, role, status)
  values (new.id, requested_name, 'member', 'pending');

  insert into public.member_wallets (member_id, adm_due)
  values (new.id, coalesce((select s.adm_default from public.dues_settings s where s.id = 1), 10000));

  return new;
end;
$$;
revoke all on function public.handle_new_auth_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

create trigger set_member_profiles_updated_at before update on public.member_profiles
  for each row execute function public.set_updated_at();
create trigger set_member_wallets_updated_at before update on public.member_wallets
  for each row execute function public.set_updated_at();
create trigger set_dues_settings_updated_at before update on public.dues_settings
  for each row execute function public.set_updated_at();

alter table public.member_profiles enable row level security;
alter table public.dues_settings enable row level security;
alter table public.member_wallets enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.daily_dues_log enable row level security;
alter table public.payment_submissions enable row level security;
alter table public.admin_audit_log enable row level security;

create policy member_profiles_select_self_or_admin on public.member_profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy member_profiles_admin_update on public.member_profiles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy dues_settings_select_authenticated on public.dues_settings
  for select to authenticated using (auth.uid() is not null);
create policy dues_settings_admin_update on public.dues_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy member_wallets_select_self_or_admin on public.member_wallets
  for select to authenticated
  using (member_id = auth.uid() or public.is_admin());
create policy member_wallets_admin_all on public.member_wallets
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy wallet_transactions_select_self_or_admin on public.wallet_transactions
  for select to authenticated
  using (member_id = auth.uid() or public.is_admin());

create policy daily_dues_log_admin_select on public.daily_dues_log
  for select to authenticated using (public.is_admin());

create policy payment_submissions_select_self_or_admin on public.payment_submissions
  for select to authenticated
  using (member_id = auth.uid() or public.is_admin());
create policy payment_submissions_insert_self_pending on public.payment_submissions
  for insert to authenticated
  with check (
    member_id = auth.uid()
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
    and exists (
      select 1 from public.member_profiles p
      where p.id = auth.uid() and p.status = 'active' and p.role = 'member'
    )
  );
create policy payment_submissions_admin_update on public.payment_submissions
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy admin_audit_log_admin_select on public.admin_audit_log
  for select to authenticated using (public.is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-proofs', 'payment-proofs', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
set public = false, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg','image/png','image/webp'];

create policy payment_proofs_upload_own_folder on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'payment-proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.member_profiles p
      where p.id = auth.uid() and p.status = 'active' and p.role = 'member'
    )
  );
create policy payment_proofs_read_own_or_admin on storage.objects
  for select to authenticated
  using (
    bucket_id = 'payment-proofs'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
    )
  );
create policy payment_proofs_delete_admin on storage.objects
  for delete to authenticated
  using (bucket_id = 'payment-proofs' and public.is_admin());
