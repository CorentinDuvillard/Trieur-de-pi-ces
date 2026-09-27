/* Interface du Trieur de pièces : dossiers de la session, dépôt, tri, résultat, mail type. */
(function () {
  'use strict';
  const TP = window.TP;
  const $ = (s) => document.querySelector(s);
  const el = (tag, attrs, ...enfants) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else e.setAttribute(k, v === true ? '' : v);
    }
    for (const c of enfants.flat()) if (c != null) e.append(c);
    return e;
  };

  const etat = { dossiers: [], courant: null, onglet: 'trieur', pdfOnglet: 'fiche' };
  window.TP.app = etat; // accès pour les tests automatisés

  $('#logo').src = window.LOGO_EMERITE;

  // ---------- Icônes ----------
  const svg = (cls, label, d) => {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', '2'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
    s.setAttribute('class', cls); s.setAttribute('role', 'img'); s.setAttribute('aria-label', label);
    for (const x of d) { const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', x); s.append(p); }
    return s;
  };
  const icoOk = () => svg('ico-ok', 'Classé', ['M5 12.5 10 17 19 7']);
  const icoAlerte = (label) => svg('ico-alerte', label || 'À vérifier', ['M12 3 2.5 20h19z', 'M12 10v4M12 17.2v.1']);
  const icoCours = () => svg('ico-cours', 'En cours', ['M12 3a9 9 0 1 1-9 9']);
  const icoAttente = () => svg('ico-cours', 'En attente', ['M12 3a9 9 0 1 1-9 9']);

  // ---------- Navigation principale ----------
  function choisirOnglet(o, focus) {
    etat.onglet = o;
    for (const [id, cle] of [['#onglet-trieur', 'trieur'], ['#onglet-mail', 'mail']]) {
      const b = $(id); const actif = cle === o;
      b.setAttribute('aria-selected', actif); b.tabIndex = actif ? 0 : -1;
      if (actif && focus) b.focus();
    }
    $('#section-trieur').hidden = o !== 'trieur';
    $('#section-mail').hidden = o !== 'mail';
  }
  $('#onglet-trieur').addEventListener('click', () => choisirOnglet('trieur'));
  $('#onglet-mail').addEventListener('click', () => choisirOnglet('mail'));
  $('nav[role="tablist"]').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); choisirOnglet(etat.onglet === 'trieur' ? 'mail' : 'trieur', true); }
  });

  function afficherEcran(n) {
    document.querySelectorAll('.ecran').forEach((e) => e.toggleAttribute('data-visible', e.id === 'e' + n));
  }

  // ---------- Barre latérale ----------
  function nomCourt(d) {
    const r = d.resultat;
    if (r && r.personnes.length === 2) return r.personnes.map((p) => p.nom + ' ' + p.prenom.charAt(0) + '.').join(' et ');
    return d.nom;
  }
  function libelleJour(date) {
    const j = new Date(date.toDateString());
    const auj = new Date(new Date().toDateString());
    const ecart = Math.round((auj - j) / 86400000);
    if (ecart === 0) return "Aujourd'hui";
    if (ecart === 1) return 'Hier';
    return TP.outils.fmtJour(date);
  }
  const heure = (d) => String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');

  function rendreListe() {
    const cont = $('#liste-dossiers');
    cont.textContent = '';
    const groupes = new Map();
    for (const d of etat.dossiers.slice().reverse()) {
      const j = libelleJour(d.cree);
      if (!groupes.has(j)) groupes.set(j, []);
      groupes.get(j).push(d);
    }
    for (const [jour, liste] of groupes) {
      cont.append(el('p', { class: 'liste-titre', text: jour }));
      const ul = el('ul', { class: 'dossiers' });
      for (const d of liste) {
        let pastille, meta = (d.total != null ? d.total + ' fichier' + (d.total > 1 ? 's' : '') : 'Inventaire');
        if (d.etat === 'termine') {
          meta += ', ' + heure(d.fin);
          if (!d.compte.ok) pastille = el('span', { class: 'pastille ecart', text: 'Écart', title: 'Le compte des fichiers ne tombe pas juste' });
          else if (d.compte.verifier) pastille = el('span', { class: 'pastille verif', text: String(d.compte.verifier), 'aria-label': d.compte.verifier + ' à vérifier' });
          else pastille = el('span', { class: 'pastille ok', text: 'OK' });
        } else if (d.etat === 'erreur') {
          pastille = el('span', { class: 'pastille ecart', text: 'Erreur' });
        } else {
          pastille = el('span', { class: 'pastille cours', text: progression(d) + ' %', 'aria-label': 'En cours, ' + progression(d) + ' %' });
        }
        const b = el('button', { type: 'button', 'aria-current': d === etat.courant ? 'true' : null },
          el('span', { class: 'nom', text: nomCourt(d) }), el('span', { class: 'meta', text: meta }), el('span', { class: 'etat' }, pastille));
        b.addEventListener('click', () => ouvrir(d));
        ul.append(el('li', {}, b));
      }
      cont.append(ul);
    }
  }

  function progression(d) {
    if (!d.total) return 0;
    const p = Math.floor((d.faits / d.total) * 100);
    return d.etat === 'termine' ? 100 : Math.min(99, p);
  }

  function ouvrir(d) {
    etat.courant = d;
    rendreListe();
    rendreCourant();
  }

  $('#nouveau').addEventListener('click', () => {
    etat.courant = null;
    rendreListe();
    afficherEcran(1);
    choisirOnglet('trieur');
    $('#btn-dossier').focus();
  });

  // ---------- Dépôt ----------
  const zone = $('#zone-depot');
  $('#btn-dossier').addEventListener('click', () => $('#choix-dossier').click());
  $('#btn-fichiers').addEventListener('click', () => $('#choix-fichiers').click());
  for (const id of ['#choix-dossier', '#choix-fichiers']) {
    $(id).addEventListener('change', (e) => {
      const fichiers = [...e.target.files];
      e.target.value = '';
      if (!fichiers.length) return;
      const racine = fichiers[0].webkitRelativePath ? fichiers[0].webkitRelativePath.split('/')[0] : null;
      // Chemins relatifs au dossier déposé
      const entrees = fichiers.map((f) => ({ fichier: f, chemin: (f.webkitRelativePath || f.name).replace(racine ? racine + '/' : /^$/, '') }));
      demarrer(entrees, racine);
    });
  }
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('survol'); });
  zone.addEventListener('dragleave', (e) => { if (!zone.contains(e.relatedTarget)) zone.classList.remove('survol'); });
  zone.addEventListener('drop', async (e) => {
    e.preventDefault();
    zone.classList.remove('survol');
    const entries = [...e.dataTransfer.items].map((i) => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
    const entrees = [];
    let racine = null;
    if (entries.length === 1 && entries[0].isDirectory) racine = entries[0].name;
    const lireEntree = async (entry, prefixe) => {
      if (entry.isFile) {
        const f = await new Promise((ok, ko) => entry.file(ok, ko));
        entrees.push({ fichier: f, chemin: prefixe + f.name });
      } else if (entry.isDirectory) {
        const lecteur = entry.createReader();
        let lot;
        do {
          lot = await new Promise((ok, ko) => lecteur.readEntries(ok, ko));
          for (const x of lot) await lireEntree(x, prefixe + entry.name + '/');
        } while (lot.length);
      }
    };
    if (entries.length === 1 && entries[0].isDirectory) {
      // Un dossier lâché : les chemins partent de l'intérieur du dossier
      const lecteur = entries[0].createReader();
      let lot;
      do { lot = await new Promise((ok, ko) => lecteur.readEntries(ok, ko)); for (const x of lot) await lireEntree(x, ''); } while (lot.length);
    } else if (entries.length) for (const en of entries) await lireEntree(en, '');
    else for (const f of e.dataTransfer.files) entrees.push({ fichier: f, chemin: f.name });
    if (entrees.length) demarrer(entrees, racine);
  });
  // Un fichier lâché hors de la zone ne doit pas être ouvert par le navigateur
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());

  let numero = 0;
  function demarrer(entrees, racine) {
    const d = { id: 'd' + (++numero), nom: racine || 'Dossier ' + heure(new Date()), cree: new Date(), etat: 'inventaire', items: [], total: null, faits: 0 };
    etat.dossiers.push(d);
    etat.courant = d;
    rendreListe();
    rendreCourant();
    let prevu = false;
    const notifier = () => {
      if (prevu) return;
      prevu = true;
      requestAnimationFrame(() => {
        prevu = false;
        rendreListe();
        if (etat.courant === d) rendreCourant();
      });
    };
    TP.moteur.traiter(d, entrees, notifier).catch((err) => {
      console.error(err);
      d.etat = 'erreur';
      d.erreur = String((err && err.message) || err);
      notifier();
    });
  }

  // ---------- Écran courant ----------
  function rendreCourant() {
    const d = etat.courant;
    if (!d) { afficherEcran(1); return; }
    if (d.etat === 'termine') { rendreResultat(d); afficherEcran(3); }
    else { rendreTri(d); afficherEcran(2); }
  }

  function destinationProvisoire(it) {
    const a = it.analyse;
    if (!a || !a.type) return 'À vérifier';
    const t = TP.reconnaissance.type(a.type);
    // Destination connue seulement à la fin pour les pièces soumises à une règle de partage ou à une entité
    if (t.routage || t.portee === 'entite' || t.destination.includes('{')) return '';
    return t.destination.split('/').join(' / ');
  }

  function rendreTri(d) {
    $('#tri-nom').textContent = d.nom;
    const total = d.total || 0;
    $('#tri-compteur').textContent = d.etat === 'erreur' ? 'Erreur' : d.etat === 'inventaire' ? 'Inventaire' : d.faits + ' / ' + total;
    const p = progression(d);
    $('#tri-barre').setAttribute('aria-valuenow', p);
    $('#tri-barre span').style.width = p + '%';
    const ul = $('#tri-journal');
    ul.textContent = '';
    if (d.etat === 'erreur') {
      ul.append(el('li', {}, icoAlerte('Erreur'), el('div', { class: 'texte' }, 'Le tri a échoué', el('span', { class: 'fichier', text: d.erreur })), el('span', { class: 'dest' })));
      return;
    }
    for (const it of d.items) {
      let ico, texte, dest = '';
      if (it.etat === 'lu') {
        const ex = it.extraction;
        if (ex && ex.erreur) { ico = icoAlerte(); texte = ex.erreur; dest = 'À vérifier'; }
        else if (!it.analyse.type || it.analyse.multi) { ico = icoAlerte(); texte = it.analyse.multi || it.analyse.raison; dest = 'À vérifier'; }
        else { ico = icoOk(); texte = TP.reconnaissance.type(it.analyse.type).libelle + (it.analyse.date ? ' - ' + it.analyse.date.texte : ''); dest = destinationProvisoire(it); }
      } else if (it.etat === 'lecture') { ico = icoCours(); texte = 'Lecture…'; }
      else { ico = icoAttente(); texte = 'En attente'; }
      ul.append(el('li', {}, ico, el('div', { class: 'texte' }, texte, el('span', { class: 'fichier', text: it.origine })), el('span', { class: 'dest', text: dest })));
    }
  }

  // ---------- Résultat ----------
  let pdfRendu = null;
  function rendreResultat(d) {
    const r = d.resultat;
    $('#res-nom').textContent = d.nom;
    const c = d.compte;
    const compte = $('#res-compte');
    compte.textContent = '';
    compte.append(el('span', { text: c.recus + ' reçu' + (c.recus > 1 ? 's' : '') }), el('span', { text: c.classes + ' classé' + (c.classes > 1 ? 's' : '') }));
    if (c.verifier) compte.append(el('span', { class: 'verif', text: c.verifier + ' à vérifier' }));
    const alerte = $('#res-alerte');
    if (!c.ok) {
      alerte.hidden = false;
      alerte.textContent = '';
      alerte.append(icoAlerte('Alerte'), el('span', { text: 'Le compte ne tombe pas juste : ' + c.recus + ' reçus, ' + c.classes + ' classés, ' + c.verifier + ' à vérifier. Le ZIP ne doit pas être utilisé sans contrôle.' }));
    } else alerte.hidden = true;
    const ign = $('#res-ignores');
    if (d.ignores && d.ignores.length) {
      ign.hidden = false;
      ign.textContent = d.ignores.length + ' fichier' + (d.ignores.length > 1 ? 's' : '') + ' système écarté' + (d.ignores.length > 1 ? 's' : '') + ' : ' + d.ignores.join(', ');
    } else ign.hidden = true;

    // Profils
    const prof = $('#res-profils');
    prof.textContent = '';
    for (const p of r.personnes) {
      prof.append(el('div', { class: 'profil' }, el('b', { text: p.affichage }), el('div', { class: 'tags' }, p.tags.map((t) => el('span', { class: 'tag', text: t })))));
    }
    for (const e of r.entites) {
      const tag = e.genre === 'sci' ? 'SCI' : e.genre === 'activite' ? 'Activité' : 'Société';
      prof.append(el('div', { class: 'profil' }, el('b', { text: e.affichage }), el('div', { class: 'tags' }, el('span', { class: 'tag', text: tag }))));
    }
    if (!r.personnes.length && !r.entites.length) prof.append(el('p', { class: 'vide', text: 'Aucune personne identifiée' }));

    // Arbre
    const arbre = $('#res-arbre');
    arbre.textContent = '';
    arbre.append(el('li', { class: 'f', text: 'Fiche client.pdf' }), el('li', { class: 'f', text: 'Rapport de tri.pdf' }));
    const rendreNoeud = (n) => {
      const estVerif = n.nom === window.REGLES.dossiers.aVerifier;
      const sum = el('summary', { class: estVerif ? 'v' : 'd' }, n.nom + ' ', el('span', { class: 'nb', text: String(n.total) }));
      const ul = el('ul');
      for (const s of n.enfants) ul.append(rendreNoeud(s));
      for (const it of n.fichiers) {
        ul.append(el('li', { class: 'fichier-arbre' }, it.decision.fichier,
          estVerif ? el('span', { class: 'raison', text: it.decision.raison }) : null,
          el('span', { class: 'origine', text: it.origine })));
      }
      return el('li', { class: estVerif ? 'v' : 'd' }, el('details', { open: estVerif ? true : null }, sum, ul));
    };
    for (const n of d.arbre.enfants) arbre.append(rendreNoeud(n));

    // Aperçu des PDF
    if (pdfRendu !== d) {
      pdfRendu = d;
      rendrePdf(d.pdfs.fiche, $('#pdf-fiche'));
      rendrePdf(d.pdfs.rapport, $('#pdf-rapport'));
    }
  }

  async function rendrePdf(buffer, cont) {
    cont.textContent = '';
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer.slice(0)), isEvalSupported: false, verbosity: 0 }).promise;
    const page = await doc.getPage(1);
    const vp = page.getViewport({ scale: 2 });
    const c = document.createElement('canvas');
    c.width = vp.width; c.height = vp.height;
    c.setAttribute('role', 'img');
    c.setAttribute('aria-label', cont.id === 'pdf-fiche' ? 'Aperçu de la fiche client' : 'Aperçu du rapport de tri');
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    cont.append(c);
    doc.destroy();
  }

  function choisirPdf(cle, focus) {
    etat.pdfOnglet = cle;
    document.querySelectorAll('[data-pdf]').forEach((b) => {
      const actif = b.dataset.pdf === cle;
      b.setAttribute('aria-selected', actif); b.tabIndex = actif ? 0 : -1;
      if (actif && focus) b.focus();
    });
    document.querySelectorAll('.a4').forEach((p) => p.toggleAttribute('data-visible', p.id === 'pdf-' + cle));
  }
  document.querySelectorAll('[data-pdf]').forEach((b) => b.addEventListener('click', () => choisirPdf(b.dataset.pdf)));
  document.querySelector('.onglets-pdf').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); choisirPdf(etat.pdfOnglet === 'fiche' ? 'rapport' : 'fiche', true); }
  });

  // ---------- ZIP ----------
  $('#btn-zip').addEventListener('click', async () => {
    const d = etat.courant;
    if (!d || d.etat !== 'termine') return;
    if (!d.compte.ok && !window.confirm('Le compte des fichiers ne tombe pas juste. Télécharger le ZIP quand même ?')) return;
    const b = $('#btn-zip');
    b.setAttribute('aria-disabled', 'true');
    try {
      const blob = await TP.sortie.zip(d.items, d.pdfs);
      const url = URL.createObjectURL(blob);
      const a = el('a', { href: url, download: d.nomZip });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } finally {
      b.removeAttribute('aria-disabled');
    }
  });

  // ---------- Mail type ----------
  function echapper(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function enLigne(s) {
    return echapper(s).replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, t, u) => '<a href="' + u.replace(/"/g, '&quot;') + '" target="_blank" rel="noopener">' + t + '</a>');
  }
  function mailEnHtml(md) {
    const lignes = md.split('\n');
    let html = '';
    let pile = 0;
    const fermer = (n) => { while (pile > n) { html += '</ul>'; pile--; } };
    for (const l of lignes) {
      const m = /^(\s*)- (.*)$/.exec(l);
      if (m) {
        const niveau = Math.floor(m[1].length / 2) + 1;
        while (pile < niveau) { html += '<ul>'; pile++; }
        fermer(niveau);
        html += '<li>' + enLigne(m[2]) + '</li>';
        continue;
      }
      fermer(0);
      if (/^---\s*$/.test(l) || !l.trim()) continue;
      const h = /^##\s+(.*)$/.exec(l);
      if (h) { html += '<h3>' + enLigne(h[1]) + '</h3>'; continue; }
      html += '<p' + (/^Objet :/.test(l) ? ' class="objet"' : '') + '>' + enLigne(l) + '</p>';
    }
    fermer(0);
    return html;
  }
  function mailEnTexte(md) {
    return md.split('\n').filter((l) => !/^---\s*$/.test(l))
      .map((l) => l.replace(/^##\s+/, '').replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)'))
      .join('\n').replace(/\n{3,}/g, '\n\n');
  }
  $('#mail').innerHTML = mailEnHtml(window.MAIL_TYPE);
  $('#btn-copier').addEventListener('click', async () => {
    const b = $('#btn-copier');
    const html = $('#mail').innerHTML;
    const texte = mailEnTexte(window.MAIL_TYPE);
    let ok = false;
    try {
      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([texte], { type: 'text/plain' }) })]);
        ok = true;
      }
    } catch (e) { ok = false; }
    if (!ok) {
      // Repli : copie de la sélection
      const sel = window.getSelection();
      const r = document.createRange();
      r.selectNodeContents($('#mail'));
      sel.removeAllRanges(); sel.addRange(r);
      ok = document.execCommand('copy');
      sel.removeAllRanges();
    }
    b.textContent = ok ? 'Copié' : 'Copie impossible';
    setTimeout(() => { b.textContent = 'Copier'; }, 1600);
  });

  rendreListe();
})();
