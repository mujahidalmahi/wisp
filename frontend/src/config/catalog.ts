export interface CatalogProgram {
  programId: string;
  episodeId: string;
  title: string;
  episodeTitle: string;
  genre: 'Sci-Fi' | 'Fantasy / Mystery' | 'Science Documentary';
  durationSeconds: number;
  synopsis: string;
  tagline: string;
}

export const DEMO_PROGRAMS: CatalogProgram[] = [
  {
    programId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
    episodeId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
    title: 'Tears of Steel',
    episodeTitle: 'The Oude Kerk Protocol',
    genre: 'Sci-Fi',
    durationSeconds: 734,
    synopsis:
      'In a dystopian Amsterdam, roboticists reconstruct key emotional memories to avert global apocalypse.',
    tagline: 'Memory is the ultimate battleground.',
  },
  {
    programId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
    episodeId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
    title: "Sintel: Dragon's Call",
    episodeTitle: 'The Lonely Spear',
    genre: 'Fantasy / Mystery',
    durationSeconds: 912,
    synopsis:
      'A solitary desert huntress traverses blizzard mountains to rescue her scaled companion.',
    tagline: 'Some bonds transcend fire and ice.',
  },
  {
    programId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3',
    episodeId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3',
    title: 'Cosmos Odyssey',
    episodeTitle: 'Standing Up in the Milky Way',
    genre: 'Science Documentary',
    durationSeconds: 2700,
    synopsis:
      'A cinematic voyage through the Cosmic Calendar, mapping 13.8 billion years of astrophysics.',
    tagline: 'We are a way for the cosmos to know itself.',
  },
];
