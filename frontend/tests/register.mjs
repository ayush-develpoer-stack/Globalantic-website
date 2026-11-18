/**
 * Test bootstrap for `node --test` (Node >= 22.18 / 24, which strip TypeScript
 * types natively). Adds the two things Node does not do on its own:
 *   - resolve the `@/…` path alias from tsconfig.json
 *   - resolve extensionless relative imports to .ts files
 * No test framework or transpiler dependency is needed.
 */
import { registerHooks } from 'node:module';
import { existsSync, statSync } from 'node:fs';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Tests always run the mock implementations.
process.env.NEXT_PUBLIC_DATA_SOURCE = 'mock';

const root = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');
const CANDIDATES = ['', '.ts', '.tsx', '/index.ts'];

function findFile(base) {
  for (const suffix of CANDIDATES) {
    const file = base + suffix;
    if (existsSync(file) && statSync(file).isFile()) return file;
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    let base = null;
    if (specifier.startsWith('@/')) base = join(root, specifier.slice(2));
    else if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL?.startsWith('file:')) {
      base = resolvePath(dirname(fileURLToPath(context.parentURL)), specifier);
    }
    if (base) {
      const file = findFile(base);
      // No explicit format: Node infers module-typescript from the .ts extension.
      if (file) return { url: pathToFileURL(file).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
