// Installs the Husky git hooks (`core.hooksPath` = `.husky/_`). Skipped silently in CI, when
// HUSKY=0, or when there is no git repository (e.g. a tarball or a Docker build context).
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import process from 'node:process';

if (process.env.CI || process.env.HUSKY === '0') process.exit(0);

try {
  execFileSync('git', ['rev-parse', '--git-dir'], { stdio: 'ignore' });
} catch {
  process.exit(0);
}

try {
  const { default: husky } = await import('husky');
  // Husky expects the repository root (where `.git` is) as the working directory.
  process.chdir(resolve(import.meta.dirname, '..'));
  const message = husky();
  if (message) process.stdout.write(`${message}\n`);
} catch (error) {
  process.stdout.write(`Skipping git hooks installation: ${String(error)}\n`);
}
