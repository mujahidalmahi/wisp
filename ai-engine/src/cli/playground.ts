import { WispAiEngine } from '../engine.ts';

/**
 * Standalone AI Playground CLI — runs completely independent of NestJS & Supabase!
 * Usage: npm run ai:playground
 */
async function runPlayground() {
  const engine = WispAiEngine.createStandalone({
    groqApiKey: process.env.GROQ_API_KEY,
    geminiApiKey: process.env.GEMINI_API_KEY,
    openRouterApiKey: process.env.OPENROUTER_API_KEY,
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL,
  });

  console.log('=== Wisp Standalone AI Engine Playground (Zero Backend / Zero DB) ===');
  console.log('Registered AI Features:', engine.listFeatures());

  const episodeId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1';
  const playheadScene1 = 40000; // 00:40 (Scene 1: Bridge Breakup)
  const playheadScene2 = 140000; // 02:20 (Scene 2: Inside Oude Kerk Dome)

  const ctx1 = await engine.getInstantSceneContext(episodeId, playheadScene1);
  console.log(`\n[Stage-1 Context @ 00:40] Active Scene: "${ctx1.active_scene.scene_title}"`);
  console.log(
    'Unlocked Celia Fact @ 00:40:',
    ctx1.unlocked_entities.find((e) => e.name === 'Celia')?.progressive_fact,
  );

  const ctx2 = await engine.getInstantSceneContext(episodeId, playheadScene2);
  console.log(`\n[Stage-1 Context @ 02:20] Active Scene: "${ctx2.active_scene.scene_title}"`);
  console.log(
    'Unlocked Celia Fact @ 02:20:',
    ctx2.unlocked_entities.find((e) => e.name === 'Celia')?.progressive_fact,
  );

  if (
    process.env.GROQ_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.OPENROUTER_API_KEY ||
    process.env.OLLAMA_BASE_URL
  ) {
    console.log('\n[Stage-2 Live AI Feature Execution @ 02:20]...');
    const card = await engine.execute({
      episodeId,
      playbackPositionMs: playheadScene2,
      actionType: 'scene_explain',
      prompt: 'Why are they recreating the bridge memory?',
      profileMode: 'quick_glance',
    });
    console.log('AI Response Card:', JSON.stringify(card, null, 2));
  } else {
    console.log(
      '\n(Set GROQ_API_KEY, GEMINI_API_KEY, OPENROUTER_API_KEY, or OLLAMA_BASE_URL to test live Stage-2 LLM inference)',
    );
  }
}

runPlayground().catch((err) => {
  console.error('Playground error:', err);
  process.exit(1);
});
