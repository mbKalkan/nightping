// Bundles the extension host (Node, CommonJS). Nightping has no webview.
import { rmSync } from 'node:fs';
import * as esbuild from 'esbuild';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const extension = {
  entryPoints: ['src/extension/extension.ts'],
  outfile: 'dist/extension.js',
  bundle: true,
  minify: production,
  sourcemap: production ? false : 'linked',
  logLevel: 'info',
  legalComments: 'linked',
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['vscode'],
};

if (watch) {
  const ctx = await esbuild.context(extension);
  await ctx.watch();
} else {
  rmSync('dist', { recursive: true, force: true });
  await esbuild.build(extension);
}
