import { cp, mkdir } from 'node:fs/promises';
const output = new URL('../dist/', import.meta.url);
await mkdir(output, { recursive: true });
await cp(new URL('../public/', import.meta.url), output, { recursive: true });
console.log('Built static site → dist/');
