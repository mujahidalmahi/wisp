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

/**
 * Last-resort chips used only when neither the model output nor the curated
 * scene chips can satisfy the minimum-chip contract. These are navigation
 * actions, never content: they route the viewer's D-pad selection into a real
 * registered feature rather than asserting an answer.
 */
const ENGINE_FALLBACK_CHIPS: ReadonlyArray<QuickActionChip> = [
  { id: 'wisp-fallback-scene', label: 'What is happening right now?', actionType: 'scene_explain' },
  { id: 'wisp-fallback-context', label: 'Ask about this scene', actionType: 'contextual_qa' },
];

export interface ChipValidationResult {
  chips: QuickActionChip[];
  coercedActionTypes: number;
  droppedChips: number;
  truncatedChips: number;
  usedFallback: boolean;
}

export interface ChipValidationOptions {
  maxLabelLength?: number;
  /**
   * Predicate deciding whether an actionType can actually be dispatched. Defaults
   * to the built-in set; the AiFeatureRegistry supplies its own so dynamically
   * registered features are accepted without coercion.
   */
  canResolveActionType?: ActionTypeResolver;
}

/**
 * Enforces the AGENTS.md rule 4 contract: every AI card offers 2-4 D-pad
 * selectable chips whose actionTypes the engine can actually dispatch.
 *
 * Escalation is staged so curated scene chips are always preferred over the
 * engine-level fallback. Chips with unusable labels are dropped, duplicate ids
 * collapse, and unresolvable actionTypes are coerced to `contextual_qa` to match
 * AiFeatureRegistry.resolve()'s existing behaviour — made explicit and counted
 * rather than silently rerouting the viewer's selection.
 */
export function validateChips(
  rawChips: unknown,
  fallbackChips: QuickActionChip[],
  options: ChipValidationOptions = {},
): ChipValidationResult {
  const maxLabelLength = options.maxLabelLength ?? MAX_CHIP_LABEL_LENGTH;
  const canResolve = options.canResolveActionType ?? isBuiltInActionType;

  const candidates = Array.isArray(rawChips) ? rawChips : [];
  const accepted: QuickActionChip[] = [];
  const seenIds = new Set<string>();
  let coercedActionTypes = 0;
  let droppedChips = 0;
  let truncatedChips = 0;

  for (const candidate of candidates) {
    const normalized = normalizeChip(candidate, canResolve, seenIds);

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

  const curated = collectCuratedChips(fallbackChips, canResolve, seenIds, maxLabelLength);
  const chips =
    curated.length < MIN_CHIPS ? completeWithEngineFallback(curated, canResolve) : curated;

  return { chips, coercedActionTypes, droppedChips, truncatedChips, usedFallback };
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

function normalizeChip(
  candidate: unknown,
  canResolve: ActionTypeResolver,
  seenIds: Set<string>,
  maxLabelLength = MAX_CHIP_LABEL_LENGTH,
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
    chip: { id, label, actionType: resolvable ? requested : SAFE_FALLBACK_ACTION },
  };
}

function collectCuratedChips(
  fallbackChips: QuickActionChip[],
  canResolve: ActionTypeResolver,
  seenIds: Set<string>,
  maxLabelLength: number,
): QuickActionChip[] {
  const collected: QuickActionChip[] = [];
  const curatedIds = new Set(seenIds);

  for (const chip of Array.isArray(fallbackChips) ? fallbackChips : []) {
    if (collected.length >= MAX_CHIPS) {
      break;
    }

    const normalized = normalizeChip(chip, canResolve, curatedIds, maxLabelLength);
    if (!normalized.ok) {
      continue;
    }

    curatedIds.add(normalized.chip.id);
    collected.push(normalized.chip);
  }

  return collected;
}

/**
 * Guarantees the minimum-chip contract even when the curated scene data is
 * missing or malformed. Only action types the resolver accepts are used, so the
 * guarantee cannot emit an undispatchable chip.
 */
function completeWithEngineFallback(
  chips: QuickActionChip[],
  canResolve: ActionTypeResolver,
): QuickActionChip[] {
  const completed = [...chips];
  const usedIds = new Set(chips.map((chip) => chip.id));

  for (const chip of ENGINE_FALLBACK_CHIPS) {
    if (completed.length >= MAX_CHIPS) {
      break;
    }
    if (usedIds.has(chip.id) || !canResolve(chip.actionType)) {
      continue;
    }
    usedIds.add(chip.id);
    completed.push(chip);
  }

  return completed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}