-- Safety interlock: approvals cannot mutate the ledger until the cash rules pass regression tests.
alter table public.dues_settings
  add column if not exists cash_operations_enabled boolean not null default false;

revoke update on table public.dues_settings from authenticated;
drop policy if exists dues_settings_admin_update on public.dues_settings;

create or replace function private.guard_cash_approval()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_enabled boolean;
begin
  if old.status = 'pending' and new.status = 'approved' then
    select cash_operations_enabled into v_enabled
    from public.dues_settings where id = 1;
    if coalesce(v_enabled, false) is not true then
      raise exception 'Persetujuan pembayaran dinonaktifkan sampai tes regresi kas lulus' using errcode = '55000';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_cash_approval() from public, anon, authenticated, service_role;

drop trigger if exists guard_cash_approval on public.payment_submissions;
create trigger guard_cash_approval
  before update of status on public.payment_submissions
  for each row execute function private.guard_cash_approval();
