// Node 18 treats .js files as CommonJS because the root package.json (used by server.js) has no "type": "module".
// The browser code under js/ is ES modules, so this loader reads those files as modules during tests only.
import { readFile } from 'node:fs/promises';

const browserCode = new URL('../js/', import.meta.url).href;

export async function load(url, context, nextLoad) {
   if (url.startsWith(browserCode) && url.endsWith('.js'))
      return { format: 'module', source: await readFile(new URL(url)), shortCircuit: true };
   return nextLoad(url, context);
}
