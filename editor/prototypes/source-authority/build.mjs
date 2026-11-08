// PROTOTYPE build: locked Vite emits an IIFE, then this script inlines it.
import { build } from 'vite';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const result = await build({
  configFile: false,
  logLevel: 'warn',
  build: {
    write: false,
    minify: true,
    lib: { entry: here + 'main.ts', name: 'InkoraSourceAuthorityPrototype', formats: ['iife'] },
  },
});
const output = Array.isArray(result) ? result[0] : result;
const code = output.output.find(item => item.type === 'chunk')?.code;
if (!code) throw Error('Vite did not emit a JavaScript chunk');
const shell = await readFile(here + 'shell.html', 'utf8');
await writeFile(here + 'PROTOTYPE.html', shell.replace(
  '<!-- INLINE_PROTOTYPE_SCRIPT -->',
  () => `<script>\n${code.replace(/<\/script/gi, '<\\/script')}\n</script>`,
));
console.log('PROTOTYPE.html ready (offline; double-click).');
