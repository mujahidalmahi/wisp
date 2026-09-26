# Prompt Spec: Character & Entity Explainer (`entity_explain`)

## Goal
Provide an instant, spoiler-safe identity card for a character, location, scientific term, or key object appearing in or referenced by the current scene.

## Spoiler-Safety Rule
Only reference facts from `unlocked_entities` where `reveal_time_ms <= playbackPositionMs`. Never mention future betrayals, deaths, or late-episode reveals.
