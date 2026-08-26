import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': import.meta.dirname },
  },
  define: {
    // React Native injects __DEV__ globally; outside Metro it doesn't exist,
    // and gateway-client branches on it.
    __DEV__: 'false',
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
