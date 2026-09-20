const fs = require('fs');

const OLD_TOKEN = "EAAO6WemhAoABSi9ZAYNZCaYs9PaTYBLsPZBS4fU1idyA54Oj7EFhrfUZCZBnZAP6zsBIpYObOK5EMIrstcZCuAT6MekoWsspZCqtRJ39PyRftl36MZAy0ivgnK0IHyDOuQcTXXOAxFSHnoIJUfFZCKyBXbe93sYru6GqRm2NWZBnNoOgTZBEMG9N7EZANWEJ03jtBETFsdYdv3fZBX3hzbjkiZBEyMui9tn3nL5GZCXhEBEhTwLvuZBLF5lkAyAIHX7W9DsGU5X6ZCIC0DMVEIVmU28SdDXSziYKoZA7FPOoSW6UwZDZD";
const NEW_TOKEN = "EAAO6WemhAoABStNb50OD4BgsIdSKjisaiskPHjSVdZACMAdbZAG6PnjUtzFnBDqkZCtRf4VYhzOZA2ZBs0xCSEKJE6gG5vVXpYTxGpvaDv3TkyZBwtZAg6UP0AT5vfwdkbAXuf7J5mi1ATKPyQT4ZCjNqQZBjqYIPVUx4OsIJ8O3qPzIT5yFzlEHlMRft4YS1rzIbGkWIn3ZBZAgmAzCtXpZAOPp9yO0wWZCnoWZAkBN3o";

const files = [
  'app/api/webhook/route.ts',
  'lib/dailySummary.ts',
];

for (const file of files) {
  if (fs.existsSync(file)) {
    let code = fs.readFileSync(file, 'utf8');
    if (code.includes(OLD_TOKEN)) {
      code = code.replace(OLD_TOKEN, NEW_TOKEN);
      fs.writeFileSync(file, code);
      console.log(`Updated ${file}`);
    } else {
      console.log(`Warning: Old token not found in ${file}`);
    }
  }
}
