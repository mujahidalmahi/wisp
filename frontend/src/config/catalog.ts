export interface CatalogProgram {
  programId: string;
  episodeId: string;
  title: string;
  episodeTitle: string;
  genre: 'Sci-Fi' | 'Mystery / Thriller' | 'Science Documentary';
  durationSeconds: number;
  synopsis: string;
  tagline: string;
  videoStreamUrl?: string;
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
      'In a dystopian future Amsterdam, a group of warriors and scientists gather at the Oude Kerk to stage a desperate memory reenactment that could save humanity from sentient machines.',
    tagline: 'Memory is the ultimate battleground.',
    videoStreamUrl:
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
  },
  {
    programId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
    episodeId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
    title: 'Cosmic Origins: Deep Field',
    episodeTitle: 'Light Across 13 Billion Years',
    genre: 'Science Documentary',
    durationSeconds: 600,
    synopsis:
      'An exploration of gravitational lensing, infrared spectroscopy, and early galaxy formation captured by the James Webb Space Telescope.',
    tagline: 'Light across thirteen billion years.',
    videoStreamUrl:
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4',
  },
  {
    programId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3',
    episodeId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3',
    title: 'The Midnight Cipher',
    episodeTitle: 'Compartment 4B',
    genre: 'Mystery / Thriller',
    durationSeconds: 900,
    synopsis:
      'Aboard a snowbound transcontinental train, an encrypted diplomatic pouch vanishes—and every passenger in Car 4 holds a conflicting alibi.',
    tagline: 'Every passenger holds a secret.',
    videoStreamUrl:
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
  },
];
