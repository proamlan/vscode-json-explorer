import { build, context } from 'esbuild';

const watch = process.argv.includes('--watch');

// NOTE: mainFields order matters. jsonc-parser ships both UMD ("main")
// and ESM ("module"). The UMD build uses a factory(require, exports)
// wrapper whose relative requires (./impl/...) cannot be bundled and
// throw "Cannot find module './impl/format'" when the extension loads.
// Preferring "module" bundles the ESM build and avoids this entirely.
const options = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: true,
  mainFields: ['module', 'main'],
};

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log('watching...');
} else {
  await build(options);
}
