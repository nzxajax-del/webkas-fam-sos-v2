-- Permit Admin Assistants to update only their own display name.
-- Keep all existing admin-role, status, rank, and member-management guards intact.
create or replace function private.guard_admin_role_boundaries()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
begin
  select p.role into v_actor_role from public.member_profiles p
  where p.id = v_actor and p.status = 'active';

  if TG_OP = 'DELETE' then
    if OLD.id = '82eee324-6549-4f74-9723-75ad33aa3cdb'::uuid then
      raise exception 'Akun Admin Master dilindungi dan tidak dapat dihapus' using errcode='42501';
    end if;
    if OLD.role in ('admin','admin_assistant') and not coalesce(private.is_admin_master(),false) then
      raise exception 'Hanya Admin Master yang dapat menghapus atau memberhentikan admin' using errcode='42501';
    end if;
    if v_actor_role = 'admin_assistant' and OLD.rank_code not in ('P1','P2','P3') then
      raise exception 'Admin Asisten hanya dapat mengelola anggota P1–P3' using errcode='42501';
    end if;
    return OLD;
  end if;

  if OLD.id = '82eee324-6549-4f74-9723-75ad33aa3cdb'::uuid then
    if NEW.role <> 'admin' or NEW.status <> 'active' then
      raise exception 'Status dan jabatan Admin Master tidak dapat diubah' using errcode='42501';
    end if;
  end if;

  -- Narrow exception: an active Admin Assistant may change their own display_name,
  -- but no other profile column through this protected table.
  if v_actor_role = 'admin_assistant'
     and OLD.id = v_actor
     and OLD.role = 'admin_assistant'
     and NEW.role = OLD.role
     and NEW.status = OLD.status
     and NEW.rank_code IS NOT DISTINCT FROM OLD.rank_code
     and (to_jsonb(NEW) - 'display_name' - 'updated_at')
         = (to_jsonb(OLD) - 'display_name' - 'updated_at') then
    return NEW;
  end if;

  if (NEW.role is distinct from OLD.role) and not coalesce(private.is_admin_master(),false) then
    raise exception 'Hanya Admin Master yang dapat mengubah jabatan admin' using errcode='42501';
  end if;

  if OLD.role in ('admin','admin_assistant') and OLD.id <> '82eee324-6549-4f74-9723-75ad33aa3cdb'::uuid
     and not coalesce(private.is_admin_master(),false) then
    raise exception 'Akun admin hanya dapat diubah oleh Admin Master' using errcode='42501';
  end if;

  if v_actor_role = 'admin_assistant' then
    if OLD.role <> 'member' or OLD.rank_code not in ('P1','P2','P3') then
      raise exception 'Admin Asisten hanya dapat mengelola anggota P1–P3' using errcode='42501';
    end if;
    if NEW.rank_code not in ('P1','P2','P3') then
      raise exception 'Admin Asisten hanya dapat menetapkan pangkat P1–P3' using errcode='42501';
    end if;
  end if;
  return NEW;
end;
$function$;
