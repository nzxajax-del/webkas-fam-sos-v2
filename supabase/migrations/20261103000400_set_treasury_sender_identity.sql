create or replace function public.set_treasury_sender_identity()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  select p.display_name, p.role
    into new.sender_name, new.sender_role
  from public.member_profiles p
  where p.id = new.sender_id
    and p.status = 'active'
    and p.role in ('admin', 'admin_assistant');

  if new.sender_name is null or new.sender_role is null then
    raise exception 'Akun Admin atau Developer aktif diperlukan untuk mencatat brangkas.';
  end if;

  return new;
end;
$$;

drop trigger if exists treasury_history_set_sender_identity on public.treasury_history;
create trigger treasury_history_set_sender_identity
before insert on public.treasury_history
for each row execute function public.set_treasury_sender_identity();
