// Release hygiene: the three places a version lives must agree (run scripts/bump-version.js to change them).
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'plan-illustrator.html'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const ver = JSON.parse(fs.readFileSync(path.join(root, 'version.json'), 'utf8')).version;
const a = (html.match(/APP_VERSION\s*=\s*'([^']+)'/) || [])[1];
const c = (sw.match(/CACHE_VERSION\s*=\s*'plan-illustrator-([^']+)'/) || [])[1];
let bad = 0;
if (a !== ver) { console.log('FAIL APP_VERSION', a, '!= version.json', ver); bad++; }
if (c !== ver) { console.log('FAIL sw CACHE_VERSION', c, '!= version.json', ver); bad++; }
console.log(bad ? 'version sync: FAILED' : 'version sync: OK (' + ver + ')');
process.exit(bad ? 1 : 0);
