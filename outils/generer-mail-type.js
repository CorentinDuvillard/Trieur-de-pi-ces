// Régénère mail-type.js à partir de « Mail type - Demande de pièces.md » (source de vérité).
// Usage : node outils/generer-mail-type.js
const fs = require('fs');
const path = require('path');
const racine = path.join(__dirname, '..');
const md = fs.readFileSync(path.join(racine, 'Mail type - Demande de pièces.md'), 'utf8');
const debut = md.indexOf('Objet :');
if (debut < 0) throw new Error('Ligne « Objet : » introuvable');
const corps = md.slice(debut).trim() + '\n';
fs.writeFileSync(path.join(racine, 'mail-type.js'),
  '/* Généré par outils/generer-mail-type.js depuis « Mail type - Demande de pièces.md ». Ne pas modifier à la main. */\n' +
  'window.MAIL_TYPE = ' + JSON.stringify(corps) + ';\n');
console.log('mail-type.js écrit (' + corps.length + ' caractères)');
