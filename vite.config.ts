import { defineConfig } from 'vite';

const stamp = new Date()
  .toISOString()
  .slice(0, 16)
  .replace(/[-:]/g, '')
  .replace('T', '.');

const envBuild = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
  ?.BUILD_NUMBER;

export default defineConfig({
  base: './',
  define: {
    __BUILD_NUMBER__: JSON.stringify(envBuild || stamp)
  }
});
