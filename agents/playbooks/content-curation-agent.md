# Playbook: Content & Temporal Graph Curation Agent

## Scope
`database/migrations/**`, `database/seeds/**`

## Responsibilities
1. Curate public-domain / CC-BY video streams and segment them into `scene_contexts`, `transcript_segments`, `entities`, and `entity_appearances`.
2. Assign accurate `start_time_ms`, `end_time_ms`, and `reveal_time_ms` timestamps so `get_spoiler_safe_context()` never leaks future plot twists.
3. Craft 3–4 scene-specific `quick_action_chips` per scene so Fire TV viewers have instant zero-typing questions at every timestamp.
