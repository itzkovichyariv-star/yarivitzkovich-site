// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://yarivitzkovich.org',
  integrations: [
    react(),
    mdx(),
    sitemap({
      // Exclude private/admin and double-opt-in confirmation routes. These
      // are already Disallow'd in /public/robots.txt; listing them in the
      // sitemap as well sends mixed signals to crawlers ("you said don't
      // crawl, but here's the URL?"). Cleaner to omit them entirely.
      filter: (page) =>
        !page.includes('/manage') &&
        !page.includes('/subscribe-confirm') &&
        // A copy-source for the sender, not a page for readers.
        !page.includes('/ma-info/email') &&
        !page.includes('/api/'),
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
  i18n: {
    locales: ['en', 'he'],
    defaultLocale: 'en',
    routing: {
      prefixDefaultLocale: false,
    },
  },
});
