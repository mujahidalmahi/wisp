import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WispAiEngine } from '../../ai-engine/src/engine.ts';
import {
  DeterministicTestAiAdapter,
} from '../helpers/mock-ai-adapter.ts';
import {
  MAX_CHIPS,
  MIN_CHIPS,
  validateChips,
  validateQuizPayload,
} from '../../ai-engine/src/features/output-validation.ts';
import { InteractiveQuizFeature } from '../../ai-engine/src/features/interactive-quiz.feature.ts';

const FALLBACK_CHIPS = [
  { id: 'scene-1', label: 'Explain this scene', actionType: 'scene_explain' },
  { id: 'scene-2', label: 'Who are these people?', actionType: 'entity_explain' },
  { id: 'scene-3', label: 'Catch me up so far', actionType: 'episode_recap' },
];

class ScriptedCardAdapter {
  readonly name: string;
  private readonly raw: string;
  public lastSystemPrompt: string;

  constructor(raw: string, name = 'scripted-card-adapter') {
    this.raw = raw;
    this.name = name;
    this.lastSystemPrompt = '';
  }

  isConfigured(): boolean {
    return true;
  }

  async complete(req: { systemPrompt: string }): Promise<{
    providerName: string;
    rawText: string;
    latencyMs: number;
  }> {
    this.lastSystemPrompt = req.systemPrompt;
    return { providerName: this.name, rawText: this.raw, latencyMs: 12 };
  }
}

const episodeId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1';
const baseInput = {
  episodeId,
  playbackPositionMs: 145000,
  actionType: 'scene_explain' as const,
  prompt: 'Why are they arguing?',
};

async function renderCard(raw: string) {
  const adapter = new ScriptedCardAdapter(raw);
  const engine = WispAiEngine.createStandalone({ enableCache: false });
  engine.registerModelAdapter(adapter as never, 'first');
  const card = await engine.execute(baseInput);
  return { card, adapter };
}

describe('AI Integration: LLM Output Validation (Zero-Fake-AI Card Contracts)', () => {
  describe('QuickActionChip contracts (AGENTS.md rule 4: 2-4 selectable chips)', () => {
    it('keeps a well-formed 2-chip model response untouched', () => {
      const result = validateChips(
        [
          { id: 'f1', label: 'Why so tense?', actionType: 'contextual_qa' },
          { id: 'f2', label: 'Who is Celia?', actionType: 'entity_explain' },
        ],
        FALLBACK_CHIPS,
      );

      assert.equal(result.chips.length, 2);
      assert.equal(result.usedFallback, false);
      assert.equal(result.droppedChips, 0);
      assert.equal(result.coercedActionTypes, 0);
      assert.deepEqual(
        result.chips.map((c) => c.actionType),
        ['contextual_qa', 'entity_explain'],
      );
    });

    it('truncates a model response that exceeds the 4-chip ceiling', () => {
      const result = validateChips(
        Array.from({ length: 7 }, (_, i) => ({
          id: `c${i}`,
          label: `Question ${i}?`,
          actionType: 'contextual_qa',
        })),
        FALLBACK_CHIPS,
      );

      assert.equal(result.chips.length, MAX_CHIPS);
      assert.ok(result.truncatedChips > 0);
    });

    it('falls back to curated scene chips when the model returns fewer than 2 usable chips', () => {
      const result = validateChips(
        [{ id: 'only', label: 'Single lonely chip?', actionType: 'contextual_qa' }],
        FALLBACK_CHIPS,
      );

      assert.equal(result.usedFallback, true);
      assert.equal(result.chips.length, MIN_CHIPS === 2 ? 3 : 3);
      assert.deepEqual(
        result.chips.map((c) => c.id),
        ['scene-1', 'scene-2', 'scene-3'],
      );
    });

    it('coerces an invented actionType to a resolvable one instead of silently rerouting', () => {
      const result = validateChips(
        [
          { id: 'a', label: 'Ask about the theme?', actionType: 'theme_analysis' },
          { id: 'b', label: 'Explain the motif?', actionType: 'visual_motifs' },
        ],
        FALLBACK_CHIPS,
      );

      assert.equal(result.coercedActionTypes, 2);
      assert.deepEqual(
        result.chips.map((c) => c.actionType),
        ['contextual_qa', 'contextual_qa'],
      );
    });

    it('drops malformed chips: blank labels, duplicates, non-objects, and oversized labels', () => {
      const result = validateChips(
        [
          { id: 'ok1', label: 'Valid question?', actionType: 'contextual_qa' },
          { id: 'ok2', label: 'Also valid?', actionType: 'entity_explain' },
          { id: 'blank', label: '   ', actionType: 'contextual_qa' },
          { id: 'ok1', label: 'Duplicate id?', actionType: 'contextual_qa' },
          'not-an-object',
          null,
          { id: 'huge', label: 'x'.repeat(500), actionType: 'contextual_qa' },
          { label: 'No id at all?', actionType: 'contextual_qa' },
        ],
        FALLBACK_CHIPS,
      );

      assert.equal(result.usedFallback, false, 'the good chips must survive');
      assert.equal(result.chips.length, 3, 'ok1, ok2, and the id-less chip all survive');
      assert.deepEqual(
        result.chips.map((c) => c.label),
        ['Valid question?', 'Also valid?', 'No id at all?'],
      );
      assert.ok(result.droppedChips >= 4, 'blank, duplicate, non-object and oversized dropped');
    });

    it('substitutes a generated id when the model omits one', () => {
      const result = validateChips(
        [
          { label: 'No id here?', actionType: 'contextual_qa' },
          { label: 'Also no id?', actionType: 'entity_explain' },
        ],
        FALLBACK_CHIPS,
      );

      assert.equal(result.chips.length, 2);
      assert.ok(result.chips.every((c) => typeof c.id === 'string' && c.id.length > 0));
    });

    it('repairs a fully malformed chip array rather than emitting an unusable card', async () => {
      const { card } = await renderCard(
        JSON.stringify({
          headline: 'Bridge Confrontation',
          body: 'Celia confronts the harbour master.',
          bulletPoints: ['ok'],
          followUpChips: [null, 42, { label: '', actionType: 'nonsense' }],
          quizPayload: null,
        }),
      );

      assert.ok(card.followUpChips.length >= MIN_CHIPS, 'viewer must still get selectable chips');
      assert.ok(
        card.followUpChips.every((chip) => typeof chip.id === 'string' && chip.label.trim().length > 0),
      );
    });
  });

  describe('Quiz payload contracts (4 options, correctIndex in range)', () => {
    it('accepts a valid 4-option quiz and normalizes whitespace', () => {
      const { quizPayload, rejected } = validateQuizPayload({
        question: '  Where does this scene happen?  ',
        options: ['  Amsterdam ', 'Lunar Base', 'Nautilus', 'Sahara'],
        correctIndex: 0,
        explanation: ' The harbour master awaits in Amsterdam. ',
      });

      assert.equal(rejected, false);
      assert.equal(quizPayload?.question, 'Where does this scene happen?');
      assert.equal(quizPayload?.options[0], 'Amsterdam');
      assert.equal(quizPayload?.correctIndex, 0);
    });

    it('rejects a quiz with the wrong number of options', () => {
      assert.equal(validateQuizPayload({
        question: 'Q?',
        options: ['A', 'B'],
        correctIndex: 0,
        explanation: 'E',
      }).rejected, true);

      assert.equal(validateQuizPayload({
        question: 'Q?',
        options: ['A', 'B', 'C', 'D', 'E'],
        correctIndex: 0,
        explanation: 'E',
      }).rejected, true);
    });

    it('rejects an out-of-range or non-integer correctIndex', () => {
      for (const correctIndex of [-1, 4, 99, 1.5, 'two', null]) {
        assert.equal(
          validateQuizPayload({
            question: 'Q?',
            options: ['A', 'B', 'C', 'D'],
            correctIndex,
            explanation: 'E',
          }).rejected,
          true,
          `correctIndex=${String(correctIndex)} must be rejected`,
        );
      }
    });

    it('rejects an empty question or missing explanation object', () => {
      assert.equal(validateQuizPayload({ question: '  ', options: ['A', 'B', 'C', 'D'], correctIndex: 0, explanation: 'E' }).rejected, true);
      assert.equal(validateQuizPayload({ options: ['A', 'B', 'C', 'D'], correctIndex: 0, explanation: 'E' }).rejected, true);
      assert.equal(validateQuizPayload('not an object').rejected, true);
    });

    it('treats an explicit null quizPayload as valid-and-absent, not a rejection', () => {
      const result = validateQuizPayload(null);
      assert.equal(result.quizPayload, undefined);
      assert.equal(result.rejected, false);
    });

    it('drops an impossible quiz from a real quiz card instead of rendering it broken', async () => {
      const quizEngine = WispAiEngine.createStandalone({ enableCache: false });
      const adapter = new ScriptedCardAdapter(
        JSON.stringify({
          headline: 'Harbour Quiz',
          body: 'Two minutes on the harbour scene.',
          bulletPoints: [],
          followUpChips: [
            { id: 'q1', label: 'Who owns the harbour?', actionType: 'contextual_qa' },
            { id: 'q2', label: 'What is the dispute?', actionType: 'scene_explain' },
          ],
          quizPayload: {
            question: 'Who owns the harbour?',
            options: ['Celia'],
            correctIndex: 7,
            explanation: 'Celia inherited it.',
          },
        }),
      );
      quizEngine.registerModelAdapter(adapter as never, 'first');

      const card = await quizEngine.execute({
        episodeId,
        playbackPositionMs: 145000,
        actionType: 'post_watch_quiz',
        prompt: 'Quiz me on the harbour scene',
      });

      assert.equal(card.quizPayload, undefined, 'a malformed quiz must not reach the TV');
      assert.ok(card.followUpChips.length >= MIN_CHIPS, 'card still needs chips');
      assert.ok(card.headline.length > 0 && card.body.length > 0);
    });

    it('preserves a valid quiz end-to-end through the engine', async () => {
      const quizEngine = WispAiEngine.createStandalone({ enableCache: false });
      const adapter = new ScriptedCardAdapter(
        JSON.stringify({
          headline: 'Harbour Quiz',
          body: 'Two minutes on the harbour scene.',
          bulletPoints: ['Celia holds the deed.'],
          followUpChips: [
            { id: 'q1', label: 'Who owns the harbour?', actionType: 'contextual_qa' },
            { id: 'q2', label: 'What is the dispute?', actionType: 'scene_explain' },
          ],
          quizPayload: {
            question: 'Who owns the harbour?',
            options: ['Celia', 'The harbour master', 'Captain Barley', 'Thom'],
            correctIndex: 0,
            explanation: 'Celia holds the deed.',
          },
        }),
      );
      quizEngine.registerModelAdapter(adapter as never, 'first');

      const card = await quizEngine.execute({
        episodeId,
        playbackPositionMs: 145000,
        actionType: 'post_watch_quiz',
        prompt: 'Quiz me on the harbour scene',
      });

      assert.equal(card.quizPayload?.options.length, 4);
      assert.equal(card.quizPayload?.correctIndex, 0);
      assert.deepEqual(card.bulletPoints, ['Celia holds the deed.']);
    });
  });

  describe('Structural resilience', () => {
    it('still yields a usable card when the model returns non-array chips and a garbage quiz', async () => {
      const { card } = await renderCard(
        JSON.stringify({
          headline: 'Odd Output',
          body: 'The model misbehaved.',
          bulletPoints: 'should-be-an-array',
          followUpChips: { not: 'an array' },
          quizPayload: { totally: 'wrong' },
        }),
      );

      assert.ok(card.followUpChips.length >= MIN_CHIPS);
      assert.deepEqual(card.bulletPoints, [], 'non-array bullets must not leak through');
      assert.equal(card.quizPayload, undefined);
    });

    it('falls back to scene title and summary when the model omits headline and body', async () => {
      const { card } = await renderCard(JSON.stringify({ followUpChips: [], quizPayload: null }));

      assert.ok(card.headline.length > 0);
      assert.ok(card.body.length > 0);
    });

    it('survives a plain-text model response that is not JSON at all', async () => {
      const { card } = await renderCard('I cannot answer that without more context.');

      assert.equal(card.headline, 'Contextual Insight');
      assert.match(card.body, /cannot answer/);
      assert.ok(card.followUpChips.length >= MIN_CHIPS);
    });

    it('strips markdown fences from a fenced JSON response', async () => {
      const { card } = await renderCard(
        '```json\n{"headline":"Fenced Card","body":"Fenced body.","followUpChips":[],"quizPayload":null}\n```',
      );

      assert.equal(card.headline, 'Fenced Card');
    });

    it('tells the model the hard chip and quiz constraints in the system prompt', async () => {
      const { adapter } = await renderCard(JSON.stringify({ followUpChips: [], quizPayload: null }));

      assert.match(adapter.lastSystemPrompt, /between 2 and 4 entries/);
      assert.match(adapter.lastSystemPrompt, /contextual_qa/);
      assert.match(adapter.lastSystemPrompt, /exactly 4 non-empty "options"/);
      assert.match(adapter.lastSystemPrompt, /correctIndex/);
    });

    it('never leaks a spoiler timestamp: card is stamped with the requested playhead', async () => {
      const quizEngine = WispAiEngine.createStandalone({ enableCache: false });
      const adapter = new DeterministicTestAiAdapter({ name: 'spoiler-check' });
      quizEngine.registerModelAdapter(adapter, 'first');

      const card = await quizEngine.execute({
        episodeId,
        playbackPositionMs: 35000,
        actionType: 'scene_explain',
        prompt: 'What is happening?',
      });

      assert.equal(card.spoilerSafeUpToMs, 35000);
    });

    it('every built-in feature still produces a card meeting the 2-chip minimum', async () => {
      const actionTypes = [
        'contextual_qa',
        'entity_explain',
        'scene_explain',
        'episode_recap',
        'post_watch_quiz',
      ] as const;

      for (const actionType of actionTypes) {
        const engine = WispAiEngine.createStandalone({ enableCache: false });
        const adapter = new ScriptedCardAdapter(
          JSON.stringify({
            headline: `${actionType} card`,
            body: 'Body text.',
            bulletPoints: ['bullet'],
            followUpChips: [
              { id: 'f1', label: 'Follow up one?', actionType: 'contextual_qa' },
              { id: 'f2', label: 'Follow up two?', actionType: 'entity_explain' },
            ],
            quizPayload: null,
          }),
        );
        engine.registerModelAdapter(adapter as never, 'first');

        const card = await engine.execute({
          episodeId,
          playbackPositionMs: 145000,
          actionType,
          prompt: `Test ${actionType}`,
        });

        assert.ok(
          card.followUpChips.length >= MIN_CHIPS && card.followUpChips.length <= MAX_CHIPS,
          `${actionType} produced ${card.followUpChips.length} chips`,
        );
      }
    });

    it('InteractiveQuizFeature declares the 4-option contract it now enforces', () => {
      const feature = new InteractiveQuizFeature();
      const request = feature.buildPrompts(
        { episodeId, playbackPositionMs: 145000, actionType: 'post_watch_quiz', prompt: 'quiz' },
        {} as never,
        'quick_glance',
      );

      assert.match(request.systemPrompt, /4-option/);
    });
  });
});