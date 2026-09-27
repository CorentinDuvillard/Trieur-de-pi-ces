/* Enchaînement du tri d'un dossier : inventaire, lecture, reconnaissance, rattachement, sorties. */
(function () {
  'use strict';
  const TP = (window.TP = window.TP || {});

  // dossier : objet d'état partagé avec l'interface. notifier(dossier) est appelé à chaque étape.
  async function traiter(dossier, entrees, notifier) {
    const n = () => { try { notifier(dossier); } catch (e) { console.error(e); } };
    dossier.etat = 'inventaire'; n();
    const inv = await TP.extraction.inventaire(entrees);
    dossier.items = inv.items;
    dossier.ignores = inv.ignores;
    dossier.total = inv.items.length;
    dossier.faits = 0;
    for (const it of dossier.items) {
      it.etat = 'attente';
      try { it.sha = it.octets.length ? await TP.outils.sha256(it.octets) : null; } catch (e) { it.sha = null; }
    }
    dossier.etat = 'lecture'; n();

    // Lecture en parallèle, au rythme des moteurs OCR
    const file = dossier.items.slice();
    const paralleles = Math.max(2, Math.min(4, Math.floor((navigator.hardwareConcurrency || 4) / 2)));
    const travailleur = async () => {
      while (file.length) {
        const it = file.shift();
        it.etat = 'lecture'; n();
        try {
          it.extraction = await TP.extraction.extraire(it);
        } catch (e) {
          console.error(e);
          it.extraction = { erreur: 'Fichier illisible (erreur de lecture)' };
        }
        if (it.extraction && !it.extraction.erreur) {
          try { it.analyse = TP.reconnaissance.analyser(it, it.extraction); } catch (e) {
            console.error(e); it.analyse = { type: null, raison: "Erreur d'analyse", candidats: [], entites: [], adresses: [] };
          }
        }
        it.etat = 'lu';
        dossier.faits++;
        n();
      }
    };
    await Promise.all(Array.from({ length: paralleles }, travailleur));

    // Rattachement et documents
    dossier.etat = 'rattachement'; n();
    let res = TP.rattachement.finaliser(dossier.items);
    // PDF scannés lus en partie : si la pièce n'a pas pu être identifiée, on relit toutes les pages
    const aRelire = dossier.items.filter((it) => it.decision.statut === 'verifier' && !it.doublonDe && it.extraction && it.extraction.pagesNonLues > 0);
    if (aRelire.length) {
      dossier.etat = 'relecture'; n();
      for (const it of aRelire) {
        try {
          it.extraction = await TP.extraction.extraire(it, true);
          it.analyse = it.extraction.erreur ? null : TP.reconnaissance.analyser(it, it.extraction);
        } catch (e) { console.error(e); }
      }
      res = TP.rattachement.finaliser(dossier.items);
    }
    TP.profils.analyserDossier(dossier.items, res);
    dossier.resultat = res;
    dossier.compte = TP.sortie.bouclage(dossier.items);
    dossier.arbre = TP.sortie.arbre(dossier.items);
    const aVerifier = dossier.items.filter((it) => it.decision.statut === 'verifier')
      .sort((x, y) => x.origine.localeCompare(y.origine, 'fr', { numeric: true }));
    dossier.pdfs = { fiche: TP.sortie.ficheClient(res), rapport: TP.sortie.rapportTri(res, dossier.compte, aVerifier) };
    dossier.nomZip = TP.sortie.nomZip(res);
    dossier.nom = res.personnes.map((p) => p.affichage).join(' et ') || res.entites.map((e) => e.affichage).join(', ') || dossier.nom;
    dossier.etat = 'termine';
    dossier.fin = new Date();
    n();
    return dossier;
  }

  TP.moteur = { traiter };
})();
