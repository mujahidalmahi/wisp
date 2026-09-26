export const EnvConfig = {
  // 10.0.2.2 routes from the Android/Fire OS emulator directly to the host machine's NestJS server
  apiBaseUrl: 'http://10.0.2.2:3000/api/v1',
  defaultEpisodeId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
  requestTimeoutMs: 12000,
} as const;
