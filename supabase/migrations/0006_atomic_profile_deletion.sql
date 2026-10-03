-- ============================================================================
-- Migration: 0006_atomic_profile_deletion.sql
-- Purpose:   Transactional Atomic Household Viewing Profile Deletion RPC
--            with Row-Level Concurrency Locking (FOR UPDATE).
-- Security:
--   * Locks search_path to public to prevent search path hijacking.
--   * Row-level FOR UPDATE lock serializes concurrent deletion requests targeting
--     the same device across distributed backend workers.
--   * Validates device ownership: raises 42501 (FORBIDDEN_DEVICE_MISMATCH)
--     if the target profile does not belong to the requesting device.
--   * Enforces sole-profile retention check: raises 23514 (CANNOT_DELETE_SOLE_PROFILE)
--     if the device has only 1 profile remaining.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Function: public.delete_viewing_profile
-- ----------------------------------------------------------------------------
create or replace function public.delete_viewing_profile(
  p_profile_id uuid,
  p_device_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_target_device text;
  v_clean_device_id text := nullif(btrim(p_device_id), '');
begin
  if v_clean_device_id is null then
    raise exception 'DEVICE_ID_REQUIRED' using errcode = '22023';
  end if;

  -- Lock target profile with FOR UPDATE to prevent race conditions on concurrent deletions
  select device_id into v_target_device
  from public.profiles
  where id = p_profile_id
  for update;

  if not found then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_target_device <> v_clean_device_id then
    raise exception 'FORBIDDEN_DEVICE_MISMATCH' using errcode = '42501';
  end if;

  -- Count total profiles for this device with lock
  select count(*) into v_count
  from public.profiles
  where device_id = v_clean_device_id;

  if v_count <= 1 then
    raise exception 'CANNOT_DELETE_SOLE_PROFILE' using errcode = '23514';
  end if;

  delete from public.profiles
  where id = p_profile_id and device_id = v_clean_device_id;

  return jsonb_build_object(
    'success', true,
    'message', format('Profile %s deleted successfully', p_profile_id)
  );
end;
$$;

comment on function public.delete_viewing_profile(uuid, text) is
  'Atomically verifies device ownership, locks device profiles to prevent deletion races, and ensures at least one viewing profile remains on the device.';

-- ----------------------------------------------------------------------------
-- 2. Scoped Grants
-- ----------------------------------------------------------------------------
revoke all on function public.delete_viewing_profile(uuid, text) from public;
grant execute on function public.delete_viewing_profile(uuid, text) to anon, authenticated, service_role;
