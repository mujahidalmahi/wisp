-- ============================================================================
-- Migration: 0002_temporal_context_functions.sql
-- Purpose: Deterministic Anti-Spoiler Temporal Context Windowing at DB layer
-- ============================================================================

create or replace function public.get_spoiler_safe_context(
  p_episode_id uuid,
  p_playback_ms bigint,
  p_lookback_ms bigint default 180000
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_program_record jsonb;
  v_active_scene jsonb;
  v_prior_scenes jsonb;
  v_recent_transcript jsonb;
  v_unlocked_entities jsonb;
begin
  -- 1. Fetch Program & Episode metadata
  select jsonb_build_object(
    'program_title', p.title,
    'genre', p.genre,
    'episode_title', e.title,
    'season_number', e.season_number,
    'episode_number', e.episode_number,
    'playback_position_ms', p_playback_ms
  )
  into v_program_record
  from public.episodes e
  join public.programs p on p.id = e.program_id
  where e.id = p_episode_id;

  -- 2. Fetch Active Scene at current playback head
  select jsonb_build_object(
    'scene_index', sc.scene_index,
    'scene_title', sc.scene_title,
    'location_name', sc.location_name,
    'spoiler_safe_summary', sc.spoiler_safe_summary,
    'quick_action_chips', sc.quick_action_chips
  )
  into v_active_scene
  from public.scene_contexts sc
  where sc.episode_id = p_episode_id
    and sc.start_time_ms <= p_playback_ms
  order by sc.start_time_ms desc
  limit 1;

  -- 3. Fetch Completed Scene Summaries up to current playback head (for Spoiler-Safe Recap)
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'scene_index', sc.scene_index,
      'scene_title', sc.scene_title,
      'summary', sc.spoiler_safe_summary
    ) order by sc.scene_index asc
  ), '[]'::jsonb)
  into v_prior_scenes
  from public.scene_contexts sc
  where sc.episode_id = p_episode_id
    and sc.start_time_ms <= p_playback_ms;

  -- 4. Fetch Strictly Bounded Transcript Segments within lookback window
  --    HARD INVARIANT: end_time_ms <= p_playback_ms (never leak future lines!)
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'start_time_ms', ts.start_time_ms,
      'end_time_ms', ts.end_time_ms,
      'speaker', ts.speaker_name,
      'dialogue', ts.dialogue_text,
      'visual_cue', ts.visual_cue
    ) order by ts.start_time_ms asc
  ), '[]'::jsonb)
  into v_recent_transcript
  from public.transcript_segments ts
  where ts.episode_id = p_episode_id
    and ts.end_time_ms <= p_playback_ms
    and ts.start_time_ms >= greatest(0, p_playback_ms - p_lookback_ms);

  -- 5. Fetch Entities & Only Facts Revealed Up To p_playback_ms
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'name', ent.name,
      'type', ent.entity_type,
      'base_description', ent.base_description,
      'progressive_fact', ea.progressive_fact,
      'in_current_scene', (p_playback_ms between ea.start_time_ms and ea.end_time_ms)
    )
  ), '[]'::jsonb)
  into v_unlocked_entities
  from public.entity_appearances ea
  join public.entities ent on ent.id = ea.entity_id
  where ea.episode_id = p_episode_id
    and ea.reveal_time_ms <= p_playback_ms;

  return jsonb_build_object(
    'metadata', coalesce(v_program_record, '{}'::jsonb),
    'active_scene', coalesce(v_active_scene, '{}'::jsonb),
    'prior_scenes', v_prior_scenes,
    'recent_transcript', v_recent_transcript,
    'unlocked_entities', v_unlocked_entities
  );
end;
$$;
