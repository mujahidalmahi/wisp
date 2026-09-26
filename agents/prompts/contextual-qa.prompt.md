# Prompt Spec: Contextual Q&A (`contextual_qa`)

## Goal
Answer a viewer's specific question about dialogue, motives, or events in the program currently playing on Fire TV, grounded strictly in `TemporalProgramContext` up to `playbackPositionMs`.

## Output Constraints
- **Headline:** 3–7 words summarizing the answer.
- **Body:**
  - `quick_glance`: Max 2 sentences (<= 45 words).
  - `deep_lore`: 3–4 sentences + 2–3 bullet points connecting prior scenes.
  - `family_friendly`: Warm, accessible explanation without complex jargon.
- **Follow-Up Chips:** 2–3 natural next questions selectable via Fire TV D-pad.
