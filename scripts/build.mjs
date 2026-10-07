import { cp, mkdir, rm } from 'node:fs/promises';
const output = new URL('../dist/', import.meta.url);
// Rebuild the generated output so removed pages cannot survive a local build.
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(new URL('../public/', import.meta.url), output, { recursive: true });
console.log('Built static site → dist/');
