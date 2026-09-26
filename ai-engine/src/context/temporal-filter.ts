import type { RawEpisodeDataset, TemporalProgramContext } from '../types/index.ts';

export function filterContextByTimestamp(
  dataset: RawEpisodeDataset,
  playbackPositionMs: number,
  lookbackMs = 180000,
): TemporalProgramContext {
  const effectivePlayhead = Math.max(0, playbackPositionMs);

  const eligibleScenes = dataset.scenes
    .filter((s) => s.startTimeMs <= effectivePlayhead)
    .sort((a, b) => b.startTimeMs - a.startTimeMs);

  const activeScene = eligibleScenes[0] || dataset.scenes[0];

  const priorScenes = dataset.scenes
    .filter((s) => s.startTimeMs <= effectivePlayhead)
    .sort((a, b) => a.sceneIndex - b.sceneIndex)
    .map((s) => ({
      scene_index: s.sceneIndex,
      scene_title: s.sceneTitle,
      summary: s.spoilerSafeSummary,
    }));

  const lowerBound = Math.max(0, effectivePlayhead - lookbackMs);
  const recentTranscript = dataset.transcriptSegments
    .filter(
      (seg) =>
        seg.endTimeMs <= Math.max(effectivePlayhead, 30000) && seg.startTimeMs >= lowerBound,
    )
    .sort((a, b) => a.startTimeMs - b.startTimeMs)
    .map((seg) => ({
      start_time_ms: seg.startTimeMs,
      end_time_ms: seg.endTimeMs,
      speaker: seg.speaker,
      dialogue: seg.dialogue,
      visual_cue: seg.visualCue,
    }));

  const unlockedEntities: TemporalProgramContext['unlocked_entities'] = [];
  for (const entity of dataset.entities) {
    const revealedAppearances = entity.appearances
      .filter((app) => app.revealTimeMs <= effectivePlayhead)
      .sort((a, b) => b.revealTimeMs - a.revealTimeMs);

    if (revealedAppearances.length > 0) {
      const latestFact = revealedAppearances[0];
      const inCurrentScene = entity.appearances.some(
        (app) => effectivePlayhead >= app.startTimeMs && effectivePlayhead <= app.endTimeMs,
      );
      unlockedEntities.push({
        name: entity.name,
        type: entity.type,
        base_description: entity.baseDescription,
        progressive_fact: latestFact.progressiveFact,
        in_current_scene: inCurrentScene,
      });
    }
  }

  return {
    metadata: {
      program_title: dataset.programTitle,
      genre: dataset.genre,
      episode_title: dataset.episodeTitle,
      season_number: dataset.seasonNumber,
      episode_number: dataset.episodeNumber,
      playback_position_ms: effectivePlayhead,
    },
    active_scene: {
      scene_index: activeScene.sceneIndex,
      scene_title: activeScene.sceneTitle,
      location_name: activeScene.locationName,
      spoiler_safe_summary: activeScene.spoilerSafeSummary,
      quick_action_chips: activeScene.quickActionChips,
    },
    prior_scenes: priorScenes,
    recent_transcript: recentTranscript,
    unlocked_entities: unlockedEntities,
  };
}
