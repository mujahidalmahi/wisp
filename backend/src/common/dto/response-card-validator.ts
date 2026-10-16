import {
  HouseholdProfileMode,
  QuickActionChip,
  WispActionType,
  WispResponseCardDto,
} from './wisp-query.dto';

export interface CardValidationOptions {
  episodeId: string;
  actionType: string;
  profileMode?: HouseholdProfileMode | string;
  playbackPositionMs: number;
  requireChips?: boolean;
}

export interface CardValidationResult {
  valid: boolean;
  card?: WispResponseCardDto;
  reason?: string;
}

/**
 * Strict shared runtime validator for Wisp AI response cards.
 * Applied symmetrically to:
 * 1. AI engine generated output before returning to client
 * 2. AI engine generated output before persisting to database cache
 * 3. Cache hits from database
 * 4. Client-submitted bookmark aiCard payloads
 */
export function validateWispResponseCard(
  rawCard: any,
  options: CardValidationOptions,
): CardValidationResult {
  if (!rawCard || typeof rawCard !== 'object' || Array.isArray(rawCard)) {
    return { valid: false, reason: 'Response card must be a non-null object' };
  }

  // Reject prototype pollution attempts
  if (
    Object.prototype.hasOwnProperty.call(rawCard, '__proto__') ||
    Object.prototype.hasOwnProperty.call(rawCard, 'constructor') ||
    Object.prototype.hasOwnProperty.call(rawCard, 'prototype')
  ) {
    return { valid: false, reason: 'Dangerous prototype properties detected' };
  }

  // 1. Mandatory headline validation
  if (
    typeof rawCard.headline !== 'string' ||
    rawCard.headline.trim().length === 0 ||
    rawCard.headline.length > 120
  ) {
    return {
      valid: false,
      reason: 'Headline must be a non-empty string with at most 120 characters',
    };
  }

  // 2. Mandatory body validation
  if (
    typeof rawCard.body !== 'string' ||
    rawCard.body.trim().length === 0 ||
    rawCard.body.length > 2000
  ) {
    return {
      valid: false,
      reason: 'Body must be a non-empty string with at most 2000 characters',
    };
  }

  // 3. Strict anti-spoiler temporal boundary validation
  const safePlaybackMs = Math.max(0, options.playbackPositionMs || 0);
  let spoilerSafeUpToMs = safePlaybackMs;

  if (rawCard.spoilerSafeUpToMs !== undefined && rawCard.spoilerSafeUpToMs !== null) {
    if (
      typeof rawCard.spoilerSafeUpToMs !== 'number' ||
      !Number.isFinite(rawCard.spoilerSafeUpToMs) ||
      rawCard.spoilerSafeUpToMs < 0
    ) {
      return {
        valid: false,
        reason: 'spoilerSafeUpToMs must be a non-negative finite integer',
      };
    }

    if (rawCard.spoilerSafeUpToMs > safePlaybackMs) {
      return {
        valid: false,
        reason: `Anti-spoiler violation: spoilerSafeUpToMs (${rawCard.spoilerSafeUpToMs}) exceeds current playbackPositionMs (${safePlaybackMs})`,
      };
    }
    spoilerSafeUpToMs = Math.floor(rawCard.spoilerSafeUpToMs);
  }

  // 4. Dimensional identity verification
  if (rawCard.episodeId && rawCard.episodeId.trim() !== options.episodeId.trim()) {
    return {
      valid: false,
      reason: `Episode mismatch: card episodeId '${rawCard.episodeId}' != requested '${options.episodeId}'`,
    };
  }

  if (rawCard.actionType && rawCard.actionType.trim() !== options.actionType.trim()) {
    return {
      valid: false,
      reason: `Action mismatch: card actionType '${rawCard.actionType}' != requested '${options.actionType}'`,
    };
  }

  const expectedProfileMode =
    options.profileMode || HouseholdProfileMode.QUICK_GLANCE;
  if (rawCard.profileMode && rawCard.profileMode !== expectedProfileMode) {
    return {
      valid: false,
      reason: `Profile mode mismatch: card profileMode '${rawCard.profileMode}' != requested '${expectedProfileMode}'`,
    };
  }

  // 5. Follow-up quick action chips validation
  const rawChips = rawCard.followUpChips ?? rawCard.chips;
  let validatedChips: QuickActionChip[] = [];

  if (rawChips !== undefined && rawChips !== null) {
    if (!Array.isArray(rawChips)) {
      return {
        valid: false,
        reason: 'followUpChips must be an array',
      };
    }
    if (rawChips.length > 4) {
      return {
        valid: false,
        reason: 'followUpChips must not exceed 4 items',
      };
    }
    if (options.requireChips && (rawChips.length < 2 || rawChips.length > 4)) {
      return {
        valid: false,
        reason: 'followUpChips must contain between 2 and 4 items',
      };
    }

    for (let i = 0; i < rawChips.length; i++) {
      const chip = rawChips[i];
      if (!chip || typeof chip !== 'object' || Array.isArray(chip)) {
        return { valid: false, reason: 'Each chip must be a valid object' };
      }
      if (
        typeof chip.label !== 'string' ||
        chip.label.trim().length === 0 ||
        chip.label.length > 60
      ) {
        return { valid: false, reason: 'Chip label must be 1 to 60 characters' };
      }
      if (typeof chip.actionType !== 'string' || chip.actionType.trim().length === 0) {
        return { valid: false, reason: 'Chip actionType is required' };
      }
      validatedChips.push({
        id:
          typeof chip.id === 'string' && chip.id.trim().length > 0
            ? chip.id.trim()
            : `chip_${i + 1}`,
        label: chip.label.trim(),
        actionType: chip.actionType.trim() as WispActionType,
      });
    }
  } else if (options.requireChips) {
    return {
      valid: false,
      reason: 'followUpChips must contain between 2 and 4 items',
    };
  }

  // 6. Bullet points bounding
  let validatedBullets: string[] | undefined = undefined;
  if (rawCard.bulletPoints !== undefined && rawCard.bulletPoints !== null) {
    if (!Array.isArray(rawCard.bulletPoints) || rawCard.bulletPoints.length > 10) {
      return {
        valid: false,
        reason: 'bulletPoints must be an array containing at most 10 items',
      };
    }
    validatedBullets = [];
    for (const bp of rawCard.bulletPoints) {
      if (typeof bp !== 'string' || bp.length > 300) {
        return {
          valid: false,
          reason: 'Each bullet point must be a string under 300 characters',
        };
      }
      validatedBullets.push(bp.trim());
    }
  }

  // 7. Quiz payload structure validation
  const rawQuiz = rawCard.quizPayload ?? rawCard.quiz;
  let validatedQuiz:
    | {
        question: string;
        options: string[];
        correctIndex: number;
        explanation: string;
      }
    | undefined = undefined;

  if (options.actionType === 'post_watch_quiz' || rawQuiz) {
    if (!rawQuiz || typeof rawQuiz !== 'object' || Array.isArray(rawQuiz)) {
      return { valid: false, reason: 'Quiz card requires a valid quiz payload object' };
    }
    if (
      typeof rawQuiz.question !== 'string' ||
      rawQuiz.question.trim().length === 0 ||
      rawQuiz.question.length > 200
    ) {
      return { valid: false, reason: 'Quiz question must be 1 to 200 characters' };
    }
    if (!Array.isArray(rawQuiz.options) || rawQuiz.options.length < 2 || rawQuiz.options.length > 4) {
      return { valid: false, reason: 'Quiz options must be an array of 2 to 4 choices' };
    }
    for (const opt of rawQuiz.options) {
      if (typeof opt !== 'string' || opt.trim().length === 0 || opt.length > 120) {
        return { valid: false, reason: 'Quiz option must be a non-empty string up to 120 chars' };
      }
    }
    if (
      !Number.isInteger(rawQuiz.correctIndex) ||
      rawQuiz.correctIndex < 0 ||
      rawQuiz.correctIndex >= rawQuiz.options.length
    ) {
      return { valid: false, reason: 'Quiz correctIndex must be a valid integer index' };
    }
    validatedQuiz = {
      question: rawQuiz.question.trim(),
      options: rawQuiz.options.map((o: string) => o.trim()),
      correctIndex: rawQuiz.correctIndex,
      explanation:
        typeof rawQuiz.explanation === 'string'
          ? rawQuiz.explanation.slice(0, 300).trim()
          : '',
    };
  }

  const validatedCard: WispResponseCardDto = {
    headline: rawCard.headline.trim(),
    body: rawCard.body.trim(),
    bulletPoints: validatedBullets,
    spoilerSafeUpToMs,
    profileMode:
      (rawCard.profileMode as HouseholdProfileMode) ||
      (expectedProfileMode as HouseholdProfileMode) ||
      HouseholdProfileMode.QUICK_GLANCE,
    providerUsed:
      typeof rawCard.providerUsed === 'string' && rawCard.providerUsed.trim().length > 0
        ? rawCard.providerUsed.trim()
        : 'groq',
    cached: Boolean(rawCard.cached),
    latencyMs:
      typeof rawCard.latencyMs === 'number' && Number.isFinite(rawCard.latencyMs)
        ? Math.max(0, Math.floor(rawCard.latencyMs))
        : 0,
    followUpChips: validatedChips,
    quizPayload: validatedQuiz,
  };

  return {
    valid: true,
    card: validatedCard,
  };
}
