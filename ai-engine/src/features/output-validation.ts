import type {
  ActionTypeResolver,
  QuickActionChip,
  WispActionType,
} from '../types/index.ts';

export const MIN_CHIPS = 2;
export const MAX_CHIPS = 4;
export const REQUIRED_QUIZ_OPTIONS = 4;
export const MAX_CHIP_LABEL_LENGTH = 80;
export const SAFE_FALLBACK_ACTION: WispActionType = 'contextual_qa';

export const BUILT_IN_ACTION_TYPES: WispActionType[] = [
  'contextual_qa',
  'entity_explain',
  'scene_explain',
  'episode_recap',
  'post_watch_quiz',
];

export const isBuiltInActionType: ActionTypeResolver = (actionType) =>
  BUILT_IN_ACTION_TYPES.includes(actionType as WispActionType);

const ENGINE_FALLBACK_CHIPS: ReadonlyArray<QuickActionChip> = [
  { id: 'wisp-fallback-scene', label: 'What is happening right now?', actionType: 'scene_explain' },
  { id: 'wisp-fallback-context', label: 'Ask about this scene', actionType: 'contextual_qa' },
];

const FALLBACK_ACTION_LABELS: Readonly<Record<string, string>> = {
  entity_explain: 'Who are these people?',
  episode_recap: 'Catch me up so far',
  post_watch_quiz: 'Test what you remember?',
};

function fallbackLabelFor(actionType: string, variant: number): string {
  const base =
    FALLBACK_ACTION_LABELS[actionType] ??
    ENGINE_FALLBACK_CHIPS.find((chip) => chip.actionType === actionType)?.label ??
    'Ask about this scene';
  return variant === 0 ? base : `${base} (${variant + 1})`;
}

export interface ChipValidationResult {
  chips: QuickActionChip[];
  coercedActionTypes: number;
  droppedChips: number;
  truncatedChips: number;
  usedFallback: boolean;
}

export interface ChipValidationOptions {
  maxLabelLength?: number;
  canResolveActionType?: ActionTypeResolver;
}

export function validateChips(
  rawChips: unknown,
  fallbackChips: QuickActionChip[],
  options: ChipValidationOptions = {},
): ChipValidationResult {
  const maxLabelLength = options.maxLabelLength ?? MAX_CHIP_LABEL_LENGTH;
  const canResolve = options.canResolveActionType ?? isBuiltInActionType;
  const coercionTarget = canResolve(SAFE_FALLBACK_ACTION)
    ? SAFE_FALLBACK_ACTION
    : BUILT_IN_ACTION_TYPES.find(canResolve) ?? SAFE_FALLBACK_ACTION;

  const candidates = Array.isArray(rawChips) ? rawChips : [];
  const accepted: QuickActionChip[] = [];
  const seenIds = new Set<string>();
  let coercedActionTypes = 0;
  let droppedChips = 0;
  let truncatedChips = 0;

  for (const candidate of candidates) {
    const normalized = normalizeChip(candidate, canResolve, seenIds, maxLabelLength, coercionTarget);

    if (!normalized.ok) {
      droppedChips += 1;
      continue;
    }

    if (accepted.length >= MAX_CHIPS) {
      truncatedChips += 1;
      continue;
    }

    if (normalized.coerced) {
      coercedActionTypes += 1;
    }

    seenIds.add(normalized.chip.id);
    accepted.push(normalized.chip);
  }

  const usedFallback = accepted.length < MIN_CHIPS;
  if (!usedFallback) {
    return { chips: accepted, coercedActionTypes, droppedChips, truncatedChips, usedFallback };
  }

  const curated = collectCuratedChips(fallbackChips, canResolve, seenIds, maxLabelLength, coercionTarget);
  coercedActionTypes += curated.coercedActionTypes;

  const chips = curated.chips.length < MIN_CHIPS
    ? completeWithEngineFallback(curated.chips, canResolve)
    : curated.chips;

  return { chips, coercedActionTypes, droppedChips, truncatedChips, usedFallback };
}

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
  const rawOptions = Array.isArray(raw.options) ? raw.options : [];
  const options: string[] = [];
  let hasMalformedOption = false;

  for (const option of rawOptions) {
    if (typeof option !== 'string') {
      hasMalformedOption = true;
      break;
    }

    const trimmed = option.trim();
    if (trimmed.length === 0) {
      hasMalformedOption = true;
      break;
    }

    options.push(trimmed);
  }

  const correctIndex = typeof raw.correctIndex === 'number' ? raw.correctIndex : Number.NaN;
  const isValid =
    question.length > 0 &&
    explanation.length > 0 &&
    !hasMalformedOption &&
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

function normalizeChip(
  candidate: unknown,
  canResolve: ActionTypeResolver,
  seenIds: Set<string>,
  maxLabelLength: number,
  coercionTarget: WispActionType,
): { ok: true; chip: QuickActionChip; coerced: boolean } | { ok: false } {
  if (!isRecord(candidate)) {
    return { ok: false };
  }

  const label = typeof candidate.label === 'string' ? candidate.label.trim() : '';
  if (!label || label.length > maxLabelLength) {
    return { ok: false };
  }

  const id =
    typeof candidate.id === 'string' && candidate.id.trim()
      ? candidate.id.trim()
      : `chip-${seenIds.size + 1}`;
  if (seenIds.has(id)) {
    return { ok: false };
  }

  const requested = candidate.actionType;
  const resolvable = typeof requested === 'string' && canResolve(requested);

  return {
    ok: true,
    coerced: !resolvable,
    chip: { id, label, actionType: resolvable ? requested : coercionTarget },
  };
}

function collectCuratedChips(
  fallbackChips: QuickActionChip[],
  canResolve: ActionTypeResolver,
  seenIds: Set<string>,
  maxLabelLength: number,
  coercionTarget: WispActionType,
): { chips: QuickActionChip[]; coercedActionTypes: number } {
  const chips: QuickActionChip[] = [];
  const curatedIds = new Set(seenIds);
  let coercedActionTypes = 0;

  for (const chip of Array.isArray(fallbackChips) ? fallbackChips : []) {
    if (chips.length >= MAX_CHIPS) {
      break;
    }

    const normalized = normalizeChip(chip, canResolve, curatedIds, maxLabelLength, coercionTarget);
    if (!normalized.ok) {
      continue;
    }

    if (normalized.coerced) {
      coercedActionTypes += 1;
    }

    curatedIds.add(normalized.chip.id);
    chips.push(normalized.chip);
  }

  return { chips, coercedActionTypes };
}

function completeWithEngineFallback(
  chips: QuickActionChip[],
  canResolve: ActionTypeResolver,
): QuickActionChip[] {
  const completed = [...chips];
  const usedIds = new Set(chips.map((chip) => chip.id));

  const add = (id: string, label: string, actionType: WispActionType): void => {
    if (completed.length >= MAX_CHIPS || usedIds.has(id) || !canResolve(actionType)) {
      return;
    }
    usedIds.add(id);
    completed.push({ id, label, actionType });
  };

  for (const chip of ENGINE_FALLBACK_CHIPS) {
    add(chip.id, chip.label, chip.actionType);
  }

  if (completed.length >= MIN_CHIPS) {
    return completed;
  }

  const resolvableBuiltIns = BUILT_IN_ACTION_TYPES.filter(canResolve);
  for (const actionType of resolvableBuiltIns) {
    add(`wisp-fallback-${actionType}`, fallbackLabelFor(actionType, 0), actionType);
  }

  for (let variant = 1; variant < MIN_CHIPS && completed.length < MIN_CHIPS; variant++) {
    for (const actionType of resolvableBuiltIns) {
      add(`wisp-fallback-${actionType}-v${variant + 1}`, fallbackLabelFor(actionType, variant), actionType);
    }
  }

  return completed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
