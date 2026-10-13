// Tauri doesn't have a Node.js server to do proper SSR
// so we use adapter-static with a fallback to index.html to put the site in SPA mode
// See: https://svelte.dev/docs/kit/single-page-apps
// See: https://v2.tauri.app/start/frontend/sveltekit/ for more info
import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

// Disable CSS preprocessing in the Vitest environment to avoid a Vite 6+
// PartialEnvironment crash (https://github.com/sveltejs/vite-plugin-svelte/issues/1043).
// In production/dev builds, style is true (the default) so PostCSS is applied normally.
const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess({ style: !isTest }),
  kit: {
    adapter: adapter({
      fallback: "index.html",
    }),
  },
};

export default config;
