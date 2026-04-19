import mammoth from 'mammoth';

const file = process.argv[2];
const result = await mammoth.extractRawText({ path: file });
console.log('--- CV TEXT (length: ' + result.value.length + ') ---');
console.log(result.value);
if (result.messages?.length) {
  console.log('\n--- PARSE MESSAGES ---');
  console.log(result.messages.slice(0, 5));
}
