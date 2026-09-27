/* Inventaire des fichiers déposés et extraction du texte (PDF, images, OCR, Word, Excel, ZIP). */
(function () {
  'use strict';
  const TP = (window.TP = window.TP || {});
  const O = TP.outils;
  const R = () => window.REGLES;

  const IMAGES = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'];
  const HEIC = ['heic', 'heif'];
  const TIFF = ['tif', 'tiff'];
  const TABLEURS = ['xlsx', 'xls', 'xlsm', 'ods', 'csv'];

  // ---------- Inventaire ----------
  // entrees : [{ fichier: File, chemin: 'dossier/sous/nom.pdf' }]
  async function inventaire(entrees) {
    const items = [];
    const ignores = [];
    const systeme = R().fichiersSysteme.map(O.compilerMot);
    const estSysteme = (chemin) => systeme.some((t) => t(O.norm(chemin)));

    async function ajouter(nomAffiche, chemin, octets, profondeur) {
      if (estSysteme(chemin)) { ignores.push(nomAffiche); return; }
      const ext = O.extension(chemin);
      if (ext === 'zip' && profondeur < 8) {
        let zip = null, erreur = null;
        try {
          zip = await JSZip.loadAsync(octets);
        } catch (e) {
          erreur = /encrypt/i.test(String(e && e.message)) ? 'ZIP protégé par mot de passe' : 'ZIP corrompu ou illisible';
        }
        if (zip) {
          const fichiers = Object.values(zip.files).filter((f) => !f.dir);
          if (!fichiers.length) erreur = 'ZIP vide';
          // Lecture complète d'abord : si une entrée est illisible, le ZIP entier part dans « À vérifier »
          const contenus = [];
          for (const f of fichiers) {
            try { contenus.push([f.name, await f.async('uint8array')]); } catch (e) { erreur = 'ZIP protégé par mot de passe ou endommagé'; break; }
          }
          if (!erreur) {
            for (const [nom, contenu] of contenus) await ajouter(nomAffiche + ' / ' + nom, nom, contenu, profondeur + 1);
            return;
          }
        }
        items.push(creerItem(nomAffiche, chemin, octets, erreur));
        return;
      }
      items.push(creerItem(nomAffiche, chemin, octets, null));
    }

    for (const e of entrees) {
      const octets = new Uint8Array(await e.fichier.arrayBuffer());
      await ajouter(e.chemin, e.chemin, octets, 0);
    }
    return { items, ignores };
  }

  let compteur = 0;
  function creerItem(nomAffiche, chemin, octets, erreur) {
    return {
      id: 'f' + (++compteur),
      origine: nomAffiche,            // chemin affiché (dossier, ZIP / fichier)
      nom: O.baseNom(chemin),         // nom d'origine
      ext: O.extension(chemin),
      octets,
      taille: octets.length,
      erreurInventaire: erreur
    };
  }

  // ---------- OCR ----------
  let planificateur = null;
  let initOcr = null;

  function blobScript(src) {
    return URL.createObjectURL(new Blob([src], { type: 'application/javascript' }));
  }

  async function obtenirOcr() {
    if (planificateur) return planificateur;
    if (!initOcr) {
      initOcr = (async () => {
        const langues = R().reconnaissance.ocrLangues.split('+').map((code) => ({
          code, data: O.base64VersOctets(window['TESS_LANG_' + code.toUpperCase()])
        }));
        // Le cœur WebAssembly est concaténé au script du worker : aucun chargement de fichier depuis le worker (file://)
        const workerURL = blobScript(window.TESS_CORE_SRC + '\n;' + window.TESS_WORKER_SRC);
        const nb = Math.max(1, Math.min(4, Math.floor((navigator.hardwareConcurrency || 4) / 2)));
        const sch = Tesseract.createScheduler();
        for (let i = 0; i < nb; i++) {
          const w = await Tesseract.createWorker(langues, 1, {
            workerPath: workerURL, workerBlobURL: false, corePath: 'embarque.js', cacheMethod: 'none'
          });
          // Analyse automatique de la mise en page (le mode par défaut, bloc unique, perd les encadrés)
          await w.setParameters({ tessedit_pageseg_mode: '3' });
          sch.addWorker(w);
        }
        planificateur = sch;
        return sch;
      })();
    }
    return initOcr;
  }

  // Niveaux de gris et étirement du contraste
  function ameliorer(canvas) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = img.data;
    const hist = new Uint32Array(256);
    for (let i = 0; i < d.length; i += 4) {
      const g = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000 | 0;
      d[i] = g; hist[g]++;
    }
    const total = d.length / 4;
    // Bas : pixels les plus sombres (le texte peut n'occuper qu'une infime partie d'une page presque vide).
    // Haut : médiane, c'est-à-dire le fond, qui devient blanc (le grain du scan disparaît).
    let bas = 0, haut = 255, cumul = 0;
    for (let v = 0; v < 256; v++) { cumul += hist[v]; if (cumul > total * 0.001) { bas = v; break; } }
    cumul = 0;
    for (let v = 0; v < 256; v++) { cumul += hist[v]; if (cumul > total * 0.5) { haut = v; break; } }
    if (haut - bas < 40) { bas = Math.max(0, haut - 120); }
    const ecart = Math.max(1, haut - bas);
    for (let i = 0; i < d.length; i += 4) {
      let g = ((d[i] - bas) * 255 / ecart) | 0;
      g = g < 0 ? 0 : g > 255 ? 255 : g;
      d[i] = d[i + 1] = d[i + 2] = g;
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }

  // Mise à l'échelle : côté long entre 1600 et 3000 pixels
  function versCanvas(source, largeur, hauteur) {
    const long = Math.max(largeur, hauteur);
    let echelle = 1;
    if (long < 1600) echelle = Math.min(3, 1600 / long);
    if (long > 3000) echelle = 3000 / long;
    const c = document.createElement('canvas');
    c.width = Math.round(largeur * echelle);
    c.height = Math.round(hauteur * echelle);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(source, 0, 0, c.width, c.height);
    return c;
  }

  function tourner(canvas, quarts) {
    const c = document.createElement('canvas');
    const droit = quarts % 2 === 1;
    c.width = droit ? canvas.height : canvas.width;
    c.height = droit ? canvas.width : canvas.height;
    const ctx = c.getContext('2d');
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate(quarts * Math.PI / 2);
    ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
    return c;
  }

  // Redressement : on cherche l'angle (quart de tour compris) qui aligne le mieux les lignes de texte.
  // Score = dispersion des pixels sombres projetés sur les lignes : maximale quand les lignes sont horizontales.
  function estimerRedressement(canvas) {
    const l = 700;
    const e = Math.min(1, l / Math.max(canvas.width, canvas.height));
    const w = Math.max(1, Math.round(canvas.width * e)), h = Math.max(1, Math.round(canvas.height * e));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(canvas, 0, 0, w, h);
    const d = x.getImageData(0, 0, w, h).data;
    const g = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) g[i] = (d[i * 4] * 299 + d[i * 4 + 1] * 587 + d[i * 4 + 2] * 114) / 1000;
    // Encre = pixel nettement plus sombre que la moyenne de son voisinage (les grands aplats, comme une table, sont ignorés)
    const I = new Float64Array((w + 1) * (h + 1));
    for (let yy = 0; yy < h; yy++) { let ligne = 0; for (let xx = 0; xx < w; xx++) { ligne += g[yy * w + xx]; I[(yy + 1) * (w + 1) + xx + 1] = I[yy * (w + 1) + xx + 1] + ligne; } }
    const r = 7;
    const encre = new Uint8Array(w * h);
    for (let yy = 0; yy < h; yy++) {
      const y0 = Math.max(0, yy - r), y1 = Math.min(h, yy + r + 1);
      for (let xx = 0; xx < w; xx++) {
        const x0 = Math.max(0, xx - r), x1 = Math.min(w, xx + r + 1);
        const moy = (I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0]) / ((x1 - x0) * (y1 - y0));
        if (g[yy * w + xx] < moy - 30) encre[yy * w + xx] = 1;
      }
    }
    // Les longs traits continus (bords de feuille, cadres, tableaux) sont écartés : seules les lettres comptent
    const long = 18;
    const garder = encre.slice();
    for (let yy = 0; yy < h; yy++) {
      let debut = -1;
      for (let xx = 0; xx <= w; xx++) {
        const v = xx < w && encre[yy * w + xx];
        if (v && debut < 0) debut = xx;
        if (!v && debut >= 0) { if (xx - debut > long) for (let k = debut; k < xx; k++) garder[yy * w + k] = 0; debut = -1; }
      }
    }
    for (let xx = 0; xx < w; xx++) {
      let debut = -1;
      for (let yy = 0; yy <= h; yy++) {
        const v = yy < h && encre[yy * w + xx];
        if (v && debut < 0) debut = yy;
        if (!v && debut >= 0) { if (yy - debut > long) for (let k = debut; k < yy; k++) garder[k * w + xx] = 0; debut = -1; }
      }
    }
    const px = [], py = [];
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) if (garder[yy * w + xx]) { px.push(xx - w / 2); py.push(yy - h / 2); }
    if (px.length < 200) return { quart: 0, angle: 0 };
    // Échantillonnage pour rester rapide
    const pas = Math.max(1, Math.floor(px.length / 40000));
    const diag = Math.ceil(Math.hypot(w, h));
    const score = (a) => {
      const cos = Math.cos(a), sin = Math.sin(a);
      const bins = new Float64Array(diag * 2 + 2);
      for (let i = 0; i < px.length; i += pas) bins[Math.round(-px[i] * sin + py[i] * cos) + diag]++;
      let s2 = 0; for (const b of bins) s2 += b * b;
      return s2;
    };
    const parBase = [0, 90].map((base) => {
      let m = { s: -1, base };
      for (let deg = -15; deg <= 15; deg += 1) { const v = score((base + deg) * Math.PI / 180); if (v > m.s) m = { s: v, base, deg }; }
      return m;
    });
    // Quart de tour seulement si les lignes verticales l'emportent nettement (les cadres et tableaux ont aussi des traits verticaux)
    let meilleur = parBase[1].s > parBase[0].s * 1.3 ? parBase[1] : parBase[0];
    for (let deg = meilleur.deg - 1; deg <= meilleur.deg + 1; deg += 0.2) {
      const v = score((meilleur.base + deg) * Math.PI / 180); if (v > meilleur.s) meilleur = { s: v, base: meilleur.base, deg };
    }
    return { quart: meilleur.base === 90 ? 1 : 0, angle: meilleur.deg };
  }

  function redresser(canvas) {
    const r = estimerRedressement(canvas);
    if (!r.quart && Math.abs(r.angle) < 0.4) return canvas;
    const a = r.quart * Math.PI / 2 + r.angle * Math.PI / 180;
    const cos = Math.abs(Math.cos(a)), sin = Math.abs(Math.sin(a));
    const c = document.createElement('canvas');
    c.width = Math.round(canvas.width * cos + canvas.height * sin);
    c.height = Math.round(canvas.width * sin + canvas.height * cos);
    const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
    x.translate(c.width / 2, c.height / 2);
    x.rotate(-a);
    x.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
    return c;
  }

  function utile(t) { return (t.match(/[A-Za-zÀ-ÿ0-9]/g) || []).length; }
  function motsReels(t) { return (t.match(/[A-Za-zÀ-ÿ]{3,}/g) || []).length; }

  // OCR d'un canvas, avec essai des rotations si la lecture est mauvaise
  async function ocrCanvas(canvas) {
    const sch = await obtenirOcr();
    canvas = redresser(canvas);
    const brut = document.createElement('canvas');
    brut.width = canvas.width; brut.height = canvas.height;
    brut.getContext('2d').drawImage(canvas, 0, 0);
    ameliorer(canvas);
    const lire = async (c) => {
      const r = await sch.addJob('recognize', c);
      return { texte: r.data.text || '', confiance: r.data.confidence || 0 };
    };
    const note = (r) => r.confiance * Math.min(motsReels(r.texte), 60);
    let meilleur = await lire(canvas);
    meilleur.rotation = 0;
    if (meilleur.confiance < 60 || motsReels(meilleur.texte) < 12) {
      // Deuxième essai sur l'image non retouchée
      const r = await lire(brut);
      r.rotation = 0;
      if (note(r) > note(meilleur)) { meilleur = r; canvas = brut; }
    }
    if (meilleur.confiance < 60 || motsReels(meilleur.texte) < 12) {
      for (const q of [1, 3, 2]) {
        const r = await lire(tourner(canvas, q));
        r.rotation = q;
        if (note(r) > note(meilleur) * 1.15) meilleur = r;
        if (meilleur.confiance >= 75 && motsReels(meilleur.texte) >= 12) break;
      }
    }
    return meilleur;
  }

  // ---------- Extraction par format ----------
  async function extrairePdf(octets, toutesPages) {
    const regles = R().reconnaissance;
    let doc;
    try {
      doc = await pdfjsLib.getDocument({ data: octets.slice(), isEvalSupported: false, disableFontFace: true, verbosity: 0 }).promise;
    } catch (e) {
      if (e && e.name === 'PasswordException') return { erreur: 'PDF protégé par mot de passe' };
      return { erreur: 'PDF corrompu ou illisible' };
    }
    const pages = [];
    const aOcr = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      let t = '';
      for (const it of tc.items) { t += it.str; t += it.hasEOL ? '\n' : ' '; }
      pages.push({ texte: t, ocr: false });
      if (utile(t) < regles.texteMinimum) aOcr.push(p);
    }
    // Pages scannées : OCR limité aux premières et dernières pages
    let choisies = aOcr;
    let pagesNonLues = 0;
    if (!toutesPages && aOcr.length > regles.ocrPagesMax) {
      const debut = aOcr.slice(0, regles.ocrPagesMax - 2);
      const fin = aOcr.slice(-2);
      choisies = debut.concat(fin);
      pagesNonLues = aOcr.length - choisies.length;
    }
    let confiances = [];
    for (const p of choisies) {
      const page = await doc.getPage(p);
      const v1 = page.getViewport({ scale: 1 });
      const scale = Math.min(3.2, 2200 / Math.max(v1.width, v1.height));
      const vp = page.getViewport({ scale });
      const c = document.createElement('canvas');
      c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      const r = await ocrCanvas(c);
      pages[p - 1] = { texte: r.texte, ocr: true };
      confiances.push(r.confiance);
    }
    await doc.destroy();
    return {
      pages, methode: choisies.length ? (choisies.length === pages.length ? 'ocr' : 'mixte') : 'texte',
      confiance: confiances.length ? confiances.reduce((a, b) => a + b, 0) / confiances.length : null,
      pagesNonLues
    };
  }

  async function bitmapDepuisOctets(octets, type) {
    const blob = new Blob([octets], { type });
    return await createImageBitmap(blob, { imageOrientation: 'from-image' });
  }

  async function extraireImage(octets, ext) {
    let bitmap;
    try {
      if (HEIC.includes(ext)) {
        const jpeg = await heic2any({ blob: new Blob([octets], { type: 'image/heic' }), toType: 'image/jpeg', quality: 0.92 });
        bitmap = await createImageBitmap(Array.isArray(jpeg) ? jpeg[0] : jpeg);
      } else {
        bitmap = await bitmapDepuisOctets(octets, 'image/' + (ext === 'jpg' ? 'jpeg' : ext));
      }
    } catch (e) {
      return { erreur: 'Image corrompue ou illisible' };
    }
    const c = versCanvas(bitmap, bitmap.width, bitmap.height);
    const r = await ocrCanvas(c);
    return { pages: [{ texte: r.texte, ocr: true }], methode: 'ocr', confiance: r.confiance, image: true };
  }

  async function extraireTiff(octets) {
    let ifds;
    try {
      ifds = UTIF.decode(octets.buffer.slice(octets.byteOffset, octets.byteOffset + octets.byteLength));
    } catch (e) { return { erreur: 'Image TIFF corrompue ou illisible' }; }
    const pages = []; const conf = [];
    const max = R().reconnaissance.ocrPagesMax;
    for (const ifd of ifds.slice(0, max)) {
      try {
        UTIF.decodeImage(octets.buffer.slice(octets.byteOffset, octets.byteOffset + octets.byteLength), ifd);
        const rgba = UTIF.toRGBA8(ifd);
        const src = document.createElement('canvas');
        src.width = ifd.width; src.height = ifd.height;
        src.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba.buffer), ifd.width, ifd.height), 0, 0);
        const r = await ocrCanvas(versCanvas(src, src.width, src.height));
        pages.push({ texte: r.texte, ocr: true }); conf.push(r.confiance);
      } catch (e) { /* page illisible */ }
    }
    if (!pages.length) return { erreur: 'Image TIFF corrompue ou illisible' };
    return { pages, methode: 'ocr', confiance: conf.reduce((a, b) => a + b, 0) / conf.length, image: true };
  }

  async function extraireDocx(octets) {
    try {
      const r = await mammoth.extractRawText({ arrayBuffer: octets.buffer.slice(octets.byteOffset, octets.byteOffset + octets.byteLength) });
      return { pages: [{ texte: r.value || '', ocr: false }], methode: 'texte' };
    } catch (e) {
      return { erreur: 'Document Word protégé ou corrompu' };
    }
  }

  async function extraireTableur(octets) {
    try {
      const wb = XLSX.read(octets, { type: 'array' });
      const pages = wb.SheetNames.map((n) => ({ texte: n + '\n' + XLSX.utils.sheet_to_csv(wb.Sheets[n], { FS: ' ; ' }), ocr: false }));
      return { pages, methode: 'texte' };
    } catch (e) {
      if (/password|encrypt/i.test(String(e && e.message))) return { erreur: 'Classeur protégé par mot de passe' };
      return { erreur: 'Classeur corrompu ou illisible' };
    }
  }

  // Ancien Word (.doc) : lecture tentée des suites de caractères lisibles
  function extraireDoc(octets) {
    let texte = '';
    // UTF-16LE
    let courant = '';
    for (let i = 0; i + 1 < octets.length; i += 2) {
      const c = octets[i] | (octets[i + 1] << 8);
      if ((c >= 32 && c < 0x250) || c === 10 || c === 13) courant += String.fromCharCode(c);
      else { if (courant.length > 20) texte += courant + '\n'; courant = ''; }
    }
    // Windows-1252
    let courant8 = ''; let texte8 = '';
    const dec = new TextDecoder('windows-1252');
    for (let i = 0; i < octets.length; i++) {
      const c = octets[i];
      if ((c >= 32 && c < 127) || c >= 0xc0 || c === 10 || c === 13) courant8 += dec.decode(octets.subarray(i, i + 1));
      else { if (courant8.length > 20) texte8 += courant8 + '\n'; courant8 = ''; }
    }
    const t = motsReels(texte) > motsReels(texte8) ? texte : texte8;
    return { pages: [{ texte: t, ocr: false }], methode: 'texte', ancienFormat: true };
  }

  // Point d'entrée : texte d'un item de l'inventaire
  async function extraire(item, toutesPages) {
    if (item.erreurInventaire) return { erreur: item.erreurInventaire };
    if (item.taille === 0) return { erreur: 'Fichier vide' };
    const ext = item.ext;
    let r;
    if (ext === 'pdf') r = await extrairePdf(item.octets, toutesPages);
    else if (IMAGES.includes(ext) || HEIC.includes(ext)) r = await extraireImage(item.octets, ext);
    else if (TIFF.includes(ext)) r = await extraireTiff(item.octets);
    else if (ext === 'docx' || ext === 'docm') r = await extraireDocx(item.octets);
    else if (TABLEURS.includes(ext)) r = await extraireTableur(item.octets);
    else if (ext === 'doc') r = extraireDoc(item.octets);
    else return { erreur: 'Format non géré' + (ext ? ' (.' + ext + ')' : '') };
    if (r.erreur) return r;
    r.texte = r.pages.map((p) => p.texte).join('\n\f\n');
    r.normPages = r.pages.map((p) => O.norm(p.texte));
    r.norm = r.normPages.join('\n\f\n');
    const lisible = utile(r.texte) >= R().reconnaissance.texteMinimum && motsReels(r.texte) >= 3;
    if (!lisible) {
      if (r.ancienFormat) return { erreur: 'Ancien format Word (.doc) non lu' };
      if (r.image || r.methode === 'ocr') return { erreur: 'Texte illisible (photo floue ou scan de mauvaise qualité)' };
      return { erreur: 'Aucun texte lisible' };
    }
    return r;
  }

  TP.extraction = { inventaire, extraire, obtenirOcr, estimerRedressement, redresser };
})();
