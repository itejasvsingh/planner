const fs = require('fs');

const OLD_TOKEN = "EAAO6WemhAoABSdMEF3np2uZB0fWZA8SHpv0dX0Nq0fjg0S5KZCj3td0amntX6vvDVzWguTYwZBSgYDCYkORiJpJXtm9mggjMkrmTLvZBCQLwlIfIOsWvKLTxKFBfjKoXAyBlAZArHkH7gHnrfYXYTgkxVe8t4AVNYZBzAE5WHZAGEKaVZAYtC0ep46QTZCSEZAcgwZDZD";
const NEW_TOKEN = "EAAO6WemhAoABSi9ZAYNZCaYs9PaTYBLsPZBS4fU1idyA54Oj7EFhrfUZCZBnZAP6zsBIpYObOK5EMIrstcZCuAT6MekoWsspZCqtRJ39PyRftl36MZAy0ivgnK0IHyDOuQcTXXOAxFSHnoIJUfFZCKyBXbe93sYru6GqRm2NWZBnNoOgTZBEMG9N7EZANWEJ03jtBETFsdYdv3fZBX3hzbjkiZBEyMui9tn3nL5GZCXhEBEhTwLvuZBLF5lkAyAIHX7W9DsGU5X6ZCIC0DMVEIVmU28SdDXSziYKoZA7FPOoSW6UwZDZD";

const files = [
  'app/api/webhook/route.ts',
  'lib/dailySummary.ts',
  'app/api/whatsapp/nudge/route.ts'
];

for (const file of files) {
  if (fs.existsSync(file)) {
    let code = fs.readFileSync(file, 'utf8');
    if (code.includes(OLD_TOKEN)) {
      code = code.replace(OLD_TOKEN, NEW_TOKEN);
      fs.writeFileSync(file, code);
      console.log(`Updated ${file}`);
    }
  }
}
