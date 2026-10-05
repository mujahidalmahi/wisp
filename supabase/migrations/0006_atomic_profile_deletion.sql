-- ============================================================================
-- Migration: 0006_atomic_profile_deletion.sql
-- Purpose:   Transactional Atomic Household Viewing Profile Deletion RPC
--            with Multi-Instance Serialization and Strict Service-Role Isolation.
-- Security:
--   * Locks search_path to public to prevent search path hijacking.
--   * Transaction-level advisory lock (pg_advisory_xact_lock) serializes concurrent
--     deletion requests targeting the same device across distributed backend workers.
--   * Row-level FOR UPDATE lock on ALL profiles belonging to the device locks the set
--     before counting, preventing concurrent deletions from seeing count > 1.
--   * Strict service-role enforcement: only backend service_role can execute this RPC;
--     execution is explicitly REVOKED from public, anon, and authenticated.
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
  -- 0. Strict execution authorization check: Only service_role may invoke this deletion RPC
  if not public.is_service_role_caller() then
    raise exception 'PERMISSION_DENIED_SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;

  if v_clean_device_id is null then
    raise exception 'DEVICE_ID_REQUIRED' using errcode = '22023';
  end if;

  -- 1. Transaction-level advisory lock to serialize concurrent deletions for this device
  --    across distributed backend workers
  perform pg_advisory_xact_lock(hashtext(v_clean_device_id));

  -- 2. Lock ALL profiles belonging to this device with FOR UPDATE to serialize
  --    row-level access and prevent concurrent sole-profile race conditions
  perform 1
  from public.profiles
  where device_id = v_clean_device_id
  for update;

  -- 3. Verify target profile existence and device ownership
  select device_id into v_target_device
  from public.profiles
  where id = p_profile_id;

  if not found then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_target_device <> v_clean_device_id then
    raise exception 'FORBIDDEN_DEVICE_MISMATCH' using errcode = '42501';
  end if;

  -- 4. Count total profiles for this device with row locks held
  select count(*) into v_count
  from public.profiles
  where device_id = v_clean_device_id;

  if v_count <= 1 then
    raise exception 'CANNOT_DELETE_SOLE_PROFILE' using errcode = '23514';
  end if;

  -- 5. Atomically delete target profile
  delete from public.profiles
  where id = p_profile_id and device_id = v_clean_device_id;

  return jsonb_build_object(
    'success', true,
    'message', format('Profile %s deleted successfully', p_profile_id)
  );
end;
$$;

comment on function public.delete_viewing_profile(uuid, text) is
  'Atomically verifies device ownership, locks device profiles to prevent deletion races across distributed workers, and ensures at least one viewing profile remains on the device. Restricted to service_role.';

-- ----------------------------------------------------------------------------
-- 2. Strict Service-Role Scoped Grants
-- ----------------------------------------------------------------------------
revoke all on function public.delete_viewing_profile(uuid, text) from public;
revoke all on function public.delete_viewing_profile(uuid, text) from anon, authenticated;
grant execute on function public.delete_viewing_profile(uuid, text) to service_role;
