declare const __BUILD_NUMBER__: string;

export const APP_VERSION = '2.5.3';

/**
 * Filled in at build time by vite.config.ts: a timestamp such as
 * 20250518.1432. Falls back to "dev" when running without the define
 * (for example during a plain dev server start).
 */
export const BUILD_NUMBER: string =
  typeof __BUILD_NUMBER__ !== 'undefined' ? __BUILD_NUMBER__ : 'dev';
