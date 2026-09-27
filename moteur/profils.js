/* Profils par personne, situations du dossier, pièces potentiellement manquantes, contenu de la fiche client. */
(function () {
  'use strict';
  const TP = (window.TP = window.TP || {});
  const O = TP.outils;
  const R = () => window.REGLES;

  function classes(items) { return items.filter((it) => it.decision && it.decision.statut === 'classe'); }

  // Une condition « si » des règles est-elle remplie pour ces pièces ?
  function conditionRemplie(c, pieces, ctx) {
    let liste = pieces;
    if (c.types) liste = liste.filter((it) => c.types.includes(it.analyse.type) || c.types.includes(it.decision.typeFinal));
    if (c.destination) liste = liste.filter((it) => it.decision.dossier.join('/').startsWith(c.destination));
    if (c.role) liste = liste.filter((it) => it.decision.role === c.role);
    if (c.mots) liste = liste.filter((it) => O.contientUn(it.extraction.norm, c.mots));
    if (c.entite) return ctx.entites.some((e) => e.genre === c.entite);
    if (c.activite) return ctx.entites.some((e) => e.genre === 'activite');
    if (c.profil) return ctx.profilsTous.has(c.profil);
    return liste.length > 0;
  }

  function piecesDe(items, p) { return classes(items).filter((it) => it.decision.personnes.includes(p)); }

  function detecterProfils(items, res) {
    const regles = R().profils;
    for (const p of res.personnes) {
      const pieces = piecesDe(items, p);
      const ents = res.entites.filter((e) => e.personnes.has(p));
      const ids = new Set();
      for (const pr of regles) {
        if (pr.siAucun) { if (!pr.siAucun.some((id) => ids.has(id))) ids.add(pr.id); continue; }
        const ok = pr.si.some((c) => {
          if (c.entite) return ents.some((e) => e.genre === c.entite);
          if (c.activite) return ents.some((e) => e.genre === 'activite');
          let liste = pieces;
          if (c.role) return pieces.some((it) => it.decision.role === c.role);
          if (c.types) liste = liste.filter((it) => c.types.includes(it.analyse.type));
          if (c.mots) liste = liste.filter((it) => O.contientUn(it.extraction.norm, c.mots));
          return liste.length > 0;
        });
        if (!ok) continue;
        if (pr.defautFamille && regles.some((q) => q.famille === pr.famille && q !== pr && ids.has(q.id))) continue;
        if (pr.famille === 'emploi' && !pr.defautFamille && regles.some((q) => q.famille === 'emploi' && ids.has(q.id))) continue;
        if (pr.precision && !regles.some((q) => q.salarie && ids.has(q.id))) continue;
        ids.add(pr.id);
      }
      // Le profil générique « salarié » sert aux règles des pièces manquantes
      p.profils = regles.filter((pr) => ids.has(pr.id));
      p.profilIds = new Set(ids);
      if (p.profils.some((pr) => pr.salarie)) p.profilIds.add('salarie');
      p.tags = p.profils.map((pr) => (p.sexe === 'F' ? pr.libelle.f : pr.libelle.m));
      // Employeur, société, identité
      const emp = pieces.map((it) => it.analyse.employeur).filter(Boolean);
      p.employeur = emp.length ? mode(emp) : null;
      const soc = ents.filter((e) => e.genre === 'societe');
      p.societes = soc.map((e) => e.affichage);
      p.activites = ents.filter((e) => e.genre === 'activite').map((e) => e.affichage);
      const idt = p.identites.slice().sort((a, b) => (b.expiration || 0) - (a.expiration || 0))[0];
      if (idt) {
        const lib = { cni: 'CNI', passeport: 'Passeport', titre_sejour: 'Titre de séjour' }[idt.type];
        if (idt.expiration) p.identiteTexte = lib + (idt.expiration >= new Date(new Date().toDateString()) ? ' valide' : ' expirée le ' + O.fmtJour(idt.expiration));
        else p.identiteTexte = null;
      }
    }
  }

  function mode(liste) {
    const c = {};
    liste.forEach((x) => { c[x] = (c[x] || 0) + 1; });
    return Object.entries(c).sort((a, b) => b[1] - a[1])[0][0];
  }

  function detecterSituations(items, res) {
    const ctx = { entites: res.entites, profilsTous: new Set(res.personnes.flatMap((p) => [...p.profilIds])) };
    const pieces = classes(items);
    const s = new Set();
    if (res.personnes.length > 1) s.add('couple');
    for (const si of R().situations) if (si.si.some((c) => conditionRemplie(c, pieces, ctx))) s.add(si.id);
    // Nombre d'enfants lu sur l'avis d'imposition
    let enfants = null;
    for (const it of pieces.filter((x) => x.analyse.type === 'avis_imposition')) {
      const m = /personnes? a charge\s*:?\s*(\d{1,2})\b/.exec(it.extraction.norm);
      if (m && +m[1] > 0) enfants = Math.max(enfants || 0, +m[1]);
    }
    res.situations = s;
    res.nbEnfants = enfants;
    res.profilsTous = ctx.profilsTous;
  }

  // ---------- Pièces potentiellement manquantes ----------
  function manquantes(items, res) {
    const pieces = classes(items);
    const auj = new Date();
    const lignes = [];
    // Aucune personne identifiée : aucun profil, donc aucune pièce à réclamer
    if (!res.personnes.length) return lignes;
    const actif = (si) => {
      if (si === 'tous') return true;
      if (si.startsWith('profil:')) return res.profilsTous.has(si.slice(7)) || res.personnes.some((p) => p.profilIds.has(si.slice(7)));
      return res.situations.has(si);
    };
    const filtre = (regle, liste) => liste.filter((it) =>
      (regle.types.includes(it.decision.typeFinal) || regle.types.includes(it.analyse.type)) &&
      (!regle.role || it.decision.role === regle.role) &&
      (!regle.destination || it.decision.dossier.join('/').startsWith(regle.destination)));
    const cleDate = (it) => (it.analyse.date ? it.analyse.date.texte : it.id);

    function verifier(regle, liste) {
      const l = filtre(regle, liste);
      if (regle.mois12) {
        const an = auj.getFullYear() - 1;
        return l.some((it) => it.analyse.date && it.analyse.date.mois === 12 && it.analyse.date.annee === an) ? null : regle.libelle;
      }
      if (regle.recent) {
        if (!l.length) return regle.libelle;
        const ok = l.some((it) => !it.analyse.date || !it.analyse.date.date || O.moisEntre(it.analyse.date.date, auj) < regle.recent);
        return ok ? null : regle.libelle;
      }
      if (regle.anneesMin) {
        const annees = new Set(l.map((it) => (it.analyse.date ? it.analyse.date.annee : null)).filter(Boolean));
        const n = annees.size || (l.length ? 1 : 0);
        if (n >= regle.anneesMin) return null;
        if (regle.bilans) {
          const manque = regle.anneesMin - n;
          if (n === 0) return '3 derniers ' + regle.libelle;
          if (manque === 1) return '3e bilan' + regle.libelle.replace(/^bilans/, '');
          return '2e et 3e bilans' + regle.libelle.replace(/^bilans/, '');
        }
        return regle.libelle + (n ? ', ' + n + (n > 1 ? ' années trouvées' : ' année trouvée') : '');
      }
      if (regle.min) {
        const n = new Set(l.map(cleDate)).size;
        if (n >= regle.min) return null;
        return regle.libelle + (n ? ', ' + n + (n > 1 ? ' trouvés' : ' trouvé') : '');
      }
      return l.length ? null : regle.libelle;
    }

    for (const regle of R().manquantes) {
      if (!actif(regle.si)) continue;
      if ((regle.sauf || []).some(actif)) continue;
      if (regle.par === 'personne') {
        for (const p of res.personnes) {
          if (regle.si.startsWith('profil:') && !p.profilIds.has(regle.si.slice(7))) continue;
          if ((regle.sauf || []).some((s) => s.startsWith('profil:') && p.profilIds.has(s.slice(7)))) continue;
          // Pièces de la personne, y compris celles de son activité ou de sa société
          const txt = verifier(regle, pieces.filter((it) => it.decision.personnes.includes(p) || (it.decision.entite && it.decision.entite.personnes.has(p))));
          if (txt) lignes.push({ qui: p.affichage, texte: txt });
        }
      } else if (regle.par === 'dossier') {
        const txt = verifier(regle, pieces);
        if (txt) lignes.push({ qui: res.personnes.map((p) => p.affichage).join(' et ') || 'Dossier', texte: txt, dossier: true });
      } else {
        const genres = regle.par === 'sci' ? ['sci'] : ['societe'];
        for (const e of res.entites.filter((x) => genres.includes(x.genre))) {
          const txt = verifier(regle, pieces.filter((it) => it.decision.entite === e));
          if (!txt) continue;
          const texte = txt.replace('{entite}', e.affichage);
          if (regle.par === 'societe' && e.personnes.size) {
            for (const p of e.personnes) if (res.personnes.includes(p)) lignes.push({ qui: p.affichage, texte });
          } else lignes.push({ qui: e.affichage, texte });
        }
      }
    }
    // Regroupement par personne ou entité, dans l'ordre des emprunteurs
    const ordre = res.personnes.map((p) => p.affichage).concat(res.entites.map((e) => e.affichage));
    lignes.sort((a, b) => {
      const ia = ordre.indexOf(a.qui), ib = ordre.indexOf(b.qui);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    return lignes;
  }

  // ---------- Fiche client ----------
  function accord(personnes, m, f, mp, fp) {
    if (personnes.length > 1) return personnes.every((p) => p.sexe === 'F') ? fp : mp;
    return personnes[0] && personnes[0].sexe === 'F' ? f : m;
  }

  function fiche(items, res) {
    const P = res.personnes;
    const s = res.situations;
    const pieces = classes(items);
    const f = { titre: P.map((p) => p.affichage).join(' et ') || res.entites.map((e) => e.affichage).join(', ') };
    // Situation familiale et logement
    const fam = [];
    if (s.has('pacse')) fam.push(accord(P, 'Pacsé', 'Pacsée', 'Pacsés', 'Pacsées'));
    else if (s.has('marie')) fam.push(accord(P, 'Marié', 'Mariée', 'Mariés', 'Mariées'));
    else if (s.has('divorce')) fam.push(accord(P, 'Divorcé', 'Divorcée', 'Divorcés', 'Divorcées'));
    if (res.nbEnfants) fam.push(res.nbEnfants + (res.nbEnfants > 1 ? ' enfants' : ' enfant'));
    else if (s.has('enfants')) fam.push(fam.length ? 'enfants' : 'Enfants');
    let logement = '';
    const domPossede = res.domicile && res.biens.some((b) => [...b.cles].some((c) => res.domicile.cles.has(c)));
    if (s.has('heberge')) logement = accord(P, 'Hébergé', 'Hébergée', 'Hébergés', 'Hébergées');
    else if (s.has('locataire')) logement = accord(P, 'Locataire', 'Locataire', 'Locataires', 'Locataires');
    else if (domPossede) logement = accord(P, 'Propriétaire', 'Propriétaire', 'Propriétaires', 'Propriétaires');
    const ville = res.domicile ? res.domicile.ville : '';
    const phr = [];
    if (fam.length) phr.push(fam.join(', '));
    if (logement || ville) phr.push([logement, ville].filter(Boolean).join(', '));
    f.sousTitre = phr.join('. ');
    // Blocs emprunteurs
    f.emprunteurs = P.map((p, i) => {
      const lignes = [];
      if (p.tags.length) lignes.push(['Profil', p.tags.map((t, k) => (k ? t.charAt(0).toLowerCase() + t.slice(1) : t)).join(', ')]);
      if (p.employeur && p.profils.some((x) => x.salarie || x.id === 'fonctionnaire')) lignes.push(['Employeur', p.employeur]);
      if (p.societes.length) lignes.push([p.societes.length > 1 ? 'Sociétés' : 'Société', p.societes.join(', ')]);
      if (p.activites.length) lignes.push(['Activité', p.activites.join(', ')]);
      if (p.identiteTexte) lignes.push(['Identité', p.identiteTexte]);
      return { titre: 'Emprunteur ' + (i + 1), nom: p.affichage, lignes };
    });
    // Patrimoine
    const pat = [];
    for (const e of res.entites.filter((x) => x.genre === 'sci')) {
      const assoc = [...e.personnes].filter((p) => P.includes(p));
      let v = 'SCI';
      if (assoc.length === 2 && P.length === 2) v = 'Associés : les deux emprunteurs';
      else if (assoc.length) v = (assoc.length > 1 ? 'Associés : ' : 'Associé : ') + assoc.map((p) => p.affichage).join(', ');
      pat.push([e.affichage, v]);
    }
    for (const b of res.biens) {
      const lies = pieces.filter((it) => it.decision.bien === b);
      let v = 'Bien détenu';
      if (lies.some((it) => it.decision.role === 'bailleur')) v = 'Bien loué';
      if (lies.some((it) => ['mandat_vente', 'offre_achat', 'accord_principe'].includes(it.analyse.type) || it.decision.role === 'vendeur')) v = 'En vente';
      else if (res.domicile && [...b.cles].some((c) => res.domicile.cles.has(c))) v = 'Résidence principale';
      pat.push([b.affichage, v]);
    }
    const credits = [];
    for (const [dest, lib] of [['Patrimoine/Crédits immo', 'crédit immo'], ['Patrimoine/Crédits conso', 'crédit conso']]) {
      const l = pieces.filter((it) => it.decision.dossier.join('/') === dest);
      const offres = l.filter((it) => it.analyse.type === 'offre_pret').length;
      const tableaux = l.filter((it) => it.analyse.type === 'tableau_amortissement').length;
      const n = Math.max(offres, tableaux);
      if (n) credits.push(n + ' ' + lib + (n > 1 ? 's' : ''));
    }
    if (credits.length) pat.push(['Crédits en cours', credits.join(', ')]);
    const ep = [];
    for (const it of pieces.filter((x) => x.decision.dossier[1] === 'Épargne' && ['releve_epargne', 'assurance_vie', 'justificatif_apport'].includes(x.analyse.type))) {
      for (const [mot, lib] of R().epargne) if (O.contientUn(it.extraction.norm, [mot]) && !ep.includes(lib)) ep.push(lib);
    }
    if (ep.length) pat.push(['Épargne', ep.map((x, k) => (k ? x : x.charAt(0).toUpperCase() + x.slice(1))).join(', ')]);
    f.patrimoine = pat;
    // Projet
    const pro = [];
    const comp = pieces.filter((it) => it.decision.dossier[0] === 'Projet' && ['compromis', 'contrat_reservation'].includes(it.analyse.type));
    const typeBien = [];
    const normProjet = comp.map((it) => it.extraction.norm).join('\n');
    if (s.has('investissement') || /investissement\s+locatif/.test(normProjet)) typeBien.push('Investissement locatif');
    else if (/residence\s+principale/.test(normProjet)) typeBien.push('Résidence principale');
    else if (/residence\s+secondaire/.test(normProjet)) typeBien.push('Résidence secondaire');
    if (s.has('bien_neuf')) typeBien.push(typeBien.length ? 'bien neuf' : 'Bien neuf');
    else if (s.has('bien_ancien')) typeBien.push(typeBien.length ? 'bien ancien' : 'Bien ancien');
    if (typeBien.length) pro.push(['Type', typeBien.join(', ')]);
    if (res.projet) pro.push(['Adresse', res.projet.adresse.affichage]);
    const c = comp.find((it) => it.analyse.type === 'compromis') || comp[0];
    if (c) {
      const d = dateSignature(c);
      const lib = c.analyse.type === 'contrat_reservation' ? 'Réservation' : 'Compromis';
      if (d) pro.push([lib, (/projet de compromis/.test(c.extraction.norm) ? 'Projet daté du ' : 'Signé le ') + O.fmtJour(d)]);
    }
    f.projet = pro;
    return f;
  }

  function dateSignature(it) {
    const n = it.extraction.norm;
    for (const src of R().datesDocument) {
      const m = new RegExp(src).exec(n);
      if (m) { const d = O.premiereDate(m[1]); if (d) return d; }
    }
    return it.analyse.date && it.analyse.date.date ? it.analyse.date.date : null;
  }

  function analyserDossier(items, res) {
    detecterProfils(items, res);
    detecterSituations(items, res);
    res.manquantes = manquantes(items, res);
    res.fiche = fiche(items, res);
    return res;
  }

  TP.profils = { analyserDossier };
})();
