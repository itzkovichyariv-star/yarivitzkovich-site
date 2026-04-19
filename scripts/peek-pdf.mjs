import { createRequire } from 'module';
import { readFileSync } from 'fs';
const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');

const file = process.argv[2];
const buf = readFileSync(file);
const data = await pdf(buf);
const firstPage = data.text.slice(0, 1200);
console.log('--- FIRST ~1200 chars ---');
console.log(firstPage);
console.log('\n--- DOIs found anywhere in text ---');
const dois = [...new Set(data.text.match(/10\.\d{4,}\/[^\s"'<>()]+/gi) ?? [])].slice(0, 5);
console.log(dois);
console.log('\n--- PDF metadata ---');
console.log(data.info);
