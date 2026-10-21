-- Hide transaction rows from the Master Admin report without deleting or updating financial records.
create table if not exists private.admin_transaction_report_state (
  singleton boolean primary key default true check (singleton),
  hidden_through timestamptz,
  updated_by uuid,
  updated_at timestamptz not null default clock_timestamp()
);
insert into private.admin_transaction_report_state (singleton)
values (true)
on conflict (singleton) do nothing;

revoke all on table private.admin_transaction_report_state from public, anon, authenticated;

create or replace function public.admin_get_transaction_report_cutoff()
returns timestamptz
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_actor uuid := auth.uid();
  v_cutoff timestamptz;
begin
  if v_actor is null or not private.is_admin_master()
     or not exists (
       select 1 from public.member_profiles
       where id = v_actor and role = 'admin' and status = 'active'
     ) then
    raise exception 'Hanya Admin Master aktif yang dapat melihat laporan transaksi' using errcode = '42501';
  end if;

  select hidden_through into v_cutoff
  from private.admin_transaction_report_state
  where singleton = true;
  return v_cutoff;
end;
$function$;

create or replace function public.admin_hide_transaction_history()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_actor uuid := auth.uid();
  v_cutoff timestamptz;
  v_hidden_count bigint := 0;
begin
  if v_actor is null or not private.is_admin_master()
     or not exists (
       select 1 from public.member_profiles
       where id = v_actor and role = 'admin' and status = 'active'
     ) then
    raise exception 'Hanya Admin Master aktif yang dapat menyembunyikan riwayat transaksi' using errcode = '42501';
  end if;

  select max(created_at) into v_cutoff from public.wallet_transactions;
  if v_cutoff is not null then
    select count(*) into v_hidden_count
    from public.wallet_transactions
    where created_at <= v_cutoff;

    insert into private.admin_transaction_report_state (singleton, hidden_through, updated_by, updated_at)
    values (true, v_cutoff, v_actor, clock_timestamp())
    on conflict (singleton) do update
      set hidden_through = greatest(
            coalesce(private.admin_transaction_report_state.hidden_through, '-infinity'::timestamptz),
            excluded.hidden_through
          ),
          updated_by = excluded.updated_by,
          updated_at = excluded.updated_at;
  end if;

  insert into public.admin_audit_log (admin_id, action, target_type, details)
  values (
    v_actor,
    'hide_transaction_history_from_report',
    'wallet_transactions',
    jsonb_build_object(
      'hidden_count', v_hidden_count,
      'hidden_through', v_cutoff,
      'financial_rows_deleted_or_updated', false
    )
  );

  return jsonb_build_object(
    'success', true,
    'hidden_count', v_hidden_count,
    'hidden_through', v_cutoff,
    'financial_rows_deleted_or_updated', false
  );
end;
$function$;

revoke all on function public.admin_get_transaction_report_cutoff() from public, anon;
revoke all on function public.admin_hide_transaction_history() from public, anon;
grant execute on function public.admin_get_transaction_report_cutoff() to authenticated;
grant execute on function public.admin_hide_transaction_history() to authenticated;
