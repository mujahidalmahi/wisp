import type { QuickActionChip, WispActionType } from '../types/index.ts';

export const BUILT_IN_ACTION_TYPES = [
  'contextual_qa',
  'entity_explain',
  'scene_explain',
  'episode_recap',
  'post_watch_quiz',
] as const;

export const MIN_CHIPS = 2;
export const MAX_CHIPS = 4;

const MAX_CHIP_LABEL_LENGTH = 160;

type QuizPayload = {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
};

function normalizeActionType(actionType: unknown): WispActionType {
  return BUILT_IN_ACTION_TYPES.includes(actionType as (typeof BUILT_IN_ACTION_TYPES)[number])
    ? (actionType as WispActionType)
    : 'contextual_qa';
}

function normalizeChip(raw: unknown, index: number): QuickActionChip | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }

  const value = raw as Partial<QuickActionChip>;
  const label = typeof value.label === 'string' ? value.label.trim() : '';
  if (!label || label.length > MAX_CHIP_LABEL_LENGTH) {
    return undefined;
  }

  const id = typeof value.id === 'string' && value.id.trim().length > 0 ? value.id.trim() : `wisp-chip-${index + 1}`;

  return {
    id,
    label,
    actionType: normalizeActionType(value.actionType),
  };
}

export function validateChips(
  rawChips: unknown,
  fallbackChips: QuickActionChip[],
): {
  chips: QuickActionChip[];
  usedFallback: boolean;
  droppedChips: number;
  truncatedChips: number;
  coercedActionTypes: number;
} {
  const list = Array.isArray(rawChips) ? rawChips : [];
  const normalized = list.map((chip, index) => normalizeChip(chip, index));
  const chips = normalized.filter((chip): chip is QuickActionChip => Boolean(chip));
  const uniqueById = new Map<string, QuickActionChip>();
  for (const chip of chips) {
    if (!uniqueById.has(chip.id)) {
      uniqueById.set(chip.id, chip);
    }
  }

  const base = [...uniqueById.values()];
  const droppedChips = list.length - base.length;
  const truncatedChips = Math.max(0, base.length - MAX_CHIPS);
  const primary = base.slice(0, MAX_CHIPS);
  const coercedActionTypes = primary.filter((chip, index) => {
    const raw = list[index] as { actionType?: unknown } | undefined;
    return !BUILT_IN_ACTION_TYPES.includes(raw?.actionType as (typeof BUILT_IN_ACTION_TYPES)[number]);
  }).length;

  if (primary.length >= MIN_CHIPS) {
    return {
      chips: primary,
      usedFallback: false,
      droppedChips,
      truncatedChips,
      coercedActionTypes,
    };
  }

  const fallback = Array.isArray(fallbackChips)
    ? fallbackChips
        .map((chip, index) => normalizeChip(chip, index))
        .filter((chip): chip is QuickActionChip => Boolean(chip))
        .slice(0, MAX_CHIPS)
    : [];

  const merged = [...primary];
  for (const chip of fallback) {
    if (merged.length >= MAX_CHIPS) break;
    if (!merged.some((x) => x.id === chip.id)) merged.push(chip);
  }

  while (merged.length < MIN_CHIPS) {
    merged.push({
      id: `wisp-fallback-${merged.length + 1}`,
      label: merged.length % 2 === 0 ? 'Explain this scene' : 'Catch me up so far',
      actionType: merged.length % 2 === 0 ? 'scene_explain' : 'episode_recap',
    });
  }

  return {
    chips: merged,
    usedFallback: true,
    droppedChips,
    truncatedChips,
    coercedActionTypes,
  };
}

export function validateQuizPayload(raw: unknown): { quizPayload?: QuizPayload; rejected: boolean } {
  if (raw == null) {
    return { quizPayload: undefined, rejected: false };
  }

  if (!raw || typeof raw !== 'object') {
    return { quizPayload: undefined, rejected: true };
  }

  const value = raw as Partial<QuizPayload>;
  const question = typeof value.question === 'string' ? value.question.trim() : '';
  const explanation = typeof value.explanation === 'string' ? value.explanation.trim() : '';

  if (!question || !explanation || !Array.isArray(value.options) || value.options.length !== 4) {
    return { quizPayload: undefined, rejected: true };
  }

  const options = value.options.map((option) => (typeof option === 'string' ? option.trim() : ''));
  if (options.some((option) => option.length === 0)) {
    return { quizPayload: undefined, rejected: true };
  }

  if (!Number.isInteger(value.correctIndex) || (value.correctIndex as number) < 0 || (value.correctIndex as number) > 3) {
    return { quizPayload: undefined, rejected: true };
  }

  return {
    quizPayload: {
      question,
      options,
      correctIndex: value.correctIndex as number,
      explanation,
    },
    rejected: false,
  };
}
