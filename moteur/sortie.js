/* Documents générés (Fiche client, Rapport de tri) et ZIP de sortie. */
(function () {
  'use strict';
  const TP = (window.TP = window.TP || {});
  const O = TP.outils;
  const R = () => window.REGLES;

  const C = {
    noir: [0, 0, 0], dore: [176, 141, 99], doreTexte: [125, 93, 56], texte: [42, 37, 34], texte2: [117, 106, 97],
    ligne: [232, 224, 216], ligneFine: [242, 237, 232], beige2: [248, 244, 240], alerte: [164, 80, 47], dateTete: [216, 204, 194]
  };
  const L = 210, H = 297, M = 16;

  function nouveauPdf(titre, date) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    doc.setProperties({ title: titre, creator: 'Trieur de pièces' });
    // En-tête noir, logo, titre et date
    doc.setFillColor(...C.noir); doc.rect(0, 0, L, 30, 'F');
    doc.addImage(window.LOGO_EMERITE, 'JPEG', M - 4, 3.5, 40, 22.5);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(255, 255, 255);
    doc.text(titre, L - M, 14, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...C.dateTete);
    doc.text(date, L - M, 20, { align: 'right' });
    doc.setFillColor(...C.dore); doc.rect(0, 30, L, 1.1, 'F');
    return doc;
  }

  function pied(doc, gauche) {
    doc.setDrawColor(...C.ligne); doc.setLineWidth(0.3); doc.line(0, H - 14, L, H - 14);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...C.texte2);
    if (gauche) doc.text(gauche, M, H - 8);
    doc.text('Page 1 / 1', L - M, H - 8, { align: 'right' });
  }

  function tronquer(doc, t, largeur) {
    t = String(t);
    if (doc.getTextWidth(t) <= largeur) return t;
    while (t.length > 1 && doc.getTextWidth(t + '...') > largeur) t = t.slice(0, -1);
    return t.trimEnd() + '...';
  }

  function titreSection(doc, texte, x, y) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.8); doc.setTextColor(...C.doreTexte);
    doc.setCharSpace(0.25); doc.text(texte.toUpperCase(), x, y); doc.setCharSpace(0);
  }

  function lignesBloc(doc, lignes, x, y, largeur) {
    doc.setFontSize(9);
    for (let i = 0; i < lignes.length; i++) {
      const [lib, val] = lignes[i];
      doc.setFont('helvetica', 'normal'); doc.setTextColor(...C.texte2);
      const libT = tronquer(doc, lib, largeur * 0.55);
      doc.text(libT, x, y);
      const reste = largeur - doc.getTextWidth(libT) - 4;
      doc.setTextColor(...C.texte);
      doc.text(tronquer(doc, val, reste), x + largeur, y, { align: 'right' });
      if (i < lignes.length - 1) { doc.setDrawColor(...C.ligneFine); doc.setLineWidth(0.25); doc.line(x, y + 2.2, x + largeur, y + 2.2); }
      y += 6;
    }
    return y;
  }

  function bloc(doc, x, y, largeur, titre, nom, lignes) {
    const h = 9 + (nom ? 6 : 0) + lignes.length * 6 + 1;
    doc.setDrawColor(...C.ligne); doc.setLineWidth(0.3); doc.roundedRect(x, y, largeur, h, 2, 2, 'S');
    titreSection(doc, titre, x + 4, y + 6);
    let yy = y + 6;
    if (nom) { yy += 6; doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...C.texte); doc.text(tronquer(doc, nom, largeur - 8), x + 4, yy); }
    yy += 6;
    lignesBloc(doc, lignes, x + 4, yy, largeur - 8);
    return h;
  }

  function dateDuJour() { return O.fmtJour(new Date()); }

  function ficheClient(res) {
    const f = res.fiche;
    const doc = nouveauPdf('Fiche client', dateDuJour());
    let y = 44;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(...C.texte);
    doc.text(tronquer(doc, f.titre, L - 2 * M), M, y);
    if (f.sousTitre) {
      y += 6.5; doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...C.texte2);
      doc.text(tronquer(doc, f.sousTitre, L - 2 * M), M, y);
    }
    y += 8;
    const larg = L - 2 * M;
    // Emprunteurs : deux colonnes
    const emp = f.emprunteurs;
    if (emp.length) {
      const col = emp.length > 1 ? (larg - 6) / 2 : larg;
      let hMax = 0;
      emp.slice(0, 2).forEach((e, i) => {
        const h = bloc(doc, M + i * (col + 6), y, col, e.titre, e.nom, e.lignes.slice(0, 6));
        hMax = Math.max(hMax, h);
      });
      y += hMax + 6;
    }
    const max = Math.floor((H - 20 - y - (f.projet.length ? 9 + f.projet.length * 6 + 7 : 0)) / 6) - 3;
    if (f.patrimoine.length) {
      const lignes = f.patrimoine.length > max ? f.patrimoine.slice(0, max - 1).concat([['Autres éléments', (f.patrimoine.length - max + 1) + ' non affichés']]) : f.patrimoine;
      y += bloc(doc, M, y, larg, 'Patrimoine', null, lignes) + 6;
    }
    if (f.projet.length) bloc(doc, M, y, larg, 'Projet', null, f.projet);
    pied(doc, '');
    return doc.output('arraybuffer');
  }

  function rapportTri(res, compte, aVerifier) {
    const doc = nouveauPdf('Rapport de tri', dateDuJour());
    let y = 44;
    const larg = L - 2 * M;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(...C.texte);
    doc.text(tronquer(doc, res.personnes.map((p) => p.affichage).join(' et ') || res.entites.map((e) => e.affichage).join(', ') || 'Dossier', larg), M, y);
    if (res.entites.length && res.personnes.length) {
      y += 6.5; doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...C.texte2);
      doc.text(tronquer(doc, res.entites.map((e) => e.affichage).join(', '), larg), M, y);
    }
    y += 7;
    // Trois compteurs
    const cw = (larg - 2 * 5) / 3;
    [[compte.recus, 'REÇUS', false], [compte.classes, 'CLASSÉS', false], [compte.verifier, 'À VÉRIFIER', true]].forEach(([n, lib, al], i) => {
      const x = M + i * (cw + 5);
      doc.setFillColor(...C.beige2); doc.roundedRect(x, y, cw, 17, 2, 2, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(...(al && n ? C.alerte : C.texte));
      doc.text(String(n), x + 4.5, y + 8.5);
      doc.setFontSize(7); doc.setTextColor(...C.texte2); doc.text(lib, x + 4.5, y + 13.5);
    });
    y += 26;
    // Place disponible, partagée entre les deux listes
    const ligneH = 5.2;
    const dispo = Math.floor((H - 22 - y - 20) / ligneH);
    const miss = res.manquantes;
    let capV = aVerifier.length, capM = miss.length;
    if (capV + capM > dispo) {
      capV = Math.min(aVerifier.length, Math.max(10, dispo - Math.min(miss.length, dispo - 10)));
      capV = Math.min(capV, 10);
      capM = Math.min(miss.length, dispo - capV - 1);
    }
    const liste = (titre, elems, cap, rendu) => {
      titreSection(doc, titre, M, y); y += 5.5;
      doc.setFontSize(9);
      const montres = elems.length > cap ? elems.slice(0, Math.max(0, cap - 1)) : elems;
      for (const e of montres) { rendu(e); y += ligneH; }
      if (elems.length > montres.length) {
        doc.setFont('helvetica', 'normal'); doc.setTextColor(...C.texte2);
        doc.text('et ' + (elems.length - montres.length) + ' autres', M + 3, y); y += ligneH;
      }
      y += 4;
    };
    const puce = () => { doc.setFillColor(...C.texte); doc.circle(M + 0.9, y - 1.1, 0.55, 'F'); };
    if (aVerifier.length) {
      liste('À vérifier', aVerifier, capV, (it) => {
        puce();
        doc.setFont('helvetica', 'normal'); doc.setTextColor(...C.texte);
        const nom = tronquer(doc, it.nom, larg * 0.5);
        doc.text(nom, M + 3, y);
        const w = doc.getTextWidth(nom);
        doc.setTextColor(...C.texte2);
        const r = it.decision.raison;
        const raison = /^[A-ZÀ-Ü][a-zà-ÿ]/.test(r) ? r.charAt(0).toLowerCase() + r.slice(1) : r;
        doc.text(tronquer(doc, ' : ' + raison, larg - 3 - w), M + 3 + w, y);
      });
    }
    if (miss.length) {
      liste('Pièces potentiellement manquantes', miss, capM, (m) => {
        puce();
        doc.setFont('helvetica', 'normal'); doc.setTextColor(...C.texte);
        doc.text(tronquer(doc, m.qui + ' : ' + m.texte, larg - 3), M + 3, y);
      });
    }
    pied(doc, 'Tri automatique, contrôle humain requis');
    return doc.output('arraybuffer');
  }

  // ---------- Contrôle de bouclage ----------
  function bouclage(items) {
    const recus = items.length;
    const classes = items.filter((it) => it.decision && it.decision.statut === 'classe').length;
    const verifier = items.filter((it) => it.decision && it.decision.statut === 'verifier').length;
    const chemins = new Set(items.map((it) => it.decision && it.decision.chemin).filter(Boolean));
    const sansContenu = items.filter((it) => !it.octets).length;
    const ok = recus === classes + verifier && chemins.size === recus && sansContenu === 0;
    return { recus, classes, verifier, ok, ecart: recus - (classes + verifier) };
  }

  // ---------- Arborescence ----------
  function arbre(items) {
    const racine = { nom: '', dossiers: new Map(), fichiers: [] };
    for (const it of items) {
      let n = racine;
      for (const d of it.decision.dossier) {
        if (!n.dossiers.has(d)) n.dossiers.set(d, { nom: d, dossiers: new Map(), fichiers: [] });
        n = n.dossiers.get(d);
      }
      n.fichiers.push(it);
    }
    const ordre = R().ordreDossiers;
    const trier = (n) => {
      const liste = [...n.dossiers.values()].sort((a, b) => {
        const ia = ordre.indexOf(a.nom), ib = ordre.indexOf(b.nom);
        if (ia >= 0 && ib >= 0) return ia - ib;
        if (ia >= 0) return -1; if (ib >= 0) return 1;
        return a.nom.localeCompare(b.nom, 'fr');
      });
      n.enfants = liste; liste.forEach(trier);
      n.fichiers.sort((a, b) => a.decision.fichier.localeCompare(b.decision.fichier, 'fr'));
      n.total = n.fichiers.length + liste.reduce((s, x) => s + x.total, 0);
    };
    trier(racine);
    return racine;
  }

  function nomZip(res) {
    let n = res.personnes.map((p) => p.affichage).join(' et ');
    if (!n) n = res.entites.map((e) => e.affichage).join(' et ');
    if (!n) n = 'Dossier du ' + O.fmtJour(new Date()).replace(/\//g, '-');
    return O.nettoyerNomFichier(n) + '.zip';
  }

  async function zip(items, pdfs) {
    const z = new JSZip();
    const Rg = R().dossiers;
    z.file(Rg.ficheClient, pdfs.fiche);
    z.file(Rg.rapport, pdfs.rapport);
    for (const it of items) z.file(it.decision.chemin, it.octets, { binary: true, date: new Date() });
    return await z.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 3 }, mimeType: 'application/zip' });
  }

  TP.sortie = { ficheClient, rapportTri, bouclage, arbre, nomZip, zip };
})();
