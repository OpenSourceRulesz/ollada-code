const esbuild = require('esbuild');
const production = process.argv.includes('--production');
async function main() {
  const ctx = await esbuild.context({
    bundle: true,
    entryPoints: ['src/extension.ts'],
    external: ['vscode'],
    format: 'cjs',
    logLevel: 'info',
    minify: production,
    outfile: 'out/extension.js',
    platform: 'node',
    sourcemap: !production,
    target: 'node20',
  });
  if (process.argv.includes('--watch')) {
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
