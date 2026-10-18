import type { RawEpisodeDataset } from '../types/index.ts';

export const EMBEDDED_DEMO_EPISODES: Record<string, RawEpisodeDataset> = {
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1': {
    episodeId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
    programTitle: 'Tears of Steel',
    genre: 'Sci-Fi / Cyberpunk',
    episodeTitle: 'The Oude Kerk Protocol',
    seasonNumber: 1,
    episodeNumber: 1,
    scenes: [
      {
        sceneIndex: 1,
        startTimeMs: 0,
        endTimeMs: 120000,
        sceneTitle: 'The Bridge Breakup (Memory Fragment)',
        locationName: 'Amsterdam Canal Bridge (40 Years Ago)',
        spoilerSafeSummary:
          'Young Thom and Celia argue about her obsession with cybernetic robotics and his fear of losing their humanity.',
        quickActionChips: [
          { id: 'chip-1', label: 'Who are Thom and Celia?', actionType: 'entity_explain' },
          {
            id: 'chip-2',
            label: 'Why are they arguing on the bridge?',
            actionType: 'scene_explain',
          },
          {
            id: 'chip-3',
            label: "What is Celia's cybernetic hand?",
            actionType: 'contextual_qa',
          },
        ],
      },
      {
        sceneIndex: 2,
        startTimeMs: 120001,
        endTimeMs: 360000,
        sceneTitle: 'Inside the Oude Kerk Dome',
        locationName: 'Fortified Oude Kerk, Future Amsterdam',
        spoilerSafeSummary:
          'An older Thom enters the holographic simulation chamber while Captain Barley and his tech crew monitor the approaching robot swarm outside.',
        quickActionChips: [
          { id: 'chip-4', label: 'Catch me up to this moment', actionType: 'episode_recap' },
          {
            id: 'chip-5',
            label: 'Why are they recreating the bridge memory?',
            actionType: 'scene_explain',
          },
          { id: 'chip-6', label: 'Who is Captain Barley?', actionType: 'entity_explain' },
          { id: 'chip-7', label: 'Quiz me on what happened so far', actionType: 'post_watch_quiz' },
        ],
      },
    ],
    transcriptSegments: [
      {
        startTimeMs: 15000,
        endTimeMs: 28000,
        speaker: 'Thom',
        dialogue:
          'You just want to go to space, Celia. I just want to stay on the ground with you.',
        visualCue: "Thom looks at Celia's robotic prosthetic hand on the bridge railing.",
      },
      {
        startTimeMs: 29000,
        endTimeMs: 45000,
        speaker: 'Celia',
        dialogue:
          'Look at what I built, Thom! It is stronger than flesh. Why does that terrify you?',
        visualCue: 'Celia flexes her mechanical fingers.',
      },
      {
        startTimeMs: 130000,
        endTimeMs: 155000,
        speaker: 'Barley',
        dialogue:
          "Hologram projectors online. Keep the neural signal stable—the perimeter turrets won't hold them forever.",
        visualCue:
          'Soldiers fortify the stained-glass windows while green holographic grids appear.',
      },
    ],
    entities: [
      {
        slug: 'thom',
        name: 'Thom',
        type: 'character',
        baseDescription:
          'Former partner of Celia and reluctant key subject in the Oude Kerk memory protocol.',
        appearances: [
          {
            startTimeMs: 0,
            endTimeMs: 734000,
            revealTimeMs: 0,
            progressiveFact:
              'Thom broke up with Celia on an Amsterdam bridge because he feared her cybernetic enhancements.',
          },
        ],
      },
      {
        slug: 'celia',
        name: 'Celia',
        type: 'character',
        baseDescription:
          'Brilliant cybernetics pioneer whose early prosthetic experiments sparked a technological revolution.',
        appearances: [
          {
            startTimeMs: 0,
            endTimeMs: 120000,
            revealTimeMs: 0,
            progressiveFact:
              'Celia is an ambitious robotics engineer testing a cybernetic hand replacement.',
          },
          {
            startTimeMs: 120001,
            endTimeMs: 734000,
            revealTimeMs: 125000,
            progressiveFact:
              "Celia's consciousness now controls the global machine network, and the resistance is trying to heal her trauma by replaying the bridge memory.",
          },
        ],
      },
      {
        slug: 'barley',
        name: 'Captain Barley',
        type: 'character',
        baseDescription:
          'Commander of the Amsterdam resistance cell operating the neural hologram dome.',
        appearances: [
          {
            startTimeMs: 120001,
            endTimeMs: 734000,
            revealTimeMs: 120001,
            progressiveFact:
              'Barley leads the technical team projecting Thom into a synthetic reconstruction of the past.',
          },
        ],
      },
    ],
  },
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2': {
    episodeId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
    programTitle: 'Cosmic Origins: Deep Field',
    genre: 'Science Documentary',
    episodeTitle: 'Light Across 13 Billion Years',
    seasonNumber: 1,
    episodeNumber: 1,
    scenes: [
      {
        sceneIndex: 1,
        startTimeMs: 0,
        endTimeMs: 600000,
        sceneTitle: 'Gravitational Lensing & SMACS 0723',
        locationName: 'Lagrange Point L2 / Deep Space',
        spoilerSafeSummary:
          'How massive foreground galaxy clusters bend spacetime to magnify faint infrared light from the earliest galaxies.',
        quickActionChips: [
          {
            id: 'doc-1',
            label: 'Explain Gravitational Lensing simply',
            actionType: 'entity_explain',
          },
          {
            id: 'doc-2',
            label: 'Why does Webb use infrared mirrors?',
            actionType: 'contextual_qa',
          },
          { id: 'doc-3', label: 'Test my knowledge on this clip', actionType: 'post_watch_quiz' },
        ],
      },
    ],
    transcriptSegments: [
      {
        startTimeMs: 5000,
        endTimeMs: 40000,
        speaker: 'Narrator',
        dialogue:
          'Galaxy cluster SMACS 0723 acts as a cosmic magnifying glass, warping and brightening light from galaxies behind it that formed over 13 billion years ago.',
        visualCue: 'Warped arcs of orange and red galaxies curve around a bright central cluster.',
      },
    ],
    entities: [
      {
        slug: 'gravitational-lensing',
        name: 'Gravitational Lensing',
        type: 'concept',
        baseDescription:
          'Relativistic bending of light caused by massive galaxy clusters curving spacetime.',
        appearances: [
          {
            startTimeMs: 0,
            endTimeMs: 600000,
            revealTimeMs: 0,
            progressiveFact:
              'Allows telescopes to observe distant galaxies that would otherwise be too faint to detect.',
          },
        ],
      },
    ],
  },
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3': {
    episodeId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3',
    programTitle: 'The Midnight Cipher',
    genre: 'Mystery / Thriller',
    episodeTitle: 'Compartment 4B',
    seasonNumber: 1,
    episodeNumber: 1,
    scenes: [
      {
        sceneIndex: 1,
        startTimeMs: 0,
        endTimeMs: 900000,
        sceneTitle: 'Compartment 4B',
        locationName: 'Transcontinental Express, Alpine Pass',
        spoilerSafeSummary:
          'Inspector Vance discovers a stopped pocket watch and a torn telegraph cipher moments before the train enters the alpine tunnel.',
        quickActionChips: [
          { id: 'myst-1', label: 'Who is Inspector Vance?', actionType: 'entity_explain' },
          { id: 'myst-2', label: 'What is the torn telegraph cipher?', actionType: 'scene_explain' },
          { id: 'myst-3', label: 'Quiz me on the suspects', actionType: 'post_watch_quiz' },
        ],
      },
    ],
    transcriptSegments: [
      {
        startTimeMs: 10000,
        endTimeMs: 35000,
        speaker: 'Inspector Vance',
        dialogue:
          'The watch stopped at precisely eleven-fourteen. Which means the pouch was taken before we entered the gorge.',
        visualCue: 'Inspector Vance holds the pocket watch up to the frosted compartment window.',
      },
    ],
    entities: [
      {
        slug: 'inspector-vance',
        name: 'Inspector Vance',
        type: 'character',
        baseDescription:
          'Veteran detective traveling on the snowbound transcontinental express investigating the missing diplomatic pouch.',
        appearances: [
          {
            startTimeMs: 0,
            endTimeMs: 900000,
            revealTimeMs: 0,
            progressiveFact:
              'Inspector Vance noticed the pocket watch stopped before the train crossed the Swiss frontier.',
          },
        ],
      },
    ],
  },
};
