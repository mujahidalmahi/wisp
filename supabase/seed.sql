-- ============================================================================
-- Seed: seed_demo_catalog.sql
-- Purpose: Production-Grade 3-Genre Public Domain / CC-BY Demo Catalog
--   1. Tears of Steel (Sci-Fi / Cyberpunk — Blender Open Movie, CC-BY 3.0)
--      * S1E1: The Oude Kerk Protocol
--      * S1E2: The Singularity Accord (for Cross-Episode Spoiler Verification)
--   2. Cosmic Origins: Deep Field (Science Documentary — NASA / STScI Public Domain)
--   3. The Midnight Cipher (Mystery / Thriller — Public Domain)
-- Note: 100% Idempotent (safe to re-run via ON CONFLICT DO UPDATE / DO NOTHING)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Household Profiles (All 3 Viewing Modes)
-- ----------------------------------------------------------------------------
insert into public.profiles (
  id, device_id, display_name, mode, spoiler_strictness, preferred_language, voice_tts_enabled, auto_pause_on_overlay
)
values
  ('11111111-1111-1111-1111-111111111111', 'firetv-demo-device-01', 'Living Room TV (Quick Glance)', 'quick_glance', 'strict', 'en', true, false),
  ('11111111-1111-1111-1111-111111111112', 'firetv-demo-device-01', 'Lore Enthusiast (Deep Lore)', 'deep_lore', 'strict', 'en', true, true),
  ('11111111-1111-1111-1111-111111111113', 'firetv-demo-device-01', 'Family Room (Kids & Family)', 'family_friendly', 'strict', 'en', true, false)
on conflict (id) do update set
  display_name = excluded.display_name,
  mode = excluded.mode,
  spoiler_strictness = excluded.spoiler_strictness,
  voice_tts_enabled = excluded.voice_tts_enabled;

-- ----------------------------------------------------------------------------
-- 2. Programs (3 Distinct Television Genres)
-- ----------------------------------------------------------------------------
insert into public.programs (
  id, slug, title, genre, synopsis, release_year, rating, content_advisories, total_seasons, license_info, is_active
)
values
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
    'tears-of-steel',
    'Tears of Steel',
    'Sci-Fi / Cyberpunk',
    'In a dystopian future Amsterdam, a group of warriors and scientists gather at the fortified Oude Kerk to stage a desperate neural memory reenactment that could save humanity from sentient machines.',
    2012,
    'TV-14',
    array['Sci-Fi Action', 'Cybernetic Imagery'],
    1,
    'Creative Commons Attribution 3.0 (Blender Foundation)',
    true
  ),
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
    'cosmic-origins-webb',
    'Cosmic Origins: Deep Field',
    'Science Documentary',
    'An exploration of gravitational lensing, infrared spectroscopy, and early galaxy formation 13.5 billion years ago captured by the James Webb Space Telescope.',
    2023,
    'TV-G',
    array['Educational'],
    1,
    'Public Domain (NASA / ESA / CSA / STScI)',
    true
  ),
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3',
    'midnight-express-mystery',
    'The Midnight Cipher',
    'Mystery / Thriller',
    'Aboard a snowbound transcontinental express train in 1954, an encrypted diplomatic pouch vanishes—and every passenger in Car 4 holds a conflicting alibi.',
    1954,
    'TV-PG',
    array['Suspense', 'Mild Peril'],
    1,
    'Public Domain',
    true
  )
on conflict (slug) do update set
  title = excluded.title,
  genre = excluded.genre,
  synopsis = excluded.synopsis,
  rating = excluded.rating,
  content_advisories = excluded.content_advisories;

-- ----------------------------------------------------------------------------
-- 3. Episodes (4 Episodes Including S1E2 for Cross-Episode Spoiler Testing)
-- ----------------------------------------------------------------------------
insert into public.episodes (
  id, program_id, season_number, episode_number, title, summary, duration_ms, intro_end_ms, credits_start_ms, default_bucket_sec, video_stream_url, is_published
)
values
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
    1,
    1,
    'The Oude Kerk Protocol',
    'Thom and Celia confront their past on the Amsterdam bridge before Captain Barley initiates the neural memory link inside the fortified church.',
    734000,
    10000,
    680000,
    15,
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
    true
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb4',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
    1,
    2,
    'The Singularity Accord',
    'Following the Oude Kerk neural link, Captain Barley and Thom negotiate a ceasefire with Celia''s orbital nexus over flooded Rotterdam.',
    780000,
    10000,
    720000,
    15,
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
    true
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
    1,
    1,
    'Light Across 13 Billion Years',
    'How gold-coated beryllium infrared mirrors pierce cosmic dust clouds and use massive galaxy clusters as natural relativistic magnifying glasses.',
    600000,
    5000,
    560000,
    15,
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4',
    true
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3',
    1,
    1,
    'Compartment 4B',
    'Inspector Vance discovers a stopped pocket watch and a torn telegraph cipher moments before the transcontinental express enters the alpine avalanche zone.',
    900000,
    12000,
    850000,
    15,
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
    true
  )
on conflict (id) do update set
  title = excluded.title,
  summary = excluded.summary,
  duration_ms = excluded.duration_ms,
  intro_end_ms = excluded.intro_end_ms,
  credits_start_ms = excluded.credits_start_ms,
  video_stream_url = excluded.video_stream_url;

-- ----------------------------------------------------------------------------
-- 4. Scene Contexts (Non-Overlapping GiST Ranges Across All Episodes)
-- ----------------------------------------------------------------------------
delete from public.scene_contexts
where episode_id in (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb4'
);

insert into public.scene_contexts (
  episode_id, scene_index, start_time_ms, end_time_ms, scene_title, location_name, mood_tag, narrative_tension_score, spoiler_safe_summary, quick_action_chips
)
values
  -- Episode 1: Tears of Steel S1E1 (Sci-Fi)
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
    1,
    0,
    120000,
    'The Bridge Breakup (Memory Fragment)',
    'Amsterdam Canal Bridge (40 Years Ago)',
    'emotional-flashback',
    6,
    'Young Thom and Celia argue about her obsession with cybernetic robotics and his fear of losing their humanity.',
    '[
      {"id": "tos-chip-1", "label": "Who are Thom and Celia?", "actionType": "entity_explain"},
      {"id": "tos-chip-2", "label": "Why are they arguing on the bridge?", "actionType": "scene_explain"},
      {"id": "tos-chip-3", "label": "What is Celia''s cybernetic hand?", "actionType": "contextual_qa"}
    ]'::jsonb
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
    2,
    120001,
    360000,
    'Inside the Oude Kerk Dome',
    'Fortified Oude Kerk, Future Amsterdam',
    'tense-preparation',
    8,
    'An older Thom enters the holographic simulation chamber while Captain Barley and his tech crew monitor the approaching robot swarm outside.',
    '[
      {"id": "tos-chip-4", "label": "Catch me up to this moment", "actionType": "episode_recap"},
      {"id": "tos-chip-5", "label": "Why are they recreating the bridge memory?", "actionType": "scene_explain"},
      {"id": "tos-chip-6", "label": "Who is Captain Barley?", "actionType": "entity_explain"},
      {"id": "tos-chip-7", "label": "Quiz me on what happened so far", "actionType": "post_watch_quiz"}
    ]'::jsonb
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
    3,
    360001,
    734000,
    'Breach at the Cathedral & Neural Climax',
    'Oude Kerk Hologram Core',
    'climactic-action',
    10,
    'As synthetic androids breach the church perimeter, Thom confronts the holographic projection of Celia to rewrite the memory that triggered the machine war.',
    '[
      {"id": "tos-chip-8", "label": "Why is the hologram glitching?", "actionType": "scene_explain"},
      {"id": "tos-chip-9", "label": "Full episode recap so far", "actionType": "episode_recap"},
      {"id": "tos-chip-10", "label": "Take the Post-Watch Trivia Quiz", "actionType": "post_watch_quiz"}
    ]'::jsonb
  ),

  -- Episode 4: Tears of Steel S1E2 (Cross-Episode Continuity Seed)
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb4',
    1,
    0,
    350000,
    'Dawn Over the Orbital Ring',
    'Rotterdam Sea Wall',
    'aftermath',
    5,
    'Following the Oude Kerk broadcast, the machine swarm halts in mid-air while Barley and Thom await Celia''s first direct transmission.',
    '[
      {"id": "tos2-chip-1", "label": "Recap Episode 1 & how we got here", "actionType": "episode_recap"},
      {"id": "tos2-chip-2", "label": "Why did the machine swarm stop attacking?", "actionType": "scene_explain"}
    ]'::jsonb
  ),

  -- Episode 2: Cosmic Origins: Deep Field (Science Documentary)
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
    1,
    0,
    200000,
    'Gravitational Lensing & SMACS 0723',
    'Lagrange Point L2 / Deep Space',
    'scientific-wonder',
    4,
    'How massive foreground galaxy clusters bend spacetime to magnify faint infrared light from the earliest galaxies.',
    '[
      {"id": "doc-chip-1", "label": "Explain Gravitational Lensing simply", "actionType": "entity_explain"},
      {"id": "doc-chip-2", "label": "What is galaxy cluster SMACS 0723?", "actionType": "scene_explain"},
      {"id": "doc-chip-3", "label": "Why do the galaxies look stretched into arcs?", "actionType": "contextual_qa"}
    ]'::jsonb
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
    2,
    200001,
    420000,
    'Redshift & Gold-Coated Infrared Mirrors',
    'James Webb Optical Telescope Element',
    'analytical',
    5,
    'As the universe expands, ancient ultraviolet and visible starlight stretches into infrared wavelengths that only cryogenically cooled gold mirrors can capture.',
    '[
      {"id": "doc-chip-4", "label": "What is Cosmological Redshift?", "actionType": "entity_explain"},
      {"id": "doc-chip-5", "label": "Why are Webb''s mirrors coated in gold?", "actionType": "contextual_qa"},
      {"id": "doc-chip-6", "label": "Summarize the science so far", "actionType": "episode_recap"}
    ]'::jsonb
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
    3,
    420001,
    600000,
    'Spectroscopy & Exoplanet Atmospheres',
    'NIRSpec Micro-Shutter Array',
    'discovery',
    6,
    'Splitting starlight into rainbow spectra reveals water vapor, carbon dioxide, and chemical signatures in distant galaxies and exoplanet atmospheres.',
    '[
      {"id": "doc-chip-7", "label": "How does NIRSpec read chemical fingerprints?", "actionType": "scene_explain"},
      {"id": "doc-chip-8", "label": "Recap the entire documentary", "actionType": "episode_recap"},
      {"id": "doc-chip-9", "label": "Test my space science knowledge", "actionType": "post_watch_quiz"}
    ]'::jsonb
  ),

  -- Episode 3: The Midnight Cipher (Mystery / Thriller)
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3',
    1,
    0,
    300000,
    'The Stopped Pocket Watch in Compartment 4B',
    'Car 4, Transcontinental Express (11:42 PM)',
    'noir-suspense',
    7,
    'Inspector Vance examines the locked diplomat''s compartment, finding a shattered gold pocket watch stopped at 11:17 PM and traces of ash on the windowsill.',
    '[
      {"id": "mys-chip-1", "label": "Who is Inspector Vance?", "actionType": "entity_explain"},
      {"id": "mys-chip-2", "label": "What clues were found in Compartment 4B?", "actionType": "scene_explain"},
      {"id": "mys-chip-3", "label": "Why is the 11:17 PM timestamp important?", "actionType": "contextual_qa"}
    ]'::jsonb
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3',
    2,
    300001,
    600000,
    'Alibis in the Dining Car',
    'First-Class Dining Car',
    'interrogation',
    8,
    'Vance questions Countess Elena and Dr. Sterling over espresso; Elena claims she was in the observation lounge, but soot on her cuff contradicts her story.',
    '[
      {"id": "mys-chip-4", "label": "Who is Countess Elena?", "actionType": "entity_explain"},
      {"id": "mys-chip-5", "label": "Compare the suspects'' alibis so far", "actionType": "episode_recap"},
      {"id": "mys-chip-6", "label": "What contradiction did Vance spot?", "actionType": "scene_explain"}
    ]'::jsonb
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3',
    3,
    600001,
    900000,
    'The Alpine Tunnel & The Double-Cross',
    'Baggage Car / Alpine Pass',
    'thriller-reveal',
    10,
    'Inside the darkened baggage car, Vance decodes the Vigenere cipher and exposes how Dr. Sterling staged the theft to intercept the treaty coordinates.',
    '[
      {"id": "mys-chip-7", "label": "How did the Vigenere cipher work?", "actionType": "entity_explain"},
      {"id": "mys-chip-8", "label": "Explain the full mystery resolution", "actionType": "episode_recap"},
      {"id": "mys-chip-9", "label": "Solve the Detective Trivia Quiz", "actionType": "post_watch_quiz"}
    ]'::jsonb
  );

-- ----------------------------------------------------------------------------
-- 5. Timestamped Transcript Segments
-- ----------------------------------------------------------------------------
delete from public.transcript_segments
where episode_id in (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb4'
);

insert into public.transcript_segments (
  episode_id, start_time_ms, end_time_ms, speaker_name, dialogue_text, visual_cue, is_key_plot_point
)
values
  -- Tears of Steel S1E1 (Note: at 35,000ms only segment 1 has end_time_ms <= 35,000!)
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 15000, 28000, 'Thom', 'You just want to go to space, Celia. I just want to stay on the ground with you.', 'Thom looks at Celia''s robotic prosthetic hand on the bridge railing.', true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 36000, 48000, 'Celia', 'Look at what I built, Thom! It is stronger than flesh. Why does that terrify you?', 'Celia flexes her mechanical fingers.', true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 85000, 112000, 'Thom', 'Because every piece you replace takes you further away from me.', 'Thom steps back on the canal bridge as rain begins to fall.', false),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 130000, 155000, 'Barley', 'Hologram projectors online. Keep the neural signal stable—the perimeter turrets won''t hold them forever.', 'Soldiers fortify the stained-glass windows while green holographic grids appear.', true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 210000, 245000, 'Barley', 'Don''t argue with the memory, Thom! Tell her you understand her fear—change the imprint before the swarm locks onto our reactor.', 'Warning sirens flash red across the command console.', true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 410000, 460000, 'Thom', 'Celia, listen to me—I was wrong on that bridge. I wasn''t afraid of what you built; I was afraid you wouldn''t need me anymore.', 'The holographic Amsterdam bridge begins to dissolve as androids breach the outer doors.', true),

  -- Cosmic Origins: Deep Field
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', 5000, 40000, 'Narrator', 'Galaxy cluster SMACS 0723 acts as a cosmic magnifying glass, warping and brightening light from galaxies behind it that formed over 13 billion years ago.', 'Warped arcs of orange and red galaxies curve around a bright central cluster.', true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', 95000, 140000, 'Dr. Lin', 'Albert Einstein predicted that massive objects curve the fabric of spacetime itself, bending the path of photons traveling past them.', 'Animated grid of spacetime bending around a glowing galaxy cluster.', false),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', 220000, 275000, 'Narrator', 'Because the universe is expanding, ultraviolet light emitted by the first stars has been stretched into infrared wavelengths—a phenomenon called cosmological redshift.', 'Spectrum bar shifting from blue ultraviolet wavelengths into deep infrared.', true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', 310000, 365000, 'Dr. Lin', 'Each of Webb''s eighteen hexagonal beryllium mirror segments is coated in a microscopic layer of pure gold to maximize infrared reflection at minus 223 degrees Celsius.', 'Close-up of the golden hexagonal mirror array unfolding at Lagrange Point L2.', true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', 450000, 510000, 'Narrator', 'Using NIRSpec''s 250,000 micro-shutters, astronomers capture spectra from a hundred galaxies simultaneously, identifying oxygen, neon, and water vapor.', 'Spectral absorption lines appearing over distant red galaxies.', true),

  -- The Midnight Cipher
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3', 18000, 55000, 'Inspector Vance', 'The diplomat''s wristwatch stopped at 11:17 PM, precisely when the emergency brake was pulled in Car 4—yet the window latch was opened from the inside.', 'Vance holds a magnifying glass over a cracked gold pocket watch.', true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3', 140000, 195000, 'Conductor Moreau', 'No one entered or left Car 4 after 11:00 PM, Inspector. The corridor doors were bolted against the blizzard.', 'Snow whips violently against the train corridor windows.', false),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3', 330000, 385000, 'Countess Elena', 'I was in the observation car drinking chamomile tea until midnight. Ask Dr. Sterling—he lent me his lighter.', 'Elena adjusts her velvet cuff, concealing a smudge of coal ash.', true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3', 440000, 495000, 'Inspector Vance', 'A fascinating alibi, Countess—except chamomile requires no lighter, and the ash on your sleeve comes from encrypted flash-paper.', 'Elena''s expression freezes as Vance places a half-burned cipher strip on the table.', true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3', 640000, 710000, 'Inspector Vance', 'The Countess burned a decoy, Dr. Sterling! You reset the diplomat''s watch backward by twenty minutes so everyone would vouch for your alibi in the dining car.', 'Vance opens Sterling''s medical bag, revealing the intact diplomatic pouch.', true);

-- ----------------------------------------------------------------------------
-- 6. Entities (12 Curated Entities Across All 3 Programs)
-- ----------------------------------------------------------------------------
insert into public.entities (
  id, program_id, slug, name, aliases, entity_type, base_description, spoiler_floor_ms
)
values
  -- Tears of Steel Entities
  ('cccccccc-cccc-cccc-cccc-ccccccccccc1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'thom', 'Thom', array['Subject One'], 'character', 'Former partner of Celia and reluctant key subject in the Oude Kerk neural memory protocol.', 0),
  ('cccccccc-cccc-cccc-cccc-ccccccccccc2', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'celia', 'Celia', array['The Architect', 'Cloud Core'], 'character', 'Brilliant cybernetics pioneer whose early prosthetic experiments sparked a technological revolution.', 0),
  ('cccccccc-cccc-cccc-cccc-ccccccccccc3', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'barley', 'Captain Barley', array['Commander Barley'], 'character', 'Commander of the Amsterdam resistance cell operating the neural hologram dome inside the Oude Kerk.', 0),
  ('cccccccc-cccc-cccc-cccc-ccccccccccc4', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'oude-kerk-dome', 'Oude Kerk Neural Dome', array['The Sanctuary'], 'location', 'Fortified historic Amsterdam church retrofitted with holographic memory projection coils.', 0),

  -- Cosmic Origins Entities
  ('cccccccc-cccc-cccc-cccc-ccccccccccc5', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'gravitational-lensing', 'Gravitational Lensing', array['Einstein Ring', 'Relativistic Magnification'], 'concept', 'Relativistic bending of light caused by massive galaxy clusters curving spacetime.', 0),
  ('cccccccc-cccc-cccc-cccc-ccccccccccc6', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'smacs-0723', 'SMACS 0723', array['Webb''s First Deep Field Cluster'], 'location', 'Massive foreground galaxy cluster 4.6 billion light-years away acting as a natural cosmic lens.', 0),
  ('cccccccc-cccc-cccc-cccc-ccccccccccc7', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'cosmological-redshift', 'Cosmological Redshift', array['Doppler Stretch'], 'concept', 'The stretching of ancient ultraviolet and visible starlight into infrared wavelengths as the universe expands.', 0),
  ('cccccccc-cccc-cccc-cccc-ccccccccccc8', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'nirspec-array', 'NIRSpec Micro-Shutter Array', array['Near-Infrared Spectrograph'], 'object', 'Spectrograph aboard the James Webb Space Telescope capable of analyzing 100 galaxy spectra at once.', 0),

  -- The Midnight Cipher Entities
  ('cccccccc-cccc-cccc-cccc-ccccccccccc9', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'inspector-vance', 'Inspector Julian Vance', array['Vance'], 'character', 'Veteran railway investigator specializing in diplomatic espionage and cryptographic reconstruction.', 0),
  ('cccccccc-cccc-cccc-cccc-cccccccccc10', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'countess-elena', 'Countess Elena Rostova', array['Passenger 4A'], 'character', 'Aristocratic passenger occupying Compartment 4A next door to the stolen diplomatic courier pouch.', 0),
  ('cccccccc-cccc-cccc-cccc-cccccccccc11', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'dr-sterling', 'Dr. Arthur Sterling', array['The Physician'], 'character', 'Seemingly mild-mannered physician traveling in Car 4 who provides Countess Elena''s dining car alibi.', 0),
  ('cccccccc-cccc-cccc-cccc-cccccccccc12', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'vigenere-pocket-watch', 'Stopped Gold Pocket Watch', array['11:17 Alibi Watch'], 'object', 'Shattered gold pocket watch found in Compartment 4B with its hands frozen at 11:17 PM.', 0)
on conflict (program_id, slug) do update set
  name = excluded.name,
  aliases = excluded.aliases,
  entity_type = excluded.entity_type,
  base_description = excluded.base_description;

-- ----------------------------------------------------------------------------
-- 7. Entity Appearances & Progressive Anti-Spoiler Reveals
-- ----------------------------------------------------------------------------
delete from public.entity_appearances
where episode_id in (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3'
);

insert into public.entity_appearances (
  episode_id, entity_id, start_time_ms, end_time_ms, reveal_time_ms, progressive_fact, is_plot_twist, importance_rank
)
values
  -- Tears of Steel Appearances (Plot twist gated at 125,000ms!)
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'cccccccc-cccc-cccc-cccc-ccccccccccc1', 0, 734000, 0, 'Thom broke up with Celia 40 years ago on an Amsterdam bridge because he feared her cybernetic enhancements.', false, 1),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'cccccccc-cccc-cccc-cccc-ccccccccccc1', 360001, 734000, 400000, 'Thom confesses inside the hologram that his real fear was being left behind by Celia''s genius, not her robotic hand.', true, 1),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'cccccccc-cccc-cccc-cccc-ccccccccccc2', 0, 120000, 0, 'Celia is an ambitious robotics engineer testing a cybernetic hand replacement.', false, 1),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'cccccccc-cccc-cccc-cccc-ccccccccccc2', 120001, 734000, 125000, 'Celia''s consciousness now controls the global machine network, and the resistance is trying to heal her trauma by replaying the bridge memory.', true, 1),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'cccccccc-cccc-cccc-cccc-ccccccccccc3', 120001, 734000, 120001, 'Barley leads the technical team projecting Thom into a synthetic reconstruction of the past.', false, 2),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'cccccccc-cccc-cccc-cccc-ccccccccccc4', 120001, 734000, 120001, 'The Oude Kerk serves as the last shielded neural broadcast facility in Amsterdam.', false, 3),

  -- Cosmic Origins Appearances
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', 'cccccccc-cccc-cccc-cccc-ccccccccccc5', 0, 600000, 0, 'Allows telescopes to observe distant galaxies that would otherwise be too faint to detect.', false, 1),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', 'cccccccc-cccc-cccc-cccc-ccccccccccc6', 0, 200000, 0, 'SMACS 0723 bends light from galaxies over 13.1 billion years old into visible Einstein rings.', false, 2),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', 'cccccccc-cccc-cccc-cccc-ccccccccccc7', 200001, 420000, 200001, 'Light from the first galaxies has redshifted by a factor of z > 10 into the mid-infrared spectrum.', false, 1),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', 'cccccccc-cccc-cccc-cccc-ccccccccccc8', 420001, 600000, 420001, 'NIRSpec''s micro-shutters block out foreground glare to read chemical elements in ancient starlight.', false, 2),

  -- The Midnight Cipher Appearances (Culprit plot twist gated at 640,000ms!)
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3', 'cccccccc-cccc-cccc-cccc-ccccccccccc9', 0, 900000, 0, 'Inspector Vance notices the Compartment 4B window was unlatched from inside despite the blizzard.', false, 1),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3', 'cccccccc-cccc-cccc-cccc-cccccccccc10', 300001, 600000, 300001, 'Countess Elena claims she was drinking tea in the lounge, but flash-paper ash stains her velvet cuff.', false, 2),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3', 'cccccccc-cccc-cccc-cccc-cccccccccc10', 600001, 900000, 620000, 'Elena only burned a blank decoy message to protect her brother; she did not steal the diplomatic pouch.', true, 2),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3', 'cccccccc-cccc-cccc-cccc-cccccccccc11', 300001, 600000, 300001, 'Dr. Sterling corroborates Elena''s dining car alibi and appears to be an uninvolved bystander.', false, 1),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3', 'cccccccc-cccc-cccc-cccc-cccccccccc11', 600001, 900000, 640000, 'Dr. Sterling is the true mastermind who reset the pocket watch backward by 20 minutes and hid the pouch in his medical bag.', true, 1),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3', 'cccccccc-cccc-cccc-cccc-cccccccccc12', 0, 900000, 0, 'The pocket watch is frozen at 11:17 PM, initially suggesting the theft occurred during the emergency brake halt.', false, 2);

-- ----------------------------------------------------------------------------
-- 8. Entity Relationships Graph
-- ----------------------------------------------------------------------------
delete from public.entity_relationships
where episode_id in (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3'
);

insert into public.entity_relationships (
  episode_id, source_entity_id, target_entity_id, relationship_type, relationship_summary, reveal_time_ms, valid_from_ms, valid_until_ms, is_secret_reveal
)
values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'cccccccc-cccc-cccc-cccc-ccccccccccc1', 'cccccccc-cccc-cccc-cccc-ccccccccccc2', 'estranged-partners', 'Thom and Celia were romantic partners whose painful breakup on the Amsterdam bridge shaped the future.', 0, 0, null, false),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'cccccccc-cccc-cccc-cccc-ccccccccccc3', 'cccccccc-cccc-cccc-cccc-ccccccccccc1', 'commander-and-subject', 'Captain Barley guides Thom through the neural memory reconstruction inside the Oude Kerk.', 120001, 120001, null, false),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', 'cccccccc-cccc-cccc-cccc-ccccccccccc6', 'cccccccc-cccc-cccc-cccc-ccccccccccc5', 'demonstrates-phenomenon', 'Galaxy cluster SMACS 0723 bends spacetime to produce gravitational lensing of background galaxies.', 0, 0, null, false),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3', 'cccccccc-cccc-cccc-cccc-cccccccccc11', 'cccccccc-cccc-cccc-cccc-cccccccccc10', 'alibi-witness', 'Dr. Sterling vouches for Countess Elena''s presence in the lounge before midnight.', 300001, 300001, 639999, false),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3', 'cccccccc-cccc-cccc-cccc-cccccccccc11', 'cccccccc-cccc-cccc-cccc-cccccccccc12', 'manipulated-evidence', 'Dr. Sterling secretly wound the pocket watch backward to 11:17 PM to fabricate his own alibi.', 640000, 640000, null, true);

-- ----------------------------------------------------------------------------
-- 9. Episode Quizzes
-- ----------------------------------------------------------------------------
delete from public.episode_quizzes
where episode_id in (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3'
);

insert into public.episode_quizzes (
  episode_id, unlock_time_ms, profile_mode, difficulty_level, question_text, options, correct_option_index, explanation_text
)
values
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
    60000,
    'quick_glance',
    'easy',
    'What physical enhancement on Celia sparks the argument between Thom and Celia on the Amsterdam bridge?',
    '["A neural ocular implant", "A robotic prosthetic hand", "A zero-gravity flight suit", "An encrypted memory chip"]'::jsonb,
    1,
    'Thom stares at Celia''s robotic prosthetic hand on the bridge railing while she flexes its mechanical fingers.'
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
    160000,
    'deep_lore',
    'medium',
    'Why is Captain Barley''s resistance cell replaying Thom''s 40-year-old bridge memory inside the Oude Kerk?',
    '["To train new pilots for space flight", "To rewrite the traumatic memory imprint in Celia''s machine consciousness", "To locate a hidden weapons cache under the canal", "To repair the cathedral''s perimeter turrets"]'::jsonb,
    1,
    'Celia''s consciousness governs the global machine network, and healing the trauma of the bridge breakup is humanity''s last hope.'
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
    60000,
    'quick_glance',
    'easy',
    'How does galaxy cluster SMACS 0723 help the James Webb Space Telescope see galaxies from 13 billion years ago?',
    '["It reflects radio waves back toward Earth", "Its immense gravity bends spacetime like a natural magnifying glass", "It blocks all infrared light", "It fuels Webb''s solar panels"]'::jsonb,
    1,
    'Through gravitational lensing, the massive foreground cluster warps spacetime and magnifies faint background galaxies.'
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
    350000,
    'deep_lore',
    'medium',
    'Why are the James Webb Space Telescope''s eighteen hexagonal beryllium mirror segments coated in pure gold?',
    '["Gold prevents meteoroid impacts", "Gold maximizes reflection of redshifted infrared light", "Gold generates heat to melt space ice", "Gold filters out oxygen spectra"]'::jsonb,
    1,
    'Because cosmic expansion stretches ancient starlight into infrared wavelengths, gold''s high infrared reflectivity is essential.'
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3',
    200000,
    'quick_glance',
    'easy',
    'At what exact time did the shattered pocket watch in Compartment 4B stop?',
    '["10:45 PM", "11:00 PM", "11:17 PM", "12:00 Midnight"]'::jsonb,
    2,
    'Inspector Vance notes the watch hands froze at 11:17 PM, matching the emergency brake halt.'
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3',
    700000,
    'deep_lore',
    'hard',
    'How did Dr. Sterling fabricate his alibi during the theft of the diplomatic pouch?',
    '["He bribed Conductor Moreau to lock the doors", "He reset the victim''s pocket watch backward by 20 minutes", "He jumped onto another train at the alpine pass", "He disguised himself as Inspector Vance"]'::jsonb,
    1,
    'By setting the watch back 20 minutes to 11:17 PM, Sterling made everyone believe the theft happened while he was seen in the dining car.'
  );

-- ----------------------------------------------------------------------------
-- 10. Temporal Semantic Embeddings (Seeded for Hybrid RRF Vector Search)
-- ----------------------------------------------------------------------------
delete from public.temporal_embeddings
where episode_id in (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3'
);

insert into public.temporal_embeddings (
  episode_id, source_type, start_time_ms, end_time_ms, reveal_time_ms, content_text, embedding_vector
)
values
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
    'transcript',
    15000,
    28000,
    0,
    'Thom and Celia argue on the Amsterdam bridge over her robotic prosthetic hand and ambition to leave Earth for space.',
    array[0.82, 0.31, -0.14, 0.42, 0.11, -0.05, 0.19, 0.08]::float4[]
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
    'entity_lore',
    120001,
    734000,
    125000,
    'Celia''s consciousness controls the global sentient machine swarm, and replaying the bridge memory inside the Oude Kerk is humanity''s last chance.',
    array[0.18, 0.79, 0.44, -0.21, 0.25, 0.12, -0.09, 0.15]::float4[]
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
    'scene_summary',
    0,
    200000,
    0,
    'Gravitational lensing by galaxy cluster SMACS 0723 bends spacetime to magnify infrared light from 13.5 billion years ago.',
    array[-0.12, 0.22, 0.88, 0.31, -0.15, 0.19, 0.04, -0.07]::float4[]
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3',
    'entity_lore',
    600001,
    900000,
    640000,
    'Dr. Sterling wound the gold pocket watch backward by twenty minutes to 11:17 PM to fake his dining car alibi and steal the pouch.',
    array[0.09, -0.18, 0.12, 0.85, 0.39, -0.22, 0.11, 0.05]::float4[]
  );

-- ----------------------------------------------------------------------------
-- 11. Pre-Warmed AI Response Cache, Conversation Sessions & Provider Metrics
-- ----------------------------------------------------------------------------
insert into public.ai_response_cache (
  cache_key, episode_id, action_type, profile_mode, time_bucket_sec, provider_used, response_payload, hit_count, origin_latency_ms, token_count, expires_at
)
values
  (
    'wisp:bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1:entity_explain:quick_glance:bucket-2',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
    'entity_explain',
    'quick_glance',
    30,
    'groq:llama-3.3-70b-versatile',
    '{
      "headline": "Thom & Celia — The Amsterdam Bridge",
      "body": "Thom and Celia are partners standing on an Amsterdam canal bridge. Celia is a passionate robotics pioneer testing a new cybernetic hand, while Thom fears her enhancements are pulling them apart.",
      "bulletPoints": [
        "Thom wants a grounded life together on Earth.",
        "Celia is proud of her mechanical prosthetic hand.",
        "Spoiler-safe up to 00:45."
      ],
      "spoilerSafeUpToMs": 45000,
      "profileMode": "quick_glance",
      "providerUsed": "groq:llama-3.3-70b-versatile",
      "cached": true,
      "latencyMs": 8,
      "followUpChips": [
        {"id": "f-1", "label": "Why are they arguing?", "actionType": "scene_explain"},
        {"id": "f-2", "label": "What is Celia''s cybernetic hand?", "actionType": "contextual_qa"}
      ]
    }'::jsonb,
    14,
    310,
    185,
    now() + interval '7 days'
  )
on conflict (cache_key) do update set
  response_payload = excluded.response_payload,
  expires_at = excluded.expires_at;

insert into public.conversation_sessions (
  device_id, profile_id, episode_id, last_playback_position_ms, turn_count, recent_turns, bookmarked_moments, expires_at
)
values
  (
    'firetv-demo-device-01',
    '11111111-1111-1111-1111-111111111111',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
    45000,
    1,
    '[{"actionType": "entity_explain", "prompt": "Who are Thom and Celia?", "playbackPositionMs": 45000}]'::jsonb,
    '[{"label": "Bridge Breakup Scene", "playbackPositionMs": 28000}]'::jsonb,
    now() + interval '12 hours'
  )
on conflict (device_id, episode_id) do update set
  last_playback_position_ms = excluded.last_playback_position_ms,
  expires_at = excluded.expires_at;

insert into public.ai_provider_metrics (
  bucket_hour, provider_name, action_type, total_requests, successful_requests, failed_requests, cache_hits, failover_count, total_latency_ms, min_latency_ms, max_latency_ms, total_tokens
)
values
  (date_trunc('hour', now()), 'groq:llama-3.3-70b-versatile', 'entity_explain', 25, 25, 0, 14, 0, 4650, 140, 390, 4625),
  (date_trunc('hour', now()), 'groq:llama-3.3-70b-versatile', 'scene_explain', 18, 18, 0, 9, 0, 3780, 160, 420, 3420),
  (date_trunc('hour', now()), 'gemini:gemini-2.0-flash', 'episode_recap', 8, 8, 0, 3, 1, 2880, 290, 510, 2160)
on conflict (bucket_hour, provider_name, action_type) do nothing;
