import React, { useState, useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { TVTheme } from '../../theme/tvTheme';

interface QuizPayload {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

interface Props {
  quiz: QuizPayload;
  onAnswerSelected?: (selectedIndex: number, isCorrect: boolean) => void;
}

export const InteractiveQuizCard: React.FC<Props> = ({ quiz, onAnswerSelected }) => {
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  useEffect(() => {
    setSelectedIndex(null);
    setFocusedIndex(null);
  }, [quiz?.question]);

  const handleSelectOption = (idx: number) => {
    if (selectedIndex !== null) return; // Prevent changing answer after selection
    setSelectedIndex(idx);
    const isCorrect = idx === quiz.correctIndex;
    onAnswerSelected?.(idx, isCorrect);
  };

  const isAnswered = selectedIndex !== null;
  const isCorrect = selectedIndex === quiz.correctIndex;

  return (
    <View style={styles.container}>
      {/* Quiz Header Badge */}
      <View style={styles.badgeRow}>
        <View style={styles.quizBadge}>
          <Text style={styles.quizBadgeText}>TRIVIA • POST-WATCH CHALLENGE</Text>
        </View>
        {isAnswered && (
          <View style={[styles.resultBadge, isCorrect ? styles.correctBadge : styles.incorrectBadge]}>
            <Text style={styles.resultBadgeText}>
              {isCorrect ? '✓ CORRECT! +100 PTS' : '✕ INCORRECT'}
            </Text>
          </View>
        )}
      </View>

      {/* Question */}
      <Text style={styles.questionText}>{quiz.question}</Text>

      {/* Options */}
      <View style={styles.optionsList}>
        {quiz.options.map((option, idx) => {
          const isFocused = focusedIndex === idx;
          const isOptionSelected = selectedIndex === idx;
          const isOptionCorrect = idx === quiz.correctIndex;
          const letterPrefix = String.fromCharCode(65 + idx); // A, B, C, D

          return (
            <Pressable
              key={idx}
              hasTVPreferredFocus={idx === 0 && !isAnswered}
              onFocus={() => setFocusedIndex(idx)}
              onBlur={() => setFocusedIndex(null)}
              onPress={() => handleSelectOption(idx)}
              style={[
                styles.optionCard,
                isAnswered && isOptionCorrect && styles.optionCorrect,
                isAnswered && isOptionSelected && !isCorrect && styles.optionIncorrect,
                isAnswered && !isOptionCorrect && !isOptionSelected && styles.optionDimmed,
                isFocused && styles.optionFocused,
                isFocused && isAnswered && styles.optionFocusedPostAnswer,
              ]}
            >
              <View style={styles.optionContent}>
                <View
                  style={[
                    styles.letterCircle,
                    isOptionCorrect && isAnswered && styles.letterCircleCorrect,
                  ]}
                >
                  <Text style={styles.letterText}>{letterPrefix}</Text>
                </View>
                <Text
                  style={[
                    styles.optionText,
                    isFocused && styles.optionTextFocused,
                    isAnswered && isOptionCorrect && styles.optionTextCorrect,
                    isAnswered && isOptionSelected && !isCorrect && styles.optionTextIncorrect,
                    isFocused && isAnswered && { fontWeight: '800' as const },
                  ]}
                >
                  {option}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      {/* Explanation Reveal */}
      {isAnswered && (
        <View style={[styles.explanationCard, isCorrect ? styles.explanationCorrect : styles.explanationIncorrect]}>
          <Text style={styles.explanationTitle}>
            {isCorrect ? '💡 Did You Know?' : 'ℹ️ Correct Insight:'}
          </Text>
          <Text style={styles.explanationText}>{quiz.explanation}</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: TVTheme.colors.cardSurface,
    padding: TVTheme.spacing.cardPadding,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: TVTheme.colors.cardBorder,
    marginBottom: 18,
  },
  badgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  quizBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: TVTheme.colors.focusRing,
  },
  quizBadgeText: {
    color: TVTheme.colors.focusRing,
    fontSize: TVTheme.typography.badge,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  resultBadge: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
  },
  correctBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.25)',
    borderColor: TVTheme.colors.spoilerSafeBadge,
    borderWidth: 1.5,
  },
  incorrectBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.25)',
    borderColor: TVTheme.colors.errorBadge,
    borderWidth: 1.5,
  },
  resultBadgeText: {
    color: TVTheme.colors.textPrimary,
    fontSize: TVTheme.typography.badge,
    fontWeight: '800',
    letterSpacing: 1,
  },
  questionText: {
    color: TVTheme.colors.textPrimary,
    fontSize: TVTheme.typography.cardHeadline,
    fontWeight: '800',
    lineHeight: 36,
    marginBottom: 18,
  },
  optionsList: {
    flexDirection: 'column',
    gap: 12,
  },
  optionCard: {
    backgroundColor: TVTheme.colors.cardSurface,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: TVTheme.colors.cardBorder,
  },
  optionFocused: {
    backgroundColor: TVTheme.colors.cardFocused,
    borderColor: TVTheme.colors.focusRing,
    borderWidth: 2.5,
    transform: [{ scale: TVTheme.animation.focusScale }],
    ...TVTheme.glow.focusRingShadow,
  },
  optionFocusedPostAnswer: {
    opacity: 1,
    borderColor: TVTheme.colors.focusRing,
    borderWidth: 2.5,
    ...TVTheme.glow.focusRingShadow,
  },
  optionCorrect: {
    backgroundColor: 'rgba(16, 185, 129, 0.22)',
    borderColor: TVTheme.colors.spoilerSafeBadge,
  },
  optionIncorrect: {
    backgroundColor: 'rgba(239, 68, 68, 0.22)',
    borderColor: TVTheme.colors.errorBadge,
  },
  optionDimmed: {
    opacity: 0.5,
  },
  optionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  letterCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: TVTheme.colors.activeTabBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letterCircleCorrect: {
    backgroundColor: TVTheme.colors.spoilerSafeBadge,
  },
  letterText: {
    color: TVTheme.colors.textPrimary,
    fontSize: TVTheme.typography.buttonText,
    fontWeight: '800',
  },
  optionText: {
    color: TVTheme.colors.textSecondary,
    fontSize: TVTheme.typography.body10Foot,
    fontWeight: '700',
    flex: 1,
  },
  optionTextFocused: {
    color: TVTheme.colors.textPrimary,
  },
  optionTextCorrect: {
    color: '#34D399',
    fontWeight: '800',
  },
  optionTextIncorrect: {
    color: '#F87171',
    fontWeight: '800',
  },
  explanationCard: {
    marginTop: 16,
    padding: 18,
    borderRadius: 12,
    borderLeftWidth: 4,
  },
  explanationCorrect: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderLeftColor: TVTheme.colors.spoilerSafeBadge,
  },
  explanationIncorrect: {
    backgroundColor: 'rgba(239, 68, 68, 0.14)',
    borderLeftColor: TVTheme.colors.errorBadge,
  },
  explanationTitle: {
    color: TVTheme.colors.textPrimary,
    fontSize: TVTheme.typography.subtitle,
    fontWeight: '800',
    marginBottom: 6,
  },
  explanationText: {
    color: TVTheme.colors.textSecondary,
    fontSize: TVTheme.typography.buttonText,
    lineHeight: 26,
  },
});
