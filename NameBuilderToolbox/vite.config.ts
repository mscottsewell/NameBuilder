import { defineConfig, type Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Power Platform ToolBox loads tools inside a sandboxed webview and expects a
 * single, self-contained entry file. This plugin inlines the built JS and CSS
 * into index.html and strips module attributes so the bundle runs as a plain
 * IIFE script (ES module loading is not available in the tool sandbox).
 */
function pptbSingleFile(): Plugin {
  return {
    name: 'pptb-single-file',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const htmlAsset = Object.values(bundle).find(
        (item) => item.type === 'asset' && item.fileName === 'index.html'
      );
      if (!htmlAsset || htmlAsset.type !== 'asset') return;

      let html = String(htmlAsset.source);

      for (const [fileName, item] of Object.entries(bundle)) {
        if (item.type === 'chunk' && fileName.endsWith('.js')) {
          const scriptTag = new RegExp(
            `<script[^>]*src=["'][./]*${fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*></script>`
          );
          html = html.replace(scriptTag, () => `<script>\n${item.code}\n</script>`);
          delete bundle[fileName];
        } else if (item.type === 'asset' && fileName.endsWith('.css')) {
          const linkTag = new RegExp(
            `<link[^>]*href=["'][./]*${fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>`
          );
          html = html.replace(linkTag, () => `<style>\n${item.source}\n</style>`);
          delete bundle[fileName];
        }
      }

      html = html
        .replace(/<script /g, '<script ')
        .replace(/ type="module"/g, '')
        .replace(/ crossorigin/g, '');

      htmlAsset.source = html;
    },
    closeBundle() {
      // Ship the manifest icon alongside the built output.
      const iconSrc = path.resolve(__dirname, 'icons');
      const iconDest = path.resolve(__dirname, 'dist', 'icons');
      if (fs.existsSync(iconSrc)) {
        fs.mkdirSync(iconDest, { recursive: true });
        for (const file of fs.readdirSync(iconSrc)) {
          fs.copyFileSync(path.join(iconSrc, file), path.join(iconDest, file));
        }
      }
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [pptbSingleFile()],
  build: {
    target: 'es2019',
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'app.js',
        assetFileNames: '[name][extname]',
      },
    },
  },
});
