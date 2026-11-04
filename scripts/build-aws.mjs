import { build } from 'esbuild';
await build({
  entryPoints: ['aws/api/handler.ts'],
  outfile: 'dist/aws/api/index.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  minify: true,
  sourcemap: false,
});
