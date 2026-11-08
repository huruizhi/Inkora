// Node-only PROTOTYPE scratch adapter. It never accepts a user document path.
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function withScratch(raw, callback) {
  const directory = await mkdtemp(join(tmpdir(), 'inkora-source-authority-'));
  const path = join(directory, 'INK-PROT-030-PROTOTYPE-scratch.md');
  try {
    await writeFile(path, Buffer.from(raw, 'utf8'));
    const bytes = await readFile(path);
    return await callback({ path, bytes, raw: bytes.toString('utf8') });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
