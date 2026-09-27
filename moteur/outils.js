/* Outils communs du moteur : normalisation du texte, dates, noms, empreintes. */
(function () {
  'use strict';
  const TP = (window.TP = window.TP || {});

  const MOIS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
  const MOIS_EN = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  const MOIS_AFFICHAGE = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

  // Texte sans accents, en minuscules, apostrophes et espaces unifiés
  function norm(s) {
    return String(s || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[œ]/g, 'oe').replace(/[Œ]/g, 'OE').replace(/[æ]/g, 'ae')
      .toLowerCase()
      .replace(/[‘’‚‛′`´]/g, "'")
      .replace(/[“”«»]/g, '"')
      .replace(/[‐-―]/g, '-')
      .replace(/[ \t  ]+/g, ' ')
      .replace(/ *\n */g, '\n');
  }

  // Un mot-clé des règles devient une fonction de recherche
  function compilerMot(mot) {
    if (mot.startsWith('re:')) {
      const re = new RegExp(mot.slice(3), 'i');
      return (t) => re.test(t);
    }
    const m = norm(mot);
    return (t) => t.includes(m);
  }

  function compilerListe(liste) {
    return (liste || []).map(([mot, poids]) => ({ mot, poids, test: compilerMot(mot) }));
  }

  function contientUn(texteNorm, mots) {
    return (mots || []).some((m) => compilerMot(m)(texteNorm));
  }

  // ---------- Dates ----------
  function dateValide(j, m, a) {
    if (a < 1900 || a > 2100 || m < 1 || m > 12 || j < 1 || j > 31) return null;
    const d = new Date(a, m - 1, j);
    return d.getMonth() === m - 1 ? d : null;
  }

  // Toutes les dates trouvées dans un texte normalisé, avec leur position
  function trouverDates(t) {
    const res = [];
    let m;
    const reNum = /\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4}|\d{2})\b/g;
    while ((m = reNum.exec(t))) {
      let a = +m[3];
      if (m[3].length === 2) a += a > 60 ? 1900 : 2000;
      const d = dateValide(+m[1], +m[2], a);
      if (d) res.push({ date: d, index: m.index, precision: 'jour' });
    }
    const noms = MOIS.join('|') + '|' + MOIS_EN.join('|');
    const reTexte = new RegExp('\\b(?:(\\d{1,2})(?:er)? )?(' + noms + ')\\.? (\\d{4})\\b', 'g');
    while ((m = reTexte.exec(t))) {
      let mi = MOIS.indexOf(m[2]);
      if (mi < 0) mi = MOIS_EN.indexOf(m[2]);
      const d = dateValide(m[1] ? +m[1] : 1, mi + 1, +m[3]);
      if (d) res.push({ date: d, index: m.index, precision: m[1] ? 'jour' : 'mois' });
    }
    const reEn = new RegExp('\\b(' + MOIS_EN.join('|') + ') (\\d{1,2}),? (\\d{4})\\b', 'g');
    while ((m = reEn.exec(t))) {
      const d = dateValide(+m[2], MOIS_EN.indexOf(m[1]) + 1, +m[3]);
      if (d) res.push({ date: d, index: m.index, precision: 'jour' });
    }
    const reIso = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
    while ((m = reIso.exec(t))) {
      const d = dateValide(+m[3], +m[2], +m[1]);
      if (d) res.push({ date: d, index: m.index, precision: 'jour' });
    }
    return res.sort((a, b) => a.index - b.index);
  }

  function premiereDate(t) {
    const d = trouverDates(t);
    return d.length ? d[0].date : null;
  }

  function fmtMois(d) { return String(d.getMonth() + 1).padStart(2, '0') + '-' + d.getFullYear(); }
  function fmtJour(d) { return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear(); }
  function moisEntre(a, b) { return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()); }

  // ---------- Noms ----------
  function capitaliser(mot) {
    return mot.toLowerCase().replace(/(^|[\s\-'])([a-zà-ÿ])/g, (x, p, c) => p + c.toUpperCase());
  }
  function nomPrenom(nom, prenom) {
    return (nom.toUpperCase() + ' ' + capitaliser(prenom)).trim();
  }

  // Titre d'adresse : « 12 rue des Lilas, Vincennes »
  const PETITS = ['de', 'des', 'du', 'la', 'le', 'les', 'et', 'sur', 'sous', 'en', 'aux', 'au', "d'", "l'"];
  function casseAdresse(s) {
    return s.toLowerCase().split(/(\s+|-)/).map((w, i) => {
      if (/^\s+$|^-$/.test(w)) return w;
      if (i > 0 && PETITS.includes(w)) return w;
      if (/^(d|l)'/.test(w)) return w.slice(0, 2) + (w.charAt(2) || '').toUpperCase() + w.slice(3);
      if (/^(rue|avenue|boulevard|allee|allée|chemin|place|impasse|quai|cours|route|square|passage|villa|bis|ter|residence|résidence|av\.?|bd)$/.test(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    }).join('');
  }

  function levenshtein(a, b) {
    if (a === b) return 0;
    const m = a.length, n = b.length;
    if (!m) return n; if (!n) return m;
    let prev = new Array(n + 1), cur = new Array(n + 1);
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
      cur[0] = i;
      for (let j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      [prev, cur] = [cur, prev];
    }
    return prev[n];
  }
  function similarite(a, b) {
    const l = Math.max(a.length, b.length);
    return l ? 1 - levenshtein(a, b) / l : 1;
  }

  // Mot entier dans un texte normalisé
  function echapper(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function reMot(mot) { return new RegExp('(^|[^a-z0-9])' + echapper(mot) + '(?=$|[^a-z0-9])', 'g'); }
  function positions(t, mot) {
    const res = []; const re = reMot(mot); let m;
    while ((m = re.exec(t))) { res.push(m.index + m[1].length); if (re.lastIndex === m.index) re.lastIndex++; }
    return res;
  }

  // Nom de fichier sans caractère interdit sous Windows
  function nettoyerNomFichier(s) {
    return String(s).replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').replace(/[. ]+$/, '').trim().slice(0, 180);
  }

  // Libellé en minuscule dans une phrase (les sigles comme PACS ou K-bis restent intacts)
  function minuscule(s) { return /^[A-ZÀ-Ü][a-zà-ÿ' ]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s; }
  // Pluriel d'un libellé : on accorde le premier mot (« bulletins de salaire », « avis d'imposition »)
  function pluriel(s) { return s.replace(/^([^\s']+)/, (m) => (/[sxz]$/i.test(m) ? m : m + 's')); }
  // « A », « A et B », « A, B et C »
  function enumerer(l) { return l.length < 2 ? (l[0] || '') : l.slice(0, -1).join(', ') + ' et ' + l[l.length - 1]; }

  async function sha256(buffer) {
    const h = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  function extension(nom) {
    const m = /\.([a-z0-9]{1,6})$/i.exec(nom);
    return m ? m[1].toLowerCase() : '';
  }
  function baseNom(chemin) { return chemin.split('/').pop(); }

  function base64VersOctets(s) {
    const b = atob(s); const u = new Uint8Array(b.length);
    for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
    return u;
  }

  TP.outils = {
    MOIS, MOIS_AFFICHAGE, norm, compilerMot, compilerListe, contientUn, trouverDates, premiereDate, dateValide,
    fmtMois, fmtJour, moisEntre, capitaliser, nomPrenom, casseAdresse, levenshtein, similarite, reMot, positions, echapper,
    nettoyerNomFichier, sha256, minuscule, pluriel, enumerer, extension, baseNom, base64VersOctets
  };
})();
