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
import { AlexaVoiceModal } from './components/modals/AlexaVoiceModal';
import { RemoteControlGuideModal } from './components/modals/RemoteControlGuideModal';
import { TVTheme } from './theme/tvTheme';

export default function App() {
  const [selectedProgram, setSelectedProgram] = useState<CatalogProgram>(DEMO_PROGRAMS[0]);
  const [episodeId, setEpisodeId] = useState<string>(selectedProgram.episodeId);
  const [playbackPositionMs, setPlaybackPositionMs] = useState<number>(35000);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [overlayVisible, setOverlayVisible] = useState<boolean>(false);
  const [catalogVisible, setCatalogVisible] = useState<boolean>(false);
  const [alexaModalVisible, setAlexaModalVisible] = useState<boolean>(false);
  const [remoteGuideVisible, setRemoteGuideVisible] = useState<boolean>(false);
  const [profileMode, setProfileMode] = useState<HouseholdProfileMode>('quick_glance');

  const [sceneContext, setSceneContext] = useState<InstantSceneContext | null>(null);
  const [responseCard, setResponseCard] = useState<WispResponseCard | null>(null);
  const [lastInquiryPrompt, setLastInquiryPrompt] = useState<string | null>(null);
  const [lastChip, setLastChip] = useState<QuickActionChip | null>(null);
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

  const handleTogglePlayPause = useCallback(() => {
    setIsPlaying((prev) => !prev);
  }, []);

  // Continuous playback timer simulation (1s progression)
  useEffect(() => {
    if (!isPlaying) return;

    const timer = setInterval(() => {
      setPlaybackPositionMs((prev) => {
        const maxMs = selectedProgram.durationSeconds * 1000;
        if (prev >= maxMs) {
          setIsPlaying(false);
          return maxMs;
        }
        return prev + 1000;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isPlaying, selectedProgram.durationSeconds]);

  useTVRemoteHandler({
    onToggleWispOverlay: handleToggleWispOverlay,
    onToggleCatalog: () => setCatalogVisible((prev) => !prev),
    onToggleAlexaVoice: () => setAlexaModalVisible((prev) => !prev),
    onToggleRemoteGuide: () => setRemoteGuideVisible((prev) => !prev),
    onPlayPause: handleTogglePlayPause,
    onSeek: (deltaMs: number) => {
      setPlaybackPositionMs((prev) =>
        Math.max(0, Math.min(selectedProgram.durationSeconds * 1000, prev + deltaMs)),
      );
    },
    onBack: () => {
      if (alexaModalVisible) {
        setAlexaModalVisible(false);
      } else if (remoteGuideVisible) {
        setRemoteGuideVisible(false);
      } else if (catalogVisible) {
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
    setLastInquiryPrompt(null);
    setLastChip(null);
  };

  const handleSelectChip = async (chip: QuickActionChip) => {
    setLoadingAi(true);
    setErrorMessage(null);
    setLastInquiryPrompt(chip.label);
    setLastChip(chip);
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

  const handleSelectVoiceQuery = async (chip: QuickActionChip) => {
    setOverlayVisible(true);
    await handleSelectChip(chip);
  };

  const handleRetry = () => {
    if (lastChip) {
      handleSelectChip(lastChip);
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
        isPlaying={isPlaying}
        sceneMarkers={selectedProgram.sceneMarkers}
        recentTranscript={sceneContext?.recent_transcript}
        onInvokeWisp={handleToggleWispOverlay}
        onAdvanceTimestamp={(delta) =>
          setPlaybackPositionMs((prev) =>
            Math.max(0, Math.min(selectedProgram.durationSeconds * 1000, prev + delta)),
          )
        }
        onOpenCatalog={() => setCatalogVisible(true)}
        onTogglePlayPause={handleTogglePlayPause}
        onOpenAlexaVoice={() => setAlexaModalVisible(true)}
        onOpenRemoteGuide={() => setRemoteGuideVisible(true)}
      />

      <WispOverlayDrawer
        visible={overlayVisible}
        playbackPositionMs={playbackPositionMs}
        sceneContext={sceneContext}
        responseCard={responseCard}
        lastInquiryPrompt={lastInquiryPrompt}
        loadingAi={loadingAi}
        errorMessage={errorMessage}
        profileMode={profileMode}
        onChangeProfileMode={setProfileMode}
        onSelectChip={handleSelectChip}
        onAskAboutEntity={handleAskAboutEntity}
        onBackToScene={() => setResponseCard(null)}
        onRetry={handleRetry}
      />

      <CatalogSelector
        visible={catalogVisible}
        currentEpisodeId={episodeId}
        onSelectProgram={handleSelectProgram}
        onClose={() => setCatalogVisible(false)}
      />

      <AlexaVoiceModal
        visible={alexaModalVisible}
        onSelectQuery={handleSelectVoiceQuery}
        onClose={() => setAlexaModalVisible(false)}
      />

      <RemoteControlGuideModal
        visible={remoteGuideVisible}
        onClose={() => setRemoteGuideVisible(false)}
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
