/* Rattachement : personnes, entités, biens, règles de partage, destination et nom de chaque fichier. */
(function () {
  'use strict';
  const TP = (window.TP = window.TP || {});
  const O = TP.outils;
  const REC = () => TP.reconnaissance;
  const R = () => window.REGLES;

  // ---------- Personnes ----------
  function creerPersonne(nom, prenom, sexe) {
    const n = nom.replace(/\s+/g, ' ').trim();
    const p = prenom.trim();
    return {
      nom: n.toUpperCase(), prenom: O.capitaliser(p), sexe: sexe || null,
      affichage: O.nomPrenom(n, p),
      nNom: O.norm(n).replace(/-/g, ' '), nPrenom: O.norm(p).replace(/-/g, ' '),
      cle: O.norm(n).replace(/[^a-z]/g, '') + '|' + O.norm(p).replace(/[^a-z]/g, ''),
      mentions: 0, identites: [], sexes: []
    };
  }

  function contientMot(norm, mot) { return mot.length >= 2 && O.reMot(mot).test(norm.replace(/-/g, ' ')); }

  // Force de la correspondance d'une personne dans un texte : 'fort', 'nom', 'proche' ou null
  function correspondance(ex, p, homonymes) {
    const n = ex.norm;
    const aNom = contientMot(n, p.nNom);
    const aPrenom = contientMot(n, p.nPrenom);
    if (aNom && aPrenom) return 'fort';
    if (aNom && !homonymes && p.nNom.length >= 4 && ex.texte.includes(p.nom)) return 'nom';
    if (!aNom && p.nNom.length >= 5) {
      // Nom mal lu : un mot à une lettre près, avec le prénom exact
      const mots = n.match(/[a-z]{4,}/g) || [];
      const proche = mots.some((w) => Math.abs(w.length - p.nNom.length) <= 1 && O.levenshtein(w, p.nNom.replace(/ /g, '')) === 1);
      if (proche && aPrenom) return 'proche';
    }
    return null;
  }

  function trouverPersonnes(ex, personnes) {
    const res = { fort: [], proche: [] };
    for (const p of personnes) {
      const homonymes = personnes.some((q) => q !== p && q.nNom === p.nNom);
      const c = correspondance(ex, p, homonymes);
      if (c === 'fort' || c === 'nom') res.fort.push(p);
      else if (c === 'proche') res.proche.push(p);
    }
    return res;
  }

  // Positions d'une personne dans le texte normalisé
  function positionsPersonne(norm, p) {
    return O.positions(norm.replace(/-/g, ' '), p.nNom);
  }

  // Rôle du client : libellé le plus proche (ou « ci-après ... ») autour de ses mentions
  function roleClient(ex, personnes, rolesA, rolesB, nomsEntites) {
    const n = ex.norm.replace(/-/g, ' ');
    const lab = (liste) => liste.flatMap((l) => O.positions(n, O.norm(l).replace(/-/g, ' ')).map((i) => ({ i, l: O.norm(l) })));
    const A = lab(rolesA).map((x) => ({ ...x, r: 'a' }));
    const B = lab(rolesB).map((x) => ({ ...x, r: 'b' }));
    const tous = A.concat(B).sort((x, y) => x.i - y.i);
    if (!tous.length) return null;
    const votes = { a: 0, b: 0 };
    const occ = [];
    for (const p of personnes) occ.push(...positionsPersonne(n, p));
    for (const e of nomsEntites || []) occ.push(...O.positions(n, e));
    for (const pos of occ) {
      // « ci-après dénommé le vendeur » juste après le nom
      const apres = n.slice(pos, pos + 260);
      const ci = /ci apres (?:denomme(?:e|s|es)? )?(?:ensemble )?(?:le |la |les |l')?([a-z']+)/.exec(apres);
      if (ci) {
        const x = tous.find((t) => ci[1].startsWith(t.l.replace(/^(le |la |les |l')/, '').split(' ')[0]));
        if (x) { votes[x.r] += 2; continue; }
      }
      let avant = null;
      for (const t of tous) if (t.i <= pos && pos - t.i < 320) avant = t;
      if (avant) votes[avant.r] += 1;
    }
    if (votes.a === votes.b) return null;
    return votes.a > votes.b ? 'a' : 'b';
  }

  function accentuer(p, docs) {
    const variantes = (mot) => {
      const cible = O.norm(mot);
      const cpt = {};
      for (const it of docs) {
        const mots = it.extraction.texte.match(/[A-Za-zÀ-ÖØ-öø-ÿ]+/g) || [];
        for (const w of mots) if (w.length === cible.length && O.norm(w) === cible) cpt[w] = (cpt[w] || 0) + 1;
      }
      const liste = Object.entries(cpt);
      const accentues = liste.filter(([w]) => /[À-ÖØ-öø-ÿ]/.test(w));
      const choix = (accentues.length ? accentues : liste).sort((a, b) => b[1] - a[1])[0];
      return choix ? choix[0] : mot;
    };
    const refaire = (s, maj) => s.split(/([\s-])/).map((t) => (/^[\s-]$/.test(t) || !t ? t : maj ? variantes(t).toUpperCase() : O.capitaliser(variantes(t)))).join('');
    p.nom = refaire(p.nom, true);
    p.prenom = refaire(p.prenom, false);
    p.affichage = p.nom + ' ' + p.prenom;
  }

  // ---------- Entités ----------
  function afficherEntite(e) {
    if (e.genre === 'sci') return 'SCI ' + e.coeur;
    if (e.genre === 'activite') return e.coeur;
    return e.coeur + (e.forme && !e.coeur.endsWith(' ' + e.forme) ? ' ' + e.forme : '');
  }

  function entiteDansTexte(norm, e) { return O.reMot(e.nCoeur).test(norm); }

  // ---------- Adresses ----------
  function choisirAdresse(item, exclure) {
    const ads = item.analyse.adresses || [];
    if (!ads.length) return null;
    const libs = R().libelles.bien.map(O.norm);
    const texte = item.extraction.texte;
    let best = null, bestS = -99;
    ads.forEach((a, k) => {
      let s = -k * 0.01;
      const avant = O.norm(texte.slice(Math.max(0, a.index - 160), a.index));
      if (libs.some((l) => avant.includes(l))) s += 3;
      if (exclure && exclure.has(a.cle)) s -= 2;
      if (s > bestS) { bestS = s; best = a; }
    });
    return best;
  }

  function regrouperAdresses(liste) {
    const groupes = [];
    for (const a of liste) {
      let g = groupes.find((x) => x.cle === a.cle || (x.cp === a.cp && O.similarite(x.cle, a.cle) >= 0.88));
      if (!g) { g = { cle: a.cle, cp: a.cp, affichage: a.affichage, ville: a.ville, variantes: {}, nb: 0, cles: new Set() }; groupes.push(g); }
      g.variantes[a.affichage] = (g.variantes[a.affichage] || 0) + 1;
      g.cles.add(a.cle);
      g.nb++;
    }
    for (const g of groupes) g.affichage = Object.entries(g.variantes).sort((x, y) => y[1] - x[1])[0][0];
    return groupes;
  }
  function groupeDe(groupes, a) { return a ? groupes.find((g) => g.cles.has(a.cle) || (g.cp === a.cp && O.similarite(g.cle, a.cle) >= 0.88)) : null; }

  // ---------- Finalisation ----------
  function finaliser(items) {
    const Rg = R();
    const T = (id) => REC().type(id);
    const res = { personnes: [], tiers: [], entites: [], biens: [], domicile: null, projet: null };

    // Remise à zéro (la finalisation peut être relancée après relecture complète)
    for (const it of items) for (const k of ['doublonDe', 'personneIdentite', 'role', 'adresseBien', 'adresseProjet', 'sciBailleur', 'corr', 'corrTiers', 'decision']) delete it[k];

    // Doublons : le second exemplaire est signalé
    const vus = new Map();
    for (const it of items) {
      if (it.sha && vus.has(it.sha)) it.doublonDe = vus.get(it.sha);
      else if (it.sha) vus.set(it.sha, it);
    }

    const lus = items.filter((it) => it.extraction && !it.extraction.erreur && !it.doublonDe);
    const reconnus = lus.filter((it) => it.analyse.type && !it.analyse.multi);

    // 1. Personnes des pièces d'identité
    const idPersonnes = [];
    for (const it of reconnus) {
      const t = T(it.analyse.type);
      const idt = it.analyse.identite;
      if (!t.identite || !idt || !idt.nom || !idt.prenom) continue;
      const p = creerPersonne(idt.nom, idt.prenom, idt.sexe);
      let ex = idPersonnes.find((q) => q.cle === p.cle || (O.similarite(q.cle, p.cle) >= 0.9));
      if (!ex) { ex = p; idPersonnes.push(ex); }
      ex.identites.push({ item: it, type: t.id, expiration: idt.expiration });
      if (idt.sexe) ex.sexes.push(idt.sexe);
      it.personneIdentite = ex;
    }

    // Mentions dans les autres pièces
    const autres = lus.filter((it) => !(it.analyse.type && T(it.analyse.type).identite));
    for (const p of idPersonnes) {
      p.mentions = autres.filter((it) => correspondance(it.extraction, p, idPersonnes.some((q) => q !== p && q.nNom === p.nNom))).length;
      const homo0 = idPersonnes.some((q) => q !== p && q.nNom === p.nNom);
      p.dansHebergement = autres.some((it) => it.analyse.type === 'attestation_hebergement' && correspondance(it.extraction, p, homo0));
      p.dansDonation = autres.some((it) => ['attestation_donation', 'cerfa_don'].includes(it.analyse.type) && correspondance(it.extraction, p, homo0));
      const homo = idPersonnes.some((q) => q !== p && q.nNom === p.nNom);
      const horsTiers = autres.filter((it) => !['attestation_hebergement', 'attestation_donation', 'cerfa_don', 'provenance_fonds'].includes(it.analyse.type)
        && !(T(it.analyse.type || 'cni') || {}).domicile && correspondance(it.extraction, p, homo)).length;
      if (horsTiers === 0 && p.dansHebergement) p.tiers = 'hebergeant';
      else if (horsTiers === 0 && p.dansDonation) p.tiers = 'donateur';
    }
    let emprunteurs = idPersonnes.filter((p) => !p.tiers).sort((a, b) => b.mentions - a.mentions);
    const inconnus = emprunteurs.slice(2);
    emprunteurs = emprunteurs.slice(0, 2);
    res.tiers = idPersonnes.filter((p) => p.tiers);

    // 2. Personnes citées sans pièce d'identité (co-emprunteur sans CNI, ou aucune CNI)
    if (emprunteurs.length < 2) {
      const agg = new Map();
      for (const it of autres) {
        const vusDoc = new Set();
        for (const c of it.analyse.candidats) {
          const p = creerPersonne(c.nom, c.prenom, c.sexe);
          if (vusDoc.has(p.cle)) continue;
          if (!R().typesPreuvePersonne.includes(it.analyse.type)) continue;
          vusDoc.add(p.cle);
          if (idPersonnes.some((q) => q.cle === p.cle || O.similarite(q.cle, p.cle) >= 0.9)) continue;
          let g = [...agg.values()].find((q) => O.similarite(q.cle, p.cle) >= 0.9);
          if (!g) { g = p; agg.set(p.cle, g); }
          g.mentions++;
          if (c.sexe) g.sexes.push(c.sexe);
        }
      }
      const minDocs = emprunteurs.length ? 3 : 2;
      const cands = [...agg.values()].filter((p) => p.mentions >= minDocs).sort((a, b) => b.mentions - a.mentions);
      emprunteurs = emprunteurs.concat(cands.slice(0, 2 - emprunteurs.length));
    }
    for (const p of emprunteurs.concat(res.tiers)) {
      if (!p.sexe && p.sexes.length) {
        const f = p.sexes.filter((s) => s === 'F').length;
        p.sexe = f * 2 > p.sexes.length ? 'F' : f * 2 < p.sexes.length ? 'M' : null;
      }
    }
    // Sexe lu dans les civilités si la pièce d'identité ne le donne pas
    for (const p of emprunteurs) {
      if (p.sexe) continue;
      const s = [];
      for (const it of autres) for (const c of it.analyse.candidats) if (creerPersonne(c.nom, c.prenom).cle === p.cle && c.sexe) s.push(c.sexe);
      const f = s.filter((x) => x === 'F').length;
      if (s.length) p.sexe = f * 2 > s.length ? 'F' : f * 2 < s.length ? 'M' : null;
    }
    // Accents : la bande MRZ n'en porte pas, on reprend la graphie lue dans les pièces
    for (const p of emprunteurs.concat(res.tiers)) accentuer(p, lus);
    res.personnes = emprunteurs;
    emprunteurs.forEach((p, i) => { p.id = 'p' + (i + 1); p.rang = i + 1; });

    // Correspondances de chaque pièce
    for (const it of lus) {
      it.corr = trouverPersonnes(it.extraction, emprunteurs);
      it.corrTiers = trouverPersonnes(it.extraction, res.tiers);
    }

    // 3. Entités
    const brutes = [];
    for (const it of reconnus) {
      const t = T(it.analyse.type);
      if (!t.entiteSource) continue;
      const ents = it.analyse.entites;
      let principale = ents.find((e) => e.source === 'libelle') || null;
      if (!principale && ents.length) {
        const cpt = {};
        ents.forEach((e) => { cpt[e.coeur] = (cpt[e.coeur] || 0) + 1; });
        const top = Object.entries(cpt).sort((a, b) => b[1] - a[1])[0][0];
        principale = ents.find((e) => e.coeur === top);
      }
      if (!principale && t.activite) {
        // Indépendant sans société : l'activité prend le nom lu, sinon celui du déclarant
        const p = it.corr.fort[0];
        if (p) principale = { coeur: p.affichage, forme: null, activitePersonne: true };
      }
      if (!principale) continue;
      let genre = principale.forme === 'SCI' ? 'sci' : (t.activite && !principale.forme ? 'activite' : 'societe');
      brutes.push({ ...principale, genre, item: it });
    }
    for (const b of brutes) {
      const nCoeur = O.norm(b.coeur);
      const cle = nCoeur.replace(/[^a-z0-9]/g, '');
      let e = res.entites.find((x) => x.genre === b.genre && (x.cle === cle || O.similarite(x.cle, cle) >= 0.85));
      if (!e) {
        e = { genre: b.genre, cle, coeur: b.activitePersonne ? b.coeur : b.coeur.toUpperCase(), nCoeur, forme: b.forme, variantes: {}, personnes: new Set(), sources: [] };
        res.entites.push(e);
      }
      e.variantes[b.coeur] = (e.variantes[b.coeur] || 0) + 1;
      if (!e.forme && b.forme) e.forme = b.forme;
      e.sources.push(b.item);
      for (const p of b.item.corr.fort) e.personnes.add(p);
    }
    res.entites.forEach((e, i) => {
      const top = Object.entries(e.variantes).sort((a, b) => b[1] - a[1])[0][0];
      e.coeur = e.genre === 'activite' ? top : top.toUpperCase();
      e.nCoeur = O.norm(e.coeur);
      e.affichage = afficherEntite(e);
      e.id = 'e' + (i + 1);
    });
    // Une activité portant le nom d'une personne est liée à cette personne
    for (const e of res.entites) if (e.genre === 'activite') for (const p of emprunteurs) if (e.nCoeur.includes(p.nNom)) e.personnes.add(p);

    const sci = res.entites.filter((e) => e.genre === 'sci');
    const zone = Rg.titulaire.zoneEntete;
    const entiteEnTete = (it, genres) => {
      const tete = it.extraction.norm.slice(0, zone);
      return res.entites.find((e) => genres.includes(e.genre) && entiteDansTexte(tete, e)) || null;
    };

    // 4. Rôles (bail, quittance, compromis) et crédits
    const roles = Rg.roles;
    for (const it of reconnus) {
      const t = T(it.analyse.type);
      const clients = it.corr.fort;
      if (t.routage === 'role_bail') {
        const sciBail = entiteEnTete(it, ['sci']) || sci.find((e) => entiteDansTexte(it.extraction.norm, e));
        const r = roleClient(it.extraction, clients, roles.locataire, roles.bailleur, sciBail ? [sciBail.nCoeur] : []);
        it.role = r === 'a' ? 'locataire' : r === 'b' ? 'bailleur' : null;
        if (it.role === 'bailleur' && sciBail && !clients.length) it.sciBailleur = sciBail;
        else if (it.role === 'bailleur' && sciBail && sciBail && roleClient(it.extraction, [], roles.locataire, roles.bailleur, [sciBail.nCoeur]) === 'b') it.sciBailleur = sciBail;
      }
      if (t.routage === 'role_vente') {
        const r = roleClient(it.extraction, clients, roles.vendeur, roles.acquereur, []);
        it.role = r === 'a' ? 'vendeur' : r === 'b' ? 'acquereur' : null;
      }
    }

    // 5. Domicile et biens
    const domiciles = [];
    for (const it of reconnus) {
      const t = T(it.analyse.type);
      const ads = it.analyse.adresses;
      if (!ads.length) continue;
      if (t.domicile && it.corr.fort.length) domiciles.push(ads[0]);
      else if (t.id === 'avis_imposition' && it.corr.fort.length) domiciles.push(ads[0]);
      else if (t.routage === 'role_bail' && it.role === 'locataire') { const a = choisirAdresse(it); if (a) domiciles.push(a); }
    }
    const grDom = regrouperAdresses(domiciles).sort((a, b) => b.nb - a.nb);
    res.domicile = grDom[0] || null;
    const clesDom = new Set(res.domicile ? [...res.domicile.cles] : []);

    const adressesBiens = [];
    for (const it of reconnus) {
      const t = T(it.analyse.type);
      let a = null;
      if (t.routage === 'bien' || (t.routage === 'role_bail' && it.role === 'bailleur') || (t.routage === 'role_vente' && it.role === 'vendeur')) {
        a = choisirAdresse(it, t.proprieteSignal ? null : clesDom);
      }
      if (t.id === 'taxe_fonciere' && it.analyse.adresses.length > 1) {
        // Taxe foncière : l'adresse du bien plutôt que celle du propriétaire, sauf libellé explicite
        const lab = choisirAdresse(it, clesDom);
        if (lab) a = lab;
      }
      if (a) { it.adresseBien = a; if (!(it.sciBailleur || (entiteEnTete(it, ['sci']) && Rg.typesPiecesSci.includes(t.id)))) adressesBiens.push(a); }
    }
    res.biens = regrouperAdresses(adressesBiens);

    // Projet : adresse du bien acheté
    const clesBiens = new Set(res.biens.flatMap((g) => [...g.cles]));
    const exclureProjet = new Set([...clesDom, ...clesBiens]);
    const adrProjet = [];
    for (const it of reconnus) {
      const t = T(it.analyse.type);
      if ((t.id === 'compromis' && it.role !== 'vendeur') || t.id === 'contrat_reservation') {
        const a = choisirAdresse(it, exclureProjet);
        if (a && !exclureProjet.has(a.cle)) { adrProjet.push(a); it.adresseProjet = a; }
      }
    }
    const grProjet = regrouperAdresses(adrProjet).sort((a, b) => b.nb - a.nb);
    res.projet = grProjet[0] ? { adresse: grProjet[0] } : null;

    // 6. Décision pour chaque fichier
    const vente = reconnus.some((it) => T(it.analyse.type).venteSignal || it.role === 'vendeur');
    for (const it of items) it.decision = decider(it);

    function aVerifier(raison) { return { statut: 'verifier', raison }; }

    function decider(it) {
      if (it.doublonDe) return aVerifier('Doublon de ' + it.doublonDe.origine);
      const ex = it.extraction;
      if (!ex || ex.erreur) return aVerifier((ex && ex.erreur) || 'Fichier illisible');
      const a = it.analyse;
      if (a.multi) return aVerifier(a.multi);
      if (!a.type) return aVerifier(a.raison || 'Pièce non reconnue');
      const t = T(a.type);
      let libelle = t.libelle;
      for (const c of t.libelles || []) if (O.contientUn(ex.norm, [c.si])) libelle = c.libelle;
      if (t.libelleImage && a.image) libelle = t.libelleImage;
      let destination = t.destination;
      let portee = t.portee;
      let typeFinal = t.id;
      let personnes = null;
      let entite = null;
      let bien = null;

      // Pièces d'identité
      if (t.identite) {
        let p = it.personneIdentite;
        if (!p) {
          const c = it.corr.fort.length === 1 ? it.corr.fort[0] : null;
          if (!c) return aVerifier(it.corr.proche.length ? 'Nom mal lu, proche de ' + it.corr.proche[0].affichage : 'Identité non lue sur la pièce');
          p = c;
        }
        if (p.tiers === 'hebergeant') { const d = Rg.derives.identite_hebergeant; return classe(d.destination, d.libelle, 'identite_hebergeant', emprunteurs, null, null); }
        if (p.tiers === 'donateur') { const d = Rg.derives.identite_donateur; return classe(d.destination, d.libelle, 'identite_donateur', emprunteurs, null, null); }
        if (!emprunteurs.includes(p)) {
          const proche = emprunteurs.find((q) => O.similarite(q.cle, p.cle) >= 0.8);
          if (proche) return aVerifier('Nom mal lu, proche de ' + proche.affichage);
          return aVerifier("Pièce d'identité d'une personne non rattachée au dossier");
        }
        // Plusieurs pièces d'identité de personnes différentes dans un même fichier
        if (a.pages > 1 && emprunteurs.length > 1) {
          const parPage = ex.normPages.map((pn) => emprunteurs.filter((q) => correspondance({ norm: pn, texte: ex.pages[ex.normPages.indexOf(pn)].texte }, q, false) === 'fort'));
          const distincts = new Set(parPage.filter((x) => x.length === 1).map((x) => x[0]));
          if (distincts.size > 1) return aVerifier('Plusieurs documents dans un seul fichier : ' + O.pluriel(O.minuscule(t.libelle)) + ' de ' + O.enumerer([...distincts].map((q) => q.affichage)));
        }
        return classe(destination, libelle, typeFinal, [p], null, null);
      }

      // Justificatif de domicile de l'hébergeant
      if (t.domicile && !it.corr.fort.length && it.corrTiers.fort.some((p) => p.tiers === 'hebergeant')) {
        const d = Rg.derives.domicile_hebergeant;
        return classe(d.destination, d.libelle, 'domicile_hebergeant', emprunteurs, null, null);
      }
      if (t.domicile && a.etranger && t.id === 'justificatif_domicile') {
        const d = T('domicile_etranger'); libelle = d.libelle; typeFinal = d.id;
      }

      // Règles de partage
      const tete = entiteEnTete(it, ['sci', 'societe', 'activite']);
      if (t.routage === 'titulaire') {
        const n1 = ex.norm.slice(0, zone);
        if (tete && tete.genre === 'sci') { const d = Rg.derives.releve_sci; return classe(d.destination, d.libelle, 'releve_sci', null, tete, null); }
        if (tete) { const d = Rg.derives.releve_pro; return classe(d.destination, d.libelle, 'releve_pro', null, tete, null); }
        if (O.contientUn(n1, Rg.titulaire.professionnel)) {
          const pers = it.corr.fort;
          const e = res.entites.find((x) => x.genre !== 'sci' && pers.some((p) => x.personnes.has(p)))
            || (res.entites.filter((x) => x.genre !== 'sci').length === 1 ? res.entites.find((x) => x.genre !== 'sci') : null);
          if (!e) return aVerifier('Compte professionnel, société non identifiée');
          const d = Rg.derives.releve_pro; return classe(d.destination, d.libelle, 'releve_pro', null, e, null);
        }
      }
      if (t.routage === 'forme') {
        let e = null;
        if (t.entiteSource) {
          const cands = res.entites.filter((x) => x.sources.includes(it));
          e = cands[0] || null;
        }
        if (!e) e = tete || res.entites.find((x) => entiteDansTexte(ex.norm, x));
        if (!e) return aVerifier('Société ou SCI non identifiée');
        if (e.genre === 'sci') { const d = Rg.derives.piece_sci; return classe(d.destination, libelle, typeFinal, null, e, null); }
        return classe('Revenus/{societe}', libelle, typeFinal, null, e, null);
      }
      if (t.activite) {
        const e = res.entites.find((x) => x.sources.includes(it)) || tete;
        if (!e) return aVerifier('Activité ou société non identifiée');
        return classe(destination, libelle, typeFinal, null, e, null);
      }
      // Toute pièce de la SCI va dans son dossier
      if (Rg.typesPiecesSci.includes(t.id)) {
        const s = it.sciBailleur || (tete && tete.genre === 'sci' ? tete : null);
        if (s) return classe(Rg.derives.piece_sci.destination, libelle, typeFinal, null, s, null);
      }
      if (t.routage === 'role_bail') {
        if (!it.role) return aVerifier('Rôle du client (locataire ou bailleur) non déterminé');
        if (it.role === 'bailleur') {
          destination = t.bailleur.destination; libelle = t.bailleur.libelle;
          if (destination.includes('{bien}')) {
            bien = groupeDe(res.biens, it.adresseBien) || (res.biens.length === 1 ? res.biens[0] : null);
            if (!bien) return aVerifier('Bien loué non identifié');
          }
        }
      }
      if (t.routage === 'role_vente') {
        if (!it.corr.fort.length && !it.corr.proche.length) {
          // Nom du client non lu : le compromis porte-t-il l'adresse d'un bien détenu ?
          const g = groupeDe(res.biens, choisirAdresse(it));
          if (g) { it.role = 'vendeur'; }
          else return aVerifier('Rôle du client (vendeur ou acquéreur) non déterminé');
        }
        if (!it.role) {
          const g = groupeDe(res.biens, choisirAdresse(it));
          it.role = g ? 'vendeur' : 'acquereur';
        }
        if (it.role === 'vendeur') {
          destination = t.vendeur.destination; libelle = t.vendeur.libelle; portee = 'commun';
          bien = groupeDe(res.biens, it.adresseBien) || (res.biens.length === 1 ? res.biens[0] : null);
          if (!bien) return aVerifier('Bien vendu non identifié');
        }
      }
      if (t.routage === 'credit') {
        const conso = Rg.credit.conso.filter((k) => O.contientUn(ex.norm, [k])).length;
        const immo = Rg.credit.immo.filter((k) => O.contientUn(ex.norm, [k])).length;
        if (t.id === 'offre_pret' && !it.corr.fort.length && !it.corr.proche.length) {
          if (!vente) return aVerifier('Emprunteurs du prêt non identifiés');
          const d = Rg.derives.offre_pret_acquereurs;
          bien = groupeDe(res.biens, choisirAdresse(it)) || biensEnVente()[0] || (res.biens.length === 1 ? res.biens[0] : null);
          if (!bien) return aVerifier('Bien vendu non identifié');
          return classe(d.destination, d.libelle, 'offre_pret_acquereurs', emprunteurs, null, bien);
        }
        if (conso === immo) return aVerifier('Crédit immobilier ou à la consommation non déterminé');
        if (conso > immo) { destination = t.conso.destination; libelle = t.conso.libelle; }
      }
      if (t.routage === 'acquereurs') {
        if (it.corr.fort.length) return aVerifier('Accord de principe au nom des emprunteurs');
        if (!vente) return aVerifier('Accord de principe sans vente du bien actuel');
        bien = groupeDe(res.biens, choisirAdresse(it)) || biensEnVente()[0] || (res.biens.length === 1 ? res.biens[0] : null);
        if (!bien) return aVerifier('Bien vendu non identifié');
      }
      if (t.routage === 'estimation') {
        const a1 = choisirAdresse(it);
        const g = groupeDe(res.biens, a1);
        if (g) { destination = 'Patrimoine/Immobilier/{bien}'; bien = g; }
        else if (res.projet && a1 && groupeDe([res.projet.adresse], a1)) destination = 'Projet';
        else if (!a1 && res.projet && !res.biens.length) destination = 'Projet';
        else if (!a1 && !res.projet && res.biens.length === 1) { destination = 'Patrimoine/Immobilier/{bien}'; bien = res.biens[0]; }
        else if (a1 && !res.biens.length) destination = 'Projet';
        else return aVerifier('Bien estimé non identifié (bien actuel ou bien acheté)');
      }
      if (destination.includes('{bien}') && !bien) {
        bien = groupeDe(res.biens, it.adresseBien) || (res.biens.length === 1 ? res.biens[0] : null);
        if (!bien) return aVerifier(res.biens.length ? 'Bien non identifié parmi plusieurs biens' : 'Adresse du bien non lue');
      }

      // Personnes
      if (portee === 'dossier') personnes = emprunteurs;
      else {
        const f = it.corr.fort;
        if (!f.length) {
          if (it.corr.proche.length) return aVerifier('Nom mal lu, proche de ' + it.corr.proche[0].affichage);
          return aVerifier(emprunteurs.length ? 'Titulaire non identifié' : 'Aucune personne identifiée dans le dossier');
        }
        if (portee === 'personne' && f.length > 1) {
          // Deux personnes citées : celle qui figure en tête du document
          const tete2 = ex.norm.slice(0, zone);
          const enTete = f.filter((p) => contientMot(tete2, p.nNom) && (contientMot(tete2, p.nPrenom) || !f.some((q) => q !== p && q.nNom === p.nNom)));
          if (enTete.length !== 1) return aVerifier('Deux personnes citées, rattachement incertain');
          personnes = enTete;
        } else personnes = f;
        // Deux personnes différentes sur des pages différentes d'une pièce individuelle
        if (portee === 'personne' && a.pages > 1 && emprunteurs.length > 1) {
          const parPage = ex.pages.map((pg, k) => emprunteurs.filter((q) => correspondance({ norm: ex.normPages[k], texte: pg.texte }, q, false) === 'fort'));
          const distincts = new Set(parPage.filter((x) => x.length === 1).map((x) => x[0]));
          if (distincts.size > 1) return aVerifier('Plusieurs documents dans un seul fichier : ' + O.pluriel(O.minuscule(t.libelle)) + ' de ' + O.enumerer([...distincts].map((q) => q.affichage)));
        }
      }
      return classe(destination, libelle, typeFinal, personnes, entite, bien);

      function classe(dest, lib, tf, pers, ent, bi) {
        let chemin = dest;
        if (chemin.includes('{bien}')) chemin = chemin.replace('{bien}', bi.affichage);
        if (chemin.includes('{sci}')) chemin = chemin.replace('{sci}', ent.affichage);
        if (chemin.includes('{societe}')) chemin = chemin.replace('{societe}', ent.affichage);
        const prefixe = ent ? ent.affichage : (pers && pers.length ? ordonner(pers).map((p) => p.affichage).join(' et ') : '');
        const date = TP.reconnaissance.type(a.type).date && a.date ? a.date.texte : '';
        return {
          statut: 'classe', dossier: chemin.split('/').map(O.nettoyerNomFichier), libelle: lib, typeFinal: tf, personnes: pers || [],
          entite: ent, bien: bi, date, prefixe, role: it.role || null,
          base: [prefixe, lib, date].filter(Boolean).join(' - ')
        };
      }
    }

    function biensEnVente() {
      return res.biens.filter((g) => reconnus.some((it) => (T(it.analyse.type).venteSignal || it.role === 'vendeur') && groupeDe([g], it.adresseBien)));
    }
    function ordonner(pers) { return pers.slice().sort((a, b) => (a.rang || 9) - (b.rang || 9)); }

    // 7. Noms de fichiers uniques par dossier
    const pris = new Map();
    const unique = (dossier, base, ext) => {
      const cle = dossier.join('/').toLowerCase();
      if (!pris.has(cle)) pris.set(cle, new Set());
      const s = pris.get(cle);
      let nom = O.nettoyerNomFichier(base) + (ext ? '.' + ext : '');
      let k = 2;
      while (s.has(nom.toLowerCase())) { nom = O.nettoyerNomFichier(base) + ' (' + k + ')' + (ext ? '.' + ext : ''); k++; }
      s.add(nom.toLowerCase());
      return nom;
    };
    for (const it of items) {
      const d = it.decision;
      const extOrig = (/\.([^.\/]{1,8})$/.exec(it.nom) || [])[1] || '';
      if (d.statut === 'classe') {
        d.fichier = unique(d.dossier, d.base, extOrig);
      } else {
        d.dossier = [Rg.dossiers.aVerifier];
        d.fichier = unique(d.dossier, it.nom.replace(/\.[^.\/]{1,8}$/, ''), extOrig);
      }
      d.chemin = d.dossier.concat(d.fichier).join('/');
    }
    res.inconnus = inconnus;
    return res;
  }

  TP.rattachement = { finaliser, correspondance, creerPersonne };
})();
