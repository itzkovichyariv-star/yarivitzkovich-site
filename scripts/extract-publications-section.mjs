import mammoth from 'mammoth';

const file = process.argv[2];
const result = await mammoth.extractRawText({ path: file });
const text = result.value;

// Find the start of the publications section
const pubSectionMatch = text.match(/(Publications|Published\s+Articles|Refereed\s+Articles|Scientific\s+Publications|F\.\s*Publications)/i);
if (!pubSectionMatch) {
  console.log('Could not find Publications section header');
  console.log('Last 3000 chars for inspection:');
  console.log(text.slice(-3000));
  process.exit(1);
}

const startIdx = pubSectionMatch.index;
console.log(`Publications section starts at char ${startIdx} (matched: "${pubSectionMatch[0]}")`);
console.log('\n--- PUBLICATIONS SECTION ---\n');
console.log(text.slice(startIdx));
