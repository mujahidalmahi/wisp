-- ============================================================================
-- Seed: seed_demo_catalog.sql
-- Purpose: 3-Genre Public Domain / CC-BY Demo Catalog for Wisp Fire TV Demo
--   1. Tears of Steel (Sci-Fi Short — Blender Open Movie, CC-BY)
--   2. Cosmic Origins: Webb's First Deep Field (Science Documentary — NASA Public Domain)
--   3. The Midnight Express (Classic Mystery / Noir — Public Domain)
-- ============================================================================

-- Default Demo Household Profile
insert into public.profiles (id, device_id, display_name, mode, spoiler_strictness)
values
  ('11111111-1111-1111-1111-111111111111', 'firetv-demo-device-01', 'Living Room TV', 'quick_glance', 'strict')
on conflict (id) do nothing;

-- 1. Programs
insert into public.programs (id, slug, title, genre, synopsis, release_year, rating, license_info)
values
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
    'tears-of-steel',
    'Tears of Steel',
    'Sci-Fi / Cyberpunk',
    'In a dystopian future Amsterdam, a group of warriors and scientists gather at the Oude Kerk to stage a desperate memory reenactment that could save humanity from sentient machines.',
    2012,
    'TV-14',
    'Creative Commons Attribution 3.0 (Blender Foundation)'
  ),
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
    'cosmic-origins-webb',
    'Cosmic Origins: Deep Field',
    'Science Documentary',
    'An exploration of gravitational lensing, infrared spectroscopy, and early galaxy formation captured by the James Webb Space Telescope.',
    2023,
    'TV-G',
    'Public Domain (NASA / STScI)'
  ),
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3',
    'midnight-express-mystery',
    'The Midnight Cipher',
    'Mystery / Thriller',
    'Aboard a snowbound transcontinental train, an encrypted diplomatic pouch vanishes—and every passenger in Car 4 holds a conflicting alibi.',
    1954,
    'TV-PG',
    'Public Domain'
  )
on conflict (slug) do nothing;

-- 2. Episodes
insert into public.episodes (id, program_id, season_number, episode_number, title, summary, duration_ms, video_stream_url)
values
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
    1,
    1,
    'The Oude Kerk Protocol',
    'Thom and Celia confront their past on the bridge before Captain Barley initiates the neural memory link inside the fortified church.',
    734000,
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4'
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
    1,
    1,
    'Light Across 13 Billion Years',
    'How infrared mirrors pierce cosmic dust clouds and use massive galaxy clusters as natural magnifying glasses.',
    600000,
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4'
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3',
    1,
    1,
    'Compartment 4B',
    'Inspector Vance discovers a stopped pocket watch and a torn telegraph cipher moments before the train enters the alpine tunnel.',
    900000,
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4'
  )
on conflict (id) do nothing;

-- 3. Scene Contexts for Tears of Steel (with Zero-Typing Quick Action Chips)
insert into public.scene_contexts (episode_id, scene_index, start_time_ms, end_time_ms, scene_title, location_name, spoiler_safe_summary, quick_action_chips)
values
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
    1,
    0,
    120000,
    'The Bridge Breakup (Memory Fragment)',
    'Amsterdam Canal Bridge (40 Years Ago)',
    'Young Thom and Celia argue about her obsession with cybernetic robotics and his fear of losing their humanity.',
    '[
      {"id": "chip-1", "label": "Who are Thom and Celia?", "actionType": "entity_explain"},
      {"id": "chip-2", "label": "Why are they arguing on the bridge?", "actionType": "scene_explain"},
      {"id": "chip-3", "label": "What is Celia''s cybernetic hand?", "actionType": "contextual_qa"}
    ]'::jsonb
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
    2,
    120001,
    360000,
    'Inside the Oude Kerk Dome',
    'Fortified Oude Kerk, Future Amsterdam',
    'An older Thom enters the holographic simulation chamber while Captain Barley and his tech crew monitor the approaching robot swarm outside.',
    '[
      {"id": "chip-4", "label": "Catch me up to this moment", "actionType": "episode_recap"},
      {"id": "chip-5", "label": "Why are they recreating the bridge memory?", "actionType": "scene_explain"},
      {"id": "chip-6", "label": "Who is Captain Barley?", "actionType": "entity_explain"}
    ]'::jsonb
  );

-- 4. Transcript Segments for Tears of Steel
insert into public.transcript_segments (episode_id, start_time_ms, end_time_ms, speaker_name, dialogue_text, visual_cue)
values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 15000, 28000, 'Thom', 'You just want to go to space, Celia. I just want to stay on the ground with you.', 'Thom looks at Celia''s robotic prosthetic hand on the bridge railing.'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 29000, 45000, 'Celia', 'Look at what I built, Thom! It is stronger than flesh. Why does that terrify you?', 'Celia flexes her mechanical fingers.'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 130000, 155000, 'Barley', 'Hologram projectors online. Keep the neural signal stable—the perimeter turrets won''t hold them forever.', 'Soldiers fortify the stained-glass windows while green holographic grids appear.');

-- 5. Entities & Progressive Anti-Spoiler Facts
insert into public.entities (id, program_id, slug, name, entity_type, base_description)
values
  ('cccccccc-cccc-cccc-cccc-ccccccccccc1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'thom', 'Thom', 'character', 'Former partner of Celia and reluctant key subject in the Oude Kerk memory protocol.'),
  ('cccccccc-cccc-cccc-cccc-ccccccccccc2', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'celia', 'Celia', 'character', 'Brilliant cybernetics pioneer whose early prosthetic experiments sparked a technological revolution.'),
  ('cccccccc-cccc-cccc-cccc-ccccccccccc3', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'barley', 'Captain Barley', 'character', 'Commander of the Amsterdam resistance cell operating the neural hologram dome.')
on conflict (program_id, slug) do nothing;

insert into public.entity_appearances (episode_id, entity_id, start_time_ms, end_time_ms, reveal_time_ms, progressive_fact)
values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'cccccccc-cccc-cccc-cccc-ccccccccccc1', 0, 734000, 0, 'Thom broke up with Celia 40 years ago on an Amsterdam bridge because he feared her cybernetic enhancements.'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'cccccccc-cccc-cccc-cccc-ccccccccccc2', 0, 120000, 0, 'Celia is an ambitious robotics engineer testing a cybernetic hand replacement.'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'cccccccc-cccc-cccc-cccc-ccccccccccc2', 120001, 734000, 125000, 'Celia''s consciousness now controls the global machine network, and the resistance is trying to heal her trauma by replaying the bridge memory.'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'cccccccc-cccc-cccc-cccc-ccccccccccc3', 120001, 734000, 120001, 'Barley leads the technical team projecting Thom into a synthetic reconstruction of the past.');
