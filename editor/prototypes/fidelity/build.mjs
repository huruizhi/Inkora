// PROTOTYPE: use the existing locked Vite toolchain, then inline its IIFE.
import { build } from 'vite';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const here = fileURLToPath(new URL('.', import.meta.url));
const result = await build({ configFile: false, logLevel: 'warn', build: { write: false, minify: true, lib: { entry: here + 'main.ts', name: 'InkoraFidelityPrototype', formats: ['iife'] } } });
const code = (Array.isArray(result) ? result[0] : result).output.find(item => item.type === 'chunk').code;
const shell = await readFile(here + 'shell.html', 'utf8');
await writeFile(here + 'PROTOTYPE.html', shell.replace('<!-- INLINE_PROTOTYPE_SCRIPT -->', () => '<script>\n' + code.replace(/<\/script/gi, '<\\/script') + '\n</script>'));
console.log('PROTOTYPE.html ready (offline; double-click).');
