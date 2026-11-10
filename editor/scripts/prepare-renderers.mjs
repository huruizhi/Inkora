import { readFileSync, readdirSync, existsSync, realpathSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
function locate(name, from) {
  for (let dir = from; ; dir = dirname(dir)) {
    const candidate = join(dir, 'node_modules', name, 'package.json');
    if (existsSync(candidate)) return dirname(realpathSync(candidate));
    if (dirname(dir) === dir) throw Error(`Missing production dependency: ${name}`);
  }
}
const mermaid = locate('mermaid', root);
const meta = JSON.parse(readFileSync(join(mermaid, 'package.json'), 'utf8'));
if (meta.version !== '11.17.2') throw Error('Renderer version differs from the reviewed bundle');
mkdirSync(join(root, 'public/vendor'), { recursive: true });
copyFileSync(join(mermaid, 'dist/mermaid.min.js'), join(root, 'public/vendor/mermaid-11.17.2.min.js'));

// Include licenses for the installed production graph, including the vendor
// bundle's transitive dependencies. Never include dev dependencies or secrets.
const visited = new Set();
const notices = [];
function visit(name, from) {
  const dir = locate(name, from);
  if (visited.has(dir)) return;
  visited.add(dir);
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const files = readdirSync(dir).filter(file => /^(?:licen[cs]e|copying|notice)(?:[.-]|$)/i.test(file));
  const texts = files.map(file => `${file}\n${readFileSync(join(dir, file), 'utf8')}`);
  if (!texts.length && existsSync(join(dir, 'README.md'))) {
    const license = /^#{1,2} License\s*\n([\s\S]*?)(?=^#{1,2} |$(?![\s\S]))/im.exec(
      readFileSync(join(dir, 'README.md'), 'utf8'));
    if (license) texts.push(license[1]);
  }
  if (!texts.length) throw Error(`No license text for ${pkg.name}@${pkg.version}`);
  notices.push(`${pkg.name} ${pkg.version}\n${pkg.license ?? ''}\n${texts.join('\n\n')}`);
  for (const dependency of Object.keys(pkg.dependencies ?? {})) visit(dependency, dir);
}
const project = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
for (const name of Object.keys(project.dependencies)) visit(name, root);
writeFileSync(join(root, 'public/RENDERER_NOTICES.txt'),
  'Inkora production dependency licenses\n====================================\n\n' + notices.sort().join('\n\n---\n\n') + '\n');
