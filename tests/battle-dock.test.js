// Smoke assertions for the one-piece responsive battle dock (2.2.9 mobile panel).
// Does not replace the browser layout test; verifies release wiring and original control IDs.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'battle-dock.css'), 'utf8');
const game = fs.readFileSync(path.join(root, 'js', 'game.js'), 'utf8');
assert.match(html, /<link rel="stylesheet" href="css\/battle-dock\.css"( id="dock-css")?>/);
assert.match(html, /class="tools" id="battle-dock"/);
for (const id of ['board','spellbar','bagbar','hint','mute','more','restart'])
  assert.match(html, new RegExp('id="' + id + '"'), `${id} preserved`);
assert.match(css, /grid-area: dock/);
assert.match(css, /orientation: portrait/);
assert.match(css, /orientation: landscape/);
assert.match(css, /grid-template-columns: repeat\(7,minmax\(0,1fr\)\)/);
assert.match(css, /grid-template-columns: repeat\(4,minmax\(0,1fr\)\)/);
assert.match(game, /contains\('phone'\) && !document\.body\.classList\.contains\('old-dock'\)\) return/);
assert.match(game, /spellbarEl\.addEventListener\('click'/);
assert.match(html, /id="dock-menu"/);
assert.match(html, /data-do="layout"/);
assert.match(game, /bagEl\.addEventListener\('click'/);
console.log('battle-dock: HTML/CSS/event handlers wired correctly');
