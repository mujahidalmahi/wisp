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
              style={[
                styles.askButton,
                isAskFocused && styles.askButtonFocused,
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
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    color: TVTheme.colors.textMuted,
    fontSize: TVTheme.typography.badge,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  sectionSubtitle: {
    color: TVTheme.colors.textMuted,
    fontSize: TVTheme.typography.microTime,
    fontWeight: '700',
  },
  entityRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 12,
  },
  entityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 24,
    backgroundColor: TVTheme.colors.cardSurface,
    borderWidth: 2,
    borderColor: TVTheme.colors.cardBorder,
  },
  entityPillSelected: {
    backgroundColor: TVTheme.colors.cardFocused,
    borderColor: TVTheme.colors.cardBorderFocused,
  },
  entityPillFocused: {
    borderColor: TVTheme.colors.focusRing,
    borderWidth: 2.5,
    transform: [{ scale: TVTheme.animation.focusScale }],
    ...TVTheme.glow.focusRingShadow,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: TVTheme.colors.spoilerSafeBadge,
  },
  entityPillText: {
    color: TVTheme.colors.textSecondary,
    fontSize: TVTheme.typography.buttonText,
    fontWeight: '700',
  },
  entityPillTextSelected: {
    color: TVTheme.colors.textPrimary,
    fontWeight: '800',
  },
  entityPillTextFocused: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  entityTypeBadge: {
    color: TVTheme.colors.focusRing,
    fontSize: TVTheme.typography.microTime,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  spotlightCard: {
    backgroundColor: TVTheme.colors.cardSurface,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: TVTheme.colors.cardBorder,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  entityName: {
    color: TVTheme.colors.textPrimary,
    fontSize: TVTheme.typography.cardHeadline,
    fontWeight: '800',
  },
  entityRole: {
    color: TVTheme.colors.focusRing,
    fontSize: TVTheme.typography.badge,
    fontWeight: '700',
    marginTop: 2,
  },
  scenePresenceBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: TVTheme.colors.spoilerSafeBadge,
  },
  scenePresenceText: {
    color: TVTheme.colors.spoilerSafeBadge,
    fontSize: TVTheme.typography.badge,
    fontWeight: '800',
  },
  entityDescription: {
    color: TVTheme.colors.textSecondary,
    fontSize: TVTheme.typography.body10Foot,
    lineHeight: 30,
    marginBottom: 14,
  },
  factBox: {
    backgroundColor: TVTheme.colors.cardFocused,
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: TVTheme.colors.focusRing,
    marginBottom: 14,
  },
  factTitle: {
    color: TVTheme.colors.focusRing,
    fontSize: TVTheme.typography.badge,
    fontWeight: '800',
    marginBottom: 6,
    letterSpacing: 0.8,
  },
  factText: {
    color: TVTheme.colors.textPrimary,
    fontSize: TVTheme.typography.subtitle,
    lineHeight: 28,
  },
  askButton: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: TVTheme.colors.focusRing,
    alignItems: 'center',
  },
  askButtonFocused: {
    borderColor: TVTheme.colors.focusRing,
    borderWidth: 2.5,
    backgroundColor: 'rgba(245, 158, 11, 0.25)',
    transform: [{ scale: TVTheme.animation.focusScale }],
    ...TVTheme.glow.focusRingShadow,
  },
  askButtonText: {
    color: TVTheme.colors.focusRing,
    fontSize: TVTheme.typography.buttonText,
    fontWeight: '800',
  },
  askButtonTextFocused: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
});
