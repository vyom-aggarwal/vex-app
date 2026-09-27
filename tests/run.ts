import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runAll, setFile } from './harness';

const dir = dirname(fileURLToPath(import.meta.url));
for (const f of readdirSync(dir).filter((x) => x.endsWith('.test.ts')).sort()) {
  setFile(f.replace('.test.ts', ''));
  await import(pathToFileURL(join(dir, f)).href);
}
const failed = await runAll(process.argv[2]);
process.exit(failed ? 1 : 0);
