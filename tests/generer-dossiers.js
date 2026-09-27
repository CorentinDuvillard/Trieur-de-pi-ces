/*
 * Génère 4 dossiers de pièces FICTIVES (aucune donnée réelle) pour tester le Trieur de pièces.
 * Usage : cd tests && npm install && node generer-dossiers.js
 * Sortie : tests/dossiers/<cas>/ et tests/dossiers/<cas>/attendu.json (destination attendue de chaque fichier)
 * Chromium est utilisé pour produire les PDF texte, les scans et les photos.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');
const { PDFDocument } = require('pdf-lib');
const JSZip = require('jszip');
const XLSX = require('xlsx');
const docx = require('docx');

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const SORTIE = path.join(__dirname, 'dossiers');
const AUJ = new Date();
const AN = AUJ.getFullYear();
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const mm = (m) => String(m).padStart(2, '0');
const jour = (j, m, a) => mm(j) + '/' + mm(m) + '/' + a;
// Mois précédents par rapport à aujourd'hui
function moisAvant(n) { const d = new Date(AN, AUJ.getMonth() - n, 1); return { m: d.getMonth() + 1, a: d.getFullYear() }; }
const M1 = moisAvant(1), M2 = moisAvant(2), M3 = moisAvant(3);

// ---------- Mise en page HTML ----------
const CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 13px; line-height: 1.45; background: #fff; }
  .page { width: 794px; min-height: 1123px; padding: 56px 60px; background: #fff; position: relative; }
  h1 { font-size: 22px; margin: 0 0 14px; } h2 { font-size: 16px; margin: 18px 0 8px; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; } td, th { border: 1px solid #999; padding: 4px 6px; text-align: left; font-size: 12.5px; }
  .ent { display: flex; justify-content: space-between; margin-bottom: 26px; } .d { text-align: right; }
  .petit { font-size: 11px; color: #333; } .enc { border: 1px solid #333; padding: 10px 12px; margin: 10px 0; }
  .mrz { font-family: 'DejaVu Sans Mono', 'Courier New', monospace; font-size: 23px; letter-spacing: 2px; font-weight: bold; line-height: 1.35; white-space: pre; }
`;
const html = (corps, extra) => `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><style>${CSS}${extra || ''}</style></head><body>${corps}</body></html>`;
const page = (contenu) => `<div class="page">${contenu}</div>`;

// ---------- Pièces ----------
function bulletin(o) {
  const lignes = [[o.rubrique || 'Salaire de base', o.brut]].concat(o.primes ? [['Prime sur objectifs', o.primes]] : []);
  return page(`<div class="ent"><div><b>${o.emp}</b><br>${o.empAdr}<br>SIRET 000 000 000 00000</div><div class="d"><h1>BULLETIN DE PAIE</h1>Période du 01/${mm(o.m)}/${o.a} au ${o.m === 2 ? 28 : 30}/${mm(o.m)}/${o.a}</div></div>
  <div class="enc">Salarié : <b>${o.civ} ${o.nom} ${o.prenom}</b><br>${o.adr}<br>Emploi : ${o.emploi} - ${o.contrat || 'Contrat à durée indéterminée (CDI)'}<br>Date d'entrée : 01/03/2019</div>
  <table><tr><th>Rubrique</th><th>Base</th><th>Montant</th></tr>${lignes.map(([r, v]) => `<tr><td>${r}</td><td></td><td>${v} €</td></tr>`).join('')}
  <tr><td>Salaire brut</td><td></td><td>${o.brutTotal} €</td></tr><tr><td>Cotisations salariales</td><td></td><td>-${o.cotis} €</td></tr>
  <tr><td>Net imposable</td><td></td><td>${o.netImp} €</td></tr><tr><td><b>Net à payer avant impôt</b></td><td></td><td><b>${o.net} €</b></td></tr></table>
  <p class="petit">Congés payés acquis : 2,08 j. Dans votre intérêt et pour vous aider à faire valoir vos droits, conservez ce bulletin de paie sans limitation de durée.</p>`);
}

function payslip(o) {
  return page(`<div class="ent"><div><b>${o.emp}</b><br>${o.empAdr}</div><div class="d"><h1>PAYSLIP</h1>Pay period: ${MONTHS[o.m - 1]} ${o.a}<br>Pay date: 28/${mm(o.m)}/${o.a}</div></div>
  <div class="enc">Employee: <b>Ms ${o.nom} ${o.prenom}</b><br>${o.adr}<br>National Insurance number: QQ 12 34 56 C &nbsp; Tax code: 1257L</div>
  <table><tr><th>Payments</th><th>Amount</th></tr><tr><td>Basic salary</td><td>£${o.brut}</td></tr><tr><td>Gross pay</td><td>£${o.brut}</td></tr>
  <tr><td>Income tax</td><td>-£${o.tax}</td></tr><tr><td>National Insurance</td><td>-£${o.ni}</td></tr><tr><td><b>Net pay</b></td><td><b>£${o.net}</b></td></tr></table>`);
}

function avis(o) {
  return page(`<div class="ent"><div><b>DIRECTION GÉNÉRALE DES FINANCES PUBLIQUES</b><br>Centre des Finances Publiques<br>${o.centre}</div><div class="d">${o.decl.map((d) => `${d.civ} ${d.nom} ${d.prenom}`).join('<br>')}<br>${o.adr}</div></div>
  <h1>AVIS D'IMPÔT ${o.an} SUR LES REVENUS DE L'ANNÉE ${o.an - 1}</h1>
  <div class="enc">Numéro fiscal : 00 00 000 000 000 &nbsp; Référence de l'avis : 00 00 000 000 000<br>Situation de famille : ${o.situation}<br>Nombre de parts : ${o.parts}<br>Personnes à charge : ${o.charge}</div>
  <table><tr><th>Détail</th><th>Montant</th></tr><tr><td>Salaires, pensions, rentes nets</td><td>${o.rev} €</td></tr><tr><td>Revenu fiscal de référence</td><td>${o.rfr} €</td></tr><tr><td>Impôt sur le revenu net</td><td>${o.impot} €</td></tr></table>
  <p class="petit">Le montant de votre impôt sur le revenu tient compte du prélèvement à la source déjà effectué.</p>`);
}

function facture(o) {
  return page(`<div class="ent"><div><b>${o.fournisseur}</b><br>Service clients</div><div class="d"><h1>FACTURE</h1>Date de facture : ${o.date}<br>Numéro client : 1 234 567 890</div></div>
  <div class="enc">Titulaire du contrat : ${o.titulaire}<br>Adresse de consommation :<br>${o.adr}</div>
  <p>Période de facturation : du ${o.du} au ${o.au}</p>
  <table><tr><th>Désignation</th><th>Montant TTC</th></tr><tr><td>${o.ligne}</td><td>${o.montant} €</td></tr><tr><td><b>Total à payer</b></td><td><b>${o.montant} €</b></td></tr></table>`);
}

function bail(o) {
  return page(`<h1>CONTRAT DE LOCATION - BAIL D'HABITATION</h1><p class="petit">Soumis au titre Ier bis de la loi du 6 juillet 1989</p>
  <h2>Désignation des parties</h2><p>LE BAILLEUR : ${o.bailleur}</p><p>LE LOCATAIRE : ${o.locataire}</p>
  <h2>Objet du contrat</h2><p>Le présent contrat a pour objet la location d'un logement situé au ${o.adr}.</p>
  <p>Loyer mensuel : ${o.loyer} € hors charges. Charges locatives : provision de 80 €. Dépôt de garantie : ${o.loyer} €.</p>
  <p>Durée du bail : trois ans à compter du ${o.debut}.</p><p>Fait à ${o.ville}, le ${o.date}</p>`);
}

function quittance(o) {
  return page(`<h1>QUITTANCE DE LOYER</h1><p>Loyer du mois de ${MOIS[o.m - 1]} ${o.a}</p>
  <p>Je soussigné ${o.bailleur}, bailleur du logement situé au ${o.adr}, déclare avoir reçu de ${o.locataire} la somme de ${o.montant} euros au titre du loyer et des charges pour la période de location du 01/${mm(o.m)}/${o.a} au 30/${mm(o.m)}/${o.a}.</p>
  <table><tr><td>Loyer</td><td>${o.montant - 80} €</td></tr><tr><td>Provision pour charges</td><td>80 €</td></tr></table>
  <p>Fait à ${o.ville}, le 05/${mm(o.m)}/${o.a}</p>`);
}

function releve(o) {
  const ops = [['02', 'PRLV EDF', '-64,20'], ['05', 'CARTE SUPERMARCHE', '-82,15'], ['10', o.pro ? 'VIR CLIENT HONORAIRES' : 'VIR SALAIRE', '+2 410,00'], ['18', 'CARTE PHARMACIE', '-12,40'], ['26', 'PRLV ASSURANCE', '-36,00']];
  return page(`<div class="ent"><div><b>${o.banque}</b><br>Agence ${o.agence}</div><div class="d"><h1>RELEVÉ DE COMPTE</h1>Relevé n° ${o.m} du 01/${mm(o.m)}/${o.a} au ${o.m === 2 ? 28 : 30}/${mm(o.m)}/${o.a}</div></div>
  <div class="enc">Titulaire : ${o.titulaire}<br>${o.pro ? 'Compte professionnel' : 'Compte courant'} n° 00012345678 - IBAN FR76 0000 0000 0000 0000 0000 000</div>
  <table><tr><th>Date opération</th><th>Date valeur</th><th>Libellé</th><th>Montant</th></tr>
  <tr><td>01/${mm(o.m)}</td><td></td><td>ANCIEN SOLDE</td><td>1 250,00</td></tr>
  ${ops.map(([j, l, v]) => `<tr><td>${j}/${mm(o.m)}/${o.a}</td><td>${j}/${mm(o.m)}/${o.a}</td><td>${l}</td><td>${v}</td></tr>`).join('')}
  <tr><td></td><td></td><td>NOUVEAU SOLDE CRÉDITEUR</td><td>3 465,25</td></tr></table>`);
}

function bankStatement(o) {
  return page(`<div class="ent"><div><b>${o.banque}</b><br>London</div><div class="d"><h1>BANK STATEMENT</h1>Statement period: 1 ${MONTHS[o.m - 1]} ${o.a} to 30 ${MONTHS[o.m - 1]} ${o.a}</div></div>
  <div class="enc">Account holder: Ms ${o.nom} ${o.prenom}<br>Current account - Sort code 00-00-00 - Account number 12345678</div>
  <table><tr><th>Date</th><th>Description</th><th>Amount</th></tr><tr><td>01/${mm(o.m)}/${o.a}</td><td>Balance brought forward</td><td>£4,210.00</td></tr>
  <tr><td>28/${mm(o.m)}/${o.a}</td><td>SALARY NORTHBRIDGE</td><td>£3,150.00</td></tr><tr><td>30/${mm(o.m)}/${o.a}</td><td>Closing balance</td><td>£5,980.00</td></tr></table>`);
}

function carteIdentiteRecente(o) {
  return `<div style="width:1000px;height:640px;border-radius:30px;background:linear-gradient(135deg,#dfe9f2,#f3e6ee);padding:34px 40px;position:relative;font-family:Arial">
  <div style="font-size:21px;font-weight:bold">RÉPUBLIQUE FRANÇAISE</div><div style="font-size:26px;font-weight:bold;margin:4px 0 22px">CARTE NATIONALE D'IDENTITÉ / IDENTITY CARD</div>
  <div style="display:flex;gap:30px"><div style="width:200px;height:250px;background:#c9c3bd"></div>
  <div style="font-size:21px;line-height:1.55">Nom / Surname : <b>${o.nom}</b><br>Prénoms / Given names : <b>${o.prenoms}</b><br>Sexe / Sex : ${o.sexe} &nbsp; Nationalité : FRA<br>Date de naissance : ${o.naissance}<br>Lieu de naissance : ${o.lieu}<br>Date d'expiration : ${o.expiration}</div></div>
  <div class="mrz" style="margin-top:18px;font-size:27px">${o.mrz.join('\n').replace(/</g, '&lt;')}</div></div>`;
}

function carteIdentiteAncienne(o) {
  return `<div style="width:1100px;height:720px;background:linear-gradient(135deg,#e8eef6,#efe6f0);padding:34px 40px;font-family:Arial">
  <div style="font-size:22px;font-weight:bold">RÉPUBLIQUE FRANÇAISE</div><div style="font-size:26px;font-weight:bold;margin:4px 0 22px">CARTE NATIONALE D'IDENTITÉ N° 000000000000</div>
  <div style="display:flex;gap:30px"><div style="width:210px;height:260px;background:#c9c3bd"></div>
  <div style="font-size:22px;line-height:1.6">Nom : <b>${o.nom}</b><br>Prénom(s) : <b>${o.prenoms}</b><br>Sexe : ${o.sexe}<br>Né(e) le : ${o.naissance}<br>à : ${o.lieu}<br>Taille : 1,68 m<br>Carte valable jusqu'au : ${o.expiration}</div></div>
  <div class="mrz" style="margin-top:26px;font-size:27px">${o.mrz.join('\n').replace(/</g, '&lt;')}</div></div>`;
}

function passeport(o) {
  return `<div style="width:1150px;height:800px;background:linear-gradient(135deg,#efe9e0,#e4ecef);padding:34px 40px;font-family:Arial">
  <div style="font-size:22px;font-weight:bold">${o.pays || 'RÉPUBLIQUE FRANÇAISE'}</div><div style="font-size:28px;font-weight:bold;margin:4px 0 22px">PASSEPORT / PASSPORT</div>
  <div style="display:flex;gap:30px"><div style="width:230px;height:290px;background:#c9c3bd"></div>
  <div style="font-size:22px;line-height:1.6">Type / Type : P &nbsp; Code : ${o.code || 'FRA'}<br>Nom / Surname : <b>${o.nom}</b><br>Prénoms / Given names : <b>${o.prenoms}</b><br>Sexe / Sex : ${o.sexe}<br>Date de naissance / Date of birth : ${o.naissance}<br>Date de délivrance : ${o.delivrance}<br>Date d'expiration / Date of expiry : ${o.expiration}<br>Autorité / Authority : Préfecture</div></div>
  <div class="mrz" style="margin-top:36px;font-size:25px">${o.mrz.join('\n').replace(/</g, '&lt;')}</div></div>`;
}

const pad = (s, n) => (s + '<'.repeat(n)).slice(0, n);
function mrzTD1(nom, prenoms, sexe, naissance, expiration) {
  return [pad('IDFRAX4RTBPFW46', 30), pad(naissance + '0' + sexe + expiration + '8FRA', 29) + '6', pad(nom.replace(/ /g, '<') + '<<' + prenoms.replace(/ /g, '<'), 30)];
}
function mrzCniAncienne(nom, prenoms, sexe, naissance) {
  return [pad('IDFRA' + nom.replace(/ /g, '<'), 30) + '751042', '1106751042561' + pad(prenoms.replace(/ /g, '<<'), 14) + naissance + '5' + sexe + '8'];
}
function mrzTD3(code, nom, prenoms, sexe, naissance, expiration) {
  return [pad('P<' + code + nom.replace(/ /g, '<') + '<<' + prenoms.replace(/ /g, '<'), 44), pad('18AB123456' + '4' + code + naissance + '2' + sexe + expiration + '5', 42) + '04'];
}

function simple(titre, paras) { return page(`<h1>${titre}</h1>${paras.map((p) => `<p>${p}</p>`).join('')}`); }

function statuts(o) {
  return page(`<h1>STATUTS</h1><p><b>${o.forme} ${o.denom}</b><br>${o.formeLongue} au capital de ${o.capital} euros<br>Siège social : ${o.siege}</p>
  <h2>Article 1 - Forme</h2><p>Il est formé entre les soussignés une ${o.formeLongue.toLowerCase()} régie par les présents statuts.</p>
  <h2>Article 2 - Objet social</h2><p>${o.objet}</p><h2>Article 3 - Dénomination</h2><p>La société a pour dénomination : ${o.denom}.</p>
  <h2>Article 7 - Capital social</h2><p>Le capital social est fixé à ${o.capital} euros, divisé en ${o.parts} parts sociales.</p>
  <h2>Associés</h2><p>${o.associes.join('<br>')}</p><h2>Gérance</h2><p>${o.dirigeant}</p><p>Fait à Paris, le 12/04/2019</p>`);
}
function kbis(o) {
  return page(`<p class="petit">Greffe du Tribunal de Commerce de Paris</p><h1>EXTRAIT KBIS</h1><p>Extrait d'immatriculation principale au registre du commerce et des sociétés à jour au ${o.date}</p>
  <table><tr><td>Dénomination</td><td>${o.denom}</td></tr><tr><td>Forme juridique</td><td>${o.formeLongue}</td></tr><tr><td>Immatriculation</td><td>RCS Paris 000 000 000</td></tr><tr><td>Capital social</td><td>${o.capital} euros</td></tr><tr><td>Adresse du siège</td><td>${o.siege}</td></tr></table>
  <h2>Gestion et direction</h2><p>Président : ${o.dirigeant}</p>`);
}
function bilan(o) {
  return page(`<h1>BILAN ET COMPTE DE RÉSULTAT</h1><p><b>${o.denom} ${o.forme}</b><br>Exercice clos le 31/12/${o.an}</p><p>Liasse fiscale 2033</p>
  <table><tr><th>Actif</th><th>Montant</th><th>Passif</th><th>Montant</th></tr><tr><td>Immobilisations</td><td>12 000</td><td>Capitaux propres</td><td>48 000</td></tr><tr><td>Disponibilités</td><td>61 000</td><td>Dettes</td><td>25 000</td></tr><tr><td>Total actif</td><td>73 000</td><td>Total passif</td><td>73 000</td></tr></table>
  <h2>Compte de résultat</h2><table><tr><td>Chiffre d'affaires</td><td>182 000</td></tr><tr><td>Résultat de l'exercice</td><td>38 000</td></tr></table>`);
}
function taxeFonciere(o) {
  return page(`<div class="ent"><div><b>DIRECTION GÉNÉRALE DES FINANCES PUBLIQUES</b></div><div class="d">${o.proprietaire}<br>${o.adrProprietaire}</div></div>
  <h1>AVIS D'IMPÔT ${o.an} TAXES FONCIÈRES</h1><div class="enc">Adresse du bien : ${o.adrBien}</div>
  <table><tr><th>Propriétés bâties</th><th>Montant</th></tr><tr><td>Base d'imposition</td><td>2 140 €</td></tr><tr><td>Taxe foncière sur les propriétés bâties</td><td>1 184 €</td></tr><tr><td>Total à payer</td><td>1 184 €</td></tr></table>`);
}
function titrePropriete(o) {
  return page(`<p class="petit">Office notarial de Maître DURAND</p><h1>ACTE DE VENTE - TITRE DE PROPRIÉTÉ</h1><h2>Partie normalisée</h2>
  <p>VENDEUR : M. MOREL Antoine</p><p>ACQUÉREUR : ${o.acquereur}</p><p>Désignation du bien : un appartement situé au ${o.adr}, cadastré section AB numéro 12.</p>
  <p>Prix de vente : ${o.prix} euros. Superficie : ${o.surface} m2.</p><p>Publicité foncière : service de la publicité foncière de Créteil.</p><p>Fait à Vincennes, le ${o.date}</p>`);
}
function offrePret(o) {
  return page(`<div class="ent"><div><b>${o.banque}</b></div><div class="d"><h1>OFFRE DE PRÊT</h1>Émise le ${o.date}</div></div>
  <div class="enc">Emprunteur : ${o.emprunteur}</div><p>Objet : ${o.objet}</p>
  <table><tr><td>Montant du prêt</td><td>${o.montant} €</td></tr><tr><td>Durée du prêt</td><td>${o.duree} mois</td></tr><tr><td>Taux effectif global (TAEG)</td><td>${o.taeg} %</td></tr><tr><td>Assurance emprunteur</td><td>incluse</td></tr></table>
  <p>${o.conso ? "Crédit à la consommation régi par le code de la consommation, articles L312-1 et suivants. Délai de rétractation de 14 jours." : "Prêt immobilier régi par les articles L313-1 et suivants du code de la consommation. Délai de réflexion de 10 jours."}</p>`);
}
function compromis(o) {
  return page(`<p class="petit">Office notarial de Maître LEBLANC</p><h1>COMPROMIS DE VENTE</h1><p>Promesse synallagmatique de vente</p>
  <h2>Entre les soussignés</h2><p>VENDEUR : ${o.vendeur}</p><p>ACQUÉREUR : ${o.acquereur}</p>
  <h2>Désignation du bien</h2><p>Le bien situé au ${o.adr}, ${o.desc}. Le bien est destiné à la ${o.usage}.</p>
  <p>Prix de vente : ${o.prix} euros, dont mobilier 5 000 euros. Dépôt de garantie versé au séquestre.</p>
  <h2>Conditions suspensives</h2><p>La vente est conclue sous la condition suspensive d'obtention d'un prêt.</p><p>Fait à ${o.ville}, le ${o.date}</p>`);
}
function ddt(o) {
  return page(`<h1>DOSSIER DE DIAGNOSTIC TECHNIQUE</h1><p>Bien : ${o.adr}</p><h2>Diagnostic de performance énergétique (DPE)</h2><p>Classe énergie : D. Classe climat : C.</p>
  <h2>Amiante</h2><p>Absence de matériaux contenant de l'amiante.</p><h2>État des risques et pollutions</h2><p>Zone de sismicité faible.</p><p>Diagnostiqueur certifié : Cabinet EXPERTIMMO, le 02/07/${AN}</p>`);
}
function captureEpargne(o) {
  return `<div style="width:900px;padding:30px;font-family:Arial;background:#f4f6f8">
  <div style="font-size:24px;font-weight:bold;margin-bottom:6px">Mes comptes</div><div style="color:#555;margin-bottom:20px">${o.nom} - Situation au ${o.date}</div>
  ${o.lignes.map(([l, v]) => `<div style="background:#fff;border-radius:10px;padding:18px 20px;margin-bottom:10px;display:flex;justify-content:space-between;font-size:20px"><span>${l}</span><b>${v} €</b></div>`).join('')}
  <div style="color:#555;margin-top:14px">Épargne totale disponible</div></div>`;
}
function dpe2035(o) {
  return page(`<p class="petit">Formulaire 2035 - Déclaration contrôlée</p><h1>DÉCLARATION 2035 - BÉNÉFICES NON COMMERCIAUX</h1>
  <p>Revenus de l'année ${o.an}</p><div class="enc">Désignation : ${o.designation}<br>Nom et prénom : ${o.civ} ${o.nom} ${o.prenom}<br>Profession libérale : ${o.profession}<br>Adresse du lieu d'exercice : ${o.adr}</div>
  <table><tr><td>Recettes encaissées</td><td>${o.recettes} €</td></tr><tr><td>Dépenses professionnelles</td><td>${o.depenses} €</td></tr><tr><td>Bénéfice</td><td>${o.recettes - o.depenses} €</td></tr></table>`);
}

// ---------- Documents Word et Excel ----------
async function docxDepuis(paras) {
  const d = new docx.Document({ sections: [{ children: paras.map((t, i) => new docx.Paragraph({ children: [new docx.TextRun({ text: t, bold: i === 0, size: i === 0 ? 32 : 22 })] })) }] });
  return await docx.Packer.toBuffer(d);
}
function xlsxDepuis(nomFeuille, lignes) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(lignes), nomFeuille);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

// ---------- Rendu ----------
let navigateur, pageRendu;
async function rendre(corps, mode, opts = {}) {
  await pageRendu.setContent(html(corps, opts.css), { waitUntil: 'load' });
  if (mode === 'pdf') return await pageRendu.pdf({ format: 'A4', printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } });
  const cible = await pageRendu.$('body > *');
  const png = await cible.screenshot({ type: 'png' });
  return png;
}
// Image transformée dans le navigateur (photo, scan, rotation, flou, conversion de format)
async function transformer(png, o) {
  if (o.format === 'tiff') {
    await pageRendu.addScriptTag({ path: path.join(__dirname, '..', 'libs', 'pako.min.js') });
    await pageRendu.addScriptTag({ path: path.join(__dirname, '..', 'libs', 'UTIF.js') });
  }
  return Buffer.from(await pageRendu.evaluate(async ({ b64, o }) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const rad = (o.angle || 0) * Math.PI / 180;
    const quart = o.quart || 0;
    const marge = o.fond ? 120 : 0;
    const w0 = img.width, h0 = img.height;
    const W = (quart % 2 ? h0 : w0) + marge * 2, H = (quart % 2 ? w0 : h0) + marge * 2;
    const c = document.createElement('canvas'); c.width = Math.round(W * (o.echelle || 1)); c.height = Math.round(H * (o.echelle || 1));
    const x = c.getContext('2d');
    x.fillStyle = o.fond || '#fff'; x.fillRect(0, 0, c.width, c.height);
    x.scale(o.echelle || 1, o.echelle || 1);
    x.translate(W / 2, H / 2); x.rotate(quart * Math.PI / 2 + rad);
    if (o.flou) x.filter = 'blur(' + o.flou + 'px)';
    if (o.gris) x.filter = (x.filter !== 'none' ? x.filter + ' ' : '') + 'grayscale(1) contrast(0.85) brightness(1.03)';
    x.drawImage(img, -w0 / 2, -h0 / 2);
    x.setTransform(1, 0, 0, 1, 0, 0);
    if (o.bruit) { const d = x.getImageData(0, 0, c.width, c.height); for (let i = 0; i < d.data.length; i += 4) { const n = (Math.random() - 0.5) * o.bruit; d.data[i] += n; d.data[i + 1] += n; d.data[i + 2] += n; } x.putImageData(d, 0, 0); }
    if (o.format === 'tiff') {
      const d = x.getImageData(0, 0, c.width, c.height);
      const buf = UTIF.encodeImage(d.data.buffer, c.width, c.height);
      return Array.from(new Uint8Array(buf));
    }
    const url = c.toDataURL(o.format === 'jpg' ? 'image/jpeg' : o.format === 'webp' ? 'image/webp' : 'image/png', 0.9);
    return Array.from(Uint8Array.from(atob(url.split(',')[1]), (ch) => ch.charCodeAt(0)));
  }, { b64: png.toString('base64'), o }));
}
async function scanPdf(pngs) {
  const pdf = await PDFDocument.create();
  for (const png of pngs) {
    const im = await pdf.embedPng(png);
    const p = pdf.addPage([595, 842]);
    const s = Math.min(595 / im.width, 842 / im.height);
    p.drawImage(im, { x: 0, y: 842 - im.height * s, width: im.width * s, height: im.height * s });
  }
  return Buffer.from(await pdf.save());
}
async function fusionPdf(buffers) {
  const out = await PDFDocument.create();
  for (const b of buffers) { const src = await PDFDocument.load(b); const pages = await out.copyPages(src, src.getPageIndices()); pages.forEach((p) => out.addPage(p)); }
  return Buffer.from(await out.save());
}
const pdf = (c) => rendre(c, 'pdf');
const png = (c) => rendre(c, 'png');
const scan = async (c) => scanPdf([await transformer(await png(c), { gris: true, bruit: 18, angle: 0.6 })]);
const photo = async (c, o = {}) => transformer(await png(c), { fond: '#6b5a4a', angle: o.angle ?? -2.5, quart: o.quart || 0, format: 'jpg', bruit: 10, echelle: o.echelle || 0.9 });

// ---------- Dossiers ----------
async function ecrire(cas, fichiers) {
  const dir = path.join(SORTIE, cas);
  fs.rmSync(dir, { recursive: true, force: true });
  const attendu = [];
  for (const f of fichiers) {
    const p = path.join(dir, f.nom);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, f.data);
    for (const a of (f.attendus || [[f.nom, f.attendu]])) attendu.push({ origine: a[0], attendu: a[1] });
  }
  fs.writeFileSync(path.join(dir, '..', cas + '.attendu.json'), JSON.stringify(attendu, null, 2));
  console.log(cas + ' : ' + fichiers.length + ' fichiers, ' + attendu.length + ' pièces attendues');
}

async function casSalarieSeul() {
  const P = { civ: 'Mme', nom: 'MARCHAND', prenom: 'Élodie', adr: '27 rue des Acacias, 69003 Lyon', emp: 'GROUPE AVERIA', empAdr: '10 quai Perrache, 69002 Lyon', emploi: 'Chargée de clientèle' };
  const E = 'MARCHAND Élodie';
  const bul = (m, a) => bulletin({ ...P, m, a, brut: '2 950,00', brutTotal: '2 950,00', cotis: '650,00', netImp: '2 380,00', net: '2 300,00' });
  const f = [];
  f.push({ nom: 'CNI Elodie.jpg', data: await photo(carteIdentiteRecente({ nom: 'MARCHAND', prenoms: 'ÉLODIE, CLAIRE', sexe: 'F', naissance: '14/05/1991', lieu: 'LYON', expiration: '03/02/2033', mrz: mrzTD1('MARCHAND', 'ELODIE CLAIRE', 'F', '910514', '330203') })), attendu: `État civil/${E} - Carte d'identité` });
  f.push({ nom: 'scan_0012.pdf', data: await pdf(bul(M1.m, M1.a)), attendu: `Revenus/Bulletins de salaire et contrat/${E} - Bulletin de salaire - ${mm(M1.m)}-${M1.a}` });
  f.push({ nom: 'bulletin juillet.pdf', data: await pdf(bul(M2.m, M2.a)), attendu: `Revenus/Bulletins de salaire et contrat/${E} - Bulletin de salaire - ${mm(M2.m)}-${M2.a}` });
  f.push({ nom: 'paie 3.pdf', data: await scan(bul(M3.m, M3.a)), attendu: `Revenus/Bulletins de salaire et contrat/${E} - Bulletin de salaire - ${mm(M3.m)}-${M3.a}` });
  f.push({ nom: 'paie decembre.pdf', data: await scan(bul(12, AN - 1)), attendu: `Revenus/Bulletins de salaire et contrat/${E} - Bulletin de salaire - 12-${AN - 1}` });
  f.push({ nom: 'Contrat CDI.docx', data: await docxDepuis(['CONTRAT DE TRAVAIL À DURÉE INDÉTERMINÉE', 'Entre les soussignés :', 'La société GROUPE AVERIA, SAS au capital de 500 000 euros, dont le siège est situé 10 quai Perrache, 69002 Lyon, ci-après l\'employeur,', 'Et Madame MARCHAND Élodie, demeurant 27 rue des Acacias, 69003 Lyon, ci-après le salarié,', 'Il a été convenu un contrat à durée indéterminée à compter du 01/03/2019. La période d\'essai est de trois mois.', 'Rémunération : 2 950 euros bruts mensuels.', 'Fait à Lyon, le 15/02/2019']), attendu: `Revenus/Bulletins de salaire et contrat/${E} - Contrat de travail - 02-2019` });
  const av = (an) => avis({ an, centre: 'Lyon', decl: [{ civ: 'Mme', nom: 'MARCHAND', prenom: 'Élodie' }], adr: P.adr, situation: 'Célibataire', parts: '1', charge: '0', rev: '28 400', rfr: '25 560', impot: '1 980' });
  f.push({ nom: 'IMG_4471.jpg', data: await photo(av(AN - 1), { quart: 1, angle: 1.2 }), attendu: `Revenus/Avis d'imposition/${E} - Avis d'imposition - ${AN - 1}` });
  f.push({ nom: 'avis impot.pdf', data: await pdf(av(AN)), attendu: `Revenus/Avis d'imposition/${E} - Avis d'imposition - ${AN}` });
  f.push({ nom: 'facture edf.pdf', data: await pdf(facture({ fournisseur: 'EDF', titulaire: 'Mme MARCHAND Élodie', adr: P.adr, date: jour(3, M1.m, M1.a), du: jour(1, M2.m, M2.a), au: jour(31, M2.m, M2.a).replace(/^31\/(04|06|09|11)/, '30/$1'), ligne: 'Électricité, consommation 312 kWh', montant: '64,20' })), attendu: `État civil/${E} - Justificatif de domicile - ${mm(M1.m)}-${M1.a}` });
  f.push({ nom: 'bail.pdf', data: await pdf(bail({ bailleur: 'M. ROUSSEL Bernard, demeurant 4 place Bellecour, 69002 Lyon', locataire: 'Mme MARCHAND Élodie', adr: '27 rue des Acacias, 69003 Lyon', loyer: 780, debut: '01/09/2022', ville: 'Lyon', date: '20/08/2022' })), attendu: `État civil/${E} - Contrat de location - 08-2022` });
  const q = (m, a) => quittance({ bailleur: 'M. ROUSSEL Bernard', locataire: 'Mme MARCHAND Élodie', adr: '27 rue des Acacias, 69003 Lyon', m, a, montant: 860, ville: 'Lyon' });
  f.push({ nom: 'quittance aout.pdf', data: await pdf(q(M1.m, M1.a)), attendu: `État civil/${E} - Quittance de loyer - ${mm(M1.m)}-${M1.a}` });
  f.push({ nom: 'quittance juillet.tif', data: await transformer(await png(q(M2.m, M2.a)), { format: 'tiff', gris: true, echelle: 0.6 }), attendu: `État civil/${E} - Quittance de loyer - ${mm(M2.m)}-${M2.a}` });
  // ZIP de relevés
  const z = new JSZip();
  for (const [k, mo] of [[1, M1], [2, M2], [3, M3]]) z.file('releve_' + k + '.pdf', await pdf(releve({ banque: 'BANQUE HORIZON', agence: 'Lyon Part-Dieu', titulaire: 'Mme MARCHAND Élodie', m: mo.m, a: mo.a })));
  f.push({ nom: 'releves.zip', data: await z.generateAsync({ type: 'nodebuffer' }), attendus: [[1, M1], [2, M2], [3, M3]].map(([k, mo]) => ['releves.zip / releve_' + k + '.pdf', `Patrimoine/Relevés de compte/${E} - Relevé de compte - ${mm(mo.m)}-${mo.a}`]) });
  f.push({ nom: 'Capture epargne.png', data: await png(captureEpargne({ nom: 'Mme MARCHAND Élodie', date: jour(20, AUJ.getMonth() + 1, AN), lignes: [['Livret A', '18 400,00'], ['LDDS', '6 200,00']] })), attendu: `Patrimoine/Épargne/${E} - Capture d'épargne - ${mm(AUJ.getMonth() + 1)}-${AN}` });
  f.push({ nom: 'frais bancaires.xlsx', data: xlsxDepuis('Frais', [['BANQUE HORIZON'], ['Récapitulatif annuel des frais ' + (AN - 1)], ['Titulaire', 'Mme MARCHAND Élodie'], ['Cotisation carte', '45,00'], ['Frais de tenue de compte', '24,00'], ['Total des frais', '69,00']]), attendu: `Patrimoine/Relevés de compte/${E} - Récapitulatif annuel des frais - ${AN - 1}` });
  f.push({ nom: 'compromis signe.pdf', data: await pdf(compromis({ vendeur: 'M. et Mme FAURE Gérard et Anne', acquereur: 'Mme MARCHAND Élodie', adr: '5 rue Juliette Récamier, 69006 Lyon', desc: 'appartement de 3 pièces au 2e étage', usage: 'résidence principale de l\'acquéreur', prix: '312 000', ville: 'Lyon', date: jour(10, AUJ.getMonth() + 1, AN) })), attendu: `Projet/${E} - Compromis de vente - ${mm(AUJ.getMonth() + 1)}-${AN}` });
  f.push({ nom: 'DDT.pdf', data: await pdf(ddt({ adr: '5 rue Juliette Récamier, 69006 Lyon' })), attendu: `Projet/${E} - Diagnostics - 07-${AN}` });
  // Cas particuliers
  f.push({ nom: 'tout_en_un.pdf', data: await fusionPdf([await pdf(bul(M1.m, M1.a)), await pdf(av(AN))]), attendu: 'À vérifier' });
  f.push({ nom: 'bulletins 3 mois.pdf', data: await fusionPdf([await pdf(bul(M1.m, M1.a)), await pdf(bul(M2.m, M2.a)), await pdf(bul(M3.m, M3.a))]), attendu: 'À vérifier' });
  f.push({ nom: 'IMG_2203.jpg', data: await transformer(await png(bul(M2.m, M2.a)), { flou: 9, format: 'jpg', echelle: 0.35 }), attendu: 'À vérifier' });
  f.push({ nom: 'scan_casse.pdf', data: Buffer.from('%PDF-1.4\n' + 'x'.repeat(300) + '\n%%EOF-casse'), attendu: 'À vérifier' });
  f.push({ nom: 'bulletin juillet (1).pdf', data: fs.readFileSync ? null : null, doublonDe: 'bulletin juillet.pdf', attendu: 'À vérifier' });
  f.push({ nom: 'recette crumble.pdf', data: await pdf(simple('Crumble aux pommes', ['Préchauffer le four à 180 degrés.', 'Mélanger la farine, le sucre et le beurre.', 'Couper les pommes et les disposer dans un plat.'])), attendu: 'À vérifier' });
  f.push({ nom: '.DS_Store', data: Buffer.from([0, 0, 0, 1, 66, 117, 100, 49]), ignore: true, attendus: [] });
  for (const x of f) if (x.doublonDe) x.data = f.find((y) => y.nom === x.doublonDe).data;
  await ecrire('1 - Salariee seule', f);
}

async function casCoupleSciSociete() {
  const C = { civ: 'Mme', nom: 'LEROY', prenom: 'Camille' };
  const J = { civ: 'M.', nom: 'BENHAMOU', prenom: 'Julien' };
  const EC = 'LEROY Camille', EJ = 'BENHAMOU Julien', EE = 'LEROY Camille et BENHAMOU Julien';
  const DOM = '15 rue Oberkampf, 75011 Paris';
  const LILAS = '12 rue des Lilas, 94300 Vincennes', LILAS_AFF = '12 rue des Lilas, Vincennes';
  const SCI = 'SCI LES TILLEULS', SOC = 'BENHAMOU CONSEIL SAS';
  const f = [];
  f.push({ nom: 'cni camille.pdf', data: await scan(carteIdentiteAncienne({ nom: 'LEROY', prenoms: 'CAMILLE, SOPHIE', sexe: 'F', naissance: '02.11.1990', lieu: 'NANTES (44)', expiration: '15.06.2031', mrz: mrzCniAncienne('LEROY', 'CAMILLE SOPHIE', 'F', '901102') })), attendu: `État civil/${EC} - Carte d'identité` });
  f.push({ nom: 'passeport julien.jpg', data: await photo(passeport({ nom: 'BENHAMOU', prenoms: 'JULIEN, DAVID', sexe: 'M', naissance: '21/03/1988', delivrance: '10/01/2022', expiration: '09/01/2032', mrz: mrzTD3('FRA', 'BENHAMOU', 'JULIEN DAVID', 'M', '880321', '320109') }), { angle: 2 }), attendu: `État civil/${EJ} - Passeport` });
  f.push({ nom: 'pacs.pdf', data: await pdf(simple('ATTESTATION D\'ENREGISTREMENT DE LA DÉCLARATION DE PACTE CIVIL DE SOLIDARITÉ', ['Le pacte civil de solidarité conclu entre Mme LEROY Camille et M. BENHAMOU Julien a été enregistré.', 'Les partenaires ont fait enregistrer la déclaration conjointe de PACS en mairie de Paris 11e.', 'Fait à Paris, le 14/06/2021'])), attendu: `État civil/${EE} - Attestation de PACS` });
  f.push({ nom: 'livret famille.pdf', data: await scan(simple('LIVRET DE FAMILLE', ['Officier de l\'état civil de la mairie de Paris 11e', 'Père : M. BENHAMOU Julien, né le 21/03/1988', 'Mère : Mme LEROY Camille, née le 02/11/1990', 'Enfant : BENHAMOU Léo, né le 08/05/2022 à Paris 12e, acte de naissance n° 812'])), attendu: `État civil/${EE} - Livret de famille` });
  f.push({ nom: 'facture internet.pdf', data: await pdf(facture({ fournisseur: 'ORANGE', titulaire: 'M. BENHAMOU Julien et Mme LEROY Camille', adr: DOM, date: jour(4, M1.m, M1.a), du: jour(1, M1.m, M1.a), au: jour(28, M1.m, M1.a), ligne: 'Abonnement box internet fibre', montant: '42,99' })), attendu: `État civil/${EE} - Justificatif de domicile - ${mm(M1.m)}-${M1.a}` });
  f.push({ nom: 'bail appartement.pdf', data: await pdf(bail({ bailleur: 'Mme GAUTHIER Hélène, demeurant 3 avenue Parmentier, 75011 Paris', locataire: 'M. BENHAMOU Julien et Mme LEROY Camille', adr: DOM, loyer: 1650, debut: '01/10/2021', ville: 'Paris', date: '15/09/2021' })), attendu: `État civil/${EE} - Contrat de location - 09-2021` });
  for (const mo of [M1, M2, M3]) f.push({ nom: `quittance ${mm(mo.m)}.pdf`, data: await pdf(quittance({ bailleur: 'Mme GAUTHIER Hélène', locataire: 'M. BENHAMOU Julien et Mme LEROY Camille', adr: DOM, m: mo.m, a: mo.a, montant: 1730, ville: 'Paris' })), attendu: `État civil/${EE} - Quittance de loyer - ${mm(mo.m)}-${mo.a}` });
  const av = (an) => avis({ an, centre: 'Paris 11e', decl: [{ civ: 'Mme', nom: 'LEROY', prenom: 'Camille' }, { civ: 'M.', nom: 'BENHAMOU', prenom: 'Julien' }], adr: DOM, situation: 'Pacsés', parts: '2,5', charge: '1', rev: '118 400', rfr: '106 000', impot: '12 400' });
  for (const an of [AN, AN - 1, AN - 2]) f.push({ nom: `avis ${an}.pdf`, data: await pdf(av(an)), attendu: `Revenus/Avis d'imposition/${EE} - Avis d'imposition - ${an}` });
  const bul = (m, a) => bulletin({ ...C, adr: DOM, emp: 'INSTITUT VERANO', empAdr: '8 rue de Lyon, 75012 Paris', emploi: 'Responsable marketing', m, a, brut: '4 200,00', primes: '600,00', brutTotal: '4 800,00', cotis: '1 050,00', netImp: '3 850,00', net: '3 750,00' });
  for (const mo of [M1, M2, M3, { m: 12, a: AN - 1 }]) f.push({ nom: `bulletin ${mm(mo.m)}-${mo.a}.pdf`, data: await pdf(bul(mo.m, mo.a)), attendu: `Revenus/Bulletins de salaire et contrat/${EC} - Bulletin de salaire - ${mm(mo.m)}-${mo.a}` });
  f.push({ nom: 'contrat camille.docx', data: await docxDepuis(['CONTRAT DE TRAVAIL', 'Entre la société INSTITUT VERANO, SAS dont le siège est 8 rue de Lyon, 75012 Paris, ci-après l\'employeur,', 'et Madame LEROY Camille, ci-après le salarié.', 'Le présent contrat est conclu pour une durée indéterminée à compter du 01/09/2020. Période d\'essai de quatre mois.', 'Rémunération fixe et part variable sur objectifs.', 'Fait à Paris, le 20/07/2020']), attendu: `Revenus/Bulletins de salaire et contrat/${EC} - Contrat de travail - 07-2020` });
  // Société
  const socBase = { denom: 'BENHAMOU CONSEIL', forme: 'SAS', formeLongue: 'Société par actions simplifiée', capital: '10 000', siege: '40 rue de la Roquette, 75011 Paris' };
  f.push({ nom: 'statuts societe.pdf', data: await pdf(statuts({ ...socBase, objet: 'Conseil en organisation et gestion.', parts: 1000, associes: ['M. BENHAMOU Julien, 1000 actions'], dirigeant: 'Président : M. BENHAMOU Julien' })), attendu: `Revenus/${SOC}/${SOC} - Statuts` });
  f.push({ nom: 'kbis.pdf', data: await pdf(kbis({ ...socBase, date: jour(2, M1.m, M1.a), dirigeant: 'M. BENHAMOU Julien' })), attendu: `Revenus/${SOC}/${SOC} - K-bis - ${mm(M1.m)}-${M1.a}` });
  for (const an of [AN - 1, AN - 2]) f.push({ nom: `bilan ${an}.pdf`, data: await pdf(bilan({ denom: 'BENHAMOU CONSEIL', forme: 'SAS', an })), attendu: `Revenus/${SOC}/${SOC} - Bilan - ${an}` });
  f.push({ nom: 'releve pro.pdf', data: await pdf(releve({ banque: 'BANQUE HORIZON', agence: 'Paris Bastille', titulaire: 'BENHAMOU CONSEIL SAS', pro: true, m: M1.m, a: M1.a })), attendu: `Revenus/${SOC}/${SOC} - Relevé de compte - ${mm(M1.m)}-${M1.a}` });
  // SCI
  f.push({ nom: 'statuts SCI.pdf', data: await pdf(statuts({ denom: 'LES TILLEULS', forme: 'SCI', formeLongue: 'Société civile immobilière', capital: '1 000', siege: '15 rue Oberkampf, 75011 Paris', objet: 'Acquisition et gestion de biens immobiliers.', parts: 100, associes: ['Mme LEROY Camille, 50 parts', 'M. BENHAMOU Julien, 50 parts'], dirigeant: 'Gérant : M. BENHAMOU Julien' })), attendu: `Patrimoine/${SCI}/${SCI} - Statuts` });
  f.push({ nom: 'releve sci.pdf', data: await pdf(releve({ banque: 'BANQUE HORIZON', agence: 'Paris Bastille', titulaire: 'SCI LES TILLEULS', m: M1.m, a: M1.a })), attendu: `Patrimoine/${SCI}/${SCI} - Relevé de compte - ${mm(M1.m)}-${M1.a}` });
  // Bien loué de Julien
  f.push({ nom: 'taxe fonciere.pdf', data: await pdf(taxeFonciere({ an: AN - 1, proprietaire: 'M. BENHAMOU Julien', adrProprietaire: DOM, adrBien: LILAS })), attendu: `Patrimoine/Immobilier/${LILAS_AFF}/${EJ} - Taxe foncière - ${AN - 1}` });
  f.push({ nom: 'titre propriete.pdf', data: await scan(titrePropriete({ acquereur: 'M. BENHAMOU Julien', adr: LILAS, prix: '285 000', surface: '48', date: '12/03/2018' })), attendu: `Patrimoine/Immobilier/${LILAS_AFF}/${EJ} - Titre de propriété - 03-2018` });
  f.push({ nom: 'bail lilas.pdf', data: await pdf(bail({ bailleur: 'M. BENHAMOU Julien, demeurant 15 rue Oberkampf, 75011 Paris', locataire: 'M. GIRARD Paul', adr: LILAS, loyer: 1100, debut: '01/02/2023', ville: 'Vincennes', date: '10/01/2023' })), attendu: `Patrimoine/Immobilier/${LILAS_AFF}/${EJ} - Bail - 01-2023` });
  for (const mo of [M1, M2]) f.push({ nom: `quittance lilas ${mm(mo.m)}.pdf`, data: await pdf(quittance({ bailleur: 'M. BENHAMOU Julien', locataire: 'M. GIRARD Paul', adr: LILAS, m: mo.m, a: mo.a, montant: 1180, ville: 'Vincennes' })), attendu: `Revenus/Revenus fonciers/${EJ} - Quittance de loyer - ${mm(mo.m)}-${mo.a}` });
  f.push({ nom: '2044.pdf', data: await pdf(simple('DÉCLARATION DES REVENUS FONCIERS 2044', [`Revenus fonciers de l'année ${AN - 1}`, 'Déclarant : M. BENHAMOU Julien', 'Immeuble : ' + LILAS, 'Loyers bruts encaissés : 13 200 euros'])), attendu: `Revenus/Revenus fonciers/${EJ} - Déclaration 2044 - ${AN - 1}` });
  f.push({ nom: 'offre pret lilas.pdf', data: await pdf(offrePret({ banque: 'CRÉDIT ALPIN', date: '02/02/2018', emprunteur: 'M. BENHAMOU Julien', objet: 'Acquisition immobilière du bien situé au ' + LILAS, montant: '240 000', duree: 240, taeg: '1,95' })), attendu: `Patrimoine/Crédits immo/${EJ} - Offre de prêt immobilier - 02-2018` });
  f.push({ nom: 'tableau amortissement.xlsx', data: xlsxDepuis('Echeancier', [['CRÉDIT ALPIN - Tableau d\'amortissement'], ['Emprunteur', 'M. BENHAMOU Julien'], ['Prêt immobilier n° 0001', 'Édité le 02/02/2018'], ['Date échéance', 'Échéance', 'Intérêts', 'Capital restant dû'], ['05/03/2018', '1 210,00', '390,00', '239 180,00'], ['05/04/2018', '1 210,00', '388,70', '238 358,70']]), attendu: `Patrimoine/Crédits immo/${EJ} - Tableau d'amortissement - 02-2018` });
  // Épargne et comptes
  f.push({ nom: 'assurance vie camille.pdf', data: await pdf(page(`<h1>RELEVÉ DE SITUATION ASSURANCE VIE</h1><p>Contrat d'assurance vie n° 000123</p><div class="enc">Souscripteur : Mme LEROY Camille</div><p>Situation au 31/12/${AN - 1}</p><table><tr><td>Fonds en euros</td><td>21 000 €</td></tr><tr><td>Unités de compte</td><td>9 000 €</td></tr><tr><td>Valeur de rachat</td><td>30 000 €</td></tr></table>`)), attendu: `Patrimoine/Épargne/${EC} - Relevé d'assurance vie - 12-${AN - 1}` });
  f.push({ nom: 'livret A.pdf', data: await pdf(page(`<h1>RELEVÉ DE COMPTE ÉPARGNE</h1><div class="enc">Titulaire : Mme LEROY Camille<br>Livret A n° 0009876</div><p>Période du 01/01/${AN} au 30/06/${AN}</p><table><tr><td>Intérêts acquis</td><td>210 €</td></tr><tr><td>Solde au 30/06/${AN}</td><td>22 950 €</td></tr></table><p>Taux de rémunération : 2,4 %</p>`)), attendu: `Patrimoine/Épargne/${EC} - Relevé d'épargne - 06-${AN}` });
  for (const mo of [M1, M2, M3]) f.push({ nom: `compte joint ${mm(mo.m)}.pdf`, data: await pdf(releve({ banque: 'BANQUE HORIZON', agence: 'Paris Bastille', titulaire: 'M. BENHAMOU Julien ou Mme LEROY Camille', m: mo.m, a: mo.a })), attendu: `Patrimoine/Relevés de compte/${EE} - Relevé de compte - ${mm(mo.m)}-${mo.a}` });
  // Projet
  const dComp = jour(15, AUJ.getMonth() + 1, AN);
  f.push({ nom: 'compromis.pdf', data: await pdf(compromis({ vendeur: 'M. PICARD Louis', acquereur: 'Mme LEROY Camille et M. BENHAMOU Julien', adr: '8 allée Watteau, 94130 Nogent-sur-Marne', desc: 'maison de 5 pièces', usage: 'résidence principale des acquéreurs', prix: '690 000', ville: 'Nogent-sur-Marne', date: dComp })), attendu: `Projet/${EE} - Compromis de vente - ${mm(AUJ.getMonth() + 1)}-${AN}` });
  f.push({ nom: 'diagnostics watteau.pdf', data: await pdf(ddt({ adr: '8 allée Watteau, 94130 Nogent-sur-Marne' })), attendu: `Projet/${EE} - Diagnostics - 07-${AN}` });
  // Doublon
  f.push({ nom: 'Copie de quittance.pdf', doublonDe: `quittance ${mm(M1.m)}.pdf`, attendu: 'À vérifier' });
  for (const x of f) if (x.doublonDe) x.data = f.find((y) => y.nom === x.doublonDe).data;
  await ecrire('2 - Couple SCI societe', f);
}

async function casIndependant() {
  const T = { civ: 'M.', nom: 'DUCASSE', prenom: 'Thibault' };
  const E = 'DUCASSE Thibault';
  const DOM = '9 avenue Foch, 33000 Bordeaux', DOM_AFF = '9 avenue Foch, Bordeaux';
  const ACT = 'CABINET DE KINESITHERAPIE DUCASSE';
  const f = [];
  f.push({ nom: 'passeport.png', data: await transformer(await png(passeport({ nom: 'DUCASSE', prenoms: 'THIBAULT', sexe: 'M', naissance: '07/09/1985', delivrance: '03/03/2019', expiration: '02/03/2029', mrz: mrzTD3('FRA', 'DUCASSE', 'THIBAULT', 'M', '850907', '290302') })), { gris: true }), attendu: `État civil/${E} - Passeport` });
  for (const an of [AN - 1, AN - 2, AN - 3]) f.push({ nom: `2035 ${an}.pdf`, data: await pdf(dpe2035({ an, designation: ACT, ...T, profession: 'Masseur-kinésithérapeute', adr: '14 cours de l\'Intendance, 33000 Bordeaux', recettes: 98000, depenses: 41000 })), attendu: `Revenus/${ACT}/${ACT} - Déclaration 2035 - ${an}` });
  for (const mo of [M1, M2]) f.push({ nom: `releve pro ${mm(mo.m)}.pdf`, data: await pdf(releve({ banque: 'BANQUE ATLANTIQUE', agence: 'Bordeaux Centre', titulaire: 'M. DUCASSE Thibault - ' + ACT, pro: true, m: mo.m, a: mo.a })), attendu: `Revenus/${ACT}/${ACT} - Relevé de compte - ${mm(mo.m)}-${mo.a}` });
  const av = (an) => avis({ an, centre: 'Bordeaux', decl: [T], adr: DOM, situation: 'Célibataire', parts: '1', charge: '0', rev: '57 000', rfr: '51 300', impot: '8 900' });
  for (const an of [AN, AN - 1, AN - 2]) f.push({ nom: `avis ${an}.pdf`, data: await pdf(av(an)), attendu: `Revenus/Avis d'imposition/${E} - Avis d'imposition - ${an}` });
  f.push({ nom: 'facture gaz.pdf', data: await pdf(facture({ fournisseur: 'ENGIE', titulaire: 'M. DUCASSE Thibault', adr: DOM, date: '12/03/' + AN, du: '01/02/' + AN, au: '28/02/' + AN, ligne: 'Gaz naturel, consommation 850 kWh', montant: '96,40' })), attendu: `État civil/${E} - Justificatif de domicile - 03-${AN}` });
  f.push({ nom: 'taxe fonciere.pdf', data: await pdf(taxeFonciere({ an: AN - 1, proprietaire: 'M. DUCASSE Thibault', adrProprietaire: DOM, adrBien: DOM })), attendu: `Patrimoine/Immobilier/${DOM_AFF}/${E} - Taxe foncière - ${AN - 1}` });
  f.push({ nom: 'attestation propriete.pdf', data: await pdf(page(`<p class="petit">Office notarial de Maître CAZENAVE</p><h1>ATTESTATION DE PROPRIÉTÉ</h1><p>Le notaire soussigné atteste que M. DUCASSE Thibault est propriétaire du bien situé au ${DOM}, acquis le 18/06/2016 au prix de 265 000 euros, d'une superficie de 62 m2.</p><p>Fait à Bordeaux, le 18/06/2016</p>`)), attendu: `Patrimoine/Immobilier/${DOM_AFF}/${E} - Attestation de propriété - 06-2016` });
  f.push({ nom: 'credit auto.pdf', data: await pdf(offrePret({ banque: 'FINANCO SUD', date: '14/04/' + (AN - 1), emprunteur: 'M. DUCASSE Thibault', objet: 'Crédit auto, prêt personnel pour l\'achat d\'un véhicule', montant: '18 000', duree: 48, taeg: '4,90', conso: true })), attendu: `Patrimoine/Crédits conso/${E} - Offre de prêt à la consommation - 04-${AN - 1}` });
  f.push({ nom: 'echeancier auto.pdf', data: await pdf(page(`<h1>TABLEAU D'AMORTISSEMENT</h1><p>FINANCO SUD - Crédit à la consommation, prêt personnel</p><div class="enc">Emprunteur : M. DUCASSE Thibault</div><table><tr><th>Date d'échéance</th><th>Échéance</th><th>Capital restant dû</th></tr><tr><td>14/05/${AN - 1}</td><td>413,20 €</td><td>17 660 €</td></tr><tr><td>14/06/${AN - 1}</td><td>413,20 €</td><td>17 318 €</td></tr></table><p>Édité le 14/04/${AN - 1}</p>`)), attendu: `Patrimoine/Crédits conso/${E} - Tableau d'amortissement - 04-${AN - 1}` });
  for (const mo of [M1, M2, M3]) f.push({ nom: `releve perso ${mm(mo.m)}.pdf`, data: await pdf(releve({ banque: 'BANQUE ATLANTIQUE', agence: 'Bordeaux Centre', titulaire: 'M. DUCASSE Thibault', m: mo.m, a: mo.a })), attendu: `Patrimoine/Relevés de compte/${E} - Relevé de compte - ${mm(mo.m)}-${mo.a}` });
  // Projet neuf, investissement locatif
  const PROJ = '3 rue du Port, 33300 Bordeaux';
  f.push({ nom: 'contrat reservation.pdf', data: await pdf(page(`<h1>CONTRAT DE RÉSERVATION</h1><p>Vente en l'état futur d'achèvement (VEFA)</p><p>RÉSERVANT : SCCV LES QUAIS NEUFS</p><p>RÉSERVATAIRE : M. DUCASSE Thibault</p><p>Le réservant s'engage à réserver au réservataire un appartement de 2 pièces situé au ${PROJ}, destiné à l'investissement locatif.</p><p>Prix : 219 000 euros. Dépôt de garantie : 5 %.</p><p>Fait à Bordeaux, le ${jour(2, M1.m, M1.a)}</p>`)), attendu: `Projet/${E} - Contrat de réservation - ${mm(M1.m)}-${M1.a}` });
  f.push({ nom: 'notice.pdf', data: await pdf(simple('NOTICE DESCRIPTIVE', ['Programme LES QUAIS NEUFS, ' + PROJ, 'Menuiseries extérieures en aluminium, double vitrage.', 'Revêtements de sol : parquet stratifié dans les chambres, carrelage dans les pièces humides.'])), attendu: `Projet/${E} - Notice descriptive`  });
  f.push({ nom: 'plan lot 12.png', data: await png(`<div style="width:900px;height:640px;padding:30px;font-family:Arial;background:#fff"><div style="font-size:26px;font-weight:bold">PLAN DE VENTE - LOT 12</div><div style="font-size:18px">Échelle 1/50 - Surface habitable 44,6 m2</div><div style="margin-top:30px;display:grid;grid-template-columns:2fr 1fr;gap:6px;height:420px"><div style="border:4px solid #000;padding:12px;font-size:22px">Séjour 24,1 m2</div><div style="border:4px solid #000;padding:12px;font-size:22px">Chambre 11,2 m2</div><div style="border:4px solid #000;padding:12px;font-size:22px">Cuisine 6,0 m2</div><div style="border:4px solid #000;padding:12px;font-size:22px">Salle de bains 3,3 m2</div></div></div>`), attendu: `Projet/${E} - Plans` });
  f.push({ nom: 'estimation loyer.pdf', data: await pdf(simple('AVIS DE VALEUR LOCATIVE', ['Agence ATLANTIQUE GESTION', 'Bien estimé : appartement de 2 pièces, ' + PROJ, 'Loyer estimé : 780 euros hors charges par mois.', 'À la demande de M. DUCASSE Thibault. Fait à Bordeaux, le ' + jour(5, M1.m, M1.a)])), attendu: `Projet/${E} - Estimation de valeur locative - ${mm(M1.m)}-${M1.a}` });
  f.push({ nom: 'notes.txt', data: Buffer.from('Rappeler le client lundi'), attendu: 'À vérifier' });
  await ecrire('3 - Independant', f);
}

async function casNonResident() {
  const E = 'NGUYEN Linh';
  const ADR = '48 Kensington Park Road, London W11 3BU, United Kingdom';
  const f = [];
  f.push({ nom: 'passport.jpg', data: await photo(passeport({ nom: 'NGUYEN', prenoms: 'LINH, MAI', sexe: 'F', naissance: '30/01/1993', delivrance: '05/05/2023', expiration: '04/05/2033', mrz: mrzTD3('FRA', 'NGUYEN', 'LINH MAI', 'F', '930130', '330504') }), { angle: -1.5 }), attendu: `État civil/${E} - Passeport` });
  f.push({ nom: 'certificate of residence.pdf', data: await pdf(page(`<h1>CERTIFICATE OF RESIDENCE</h1><p>HM Revenue &amp; Customs</p><p>This is to certify that Ms NGUYEN Linh, of ${ADR}, is resident in the United Kingdom for tax purposes for the tax year ${AN - 1} to ${AN}.</p><p>Issued on ${jour(3, 5, AN)}</p>`)), attendu: `État civil/${E} - Attestation de résidence fiscale - ${AN - 1}` });
  f.push({ nom: 'utility bill.pdf', data: await pdf(page(`<div class="ent"><div><b>THAMES POWER</b></div><div class="d"><h1>ELECTRICITY BILL</h1>Bill date: ${jour(6, M1.m, M1.a)}</div></div><div class="enc">Ms NGUYEN Linh<br>Service address: ${ADR}</div><p>Billing period: ${jour(1, M2.m, M2.a)} to ${jour(30, M2.m, M2.a)}</p><table><tr><td>Electricity used 240 kWh</td><td>£71.30</td></tr><tr><td>Amount due</td><td>£71.30</td></tr></table>`)), attendu: `État civil/${E} - Justificatif de domicile à l'étranger - ${mm(M1.m)}-${M1.a}` });
  f.push({ nom: 'tax assessment.pdf', data: await pdf(page(`<h1>NOTICE OF ASSESSMENT</h1><p>HM Revenue &amp; Customs - Self Assessment tax calculation</p><div class="enc">Ms NGUYEN Linh<br>${ADR}</div><p>Tax year ${AN - 1}</p><table><tr><td>Taxable income</td><td>£54,000</td></tr><tr><td>Income tax due</td><td>£9,432</td></tr></table>`)), attendu: `Revenus/Avis d'imposition/${E} - Avis d'imposition étranger - ${AN - 1}` });
  for (const mo of [M1, M2, M3]) f.push({ nom: `payslip ${MONTHS[mo.m - 1]}.pdf`, data: await pdf(payslip({ nom: 'NGUYEN', prenom: 'Linh', adr: ADR, emp: 'NORTHBRIDGE ANALYTICS LTD', empAdr: '1 Canada Square, London', m: mo.m, a: mo.a, brut: '4,500.00', tax: '720.00', ni: '310.00', net: '3,470.00' })), attendu: `Revenus/Bulletins de salaire et contrat/${E} - Bulletin de salaire - ${mm(mo.m)}-${mo.a}` });
  f.push({ nom: 'employment contract.docx', data: await docxDepuis(['CONTRACT OF EMPLOYMENT', 'This employment contract is made between NORTHBRIDGE ANALYTICS LTD (the employer) and Ms NGUYEN Linh (the employee).', 'The employee is employed on a permanent basis from 01/04/2021. The probation period is three months.', 'Salary: 54,000 GBP per annum.', 'Signed in London on 12/03/2021']), attendu: `Revenus/Bulletins de salaire et contrat/${E} - Contrat de travail - 03-2021` });
  for (const mo of [M1, M2, M3]) f.push({ nom: `statement ${mm(mo.m)}.pdf`, data: await pdf(bankStatement({ banque: 'THAMES BANK', nom: 'NGUYEN', prenom: 'Linh', m: mo.m, a: mo.a })), attendu: `Patrimoine/Relevés de compte/${E} - Relevé de compte - ${mm(mo.m)}-${mo.a}` });
  // Donation des parents
  f.push({ nom: 'attestation don.pdf', data: await pdf(simple('ATTESTATION DE DONATION', ['Je soussigné M. NGUYEN Van Minh, donateur, demeurant 6 rue Sully, 69006 Lyon, atteste faire don manuel de la somme de 60 000 euros à ma fille, Mme NGUYEN Linh, donataire, pour l\'acquisition de sa résidence.', 'Fait à Lyon, le ' + jour(1, M1.m, M1.a)])), attendu: `Patrimoine/Épargne/${E} - Attestation de donation - ${mm(M1.m)}-${M1.a}` });
  f.push({ nom: 'cni donateur.jpg', data: await photo(carteIdentiteRecente({ nom: 'NGUYEN', prenoms: 'VAN MINH', sexe: 'M', naissance: '11/08/1961', lieu: 'HANOI', expiration: '19/10/2032', mrz: mrzTD1('NGUYEN', 'VAN MINH', 'M', '610811', '321019') }), { angle: 1 }), attendu: `Patrimoine/Épargne/${E} - Pièce d'identité du donateur` });
  f.push({ nom: 'cerfa 2735.pdf', data: await pdf(simple('DÉCLARATION DE DON MANUEL - FORMULAIRE 2735', ['Cerfa n° 2735', 'Donateur : M. NGUYEN Van Minh', 'Donataire : Mme NGUYEN Linh', 'Montant du don : 60 000 euros', 'Date du don : ' + jour(1, M1.m, M1.a)])), attendu: `Patrimoine/Épargne/${E} - CERFA de don - ${mm(M1.m)}-${M1.a}` });
  f.push({ nom: 'compromis lyon.pdf', data: await pdf(compromis({ vendeur: 'M. BRUN Olivier', acquereur: 'Mme NGUYEN Linh', adr: '22 rue Victor Hugo, 69002 Lyon', desc: 'appartement de 2 pièces', usage: 'résidence principale de l\'acquéreur', prix: '265 000', ville: 'Lyon', date: jour(8, AUJ.getMonth() + 1, AN) })), attendu: `Projet/${E} - Compromis de vente - ${mm(AUJ.getMonth() + 1)}-${AN}` });
  // ZIP imbriqué : archives.zip contient sous.zip qui contient un relevé
  const zSous = new JSZip();
  zSous.file('statement old.pdf', await pdf(bankStatement({ banque: 'THAMES BANK', nom: 'NGUYEN', prenom: 'Linh', m: 5, a: AN })));
  const zArch = new JSZip();
  zArch.file('sous.zip', await zSous.generateAsync({ type: 'nodebuffer' }));
  f.push({ nom: 'archives.zip', data: await zArch.generateAsync({ type: 'nodebuffer' }), attendus: [['archives.zip / sous.zip / statement old.pdf', `Patrimoine/Relevés de compte/${E} - Relevé de compte - 05-${AN}`]] });
  f.push({ nom: 'ancien document.doc', data: Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(600, 0)]), attendu: 'À vérifier' });
  await ecrire('4 - Non-resident', f);
}

async function casRetraite() {
  const E = 'ROCHE Gérard';
  const DOM = '6 place Carnot, 21000 Dijon';
  const f = [];
  f.push({ nom: 'photo cni.jpg', data: await photo(carteIdentiteRecente({ nom: 'ROCHE', prenoms: 'GÉRARD, MICHEL', sexe: 'M', naissance: '19/06/1957', lieu: 'DIJON', expiration: '11/12/2030', mrz: mrzTD1('ROCHE', 'GERARD MICHEL', 'M', '570619', '301211') }), { angle: 8 }), attendu: `État civil/${E} - Carte d'identité` });
  const av = avis({ an: AN, centre: 'Dijon', decl: [{ civ: 'M.', nom: 'ROCHE', prenom: 'Gérard' }], adr: DOM, situation: 'Veuf', parts: '1', charge: '0', rev: '26 100', rfr: '23 490', impot: '1 450' });
  f.push({ nom: 'avis photo.jpg', data: await photo(av, { quart: 3, angle: 4 }), attendu: `Revenus/Avis d'imposition/${E} - Avis d'imposition - ${AN}` });
  f.push({ nom: 'attestation retraite.pdf', data: await pdf(page(`<div class="ent"><div><b>L'ASSURANCE RETRAITE</b><br>CARSAT Bourgogne-Franche-Comté</div><div class="d">M. ROCHE Gérard<br>${DOM}</div></div><h1>ATTESTATION DE PAIEMENT</h1><p>Nous vous confirmons le paiement de votre retraite de base pour le mois de ${MOIS[M1.m - 1]} ${M1.a}.</p><table><tr><td>Pension de retraite brute</td><td>1 612,40 €</td></tr><tr><td>Pension nette</td><td>1 468,20 €</td></tr></table><p>Fait à Dijon, le ${jour(5, M1.m, M1.a)}</p>`)), attendu: `Revenus/${E} - Justificatif de retraite - ${mm(M1.m)}-${M1.a}` });
  // PDF scanné de 11 pages : le relevé n'apparaît qu'en page 7, hors de la première lecture (6 premières et 2 dernières pages)
  const remplissage = (n) => page(`<h1>Conditions générales - page ${n}</h1>${'<p>Les présentes conditions s\'appliquent à la relation entre la banque et son client. Elles peuvent être modifiées à tout moment avec information préalable.</p>'.repeat(6)}`);
  const pages = [];
  for (let n = 1; n <= 11; n++) {
    const corps = n === 7 ? releve({ banque: 'BANQUE DE BOURGOGNE', agence: 'Dijon', titulaire: 'M. ROCHE Gérard', m: M1.m, a: M1.a }) : remplissage(n);
    pages.push(await transformer(await png(corps), { gris: true, bruit: 14, angle: 0.4, echelle: 0.7 }));
  }
  f.push({ nom: 'scan banque 11 pages.pdf', data: await scanPdf(pages), attendu: `Patrimoine/Relevés de compte/${E} - Relevé de compte - ${mm(M1.m)}-${M1.a}` });
  f.push({ nom: 'offre de pret.pdf', data: await pdf(page(`<div class="ent"><div><b>BANQUE DE BOURGOGNE</b></div><div class="d"><h1>OFFRE DE PRÊT</h1>Émise le 10/03/2021</div></div><div class="enc">Emprunteur : M. ROCHE Gérard</div><table><tr><td>Montant du prêt</td><td>20 000 €</td></tr><tr><td>Durée du prêt</td><td>60 mois</td></tr><tr><td>TAEG</td><td>3,10 %</td></tr></table>`)), attendu: 'À vérifier' });
  f.push({ nom: 'EIG.pdf', data: await pdf(page(`<p class="petit">Info Retraite</p><h1>ESTIMATION INDICATIVE GLOBALE</h1><div class="enc">M. ROCHE Gérard, né le 19/06/1957</div><p>Estimation de votre retraite à la date de départ à la retraite envisagée, selon les trimestres validés.</p><table><tr><td>Trimestres validés</td><td>168</td></tr><tr><td>Montant estimé brut</td><td>1 600 € par mois</td></tr></table><p>Édité le ${jour(12, 3, 2019)}</p>`)), attendu: `Revenus/${E} - Prévisionnel de retraite - 03-2019` });
  await ecrire('5 - Retraite et cas limites', f);
}

async function casVenteAchat() {
  const P = { civ: 'M.', nom: 'MARTIN', prenom: 'Paul' };
  const S = { civ: 'Mme', nom: 'MARTIN', prenom: 'Sophie' };
  const EP = 'MARTIN Paul', ES = 'MARTIN Sophie', EE = 'MARTIN Paul et MARTIN Sophie';
  const DOM = '4 rue Pasteur, 44000 Nantes', BIEN = '4 rue Pasteur, Nantes';
  const PROJ = '11 rue Crébillon, 44000 Nantes';
  const f = [];
  f.push({ nom: 'CNI Paul.jpg', data: await photo(carteIdentiteRecente({ nom: 'MARTIN', prenoms: 'PAUL, ÉTIENNE', sexe: 'M', naissance: '03/04/1982', lieu: 'NANTES', expiration: '14/09/2031', mrz: mrzTD1('MARTIN', 'PAUL ETIENNE', 'M', '820403', '310914') }), { angle: -3 }), attendu: `État civil/${EP} - Carte d'identité` });
  f.push({ nom: 'CNI Sophie.pdf', data: await scan(carteIdentiteAncienne({ nom: 'MARTIN', prenoms: 'SOPHIE, ANNE', sexe: 'F', naissance: '27.08.1984', lieu: 'ANGERS (49)', expiration: '02.02.2030', mrz: mrzCniAncienne('MARTIN', 'SOPHIE ANNE', 'F', '840827') })), attendu: `État civil/${ES} - Carte d'identité` });
  f.push({ nom: 'contrat de mariage.pdf', data: await pdf(simple('CONTRAT DE MARIAGE', ['Office notarial de Maître BERTIN, Nantes', 'Entre les futurs époux M. MARTIN Paul et Mme MARTIN Sophie, née LEGRAND', 'Les futurs époux adoptent le régime de la séparation de biens.', 'Fait à Nantes, le 12/05/2012'])), attendu: `État civil/${EE} - Contrat de mariage` });
  f.push({ nom: 'livret de famille.pdf', data: await scan(simple('LIVRET DE FAMILLE', ['Extrait d\'acte de mariage : M. MARTIN Paul et Mme MARTIN Sophie, mariés le 16/06/2012 à Nantes', 'Enfant : MARTIN Chloé, née le 02/03/2015, acte de naissance n° 311', 'Enfant : MARTIN Hugo, né le 21/10/2018, acte de naissance n° 902'])), attendu: `État civil/${EE} - Livret de famille` });
  f.push({ nom: 'facture electricite.pdf', data: await pdf(facture({ fournisseur: 'EDF', titulaire: 'M. MARTIN Paul et Mme MARTIN Sophie', adr: DOM, date: jour(4, M1.m, M1.a), du: jour(1, M2.m, M2.a), au: jour(30, M2.m, M2.a), ligne: 'Électricité, consommation 410 kWh', montant: '88,10' })), attendu: `État civil/${EE} - Justificatif de domicile - ${mm(M1.m)}-${M1.a}` });
  const av = (an) => avis({ an, centre: 'Nantes', decl: [P, S], adr: DOM, situation: 'Mariés', parts: '3', charge: '2', rev: '96 000', rfr: '86 400', impot: '6 900' });
  for (const an of [AN, AN - 1, AN - 2]) f.push({ nom: `avis ${an}.pdf`, data: await pdf(av(an)), attendu: `Revenus/Avis d'imposition/${EE} - Avis d'imposition - ${an}` });
  const bulS = (m, a) => bulletin({ ...S, adr: DOM, emp: 'CENTRE HOSPITALIER DE NANTES', empAdr: '5 allée de l\'Île Gloriette, 44000 Nantes', emploi: 'Infirmière', contrat: 'Titulaire de la fonction publique hospitalière', rubrique: 'Traitement brut indiciaire (indice majoré 520)', m, a, brut: '2 850,00', brutTotal: '2 850,00', cotis: '520,00', netImp: '2 400,00', net: '2 330,00' });
  const bulP = (m, a) => bulletin({ ...P, adr: DOM, emp: 'ATELIERS LOIRE MÉTAL', empAdr: '20 quai de la Fosse, 44000 Nantes', emploi: 'Technicien', contrat: 'Contrat à durée déterminée (CDD)', m, a, brut: '2 600,00', brutTotal: '2 600,00', cotis: '570,00', netImp: '2 100,00', net: '2 030,00' });
  for (const mo of [M1, M2, M3, { m: 12, a: AN - 1 }]) {
    f.push({ nom: `paie Sophie ${mm(mo.m)}-${mo.a}.pdf`, data: await pdf(bulS(mo.m, mo.a)), attendu: `Revenus/Bulletins de salaire et contrat/${ES} - Bulletin de salaire - ${mm(mo.m)}-${mo.a}` });
    f.push({ nom: `paie Paul ${mm(mo.m)}-${mo.a}.pdf`, data: await pdf(bulP(mo.m, mo.a)), attendu: `Revenus/Bulletins de salaire et contrat/${EP} - Bulletin de salaire - ${mm(mo.m)}-${mo.a}` });
  }
  f.push({ nom: 'arrete titularisation.pdf', data: await pdf(simple('ARRÊTÉ DE TITULARISATION', ['Centre hospitalier de Nantes, direction des ressources humaines', 'Mme MARTIN Sophie, infirmière stagiaire, est titularisée dans le grade d\'infirmière en soins généraux de la fonction publique hospitalière à compter du 01/09/2016.', 'Fait à Nantes, le 25/08/2016'])), attendu: `Revenus/Bulletins de salaire et contrat/${ES} - Arrêté de titularisation - 08-2016` });
  f.push({ nom: 'CDD Paul.docx', data: await docxDepuis(['CONTRAT DE TRAVAIL À DURÉE DÉTERMINÉE', 'Entre la société ATELIERS LOIRE MÉTAL, ci-après l\'employeur, et Monsieur MARTIN Paul, ci-après le salarié.', 'Le présent contrat à durée déterminée est conclu pour 18 mois à compter du 01/02/' + AN + '.', 'Fait à Nantes, le 20/01/' + AN]), attendu: `Revenus/Bulletins de salaire et contrat/${EP} - Contrat de travail - 01-${AN}` });
  // Bien actuel, en vente
  f.push({ nom: 'titre de propriete.pdf', data: await scan(titrePropriete({ acquereur: 'M. MARTIN Paul et Mme MARTIN Sophie', adr: DOM, prix: '248 000', surface: '82', date: '19/09/2014' })), attendu: `Patrimoine/Immobilier/${BIEN}/${EE} - Titre de propriété - 09-2014` });
  f.push({ nom: 'taxe fonciere.pdf', data: await pdf(taxeFonciere({ an: AN - 1, proprietaire: 'M. MARTIN Paul et Mme MARTIN Sophie', adrProprietaire: DOM, adrBien: DOM })), attendu: `Patrimoine/Immobilier/${BIEN}/${EE} - Taxe foncière - ${AN - 1}` });
  f.push({ nom: 'mandat agence.pdf', data: await pdf(simple('MANDAT DE VENTE EXCLUSIF', ['Agence NANTES CENTRE IMMOBILIER, mandataire', 'Mandants : M. MARTIN Paul et Mme MARTIN Sophie', 'Bien à vendre : maison située au ' + DOM, 'Prix de vente : 365 000 euros', 'Fait à Nantes, le 02/05/' + AN])), attendu: `Patrimoine/Immobilier/${BIEN}/${EE} - Mandat de vente - 05-${AN}` });
  f.push({ nom: 'offre achat.pdf', data: await pdf(simple('OFFRE D\'ACHAT', ['Je soussigné M. GARNIER Luc, fais une offre d\'achat pour le bien de M. MARTIN Paul et Mme MARTIN Sophie situé au ' + DOM + ' au prix de 355 000 euros.', 'Validité de l\'offre : 10 jours.', 'Fait à Nantes, le 18/06/' + AN])), attendu: `Patrimoine/Immobilier/${BIEN}/${EE} - Offre d'achat - 06-${AN}` });
  f.push({ nom: 'compromis vente maison.pdf', data: await pdf(compromis({ vendeur: 'M. MARTIN Paul et Mme MARTIN Sophie', acquereur: 'M. GARNIER Luc et Mme GARNIER Emma', adr: DOM, desc: 'maison de 5 pièces', usage: 'résidence principale des acquéreurs', prix: '355 000', ville: 'Nantes', date: jour(3, M2.m, M2.a) })), attendu: `Patrimoine/Immobilier/${BIEN}/${EE} - Compromis de vente - ${mm(M2.m)}-${M2.a}` });
  f.push({ nom: 'accord banque acquereurs.pdf', data: await pdf(simple('ACCORD DE PRINCIPE', ['BANQUE DE L\'OUEST', 'Emprunteurs : M. GARNIER Luc et Mme GARNIER Emma', 'Nous donnons notre accord de principe pour le financement de l\'acquisition du bien situé au ' + DOM + '.', 'Fait à Rennes, le 10/' + mm(M1.m) + '/' + M1.a])), attendu: `Patrimoine/Immobilier/${BIEN}/${EE} - Accord de principe des acquéreurs - ${mm(M1.m)}-${M1.a}` });
  f.push({ nom: 'offre pret en cours.pdf', data: await pdf(offrePret({ banque: 'CRÉDIT ATLANTIQUE', date: '01/08/2014', emprunteur: 'M. MARTIN Paul et Mme MARTIN Sophie', objet: 'Acquisition immobilière du bien situé au ' + DOM, montant: '210 000', duree: 300, taeg: '2,85' })), attendu: `Patrimoine/Crédits immo/${EE} - Offre de prêt immobilier - 08-2014` });
  f.push({ nom: 'succession.pdf', data: await pdf(simple('ATTESTATION DE SUCCESSION', ['Office notarial de Maître BERTIN', 'Succession de M. MARTIN Henri, défunt le 04/01/' + AN, 'Héritier : M. MARTIN Paul, son fils', 'Actif net revenant à l\'héritier : 42 000 euros.', 'Fait à Nantes, le 15/03/' + AN])), attendu: `Patrimoine/Épargne/${EP} - Justificatif de succession - 03-${AN}` });
  for (const mo of [M1, M2, M3]) f.push({ nom: `compte commun ${mm(mo.m)}.pdf`, data: await pdf(releve({ banque: 'CRÉDIT ATLANTIQUE', agence: 'Nantes Commerce', titulaire: 'M. MARTIN Paul ou Mme MARTIN Sophie', m: mo.m, a: mo.a })), attendu: `Patrimoine/Relevés de compte/${EE} - Relevé de compte - ${mm(mo.m)}-${mo.a}` });
  // Projet
  f.push({ nom: 'compromis achat.pdf', data: await pdf(compromis({ vendeur: 'Mme ROBIN Claire', acquereur: 'M. MARTIN Paul et Mme MARTIN Sophie', adr: PROJ, desc: 'appartement de 4 pièces', usage: 'résidence principale des acquéreurs', prix: '420 000', ville: 'Nantes', date: jour(12, M1.m, M1.a) })), attendu: `Projet/${EE} - Compromis de vente - ${mm(M1.m)}-${M1.a}` });
  f.push({ nom: 'devis cuisine.pdf', data: await pdf(simple('DEVIS', ['CUISINES DE L\'ERDRE', 'Client : M. MARTIN Paul, chantier au ' + PROJ, 'Travaux : fourniture et pose d\'une cuisine équipée. Montant HT : 14 200 euros.', 'Validité du devis : 3 mois. Bon pour accord.', 'Fait à Nantes, le 20/' + mm(M1.m) + '/' + M1.a])), attendu: `Projet/${EE} - Devis travaux - ${mm(M1.m)}-${M1.a}` });
  f.push({ nom: 'prorogation.pdf', data: await pdf(simple('AVENANT AU COMPROMIS - PROROGATION', ['Les parties conviennent de la prorogation des conditions suspensives du compromis portant sur le bien situé au ' + PROJ + '.', 'Nouvelle date de réalisation : 30/11/' + AN, 'Fait à Nantes, le 15/' + mm(AUJ.getMonth() + 1) + '/' + AN])), attendu: `Projet/${EE} - Prorogation des conditions suspensives - ${mm(AUJ.getMonth() + 1)}-${AN}` });
  f.push({ nom: 'diagnostics crebillon.pdf', data: await pdf(ddt({ adr: PROJ })), attendu: `Projet/${EE} - Diagnostics - 07-${AN}` });
  await ecrire('6 - Couple marie vente et achat', f);
}

async function casHebergee() {
  const M = { civ: 'Mme', nom: 'DUPUIS', prenom: 'Manon' };
  const E = 'DUPUIS Manon';
  const DOM = '9 impasse des Mésanges, 31400 Toulouse';
  const PROJ = '2 allée Jean Jaurès, 31000 Toulouse';
  const f = [];
  f.push({ nom: 'ma carte identite.jpg', data: await photo(carteIdentiteRecente({ nom: 'DUPUIS', prenoms: 'MANON, LÉA', sexe: 'F', naissance: '09/12/1999', lieu: 'TOULOUSE', expiration: '21/06/2032', mrz: mrzTD1('DUPUIS', 'MANON LEA', 'F', '991209', '320621') }), { quart: 1, angle: 2 }), attendu: `État civil/${E} - Carte d'identité` });
  f.push({ nom: 'attestation hebergement.pdf', data: await pdf(simple('ATTESTATION D\'HÉBERGEMENT', ['Je soussigné M. DUPUIS Alain, demeurant ' + DOM + ', certifie héberger à titre gratuit ma fille, Mme DUPUIS Manon, à mon domicile depuis le 01/09/2021.', 'Fait pour servir et valoir ce que de droit. Attestation sur l\'honneur.', 'Fait à Toulouse, le ' + jour(2, M1.m, M1.a)])), attendu: `État civil/${E} - Attestation d'hébergement - ${mm(M1.m)}-${M1.a}` });
  f.push({ nom: 'cni papa.jpg', data: await photo(carteIdentiteRecente({ nom: 'DUPUIS', prenoms: 'ALAIN, ROBERT', sexe: 'M', naissance: '17/02/1968', lieu: 'ALBI', expiration: '30/04/2029', mrz: mrzTD1('DUPUIS', 'ALAIN ROBERT', 'M', '680217', '290430') })), attendu: `État civil/${E} - Pièce d'identité de l'hébergeant` });
  f.push({ nom: 'facture papa.pdf', data: await pdf(facture({ fournisseur: 'ENGIE', titulaire: 'M. DUPUIS Alain', adr: DOM, date: jour(8, M1.m, M1.a), du: jour(1, M2.m, M2.a), au: jour(30, M2.m, M2.a), ligne: 'Gaz naturel, consommation 620 kWh', montant: '74,30' })), attendu: `État civil/${E} - Justificatif de domicile de l'hébergeant - ${mm(M1.m)}-${M1.a}` });
  const bul = (m, a) => bulletin({ ...M, adr: DOM, emp: 'STUDIO PIXELIA', empAdr: '12 rue Alsace-Lorraine, 31000 Toulouse', emploi: 'Graphiste', m, a, brut: '2 400,00', brutTotal: '2 400,00', cotis: '530,00', netImp: '1 930,00', net: '1 870,00' });
  for (const mo of [M1, M2, M3]) f.push({ nom: `fiche de paie ${mm(mo.m)}.pdf`, data: await pdf(bul(mo.m, mo.a)), attendu: `Revenus/Bulletins de salaire et contrat/${E} - Bulletin de salaire - ${mm(mo.m)}-${mo.a}` });
  f.push({ nom: 'contrat pixelia.pdf', data: await pdf(page(`<h1>CONTRAT DE TRAVAIL</h1><p>Entre la société STUDIO PIXELIA, ci-après l'employeur, et Mme DUPUIS Manon, ci-après le salarié.</p><p>Contrat à durée indéterminée à compter du 03/02/${AN}. Période d'essai de deux mois.</p><p>Fait à Toulouse, le 20/01/${AN}</p>`)), attendu: `Revenus/Bulletins de salaire et contrat/${E} - Contrat de travail - 01-${AN}` });
  f.push({ nom: 'fin essai.pdf', data: await pdf(simple('ATTESTATION DE FIN DE PÉRIODE D\'ESSAI', ['STUDIO PIXELIA atteste que la période d\'essai de Mme DUPUIS Manon a pris fin le 02/04/' + AN + '. Son embauche est confirmée définitivement.', 'Fait à Toulouse, le 03/04/' + AN])), attendu: `Revenus/Bulletins de salaire et contrat/${E} - Attestation de fin de période d'essai - 04-${AN}` });
  f.push({ nom: 'avenant salaire.pdf', data: await pdf(simple('AVENANT AU CONTRAT DE TRAVAIL', ['Entre STUDIO PIXELIA et Mme DUPUIS Manon.', 'Nouvelle rémunération : 2 400 euros bruts mensuels à compter du 01/06/' + AN + '.', 'Fait à Toulouse, le 25/05/' + AN])), attendu: `Revenus/Bulletins de salaire et contrat/${E} - Avenant au contrat de travail - 05-${AN}` });
  f.push({ nom: 'avis impot.pdf', data: await pdf(avis({ an: AN, centre: 'Toulouse', decl: [M], adr: DOM, situation: 'Célibataire', parts: '1', charge: '0', rev: '21 000', rfr: '18 900', impot: '620' })), attendu: `Revenus/Avis d'imposition/${E} - Avis d'imposition - ${AN}` });
  const z = new JSZip();
  for (const mo of [M1, M2, M3]) z.file(`releve ${mm(mo.m)}.pdf`, await pdf(releve({ banque: 'BANQUE OCCITANE', agence: 'Toulouse Capitole', titulaire: 'Mme DUPUIS Manon', m: mo.m, a: mo.a })));
  f.push({ nom: 'mes releves.zip', data: await z.generateAsync({ type: 'nodebuffer' }), attendus: [M1, M2, M3].map((mo) => [`mes releves.zip / releve ${mm(mo.m)}.pdf`, `Patrimoine/Relevés de compte/${E} - Relevé de compte - ${mm(mo.m)}-${mo.a}`]) });
  f.push({ nom: 'PEL.pdf', data: await pdf(page(`<h1>RELEVÉ DE COMPTE ÉPARGNE</h1><div class="enc">Titulaire : Mme DUPUIS Manon<br>Plan d'épargne logement (PEL) n° 5566</div><p>Situation au 30/06/${AN}</p><table><tr><td>Intérêts acquis</td><td>118 €</td></tr><tr><td>Solde</td><td>14 300 €</td></tr></table>`)), attendu: `Patrimoine/Épargne/${E} - Relevé d'épargne - 06-${AN}` });
  f.push({ nom: 'reservation vefa.pdf', data: await pdf(page(`<h1>CONTRAT DE RÉSERVATION</h1><p>Vente en l'état futur d'achèvement (VEFA)</p><p>RÉSERVANT : SCCV RIVE GARONNE</p><p>RÉSERVATAIRE : Mme DUPUIS Manon</p><p>Appartement de 2 pièces situé au ${PROJ}, destiné à la résidence principale de la réservataire.</p><p>Fait à Toulouse, le ${jour(6, M1.m, M1.a)}</p>`)), attendu: `Projet/${E} - Contrat de réservation - ${mm(M1.m)}-${M1.a}` });
  f.push({ nom: 'notice rive garonne.pdf', data: await pdf(simple('NOTICE DESCRIPTIVE', ['Programme RIVE GARONNE, ' + PROJ, 'Menuiseries en PVC double vitrage. Revêtements de sol : parquet contrecollé.'])), attendu: `Projet/${E} - Notice descriptive` });
  f.push({ nom: 'plan lot B04.png', data: await png(`<div style="width:900px;height:600px;padding:30px;font-family:Arial;background:#fff"><div style="font-size:26px;font-weight:bold">PLAN DE VENTE - LOT B04</div><div style="font-size:18px">Échelle 1/50 - Surface habitable 41,2 m2</div><div style="margin-top:30px;display:grid;grid-template-columns:2fr 1fr;gap:6px;height:400px"><div style="border:4px solid #000;padding:12px;font-size:22px">Séjour 22,4 m2</div><div style="border:4px solid #000;padding:12px;font-size:22px">Chambre 10,9 m2</div></div></div>`), attendu: `Projet/${E} - Plans` });
  await ecrire('7 - Jeune hebergee achat neuf', f);
}

async function casEchec() {
  // Dossier en vrac que l'outil ne peut pas exploiter : tout doit partir dans « À vérifier », sans rien forcer
  const f = [];
  const flou = async (c, n) => transformer(await png(c), { flou: 10, format: 'jpg', echelle: 0.3, fond: '#4a4038' });
  f.push({ nom: 'IMG_0001.jpg', data: await flou(simple('BULLETIN DE PAIE', ['Salarié : Mme XXXX', 'Net à payer 1 900 €'])), attendu: 'À vérifier' });
  f.push({ nom: 'IMG_0002.jpg', data: await flou(simple('AVIS D\'IMPÔT', ['Revenu fiscal de référence'])), attendu: 'À vérifier' });
  f.push({ nom: 'IMG_0003.jpg', data: await transformer(await png('<div style="width:600px;height:400px;background:linear-gradient(#335,#aa8)"></div>'), { format: 'jpg' }), attendu: 'À vérifier' });
  f.push({ nom: 'document.pdf', data: Buffer.from('%PDF-1.7\n1 0 obj <<>> endobj\n%%EOF-tronque'), attendu: 'À vérifier' });
  f.push({ nom: 'scan.pdf', data: Buffer.alloc(0), attendu: 'À vérifier' });
  f.push({ nom: 'papiers.pdf', data: await fusionPdf([await pdf(facture({ fournisseur: 'EDF', titulaire: 'M. LAMBERT Yves', adr: '3 rue Verte, 59000 Lille', date: '02/01/' + AN, du: '01/12/' + (AN - 1), au: '31/12/' + (AN - 1), ligne: 'Électricité', montant: '51,00' })), await pdf(quittance({ bailleur: 'M. HENRY Paul', locataire: 'M. LAMBERT Yves', adr: '3 rue Verte, 59000 Lille', m: 1, a: AN, montant: 640, ville: 'Lille' }))]), attendu: 'À vérifier' });
  f.push({ nom: 'Brief.pdf', data: await pdf(simple('Réunion de chantier', ['Ordre du jour : planning, sécurité, livraisons.', 'Prochaine réunion mardi.'])), attendu: 'À vérifier' });
  f.push({ nom: 'Steuer.pdf', data: await pdf(simple('Mitteilung', ['Sehr geehrte Damen und Herren, anbei erhalten Sie die gewünschten Unterlagen.', 'Mit freundlichen Grüßen'])), attendu: 'À vérifier' });
  f.push({ nom: 'notes.pages', data: Buffer.from('PK\x03\x04 pages'), attendu: 'À vérifier' });
  f.push({ nom: 'vieux courrier.doc', data: Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(900, 0)]), attendu: 'À vérifier' });
  f.push({ nom: 'IMG_0001 (copie).jpg', doublonDe: 'IMG_0001.jpg', attendu: 'À vérifier' });
  for (const x of f) if (x.doublonDe) x.data = f.find((y) => y.nom === x.doublonDe).data;
  await ecrire('8 - Echec dossier en vrac', f);
}

(async () => {
  fs.mkdirSync(SORTIE, { recursive: true });
  navigateur = await chromium.launch({ executablePath: CHROME });
  pageRendu = await navigateur.newPage({ viewport: { width: 1300, height: 1200 }, deviceScaleFactor: 2 });
  const cas = process.argv[2];
  if (!cas || cas === '1') await casSalarieSeul();
  if (!cas || cas === '2') await casCoupleSciSociete();
  if (!cas || cas === '3') await casIndependant();
  if (!cas || cas === '4') await casNonResident();
  if (!cas || cas === '5') await casRetraite();
  if (!cas || cas === '6') await casVenteAchat();
  if (!cas || cas === '7') await casHebergee();
  if (!cas || cas === '8') await casEchec();
  await navigateur.close();
})();
