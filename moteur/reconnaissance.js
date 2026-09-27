/* Reconnaissance d'une pièce : score par type, pages, dates, identité, noms, entités, adresses. */
(function () {
  'use strict';
  const TP = (window.TP = window.TP || {});
  const O = TP.outils;
  const R = () => window.REGLES;

  let cache = null;
  function types() {
    if (cache && cache.regles === R()) return cache.types;
    const liste = R().types.map((t) => ({
      ...t,
      motsC: O.compilerListe(t.mots),
      nomC: O.compilerListe(t.nomFichier),
      dateRe: (t.dateMotifs || []).map((s) => new RegExp(s)),
      anneeRe: (t.anneeMotifs || []).map((s) => new RegExp(s)),
      anneeRevRe: (t.anneeRevenusMotifs || []).map((s) => new RegExp(s))
    }));
    cache = { regles: R(), types: liste, index: Object.fromEntries(liste.map((t) => [t.id, t])) };
    return liste;
  }
  function type(id) { types(); return cache.index[id]; }

  // ---------- Score ----------
  function scorer(t, premier, reste, nomNorm) {
    let s = 0;
    const trouves = [];
    for (const k of t.motsC) {
      if (k.poids < 0) { if (k.test(premier) || k.test(reste)) s += k.poids; continue; }
      if (k.test(premier)) { s += k.poids; trouves.push(k.mot); } else if (reste && k.test(reste)) { s += k.poids / 2; trouves.push(k.mot); }
    }
    if (nomNorm) for (const k of t.nomC) if (k.test(nomNorm)) { s += k.poids * R().reconnaissance.poidsNomFichier; trouves.push('fichier:' + k.mot); }
    return { s, trouves };
  }

  function classer(premier, reste, nomNorm) {
    const res = types().map((t) => ({ t, ...scorer(t, premier, reste, nomNorm) }));
    res.sort((a, b) => b.s - a.s);
    return res;
  }

  function compatibles(f1, f2) {
    if (f1 === f2) return true;
    return R().famillesCompatibles.some((g) => g.includes(f1) && g.includes(f2));
  }

  // ---------- Dates ----------
  function dateDocument(t, ex) {
    if (!t.date) return null;
    const n = ex.norm;
    const auj = new Date();
    const max = new Date(auj.getFullYear(), auj.getMonth(), auj.getDate() + 45);
    if (t.date === 'annee') {
      const premiere = (re, max) => {
        const g = new RegExp(re.source, 'g');
        let m;
        while ((m = g.exec(n))) { if (+m[1] >= 1990 && +m[1] <= max) return +m[1]; if (g.lastIndex === m.index) g.lastIndex++; }
        return null;
      };
      for (const re of t.anneeRe) {
        const a = premiere(re, auj.getFullYear() + 1);
        if (a) return { annee: a, texte: String(a) };
      }
      for (const re of t.anneeRevRe) {
        const a = premiere(re, auj.getFullYear());
        if (a) return { annee: a + 1, texte: String(a + 1) };
      }
      const d = derniereDate(n, max);
      return d ? { annee: d.getFullYear(), texte: String(d.getFullYear()) } : null;
    }
    // Mois
    let d = null;
    for (const re of t.dateRe) {
      const m = re.exec(n);
      if (m) { const ds = O.trouverDates(m[1]); if (ds.length) { d = ds[0].date; break; } }
    }
    if (!d) {
      // Période : c'est la fin qui date le document (relevé, quittance, bulletin)
      const m = /(?:periode|period)[^\n]{0,30}?(?:du|from)? ?(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4}) (?:au|to) (\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4})/.exec(n);
      if (m) d = O.premiereDate(m[2]);
    }
    if (!d) {
      for (const src of R().datesDocument) {
        const m = new RegExp(src).exec(n);
        if (m) { d = O.premiereDate(m[1]); if (d) break; }
      }
    }
    if (!d) d = derniereDate(n, max);
    if (!d || d > max) return null;
    return { mois: d.getMonth() + 1, annee: d.getFullYear(), date: d, texte: O.fmtMois(d) };
  }

  function derniereDate(n, max) {
    let best = null;
    for (const x of O.trouverDates(n)) {
      if (x.date > max || x.date.getFullYear() < 1990) continue;
      if (!best || x.date > best) best = x.date;
    }
    return best;
  }

  // ---------- Identité (bande MRZ et champs lus) ----------
  function nettoyerMrz(l) {
    return l.toUpperCase().replace(/[«‹]/g, '<').replace(/\s+/g, '').replace(/[^A-Z0-9<]/g, '');
  }
  function aaMMjj(s, futur) {
    if (!/^\d{6}$/.test(s)) return null;
    let a = +s.slice(0, 2); const m = +s.slice(2, 4); const j = +s.slice(4, 6);
    const siecle = futur ? 2000 : (a > (new Date().getFullYear() % 100) ? 1900 : 2000);
    a += siecle;
    return O.dateValide(j, m, a);
  }
  function noms(s) { return s.split('<').filter(Boolean).map((x) => x.trim()).filter((x) => x.length > 1); }

  function lireMrz(texte) {
    const lignes = texte.split(/\n/).map(nettoyerMrz).filter((l) => l.length >= 25 && (l.match(/</g) || []).length >= 2);
    const res = {};
    for (let i = 0; i < lignes.length; i++) {
      const l = lignes[i];
      let m;
      // Passeport (TD3), ligne 1 : P<FRANOM<<PRENOM<PRENOM2
      if ((m = /^P[A-Z<]([A-Z]{3})([A-Z]+(?:<[A-Z]+)*)<<([A-Z]+(?:<[A-Z]+)*)/.exec(l))) {
        res.nom = noms(m[2]).join(' '); res.prenoms = noms(m[3]); res.mrz = 'passeport';
        const l2 = lignes[i + 1];
        if (l2 && l2.length >= 27) { res.sexe = /[MF]/.test(l2[20]) ? l2[20] : res.sexe; res.expiration = aaMMjj(l2.slice(21, 27), true) || res.expiration; }
        continue;
      }
      // Ancienne CNI, ligne 1 : IDFRANOM<<<<<<...
      if ((m = /^IDFRA([A-Z]+(?:<[A-Z]+)*)</.exec(l))) {
        res.nom = noms(m[1]).join(' '); res.mrz = 'cni';
        const l2 = lignes[i + 1];
        if (l2) {
          const m2 = /^[A-Z0-9<]{12,13}\d?([A-Z]+(?:<{1,2}[A-Z]+)*)<*(\d{6})\d([MF])/.exec(l2);
          if (m2) { res.prenoms = m2[1].split(/<<|</).filter(Boolean); res.sexe = m2[3]; }
        }
        continue;
      }
      // CNI récente (TD1) : ligne 2 dates, ligne 3 NOM<<PRENOMS
      if ((m = /^(\d{6})\d([MF<])(\d{6})\d[A-Z]{3}/.exec(l))) {
        if (m[2] !== '<') res.sexe = m[2];
        res.expiration = aaMMjj(m[3], true) || res.expiration;
        const l3 = lignes[i + 1];
        const m3 = l3 && /^([A-Z]+(?:<[A-Z]+)*)<<([A-Z]+(?:<[A-Z]+)*)/.exec(l3);
        if (m3) { res.nom = noms(m3[1]).join(' '); res.prenoms = noms(m3[2]); res.mrz = res.mrz || 'td1'; }
        continue;
      }
    }
    return res.nom && res.prenoms && res.prenoms.length ? res : null;
  }

  function lireChampsIdentite(texte) {
    const res = {};
    const lignes = texte.split('\n');
    const L = R().libelles;
    const reNom = new RegExp('^\\s*(?:' + L.nom.map((x) => O.echapper(O.norm(x))).join('|') + ')(?:\\s*/\\s*[a-z]+)?\\s*[:.]?\\s*(.*)$');
    const rePre = new RegExp('^\\s*(?:' + L.prenom.map((x) => O.echapper(O.norm(x)).replace(/\\\(s\\\)/, '\\(s\\)')).join('|') + ')(?:\\s*/\\s*[a-z ]+)?\\s*[:.]?\\s*(.*)$');
    for (let i = 0; i < lignes.length; i++) {
      const brut = lignes[i]; const n = O.norm(brut);
      let m;
      if (!res.nom && (m = reNom.exec(n))) {
        const val = (m[1] || '').trim() ? brut.slice(brut.length - m[1].length) : (lignes[i + 1] || '');
        const v = val.replace(/[^A-Za-zÀ-ÿ' -]/g, ' ').trim();
        if (/^[A-ZÀ-Ü][A-ZÀ-Ü' -]{1,40}$/.test(v)) res.nom = v.replace(/\s+/g, ' ');
      }
      if (!res.prenoms && (m = rePre.exec(n))) {
        const val = (m[1] || '').trim() ? brut.slice(brut.length - m[1].length) : (lignes[i + 1] || '');
        const v = val.replace(/[^A-Za-zÀ-ÿ' ,-]/g, ' ').trim();
        if (v.length >= 2) res.prenoms = v.split(/[ ,]+/).filter((x) => x.length > 1);
      }
      if (!res.sexe && (m = /^\s*sexe(?:\s*\/\s*sex)?\s*[:.]?\s*([mf])\b/.exec(n))) res.sexe = m[1].toUpperCase();
    }
    // Date d'expiration
    const n = O.norm(texte);
    for (const lib of L.expiration) {
      const i = n.indexOf(O.norm(lib));
      if (i >= 0) { const d = O.premiereDate(n.slice(i, i + 60)); if (d) { res.expiration = d; break; } }
    }
    return res;
  }

  function identite(texte) {
    const mrz = lireMrz(texte);
    const champs = lireChampsIdentite(texte);
    if (mrz) {
      return { nom: mrz.nom, prenom: mrz.prenoms[0], sexe: mrz.sexe || champs.sexe || null, expiration: mrz.expiration || champs.expiration || null, source: 'mrz' };
    }
    if (champs.nom && champs.prenoms && champs.prenoms.length) {
      return { nom: champs.nom, prenom: champs.prenoms[0], sexe: champs.sexe || null, expiration: champs.expiration || null, source: 'champs' };
    }
    return champs.expiration ? { expiration: champs.expiration } : null;
  }

  // ---------- Noms de personnes cités ----------
  const MAJ = "A-ZÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŸ";
  const MIN = "a-zàâäçéèêëîïôöùûüÿ";
  function candidatsNoms(texte) {
    const civ = '(M\\.|Mr\\.?|MR|Mme|MME|Mlle|Monsieur|MONSIEUR|Madame|MADAME|Mrs\\.?|Ms\\.?)';
    const NOM = `([${MAJ}][${MAJ}'\\-]{1,}(?:[ ][${MAJ}][${MAJ}'\\-]{1,})?)`;
    const PRE = `([${MAJ}][${MIN}]+(?:-[${MAJ}][${MIN}]+)?)`;
    const res = [];
    const reA = new RegExp(civ + '\\s+' + NOM + '\\s+' + PRE, 'g');
    const reB = new RegExp(civ + '\\s+' + PRE + '\\s+' + NOM + '(?![' + MIN + '])', 'g');
    let m;
    const sexeDe = (c) => /^(mme|mlle|madame|mrs|ms)/i.test(c) ? 'F' : 'M';
    while ((m = reA.exec(texte))) res.push({ nom: m[2], prenom: m[3], sexe: sexeDe(m[1]), index: m.index });
    while ((m = reB.exec(texte))) res.push({ nom: m[3], prenom: m[2], sexe: sexeDe(m[1]), index: m.index });
    // « Nom : X » « Prénom : Y » sur des lignes voisines
    const ch = lireChampsIdentite(texte);
    if (ch.nom && ch.prenoms && ch.prenoms.length) res.push({ nom: ch.nom, prenom: ch.prenoms[0], sexe: ch.sexe || null, index: 0 });
    return res.filter((c) => !/^(ET|OU|LE|LA|LES|DE|DU|DES|SAS|SARL|SCI|EURL|SA)$/.test(c.nom.split(' ')[0]));
  }

  // ---------- Entités (SCI, sociétés) ----------
  const ARRET = /\b(AU|CAPITAL|SIEGE|SIÈGE|RCS|IMMATRICUL\w*|SOCIETE|SOCIÉTÉ|DONT|REPRESENT\w*|REPRÉSENT\w*|DOMICILI\w*|SISE?|N°|NUMERO|NUMÉRO|SIRET|SIREN|TITULAIRE|COMPTE|EN|ET|PAR|POUR)\b.*$/;
  function nettoyerNomEntite(s) {
    let v = s.replace(/[«»"“”]/g, ' ').replace(/\s+/g, ' ').trim();
    v = v.replace(ARRET, '').trim();
    v = v.replace(/[,.;:\-]+$/, '').trim();
    return v.split(' ').slice(0, 5).join(' ');
  }

  function formeCourte(texteForme) {
    const n = O.norm(texteForme);
    const ab = R().formes.abreviations;
    const cles = Object.keys(ab).sort((a, b) => b.length - a.length);
    for (const k of cles) if (n.includes(O.norm(k))) return ab[k];
    const m = /\b(sasu|sas|sarl|eurl|selarl|selas|snc|sci|scm|scp|sa)\b/.exec(n);
    return m ? m[1].toUpperCase() : null;
  }

  function entites(texte) {
    const res = [];
    let m;
    const lignes = texte.split('\n');
    const L = R().libelles;
    // Dénomination et forme juridique en libellés
    let denom = null, forme = null;
    const reDen = new RegExp('^\\s*(?:' + L.denomination.map((x) => O.echapper(O.norm(x))).join('|') + ')\\s*[:.]\\s*(.+)$');
    const reForme = new RegExp('^\\s*(?:' + L.formeJuridique.map((x) => O.echapper(O.norm(x))).join('|') + ')\\s*[:.]\\s*(.+)$');
    for (const brut of lignes) {
      const n = O.norm(brut);
      if (!denom && (m = reDen.exec(n))) denom = nettoyerNomEntite(brut.slice(brut.length - m[1].length).toUpperCase());
      if (!forme && (m = reForme.exec(n))) forme = formeCourte(m[1]);
    }
    if (denom) {
      let f = forme || formeCourte(denom);
      let nom = denom.replace(/^(SCI|SAS|SASU|SARL|EURL|SELARL|SA)\s+/, '').replace(/\s+(SCI|SAS|SASU|SARL|EURL|SELARL|SA)$/, '').trim();
      if (nom.length >= 2) res.push({ coeur: nom, forme: f, source: 'libelle' });
    }
    // « SCI LES TILLEULS », « Société civile immobilière LES TILLEULS »
    const reSci = new RegExp('(?:\\bS\\.?C\\.?I\\.?|Soci[ée]t[ée] civile immobili[èe]re)\\s+(?:d[ée]nomm[ée]e\\s+)?[«"]?\\s*([' + MAJ + '0-9][' + MAJ + MIN + "0-9'’ \\-]{2,50})", 'g');
    while ((m = reSci.exec(texte))) {
      const brut = m[1].split('\n')[0];
      // on garde les mots en majuscules, ou le nom entre guillemets
      let v = nettoyerNomEntite(brut.toUpperCase() === brut ? brut : (brut.match(new RegExp('^([' + MAJ + '][' + MAJ + MIN + "0-9'’\\-]*(?:\\s+[" + MAJ + '][' + MAJ + MIN + "0-9'’\\-]*){0,3})")) || [''])[0]);
      v = v.toUpperCase();
      if (v.length >= 2 && !/^(AU|DE|DU|LA|LE)$/.test(v)) res.push({ coeur: v, forme: 'SCI', source: 'motif' });
    }
    // « BENHAMOU CONSEIL SAS » ou « SAS BENHAMOU CONSEIL »
    const reApres = new RegExp('\\b([' + MAJ + '][' + MAJ + "0-9&'’\\-]+(?:\\s[" + MAJ + '][' + MAJ + "0-9&'’\\-]+){0,3})\\s+(SASU|SAS|SARL|EURL|SELARL)\\b", 'g');
    while ((m = reApres.exec(texte))) {
      const v = nettoyerNomEntite(m[1]);
      if (v.length >= 2 && !/^(SCI|FORME|STATUTS)$/.test(v)) res.push({ coeur: v, forme: m[2], source: 'motif' });
    }
    const reAvant = new RegExp('\\b(SASU|SAS|SARL|EURL|SELARL)\\s+([' + MAJ + '][' + MAJ + "0-9&'’\\-]+(?:\\s[" + MAJ + '][' + MAJ + "0-9&'’\\-]+){0,3})", 'g');
    while ((m = reAvant.exec(texte))) {
      const v = nettoyerNomEntite(m[2]);
      if (v.length >= 2) res.push({ coeur: v, forme: m[1], source: 'motif' });
    }
    return res.map((e) => ({ ...e, sci: e.forme === 'SCI' }));
  }

  // ---------- Adresses ----------
  const VOIES = "rue|avenue|av\\.?|boulevard|bd|allée|allee|chemin|place|impasse|quai|cours|route|square|passage|villa|résidence|residence|cité|cite|sentier|promenade|mail";
  function adresses(texte) {
    const res = [];
    const re = new RegExp("(\\d{1,4}(?:\\s?(?:bis|ter|b))?),?\\s+(" + VOIES + ")\\s+([^\\n,;\\d]{2,45}?)\\s*(?:,\\s*|\\n\\s*|\\s+)(\\d{5})\\s+([A-Za-zÀ-ÿ'’\\- ]{2,40})", 'gi');
    let m;
    while ((m = re.exec(texte))) {
      const num = m[1].replace(/\s+/g, '');
      const voie = m[2].toLowerCase().replace(/^av\.?$/, 'avenue').replace(/^bd$/, 'boulevard').replace('allee', 'allée');
      const libelle = m[3].trim().replace(/\s+/g, ' ');
      const cp = m[4];
      let ville = m[5].trim().split(/\s{2,}|\s(?:cedex|france)\b/i)[0].trim();
      ville = ville.split(' ').slice(0, 4).join(' ');
      ville = ville.replace(/\s+(?:le|du|au|et|tel|tél)$/i, '');
      const cle = O.norm(num + ' ' + voie + ' ' + libelle).replace(/[^a-z0-9]/g, '') + cp;
      let villeAff = O.casseAdresse(ville);
      if (/^750\d\d$/.test(cp) && /paris/i.test(ville)) villeAff = 'Paris ' + (+cp.slice(3)) + (cp.slice(3) === '01' ? 'er' : 'e');
      const affichage = O.casseAdresse(num + ' ' + voie + ' ' + libelle) + ', ' + villeAff;
      res.push({ cle, affichage, cp, ville: villeAff, index: m.index });
    }
    return res.concat(adressesEtrangeres(texte).filter((e) => !res.some((f) => Math.abs(f.index - e.index) < 20)));
  }

  // Adresses étrangères : Royaume-Uni (code postal type W11 3BU), États-Unis (NY 10001),
  // et forme internationale « rue, code postal ville, pays » quand le pays est cité
  function adressesEtrangeres(texte) {
    const res = [];
    const ajouter = (rue, ville, cp, index, pays) => {
      rue = rue.replace(/\s+/g, ' ').trim(); ville = ville.replace(/\s+/g, ' ').trim();
      const cle = O.norm(rue).replace(/[^a-z0-9]/g, '') + O.norm(cp || ville).replace(/[^a-z0-9]/g, '');
      if (res.some((r) => r.cle === cle)) return;
      res.push({ cle, affichage: rue + ', ' + ville, cp: cp || '', ville, index, etranger: true, pays: pays || null });
    };
    const VOIES_EN = 'Road|Rd|Street|St|Avenue|Ave|Lane|Ln|Drive|Dr|Place|Pl|Square|Sq|Gardens|Close|Way|Terrace|Court|Ct|Crescent|Hill|Row|Mews|Park|Grove|Walk|Boulevard|Blvd';
    let m;
    const reUk = new RegExp("(\\d{1,4}[A-Za-z]?,?\\s+(?:[A-Z][A-Za-z'.\\-]*\\s+){0,4}(?:" + VOIES_EN + "))\\b\\.?[,\\s]+([A-Z][A-Za-z .'\\-]{1,30}?)[,\\s]+([A-Z]{1,2}\\d[A-Z\\d]?\\s?\\d[A-Z]{2})\\b", 'g');
    while ((m = reUk.exec(texte))) ajouter(m[1], m[2], m[3], m.index, 'Royaume-Uni');
    const reUs = new RegExp("(\\d{1,5}\\s+(?:[A-Za-z0-9.'\\-]+\\s+){0,4}(?:" + VOIES_EN + "))\\b\\.?,\\s*([A-Za-z .'\\-]{2,30}),\\s*([A-Z]{2})\\s+(\\d{5})(?:-\\d{4})?", 'g');
    while ((m = reUs.exec(texte))) ajouter(m[1], m[2], m[3] + ' ' + m[4], m.index, 'États-Unis');
    const pays = R().paysEtrangers.map(O.echapper).join('|');
    const reInt = new RegExp("([^\\n,;:]{0,50}\\d[^\\n,;:]{0,50}),\\s*(?:([A-Z]{0,2}-?\\d{3,6}[A-Z]{0,2})\\s+)?([A-Za-zÀ-ÿ .'\\-]{2,40}),\\s*(" + pays + ")\\b", 'gi');
    while ((m = reInt.exec(texte))) {
      const rue = m[1].replace(/^.*?(?=\\d{1,5}\\s|[A-Za-zÀ-ÿ]+\\s+[^\\n]*\\d)/, '');
      if (!/[A-Za-zÀ-ÿ]{3,}/.test(rue) || /^\\s*\\d+\\s*$/.test(rue)) continue;
      ajouter(rue, m[3], m[2] || '', m.index, m[4]);
    }
    return res;
  }

  function adresseEtrangere(norm) {
    return R().paysEtrangers.some((p) => O.reMot(O.norm(p)).test(norm));
  }

  // ---------- Champs lus par libellé ----------
  function champ(texte, libelles) {
    const lignes = texte.split('\n');
    const re = new RegExp('^\\s*(?:' + libelles.map((x) => O.echapper(O.norm(x))).join('|') + ')\\s*[:.]\\s*(.+)$');
    for (let i = 0; i < lignes.length; i++) {
      const n = O.norm(lignes[i]);
      const m = re.exec(n);
      if (m) {
        const v = lignes[i].slice(lignes[i].length - m[1].length).trim();
        if (v.length >= 2) return v;
      }
    }
    return null;
  }

  function employeur(texte) {
    let v = champ(texte, R().libelles.employeur);
    if (!v) {
      const m = /entre (?:la soci[ée]t[ée]|l'entreprise)\s+([A-ZÀ-Ü][A-Za-zÀ-ÿ0-9&' \-]{2,50}?)(?:,|\s+(?:dont|au capital|sise|situ))/i.exec(texte);
      if (m) v = m[1];
    }
    if (!v) return null;
    v = v.replace(/\s{2,}.*/, '').replace(/[,;].*$/, '').trim();
    return v.length >= 2 && v.length <= 60 ? v : null;
  }

  // ---------- Analyse complète d'un fichier ----------
  function analyser(item, ex) {
    const regles = R().reconnaissance;
    const nomNorm = O.norm(item.nom.replace(/\.[^.]+$/, '')).replace(/[_\-.]+/g, ' ');
    const pagesN = ex.normPages;
    const premier = pagesN.length > 1 ? pagesN[0] : ex.norm.slice(0, regles.premierePartie);
    const reste = pagesN.length > 1 ? pagesN.slice(1).join('\n') : ex.norm.slice(regles.premierePartie);
    const classement = classer(premier, reste, nomNorm);
    const [b1, b2] = classement;
    const a = { scores: classement.slice(0, 4).map((c) => ({ id: c.t.id, s: Math.round(c.s * 10) / 10 })) };

    if (!b1 || b1.s < regles.seuil) {
      a.type = null;
      a.raison = 'Pièce non reconnue';
    } else if (b2 && b2.s >= regles.seuil && b2.s >= b1.s * regles.ambiguite && !compatibles(b1.t.famille, b2.t.famille)) {
      a.type = null;
      a.raison = 'Pièce ambiguë : ' + b1.t.libelle.toLowerCase() + ' ou ' + b2.t.libelle.toLowerCase();
    } else {
      a.type = b1.t.id;
      a.score = b1.s;
    }

    // Plusieurs documents dans un seul fichier
    a.pages = pagesN.length;
    if (a.type && pagesN.length > 1) {
      const t1 = type(a.type);
      const pagesTypes = pagesN.map((p) => {
        const c = classer(p, '', '')[0];
        return c && c.s >= regles.seuilPage ? c.t : null;
      });
      a.pagesTypes = pagesTypes.map((t) => (t ? t.id : null));
      if (!t1.conteneur) {
        const autres = pagesTypes.filter((t) => t && !compatibles(t.famille, t1.famille));
        if (autres.length) {
          // Nature de chaque document trouvé, dans l'ordre des pages, avec le nombre si un type revient
          const cpt = new Map();
          for (const t of pagesTypes) if (t) cpt.set(t.libelle, (cpt.get(t.libelle) || 0) + 1);
          const natures = [...cpt].map(([lib, n]) => (n > 1 ? n + ' ' + O.pluriel(O.minuscule(lib)) : O.minuscule(lib)));
          a.multi = 'Plusieurs documents dans un seul fichier : ' + O.enumerer(natures);
        }
      }
      if (!a.multi && t1.mensuel) {
        const mois = new Set();
        pagesN.forEach((p, i) => {
          if (a.pagesTypes[i] !== t1.id) return;
          const d = dateDocument(t1, { norm: p });
          if (d) mois.add(d.texte);
        });
        if (mois.size > 1) a.multi = 'Plusieurs documents dans un seul fichier : ' + mois.size + ' ' + O.pluriel(O.minuscule(t1.libelle)) + ' (' + O.enumerer([...mois].sort()) + ')';
      }
    }

    const t = a.type ? type(a.type) : null;
    if (t) {
      a.date = dateDocument(t, ex);
      if (t.identite) a.identite = identite(ex.texte);
      if (t.id === 'bulletin_salaire' || t.id === 'contrat_travail' || t.id === 'avenant' || t.id === 'fin_periode_essai') a.employeur = employeur(ex.texte);
    }
    a.candidats = candidatsNoms(ex.texte);
    a.entites = entites(ex.texte);
    a.adresses = adresses(ex.texte);
    a.etranger = adresseEtrangere(ex.norm);
    a.image = !!ex.image;
    a.confianceOcr = ex.confiance;
    return a;
  }

  TP.reconnaissance = { analyser, type, types, dateDocument, adresses, identite, entites, candidatsNoms, formeCourte, compatibles };
})();
