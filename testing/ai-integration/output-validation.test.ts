import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WispAiEngine } from '../../ai-engine/src/engine.ts';
import {
  DeterministicTestAiAdapter,
} from '../helpers/mock-ai-adapter.ts';
import {
  BUILT_IN_ACTION_TYPES,
  MAX_CHIPS,
  MIN_CHIPS,
  validateChips,
  validateQuizPayload,
} from '../../ai-engine/src/features/output-validation.ts';
import { AiFeatureRegistry } from '../../ai-engine/src/features/feature-registry.ts';
import { BaseAiFeatureModule } from '../../ai-engine/src/features/base.feature.ts';
import { InteractiveQuizFeature } from '../../ai-engine/src/features/interactive-quiz.feature.ts';
import { SceneExplainerFeature } from '../../ai-engine/src/features/scene-explainer.feature.ts';
import type { QuickActionChip } from '../../ai-engine/src/types/index.ts';

class ThemeAnalysisFeature extends BaseAiFeatureModule {
  readonly actionType = 'theme_analysis';
  readonly description = 'Analyzes visual motifs and narrative themes in the active scene.';

  protected getFeatureSpecificInstructions(): string {
    return 'Task: Explain the visual motifs and symbolism in active_scene without spoiling future scenes.';
  }
}

function assertChipInvariant(chips: Array<{ id: string; label: string }>, label: string) {
  assert.ok(
    chips.length >= MIN_CHIPS && chips.length <= MAX_CHIPS,
    `${label}: expected ${MIN_CHIPS}-${MAX_CHIPS} chips, received ${chips.length}`,
  );
  assert.equal(
    new Set(chips.map((chip) => chip.id)).size,
    chips.length,
    `${label}: chip ids must be unique`,
  );
  for (const chip of chips) {
    assert.ok(chip.label.trim().length > 0, `${label}: chip "${chip.id}" has a blank label`);
  }
}

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

    describe('Minimum-chip invariant holds even when fallback data is unusable', () => {
      const cases: Array<{ label: string; rawChips: unknown; fallbackChips: QuickActionChip[] }> = [
        { label: 'empty model chips + valid fallback chips', rawChips: [], fallbackChips: FALLBACK_CHIPS },
        {
          label: 'empty model chips + one fallback chip',
          rawChips: [],
          fallbackChips: [{ id: 'only-one', label: 'Explain this scene', actionType: 'scene_explain' }],
        },
        { label: 'empty model chips + empty fallback array', rawChips: [], fallbackChips: [] },
        {
          label: 'malformed fallback chips',
          rawChips: [],
          fallbackChips: [
            null as unknown as QuickActionChip,
            { id: 'blank', label: '   ', actionType: 'scene_explain' } as QuickActionChip,
            { id: 42, label: 'Non-string id', actionType: 'nope' } as unknown as QuickActionChip,
            'not-a-chip' as unknown as QuickActionChip,
          ],
        },
        {
          label: 'undefined model chips + undefined-ish fallback',
          rawChips: undefined,
          fallbackChips: undefined as unknown as QuickActionChip[],
        },
      ];

      for (const testCase of cases) {
        it(`guarantees 2-4 chips: ${testCase.label}`, () => {
          const result = validateChips(testCase.rawChips, testCase.fallbackChips);
          assertChipInvariant(result.chips, testCase.label);
          assert.equal(result.usedFallback, true);
        });
      }

      it('prefers curated scene chips over the engine-level fallback when they are valid', () => {
        const result = validateChips([], FALLBACK_CHIPS);
        assert.deepEqual(
          result.chips.map((chip) => chip.id),
          ['scene-1', 'scene-2', 'scene-3'],
          'curated chips must be preserved',
        );
      });

      it('falls back to engine-level navigation chips when curated data is unusable', () => {
        const result = validateChips([], []);
        assert.deepEqual(
          result.chips.map((chip) => chip.actionType),
          ['scene_explain', 'contextual_qa'],
        );
        for (const chip of result.chips) {
          assert.ok(
            BUILT_IN_ACTION_TYPES.includes(chip.actionType),
            'engine fallback must only use resolvable action types',
          );
        }
      });

      it('tops up a single curated chip with engine fallback instead of returning one', () => {
        const result = validateChips(
          [],
          [{ id: 'curated-only', label: 'Explain this scene', actionType: 'scene_explain' }],
        );

        assertChipInvariant(result.chips, 'single curated chip');
        assert.equal(result.chips[0].id, 'curated-only', 'curated chip is kept');
        assert.equal(
          result.chips.some((chip) => chip.id.startsWith('wisp-fallback-')),
          true,
          'engine fallback tops the card up to the minimum',
        );
      });

      it('never exceeds the ceiling when curated chips already fill the card', () => {
        const manyCurated = Array.from({ length: 6 }, (_, index) => ({
          id: `curated-${index}`,
          label: `Curated question ${index}?`,
          actionType: 'contextual_qa' as const,
        }));
        const result = validateChips([], manyCurated);

        assertChipInvariant(result.chips, 'six curated chips');
        assert.equal(result.chips.length, MAX_CHIPS);
      });

      it('keeps the invariant for an empty card with no context chips at all', async () => {
        const { card } = await renderCard(
          JSON.stringify({ headline: 'No Context', body: 'Body.', followUpChips: [], quizPayload: null }),
        );

        assertChipInvariant(card.followUpChips, 'engine-rendered card');
      });
    });

    describe('truncatedChips counts only over-limit discards', () => {
      it('reports 3 truncated when 7 valid chips are supplied', () => {
        const sevenValid = Array.from({ length: 7 }, (_, index) => ({
          id: `c${index}`,
          label: `Question ${index}?`,
          actionType: 'contextual_qa' as const,
        }));
        const result = validateChips(sevenValid, FALLBACK_CHIPS);

        assert.equal(result.truncatedChips, 3);
        assert.equal(result.droppedChips, 0);
        assert.equal(result.chips.length, MAX_CHIPS);
      });

      it('does not count malformed entries as truncated', () => {
        const candidates = [
          { id: 'v1', label: 'Valid one?', actionType: 'contextual_qa' },
          { id: 'v2', label: 'Valid two?', actionType: 'entity_explain' },
          { id: 'v3', label: 'Valid three?', actionType: 'scene_explain' },
          { id: 'v4', label: 'Valid four?', actionType: 'episode_recap' },
          null,
          'garbage',
          { id: 'bad', label: '  ', actionType: 'contextual_qa' },
        ];
        const result = validateChips(candidates, FALLBACK_CHIPS);

        assert.equal(result.truncatedChips, 0, 'only 4 usable chips existed, so nothing hit the ceiling');
        assert.equal(result.droppedChips, 3, 'the three malformed entries are drops, not truncation');
        assert.equal(result.chips.length, MAX_CHIPS);
      });

      it('reports zero truncation for fewer than 4 valid candidates', () => {
        const result = validateChips(
          [
            { id: 'a', label: 'One?', actionType: 'contextual_qa' },
            { id: 'b', label: 'Two?', actionType: 'entity_explain' },
            null,
          ],
          FALLBACK_CHIPS,
        );

        assert.equal(result.truncatedChips, 0);
        assert.equal(result.droppedChips, 1);
      });
    });

    describe('Prompt generation and validation share one registered action set', () => {
      const promptActionTypes = (systemPrompt: string): string[] => {
        const line = systemPrompt
          .split('\n')
          .find((entry) => entry.includes('must be exactly one of'));
        assert.ok(line, 'prompt must state the permitted action types');
        return line!
          .split('must be exactly one of:')[1]
          .replace('.', '')
          .split(',')
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0);
      };

      it('lists every built-in action type when no registry is supplied', () => {
        const feature = new SceneExplainerFeature();
        const request = feature.buildPrompts(baseInput, {} as never, 'quick_glance');

        assert.deepEqual(
          promptActionTypes(request.systemPrompt).sort(),
          [...BUILT_IN_ACTION_TYPES].sort(),
        );
      });

      it('advertises a dynamically registered custom action type to the model', () => {
        const registry = new AiFeatureRegistry();
        registry.register(new ThemeAnalysisFeature());
        const feature = new ThemeAnalysisFeature();

        const request = feature.buildPrompts(
          { ...baseInput, actionType: 'theme_analysis' },
          {} as never,
          'quick_glance',
          registry.listRegisteredActionTypes(),
        );

        const advertised = promptActionTypes(request.systemPrompt);
        assert.ok(advertised.includes('theme_analysis'), 'custom action must be advertised');
        for (const builtIn of BUILT_IN_ACTION_TYPES) {
          assert.ok(advertised.includes(builtIn), `built-in ${builtIn} must remain advertised`);
        }
      });

      it('prompts the model with exactly the action types the validator will accept', async () => {
        const registry = new AiFeatureRegistry();
        registry.register(new ThemeAnalysisFeature());

        const request = new ThemeAnalysisFeature().buildPrompts(
          { ...baseInput, actionType: 'theme_analysis' },
          {} as never,
          'quick_glance',
          registry.listRegisteredActionTypes(),
        );

        const advertised = promptActionTypes(request.systemPrompt);
        assert.deepEqual(
          advertised.slice().sort(),
          registry.listRegisteredActionTypes().slice().sort(),
          'prompt and registry must describe the same action set',
        );
        for (const actionType of advertised) {
          assert.ok(
            registry.canResolve(actionType),
            `prompt advertises ${actionType} but the registry cannot resolve it`,
          );
        }
      });

      it('routes the same registered set through a real engine request', async () => {
        const engine = WispAiEngine.createStandalone({ enableCache: false });
        engine.registerFeature(new ThemeAnalysisFeature());
        const adapter = new ScriptedCardAdapter(
          JSON.stringify({ headline: 'H', body: 'B', followUpChips: [], quizPayload: null }),
        );
        engine.registerModelAdapter(adapter as never, 'first');

        await engine.execute({
          episodeId,
          playbackPositionMs: 145000,
          actionType: 'theme_analysis',
          prompt: 'What themes are at play?',
        });

        const advertised = promptActionTypes(adapter.lastSystemPrompt);
        assert.ok(advertised.includes('theme_analysis'), 'engine must pass the registry set');
        assert.equal(
          advertised.length,
          engine.listFeatures().length,
          'one advertised action type per registered feature',
        );
      });

      it('falls back to the built-ins when the available set is omitted entirely', () => {
        const request = new SceneExplainerFeature().buildPrompts(baseInput, {} as never, 'quick_glance', []);

        assert.deepEqual(
          promptActionTypes(request.systemPrompt).sort(),
          [...BUILT_IN_ACTION_TYPES].sort(),
          'an empty set must not produce an empty prompt constraint',
        );
      });

      it('preserves a custom action type advertised by the prompt', async () => {
        const engine = WispAiEngine.createStandalone({ enableCache: false });
        engine.registerFeature(new ThemeAnalysisFeature());
        const adapter = new ScriptedCardAdapter(
          JSON.stringify({
            headline: 'Thematic Read',
            body: 'The harbour scene leans on water and reflection.',
            followUpChips: [
              { id: 'f1', label: 'What themes are at play?', actionType: 'theme_analysis' },
              { id: 'f2', label: 'Explain the motif?', actionType: 'scene_explain' },
            ],
            quizPayload: null,
          }),
        );
        engine.registerModelAdapter(adapter as never, 'first');

        const card = await engine.execute({
          episodeId,
          playbackPositionMs: 145000,
          actionType: 'theme_analysis',
          prompt: 'What themes are at play?',
        });

        const advertised = promptActionTypes(adapter.lastSystemPrompt);
        const emitted = card.followUpChips[0].actionType;

        assert.ok(advertised.includes(emitted), 'emitted action type must have been advertised');
        assert.equal(emitted, 'theme_analysis');
        assert.equal(card.followUpChips[0].actionType, emitted, 'validator must not coerce it');
      });
    });

    describe('Registry-aware action type resolution', () => {
      it('accepts a built-in action type', () => {
        const result = validateChips(
          [
            { id: 'a', label: 'Built-in question?', actionType: 'episode_recap' },
            { id: 'b', label: 'Another built-in?', actionType: 'scene_explain' },
          ],
          FALLBACK_CHIPS,
        );

        assert.equal(result.coercedActionTypes, 0);
        assert.deepEqual(
          result.chips.map((chip) => chip.actionType),
          ['episode_recap', 'scene_explain'],
        );
      });

      it('accepts a dynamically registered custom action type unchanged', () => {
        const registry = new AiFeatureRegistry();
        registry.register(new ThemeAnalysisFeature());

        const result = validateChips(
          [
            { id: 'a', label: 'What themes are at play?', actionType: 'theme_analysis' },
            { id: 'b', label: 'Explain the motif?', actionType: 'scene_explain' },
          ],
          FALLBACK_CHIPS,
          { canResolveActionType: registry.asActionTypeResolver() },
        );

        assert.equal(result.coercedActionTypes, 0, 'a registered custom action must not be coerced');
        assert.deepEqual(
          result.chips.map((chip) => chip.actionType),
          ['theme_analysis', 'scene_explain'],
        );
      });

      it('still coerces a genuinely unregistered action type', () => {
        const registry = new AiFeatureRegistry();

        const result = validateChips(
          [
            { id: 'a', label: 'Never registered?', actionType: 'not_a_real_feature' },
            { id: 'b', label: 'Also unknown?', actionType: 'another_fake' },
          ],
          FALLBACK_CHIPS,
          { canResolveActionType: registry.asActionTypeResolver() },
        );

        assert.equal(result.coercedActionTypes, 2);
        assert.deepEqual(
          result.chips.map((chip) => chip.actionType),
          ['contextual_qa', 'contextual_qa'],
        );
      });

      it('exposes canResolve consistently with resolve()', () => {
        const registry = new AiFeatureRegistry();
        assert.equal(registry.canResolve('theme_analysis'), false);
        registry.register(new ThemeAnalysisFeature());
        assert.equal(registry.canResolve('theme_analysis'), true);
        assert.equal(registry.canResolve('episode_recap'), true);
      });

      it('carries a custom action type end-to-end through the engine', async () => {
        const engine = WispAiEngine.createStandalone({ enableCache: false });
        engine.registerFeature(new ThemeAnalysisFeature());
        const adapter = new ScriptedCardAdapter(
          JSON.stringify({
            headline: 'Thematic Read',
            body: 'The harbour scene leans on water and reflection.',
            bulletPoints: [],
            followUpChips: [
              { id: 'f1', label: 'What themes are at play?', actionType: 'theme_analysis' },
              { id: 'f2', label: 'Explain the scene?', actionType: 'scene_explain' },
            ],
            quizPayload: null,
          }),
        );
        engine.registerModelAdapter(adapter as never, 'first');

        const card = await engine.execute({
          episodeId,
          playbackPositionMs: 145000,
          actionType: 'theme_analysis',
          prompt: 'What themes are at play?',
        });

        assert.equal(
          card.followUpChips[0].actionType,
          'theme_analysis',
          'engine must preserve a registered custom action type',
        );
      });

      it('honours the minimum-chip invariant under a restrictive resolver', () => {
        const permitted = 'post_watch_quiz';
        const result = validateChips([], [], {
          canResolveActionType: (actionType) => actionType === permitted,
        });

        assertChipInvariant(result.chips, 'single permitted action type');
        for (const chip of result.chips) {
          assert.equal(chip.actionType, permitted, 'every chip must stay dispatchable');
        }
      });

      it('still honours the invariant when curated chips are unresolvable', () => {
        const result = validateChips(
          [
            { id: 'custom-a', label: 'Unresolvable one?', actionType: 'not_registered' },
            { id: 'custom-b', label: 'Unresolvable two?', actionType: 'also_missing' },
          ],
          FALLBACK_CHIPS,
          { canResolveActionType: (actionType) => actionType === 'post_watch_quiz' },
        );

        assertChipInvariant(result.chips, 'unresolvable curated chips');
        assert.equal(
          result.coercedActionTypes,
          2,
          'unresolvable action types are coerced, not left undispatchable',
        );
        for (const chip of result.chips) {
          assert.equal(chip.actionType, 'post_watch_quiz');
        }
      });

      it('never emits an undispatchable engine-fallback chip under a restrictive resolver', () => {
        const result = validateChips([], [], {
          canResolveActionType: (actionType) => actionType === 'post_watch_quiz',
        });

        for (const chip of result.chips) {
          assert.equal(chip.actionType, 'post_watch_quiz');
        }
      });
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