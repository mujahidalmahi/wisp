import React, { useCallback, useEffect, useState } from 'react';
import { SafeAreaView, StyleSheet } from 'react-native';
import { EnvConfig } from './config/env';
import { WispApiClient } from './services/api.client';
import {
  HouseholdProfileMode,
  InstantSceneContext,
  QuickActionChip,
  WispResponseCard,
} from './types/wisp';
import { useTVRemoteHandler } from './hooks/useTVRemoteHandler';
import { VideoPlayerSurface } from './components/player/VideoPlayerSurface';
import { WispOverlayDrawer } from './components/overlay/WispOverlayDrawer';
import { UnlockedEntity } from './components/overlay/ActiveEntitiesBar';
import { CatalogSelector, DEMO_PROGRAMS, CatalogProgram } from './components/catalog/CatalogSelector';
import { TVTheme } from './theme/tvTheme';

export default function App() {
  const [selectedProgram, setSelectedProgram] = useState<CatalogProgram>(DEMO_PROGRAMS[0]);
  const [episodeId, setEpisodeId] = useState<string>(selectedProgram.episodeId);
  const [playbackPositionMs, setPlaybackPositionMs] = useState<number>(35000);
  const [overlayVisible, setOverlayVisible] = useState<boolean>(false);
  const [catalogVisible, setCatalogVisible] = useState<boolean>(false);
  const [profileMode, setProfileMode] = useState<HouseholdProfileMode>('quick_glance');

  const [sceneContext, setSceneContext] = useState<InstantSceneContext | null>(null);
  const [responseCard, setResponseCard] = useState<WispResponseCard | null>(null);
  const [loadingAi, setLoadingAi] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadInstantSceneContext = useCallback(async (epId: string, posMs: number) => {
    try {
      const ctx = await WispApiClient.fetchInstantSceneContext(epId, posMs);
      setSceneContext(ctx);
      setErrorMessage(null);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Unable to reach Wisp backend');
    }
  }, []);

  const handleToggleWispOverlay = useCallback(() => {
    setOverlayVisible((prev) => {
      const next = !prev;
      if (next) {
        setResponseCard(null);
        loadInstantSceneContext(episodeId, playbackPositionMs);
      }
      return next;
    });
  }, [episodeId, playbackPositionMs, loadInstantSceneContext]);

  useTVRemoteHandler({
    onToggleWispOverlay: handleToggleWispOverlay,
    onBack: () => {
      if (catalogVisible) {
        setCatalogVisible(false);
      } else if (overlayVisible) {
        setOverlayVisible(false);
      }
    },
  });

  useEffect(() => {
    loadInstantSceneContext(episodeId, playbackPositionMs);
  }, [episodeId, playbackPositionMs, loadInstantSceneContext]);

  const handleSelectProgram = (prog: CatalogProgram) => {
    setSelectedProgram(prog);
    setEpisodeId(prog.episodeId);
    setPlaybackPositionMs(25000); // Start near beginning of chosen show
    setResponseCard(null);
    loadInstantSceneContext(prog.episodeId, 25000);
  };

  const handleSelectChip = async (chip: QuickActionChip) => {
    setLoadingAi(true);
    setErrorMessage(null);
    try {
      const card = await WispApiClient.queryWispAi({
        episodeId,
        playbackPositionMs,
        actionType: chip.actionType,
        prompt: chip.label,
        profileMode,
      });
      setResponseCard(card);
    } catch (err: any) {
      setErrorMessage(err?.message || 'AI provider request failed');
    } finally {
      setLoadingAi(false);
    }
  };

  const handleAskAboutEntity = async (entity: UnlockedEntity) => {
    await handleSelectChip({
      id: `entity-${entity.name}`,
      label: `Tell me about ${entity.name}`,
      actionType: 'entity_explain',
    });
  };

  return (
    <SafeAreaView style={styles.root}>
      <VideoPlayerSurface
        programTitle={sceneContext?.metadata.program_title || selectedProgram.title}
        episodeTitle={sceneContext?.metadata.episode_title || selectedProgram.episodeTitle}
        genre={selectedProgram.genre}
        playbackPositionMs={playbackPositionMs}
        durationMs={selectedProgram.durationSeconds * 1000}
        overlayVisible={overlayVisible}
        onInvokeWisp={handleToggleWispOverlay}
        onAdvanceTimestamp={(delta) =>
          setPlaybackPositionMs((prev) =>
            Math.max(0, Math.min(selectedProgram.durationSeconds * 1000, prev + delta)),
          )
        }
        onOpenCatalog={() => setCatalogVisible(true)}
      />

      <WispOverlayDrawer
        visible={overlayVisible}
        playbackPositionMs={playbackPositionMs}
        sceneContext={sceneContext}
        responseCard={responseCard}
        loadingAi={loadingAi}
        errorMessage={errorMessage}
        profileMode={profileMode}
        onChangeProfileMode={setProfileMode}
        onSelectChip={handleSelectChip}
        onAskAboutEntity={handleAskAboutEntity}
      />

      <CatalogSelector
        visible={catalogVisible}
        currentEpisodeId={episodeId}
        onSelectProgram={handleSelectProgram}
        onClose={() => setCatalogVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: TVTheme.colors.background,
  },
});
