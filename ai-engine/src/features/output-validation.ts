import type {
  QuickActionChip,
  WispActionType,
} from '../types/index.ts';

export const MIN_CHIPS = 2;
export const MAX_CHIPS = 4;
export const REQUIRED_QUIZ_OPTIONS = 4;
export const SAFE_FALLBACK_ACTION: WispActionType = 'contextual_qa';

export const BUILT_IN_ACTION_TYPES: WispActionType[] = [
  'contextual_qa',
  'entity_explain',
  'scene_explain',
  'episode_recap',
  'post_watch_quiz',
];

export interface ChipValidationResult {
  chips: QuickActionChip[];
  coercedActionTypes: number;
  droppedChips: number;
  truncatedChips: number;
  usedFallback: boolean;
}

/**
 * Enforces the AGENTS.md rule 4 contract: every AI card must offer 2-4 D-pad
 * selectable chips whose actionTypes the engine can actually resolve.
 *
 * Chips with unusable labels are dropped, duplicates collapse by id, and
 * unrecognized actionTypes are coerced to `contextual_qa`. That coercion matches
 * the AiFeatureRegistry fallback, but makes it explicit and observable instead
 * of silently rerouting the viewer's D-pad selection.
 */
export function validateChips(
  rawChips: unknown,
  fallbackChips: QuickActionChip[],
  maxLabelLength = 80,
): ChipValidationResult {
  const candidates = Array.isArray(rawChips) ? rawChips : [];
  const accepted: QuickActionChip[] = [];
  const seenIds = new Set<string>();
  let coercedActionTypes = 0;
  let droppedChips = 0;

  for (const candidate of candidates) {
    if (!isRecord(candidate)) {
      droppedChips += 1;
      continue;
    }

    const label = typeof candidate.label === 'string' ? candidate.label.trim() : '';
    if (!label || label.length > maxLabelLength) {
      droppedChips += 1;
      continue;
    }

    const id =
      typeof candidate.id === 'string' && candidate.id.trim()
        ? candidate.id.trim()
        : `chip-${accepted.length + 1}`;
    if (seenIds.has(id)) {
      droppedChips += 1;
      continue;
    }

    const requested = candidate.actionType;
    let actionType: WispActionType;
    if (typeof requested === 'string' && isKnownActionType(requested)) {
      actionType = requested;
    } else {
      actionType = SAFE_FALLBACK_ACTION;
      coercedActionTypes += 1;
    }

    seenIds.add(id);
    accepted.push({ id, label, actionType });

    if (accepted.length >= MAX_CHIPS) {
      break;
    }
  }

  const truncatedChips = Math.max(0, candidates.length - MAX_CHIPS);
  const usedFallback = accepted.length < MIN_CHIPS;

  if (!usedFallback) {
    return { chips: accepted, coercedActionTypes, droppedChips, truncatedChips, usedFallback };
  }

  const fallback = fallbackChips
    .filter(isUsableChip)
    .slice(0, MAX_CHIPS)
    .map((chip) => {
      const actionType = isKnownActionType(chip.actionType) ? chip.actionType : SAFE_FALLBACK_ACTION;
      if (actionType !== chip.actionType) {
        coercedActionTypes += 1;
      }
      return { id: chip.id, label: chip.label.trim(), actionType };
    });

  return {
    chips: fallback,
    coercedActionTypes,
    droppedChips,
    truncatedChips,
    usedFallback,
  };
}

/**
 * Validates the 4-option quiz contract. Returns undefined when the payload is
 * unusable so a malformed quiz is dropped rather than rendered half-correct.
 */
export function validateQuizPayload(raw: unknown): {
  quizPayload?: {
    question: string;
    options: string[];
    correctIndex: number;
    explanation: string;
  };
  rejected: boolean;
} {
  if (!isRecord(raw)) {
    return { quizPayload: undefined, rejected: raw !== null && raw !== undefined };
  }

  const question = typeof raw.question === 'string' ? raw.question.trim() : '';
  const explanation = typeof raw.explanation === 'string' ? raw.explanation.trim() : '';
  const options = Array.isArray(raw.options)
    ? raw.options
        .filter((option): option is string => typeof option === 'string')
        .map((option) => option.trim())
        .filter((option) => option.length > 0)
    : [];
  const correctIndex = typeof raw.correctIndex === 'number' ? raw.correctIndex : Number.NaN;

  const isValid =
    question.length > 0 &&
    options.length === REQUIRED_QUIZ_OPTIONS &&
    Number.isInteger(correctIndex) &&
    correctIndex >= 0 &&
    correctIndex < options.length;

  if (!isValid) {
    return { quizPayload: undefined, rejected: true };
  }

  return {
    quizPayload: { question, options, correctIndex, explanation },
    rejected: false,
  };
}

function isKnownActionType(actionType: string): boolean {
  return BUILT_IN_ACTION_TYPES.includes(actionType as WispActionType);
}

function isUsableChip(chip: QuickActionChip): boolean {
  return Boolean(chip && typeof chip.id === 'string' && typeof chip.label === 'string' && chip.label.trim());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}