-- ============================================================================
-- Migration 0008: Atomic Session Bookmarking & Voting Concurrency Invariants
-- ============================================================================
-- Addresses PR #21 Security Blockers:
--   1. Atomic bookmark append and deduplication with row locking and 100-cap
--   2. Atomic session creation without race conditions or duplicate keys
--   3. Atomic interaction voting with real-time profile device ownership verification
-- ============================================================================

-- 1. RPC: public.add_session_bookmark (Restricted to service_role)
create or replace function public.add_session_bookmark(
  p_device_id text,
  p_episode_id uuid,
  p_profile_id uuid,
  p_bookmark jsonb,
  p_last_playback_position_ms bigint
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
  v_bookmarks jsonb;
  v_clean_device_id text := btrim(p_device_id);
  v_profile_owner text;
begin
  perform public.assert_service_role_caller('add_session_bookmark');

  if v_clean_device_id is null or char_length(v_clean_device_id) < 3 then
    raise exception 'INVALID_DEVICE_ID: Valid device_id is required'
      using errcode = '22023';
  end if;

  if p_bookmark is null or jsonb_typeof(p_bookmark) <> 'object' then
    raise exception 'INVALID_BOOKMARK: JSON object required for bookmark'
      using errcode = '22023';
  end if;

  -- Verify profile ownership if profile_id is provided
  if p_profile_id is not null then
    select pr.device_id into v_profile_owner
    from public.profiles pr
    where pr.id = p_profile_id;

    if v_profile_owner is null or v_profile_owner <> v_clean_device_id then
      raise exception 'PROFILE_MISMATCH: Profile % does not belong to authenticated device %', p_profile_id, v_clean_device_id
        using errcode = '42501';
    end if;
  end if;

  -- Atomic upsert handling existing active session vs expired session vs new session
  insert into public.conversation_sessions (
    device_id,
    episode_id,
    profile_id,
    last_playback_position_ms,
    turn_count,
    recent_turns,
    bookmarked_moments,
    expires_at,
    updated_at
  )
  values (
    v_clean_device_id,
    p_episode_id,
    p_profile_id,
    greatest(0, coalesce(p_last_playback_position_ms, 0)),
    0,
    '[]'::jsonb,
    jsonb_build_array(p_bookmark),
    now() + interval '12 hours',
    now()
  )
  on conflict (device_id, episode_id) do update set
    profile_id = coalesce(excluded.profile_id, public.conversation_sessions.profile_id),
    last_playback_position_ms = greatest(public.conversation_sessions.last_playback_position_ms, excluded.last_playback_position_ms),
    bookmarked_moments = case
      -- Expired session: reset moments array with the new bookmark
      when public.conversation_sessions.expires_at <= now() then
        jsonb_build_array(p_bookmark)
      -- Idempotency: duplicate bookmark by interactionId or (playbackPositionMs + label)
      when exists (
        select 1
        from jsonb_array_elements(public.conversation_sessions.bookmarked_moments) elem
        where (p_bookmark->>'interactionId' is not null and elem->>'interactionId' = p_bookmark->>'interactionId')
           or (elem->>'playbackPositionMs' = p_bookmark->>'playbackPositionMs' and elem->>'label' = p_bookmark->>'label')
      ) then
        public.conversation_sessions.bookmarked_moments
      -- Append and cap at 100 entries
      else
        (
          select jsonb_agg(elem)
          from (
            select elem
            from jsonb_array_elements(public.conversation_sessions.bookmarked_moments || jsonb_build_array(p_bookmark)) elem
            order by (elem->>'playbackPositionMs')::bigint asc
            limit 100
          ) sub
        )
    end,
    expires_at = now() + interval '12 hours',
    updated_at = now()
  returning id, bookmarked_moments into v_session_id, v_bookmarks;

  return jsonb_build_object(
    'success', true,
    'session_id', v_session_id,
    'bookmark', p_bookmark,
    'bookmarked_moments', coalesce(v_bookmarks, '[]'::jsonb)
  );
end;
$$;

comment on function public.add_session_bookmark(text, uuid, uuid, jsonb, bigint) is
  'Atomic RPC for conversation session creation and bookmark appending with profile ownership and 100-cap protection.';

-- 2. RPC: public.vote_interaction_atomic (Restricted to service_role)
create or replace function public.vote_interaction_atomic(
  p_interaction_id uuid,
  p_device_id text,
  p_vote integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_int_id uuid;
  v_prof_id uuid;
  v_dev_id text;
  v_clean_device_id text := btrim(p_device_id);
begin
  perform public.assert_service_role_caller('vote_interaction_atomic');

  if p_vote not in (-1, 0, 1) then
    raise exception 'INVALID_VOTE: Helpful vote must be -1, 0, or 1'
      using errcode = '22023';
  end if;

  select ih.id, ih.profile_id, pr.device_id
  into v_int_id, v_prof_id, v_dev_id
  from public.interaction_history ih
  left join public.profiles pr on pr.id = ih.profile_id
  where ih.id = p_interaction_id;

  if v_int_id is null then
    raise exception 'INTERACTION_NOT_FOUND: Interaction with ID % not found', p_interaction_id
      using errcode = 'P0002';
  end if;

  if v_prof_id is null or v_dev_id is null or v_dev_id <> v_clean_device_id then
    raise exception 'FORBIDDEN: Interaction % does not belong to authenticated device %', p_interaction_id, v_clean_device_id
      using errcode = '42501';
  end if;

  update public.interaction_history
  set user_helpful_vote = p_vote
  where id = p_interaction_id
    and profile_id = v_prof_id;

  return jsonb_build_object(
    'success', true,
    'interactionId', p_interaction_id,
    'vote', p_vote
  );
end;
$$;

comment on function public.vote_interaction_atomic(uuid, text, integer) is
  'Atomic RPC enforcing device ownership verification and recording interaction helpfulness vote without TOCTOU races.';

-- Permissions
revoke all on function public.add_session_bookmark(text, uuid, uuid, jsonb, bigint) from public, anon, authenticated;
grant execute on function public.add_session_bookmark(text, uuid, uuid, jsonb, bigint) to service_role;

revoke all on function public.vote_interaction_atomic(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.vote_interaction_atomic(uuid, text, integer) to service_role;
