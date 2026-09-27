/*
 * Test de bout en bout : ouvre index.html en file:// dans Chromium, dépose chaque dossier fictif,
 * attend la fin du tri, télécharge le ZIP et le contrôle.
 * Usage : cd tests && node tester.js [numéro du cas]
 * Sortie : tests/sorties/<cas>.json, <cas>.zip, captures <cas>-*.png, et un résumé à l'écran.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');
const JSZip = require('jszip');
const { PDFDocument } = require('pdf-lib');

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const RACINE = path.join(__dirname, '..');
const DOSSIERS = path.join(__dirname, 'dossiers');
const SORTIES = path.join(__dirname, 'sorties');

function lister(dir) {
  const res = [];
  for (const n of fs.readdirSync(dir)) {
    const p = path.join(dir, n);
    if (fs.statSync(p).isDirectory()) res.push(...lister(p)); else res.push(p);
  }
  return res;
}
const sansExt = (s) => s.replace(/\.[a-z0-9]{1,5}$/i, '');
// L'ordre des deux emprunteurs dans un nom (« A et B ») n'est pas imposé par le cahier des charges
const canon = (s) => s.split('/').map((seg) => seg.replace(/^(.+?)( - .*)?$/, (m, a, b) => a.split(' et ').sort().join(' et ') + (b || ''))).join('/');

async function testerCas(navigateur, cas) {
  const page = await navigateur.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const erreurs = [];
  const reseau = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text()); });
  page.on('request', (r) => { if (!/^(file|blob|data):/.test(r.url())) reseau.push(r.url()); });
  await page.goto('file://' + path.join(RACINE, 'index.html'));
  const debut = Date.now();
  const dir = path.join(DOSSIERS, cas);
  // Dépôt du dossier entier via le bouton « Dossier »
  await page.setInputFiles('#choix-dossier', dir);
  await page.waitForFunction(() => TP.app.dossiers[0] && TP.app.dossiers[0].total != null, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(SORTIES, cas + '-tri.png') });
  await page.waitForFunction(() => ['termine', 'erreur'].includes(TP.app.dossiers[0].etat), null, { timeout: 30 * 60000, polling: 1000 });
  const duree = Math.round((Date.now() - debut) / 1000);
  const res = await page.evaluate(() => {
    const d = TP.app.dossiers[0];
    if (d.etat === 'erreur') return { erreur: d.erreur };
    const r = d.resultat;
    return {
      nom: d.nom, nomZip: d.nomZip, compte: d.compte, ignores: d.ignores,
      personnes: r.personnes.map((p) => ({ nom: p.affichage, sexe: p.sexe, tags: p.tags, employeur: p.employeur, identite: p.identiteTexte })),
      entites: r.entites.map((e) => ({ nom: e.affichage, genre: e.genre, personnes: [...e.personnes].map((p) => p.affichage) })),
      biens: r.biens.map((b) => b.affichage), domicile: r.domicile && r.domicile.affichage, projet: r.projet && r.projet.adresse.affichage,
      situations: [...r.situations], manquantes: r.manquantes, fiche: r.fiche,
      items: d.items.map((it) => ({
        origine: it.origine, chemin: it.decision.chemin, statut: it.decision.statut, raison: it.decision.raison || null,
        type: it.analyse ? it.analyse.type : null, scores: it.analyse ? it.analyse.scores : null, date: it.analyse && it.analyse.date ? it.analyse.date.texte : null,
        methode: it.extraction ? it.extraction.methode : null, erreur: it.extraction ? it.extraction.erreur : null,
        confiance: it.extraction && it.extraction.confiance ? Math.round(it.extraction.confiance) : null,
        texte: it.extraction && it.extraction.texte ? it.extraction.texte.slice(0, 1200) : null
      }))
    };
  });
  if (res.erreur) { console.log(cas, 'ERREUR', res.erreur); return; }
  await page.screenshot({ path: path.join(SORTIES, cas + '-resultat.png'), fullPage: true });
  await page.click('#tab-rapport');
  await page.waitForTimeout(400);
  await page.locator('#pdf-rapport').screenshot({ path: path.join(SORTIES, cas + '-rapport.png') });
  await page.click('#tab-fiche');
  await page.waitForTimeout(400);
  await page.locator('#pdf-fiche').screenshot({ path: path.join(SORTIES, cas + '-fiche.png') });
  // Téléchargement du ZIP
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btn-zip')]);
  const zipPath = path.join(SORTIES, cas + '.zip');
  await dl.saveAs(zipPath);
  const zip = await JSZip.loadAsync(fs.readFileSync(zipPath));
  const entrees = Object.values(zip.files);
  const fichiers = entrees.filter((e) => !e.dir).map((e) => e.name);
  const dossiers = new Set(entrees.filter((e) => e.dir).map((e) => e.name.replace(/\/$/, '')));
  fichiers.forEach((f) => { const parts = f.split('/'); for (let i = 1; i < parts.length; i++) dossiers.add(parts.slice(0, i).join('/')); });
  const vides = [...dossiers].filter((d) => !fichiers.some((f) => f.startsWith(d + '/')));
  const pages = {};
  for (const n of ['Fiche client.pdf', 'Rapport de tri.pdf']) {
    const b = await zip.file(n).async('uint8array');
    pages[n] = (await PDFDocument.load(b)).getPageCount();
  }
  // Comparaison avec l'attendu
  const attendu = JSON.parse(fs.readFileSync(path.join(DOSSIERS, cas + '.attendu.json'), 'utf8'));
  const ecarts = [];
  let justes = 0;
  for (const a of attendu) {
    const it = res.items.find((x) => x.origine.replace(/^[^/]+\//, '') === a.origine || x.origine.endsWith('/' + a.origine) || x.origine === a.origine);
    if (!it) { ecarts.push({ origine: a.origine, attendu: a.attendu, obtenu: 'ABSENT' }); continue; }
    const obtenu = sansExt(it.chemin);
    const ok = a.attendu === 'À vérifier' ? it.statut === 'verifier' : canon(obtenu) === canon(a.attendu);
    if (ok) justes++; else ecarts.push({ origine: a.origine, attendu: a.attendu, obtenu: it.statut === 'verifier' ? 'À vérifier : ' + it.raison : obtenu, type: it.type, scores: it.scores });
  }
  const bilan = {
    cas, duree, nomZip: res.nomZip, compte: res.compte, zipFichiers: fichiers.length, dossiersVides: vides, pagesPdf: pages,
    justes, total: attendu.length, erreursConsole: erreurs, appelsReseau: reseau, ecarts
  };
  fs.writeFileSync(path.join(SORTIES, cas + '.json'), JSON.stringify({ bilan, ...res }, null, 2));
  console.log('\n=== ' + cas + ' (' + duree + ' s) ===');
  console.log('ZIP : ' + res.nomZip + ' | reçus ' + res.compte.recus + ', classés ' + res.compte.classes + ', à vérifier ' + res.compte.verifier + ', bouclage ' + (res.compte.ok ? 'OK' : 'ÉCART'));
  console.log('Fichiers dans le ZIP : ' + fichiers.length + ' (attendu ' + (res.compte.recus + 2) + ') | dossiers vides : ' + (vides.length ? vides.join(', ') : 'aucun') + ' | pages PDF : ' + JSON.stringify(pages));
  console.log('Personnes : ' + res.personnes.map((p) => p.nom + ' [' + p.tags.join(', ') + ']').join(' ; '));
  console.log('Entités : ' + res.entites.map((e) => e.nom + ' (' + e.genre + ')').join(' ; '));
  console.log('Situations : ' + res.situations.join(', '));
  console.log('Pièces conformes à l\'attendu : ' + justes + ' / ' + attendu.length);
  for (const e of ecarts) console.log('  ÉCART ' + e.origine + '\n     attendu : ' + e.attendu + '\n     obtenu  : ' + e.obtenu + (e.scores ? '\n     scores  : ' + JSON.stringify(e.scores) : ''));
  console.log('Manquantes : ' + res.manquantes.map((m) => m.qui + ' : ' + m.texte).join(' | '));
  if (erreurs.length) console.log('Erreurs console : ' + erreurs.join(' | '));
  if (reseau.length) console.log('APPELS RÉSEAU : ' + reseau.join(', '));
  await page.close();
}

(async () => {
  fs.mkdirSync(SORTIES, { recursive: true });
  const navigateur = await chromium.launch({ executablePath: CHROME });
  const choix = process.argv[2];
  const cas = fs.readdirSync(DOSSIERS).filter((n) => fs.statSync(path.join(DOSSIERS, n)).isDirectory()).filter((n) => !choix || n.startsWith(choix));
  for (const c of cas) await testerCas(navigateur, c);
  await navigateur.close();
})();
