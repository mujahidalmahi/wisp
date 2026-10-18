import React, { useState, useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { TVTheme } from '../../theme/tvTheme';

export interface UnlockedEntity {
  name: string;
  type: string;
  base_description: string;
  progressive_fact: string;
  in_current_scene: boolean;
}

interface Props {
  entities: UnlockedEntity[];
  onAskAboutEntity?: (entity: UnlockedEntity) => void;
}

export const ActiveEntitiesBar: React.FC<Props> = ({ entities, onAskAboutEntity }) => {
  const [selectedEntity, setSelectedEntity] = useState<UnlockedEntity | null>(
    entities?.find((e) => e.in_current_scene) || entities?.[0] || null,
  );
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [isAskFocused, setIsAskFocused] = useState<boolean>(false);

  useEffect(() => {
    if (entities && entities.length > 0) {
      setSelectedEntity(entities.find((e) => e.in_current_scene) || entities[0] || null);
    } else {
      setSelectedEntity(null);
    }
  }, [entities]);

  if (!entities || entities.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>CHARACTERS & LORE ON SCREEN</Text>
        <Text style={styles.sectionSubtitle}>D-PAD SELECT TO INSPECT</Text>
      </View>

      {/* Horizontal Entity Chips */}
      <View style={styles.entityRow}>
        {entities.map((entity, idx) => {
          const isSelected = selectedEntity?.name === entity.name;
          const isFocused = focusedIndex === idx;

          return (
            <Pressable
              key={entity.name}
              onFocus={() => {
                setFocusedIndex(idx);
                setSelectedEntity(entity);
              }}
              onBlur={() => setFocusedIndex(null)}
              onPress={() => setSelectedEntity(entity)}
              style={[
                styles.entityPill,
                isSelected && styles.entityPillSelected,
                isFocused && styles.entityPillFocused,
              ]}
            >
              {entity.in_current_scene && <View style={styles.liveDot} />}
              <Text
                style={[
                  styles.entityPillText,
                  isSelected && styles.entityPillTextSelected,
                  isFocused && styles.entityPillTextFocused,
                ]}
              >
                {entity.name}
              </Text>
              <Text style={styles.entityTypeBadge}>{entity.type}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Selected Entity Spotlight Detail Card */}
      {selectedEntity && (
        <View style={styles.spotlightCard}>
          <View style={styles.cardHeader}>
            <View>
              <Text style={styles.entityName}>{selectedEntity.name}</Text>
              <Text style={styles.entityRole}>{selectedEntity.type}</Text>
            </View>
            {selectedEntity.in_current_scene && (
              <View style={styles.scenePresenceBadge}>
                <Text style={styles.scenePresenceText}>VISIBLE IN THIS SCENE</Text>
              </View>
            )}
          </View>

          <Text style={styles.entityDescription}>{selectedEntity.base_description}</Text>

          {selectedEntity.progressive_fact && (
            <View style={styles.factBox}>
              <Text style={styles.factTitle}>🔒 SPOILER-SAFE LORE UNLOCKED:</Text>
              <Text style={styles.factText}>{selectedEntity.progressive_fact}</Text>
            </View>
          )}

          {onAskAboutEntity && (
            <Pressable
              onFocus={() => setIsAskFocused(true)}
              onBlur={() => setIsAskFocused(false)}
              onPress={() => onAskAboutEntity(selectedEntity)}
              style={({ pressed }) => [
                styles.askButton,
                isAskFocused && styles.askButtonFocused,
                pressed && { opacity: 0.8 },
              ]}
            >
              <Text
                style={[
                  styles.askButtonText,
                  isAskFocused && styles.askButtonTextFocused,
                ]}
              >
                ✨ Ask Wisp about {selectedEntity.name}
              </Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: {
    color: TVTheme.colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  sectionSubtitle: {
    color: TVTheme.colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  entityRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  entityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#0F172A',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  entityPillSelected: {
    backgroundColor: '#1E293B',
    borderColor: TVTheme.colors.accentCyan,
  },
  entityPillFocused: {
    borderColor: TVTheme.colors.focusRing,
    transform: [{ scale: 1.03 }],
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: TVTheme.colors.spoilerSafeBadge,
  },
  entityPillText: {
    color: TVTheme.colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  entityPillTextSelected: {
    color: TVTheme.colors.textPrimary,
    fontWeight: '700',
  },
  entityPillTextFocused: {
    color: '#FFFFFF',
  },
  entityTypeBadge: {
    color: TVTheme.colors.accentCyan,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  spotlightCard: {
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  entityName: {
    color: TVTheme.colors.textPrimary,
    fontSize: 20,
    fontWeight: '800',
  },
  entityRole: {
    color: TVTheme.colors.accentCyan,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  scenePresenceBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: TVTheme.colors.spoilerSafeBadge,
  },
  scenePresenceText: {
    color: TVTheme.colors.spoilerSafeBadge,
    fontSize: 13,
    fontWeight: '700',
  },
  entityDescription: {
    color: TVTheme.colors.textSecondary,
    fontSize: 20,
    lineHeight: 28,
    marginBottom: 10,
  },
  factBox: {
    backgroundColor: 'rgba(30, 41, 59, 0.7)',
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: TVTheme.colors.focusRing,
    marginBottom: 10,
  },
  factTitle: {
    color: TVTheme.colors.focusRing,
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  factText: {
    color: TVTheme.colors.textPrimary,
    fontSize: 18,
    lineHeight: 26,
  },
  askButton: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: TVTheme.colors.accentCyan,
    alignItems: 'center',
  },
  askButtonFocused: {
    borderColor: TVTheme.colors.focusRing,
    borderWidth: 2,
    backgroundColor: 'rgba(245, 158, 11, 0.25)',
  },
  askButtonText: {
    color: TVTheme.colors.accentCyan,
    fontSize: 16,
    fontWeight: '700',
  },
  askButtonTextFocused: {
    color: TVTheme.colors.focusRing,
    fontWeight: '800',
  },
});
