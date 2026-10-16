import React, { useState } from 'react';
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
              {isCorrect ? 'CORRECT! +100 PTS' : 'INCORRECT'}
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
                isFocused && !isAnswered && styles.optionFocused,
                isAnswered && isOptionCorrect && styles.optionCorrect,
                isAnswered && isOptionSelected && !isCorrect && styles.optionIncorrect,
                isAnswered && !isOptionCorrect && !isOptionSelected && styles.optionDimmed,
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
                    isFocused && !isAnswered && styles.optionTextFocused,
                    isAnswered && isOptionCorrect && styles.optionTextCorrect,
                    isAnswered && isOptionSelected && !isCorrect && styles.optionTextIncorrect,
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
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
    marginBottom: 16,
  },
  badgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  quizBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: TVTheme.colors.focusRing,
  },
  quizBadgeText: {
    color: TVTheme.colors.focusRing,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  resultBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
  },
  correctBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.25)',
    borderColor: TVTheme.colors.spoilerSafeBadge,
    borderWidth: 1,
  },
  incorrectBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.25)',
    borderColor: TVTheme.colors.errorBadge,
    borderWidth: 1,
  },
  resultBadgeText: {
    color: TVTheme.colors.textPrimary,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
  },
  questionText: {
    color: TVTheme.colors.textPrimary,
    fontSize: TVTheme.typography.cardHeadline,
    fontWeight: '700',
    lineHeight: 34,
    marginBottom: 16,
  },
  optionsList: {
    flexDirection: 'column',
    gap: 10,
  },
  optionCard: {
    backgroundColor: '#0F172A',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  optionFocused: {
    backgroundColor: TVTheme.colors.cardFocused,
    borderColor: TVTheme.colors.focusRing,
    transform: [{ scale: 1.02 }],
  },
  optionCorrect: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderColor: TVTheme.colors.spoilerSafeBadge,
  },
  optionIncorrect: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderColor: TVTheme.colors.errorBadge,
  },
  optionDimmed: {
    opacity: 0.5,
  },
  optionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  letterCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  letterCircleCorrect: {
    backgroundColor: TVTheme.colors.spoilerSafeBadge,
  },
  letterText: {
    color: TVTheme.colors.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
  optionText: {
    color: TVTheme.colors.textSecondary,
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
  },
  optionTextFocused: {
    color: TVTheme.colors.textPrimary,
  },
  optionTextCorrect: {
    color: '#34D399',
    fontWeight: '700',
  },
  optionTextIncorrect: {
    color: '#F87171',
    fontWeight: '700',
  },
  explanationCard: {
    marginTop: 14,
    padding: 14,
    borderRadius: 10,
    borderLeftWidth: 4,
  },
  explanationCorrect: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderLeftColor: TVTheme.colors.spoilerSafeBadge,
  },
  explanationIncorrect: {
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    borderLeftColor: TVTheme.colors.accentCyan,
  },
  explanationTitle: {
    color: TVTheme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  explanationText: {
    color: TVTheme.colors.textSecondary,
    fontSize: 16,
    lineHeight: 22,
  },
});
