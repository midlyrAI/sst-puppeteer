// Ensures the node-pty spawn-helper binary is executable after pnpm install.
// pnpm may not preserve executable permissions on prebuilt binaries.
import { chmodSync } from 'fs';
import { createRequire } from 'module';
import { join } from 'path';

const require = createRequire(import.meta.url);
const ptyPkg = require.resolve('node-pty/package.json');
const ptyRoot = join(ptyPkg, '..'); // node_modules/node-pty/
const helperPath = join(
  ptyRoot,
  'prebuilds',
  `${process.platform}-${process.arch}`,
  'spawn-helper',
);

try {
  chmodSync(helperPath, 0o755);
} catch {
  // Non-fatal: might not exist on Windows or in bundled environments
}
