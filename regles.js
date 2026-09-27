/*
 * Règles du Trieur de pièces.
 * Tout ce qui décrit le métier est ici : types de pièces, mots-clés, destinations,
 * profils, situations et pièces potentiellement manquantes. Le moteur ne contient
 * aucune règle métier en dur : pour ajouter ou modifier une règle, on modifie ce fichier.
 *
 * Écriture des mots-clés : en clair, avec ou sans accents (le moteur ignore accents et majuscules).
 * Un mot-clé qui commence par "re:" est une expression régulière (appliquée au texte sans accents, en minuscules).
 * Chaque mot-clé a un poids. Le score d'une pièce est la somme des poids trouvés,
 * compté plein en première page et à moitié au-delà.
 *
 * Destinations : chemins séparés par "/". Les parties variables sont :
 *   {bien}    adresse du bien lue dans les pièces
 *   {sci}     nom de la SCI
 *   {societe} nom de la société (ou de l'activité pour un indépendant)
 *
 * Portée d'une pièce (qui figure en tête du nom de fichier) :
 *   personne : une seule personne, sinon « À vérifier »
 *   commun   : une ou les deux personnes citées
 *   dossier  : pièce du dossier, porte le nom des emprunteurs
 *   entite   : porte le nom de la SCI ou de la société
 *
 * Date dans le nom : "mois" (MM-AAAA), "annee" (AAAA) ou null (pas de date).
 */
window.REGLES = {
  version: 1,

  reconnaissance: {
    seuil: 6,             // score minimum pour reconnaître une pièce
    ambiguite: 0.8,       // si le 2e type atteint 80 % du 1er (et n'est pas compatible), la pièce est ambiguë
    seuilPage: 8,         // score minimum d'une page pour la compter comme un document à part
    premierePartie: 1800, // nombre de caractères comptés comme « première page » si le découpage par page n'existe pas
    poidsNomFichier: 1,   // multiplicateur des mots-clés trouvés dans le nom d'origine du fichier
    texteMinimum: 25,     // en dessous (caractères utiles), le texte est jugé illisible
    ocrPagesMax: 8,       // PDF scannés : nombre maximum de pages passées à l'OCR
    ocrLangues: 'fra+eng'
  },

  dossiers: {
    aVerifier: 'À vérifier',
    ficheClient: 'Fiche client.pdf',
    rapport: 'Rapport de tri.pdf'
  },

  // Date d'un document signé ou édité (appliquées au texte sans accents, en minuscules). La date suit le motif.
  datesDocument: ["fait a [a-z' -]{2,40},? le,? ([^\\n]{6,25})", '(?:edite|etabli|emis|delivre)e?s? le,? ([^\\n]{6,25})',
                  'signed (?:in [a-z ]+ )?on ([^\\n]{6,25})', 'issued on ([^\\n]{6,25})', 'signee? le,? ([^\\n]{6,25})'],

  // Ordre d'affichage de l'arborescence de sortie (les dossiers variables suivent)
  ordreDossiers: ['À vérifier', 'État civil', 'Patrimoine', 'Épargne', 'Relevés de compte', 'Immobilier', 'Crédits immo', 'Crédits conso',
                  'Projet', 'Revenus', "Avis d'imposition", 'Bulletins de salaire et contrat', 'Revenus fonciers'],

  // Fichiers système, jamais des pièces du client : écartés de l'inventaire et signalés à l'écran
  fichiersSysteme: ['re:(^|/)__macosx/', 're:(^|/)\\.ds_store$', 're:(^|/)thumbs\\.db$', 're:(^|/)desktop\\.ini$', 're:(^|/)\\._'],

  types: [
    // ---------------- État civil ----------------
    {
      id: 'cni', libelle: "Carte d'identité", destination: 'État civil', portee: 'personne', date: null,
      identite: true, famille: 'identite',
      mots: [["carte nationale d'identité", 8], ["carte d'identité", 6], ['identity card', 5], ['re:\\bidfra', 8],
             ['re:\\bid<?fra', 4], ['nationalité française', 2], ['date de naissance', 1], ['lieu de naissance', 1],
             ['sexe', 1], ["date d'expiration", 1], ['prénoms', 1], ["nom d'usage", 1], ['taille', 1]],
      nomFichier: [['cni', 6], ['carte identite', 6], ["carte d'identite", 6], ['id card', 4]]
    },
    {
      id: 'passeport', libelle: 'Passeport', destination: 'État civil', portee: 'personne', date: null,
      identite: true, famille: 'identite',
      mots: [['passeport', 8], ['passport', 6], ['re:p<fra', 6], ['re:\\bp<[a-z]{3}', 4], ['autorité', 1], ['date de délivrance', 1], ['date of expiry', 1]],
      nomFichier: [['passeport', 6], ['passport', 6]]
    },
    {
      id: 'titre_sejour', libelle: 'Titre de séjour', destination: 'État civil', portee: 'personne', date: null,
      identite: true, famille: 'identite',
      mots: [['titre de séjour', 8], ['residence permit', 7], ['carte de résident', 7], ['re:\\bir<?fra', 3], ['carte de séjour', 7]],
      nomFichier: [['titre de sejour', 6], ['titre sejour', 6]]
    },
    {
      id: 'livret_famille', libelle: 'Livret de famille', destination: 'État civil', portee: 'commun', date: null,
      famille: 'etat_civil', conteneur: true,
      mots: [['livret de famille', 10], ["extrait d'acte de mariage", 3], ['acte de naissance', 1], ['officier de l\'état civil', 2]],
      nomFichier: [['livret de famille', 6], ['livret famille', 6]]
    },
    {
      id: 'contrat_mariage', libelle: 'Contrat de mariage', destination: 'État civil', portee: 'commun', date: null,
      famille: 'etat_civil', conteneur: true,
      mots: [['contrat de mariage', 10], ['séparation de biens', 4], ['régime matrimonial', 3], ['futurs époux', 3]],
      nomFichier: [['contrat de mariage', 6]]
    },
    {
      id: 'pacs', libelle: 'Attestation de PACS', destination: 'État civil', portee: 'commun', date: null,
      famille: 'etat_civil',
      mots: [['pacte civil de solidarité', 8], ['re:\\bpacs\\b', 5], ['enregistrement de la déclaration', 3], ['partenaires', 2]],
      nomFichier: [['pacs', 6]]
    },
    {
      id: 'divorce', libelle: 'Jugement de divorce', destination: 'État civil', portee: 'commun', date: null,
      famille: 'etat_civil', conteneur: true,
      libelles: [{ si: 'convention de divorce', libelle: 'Convention de divorce' }],
      mots: [['jugement de divorce', 9], ['convention de divorce', 9], ['re:\\bdivorce\\b', 4], ['juge aux affaires familiales', 4],
             ['prestation compensatoire', 2], ['pension alimentaire', 1]],
      nomFichier: [['divorce', 6]]
    },
    {
      id: 'pension_alimentaire', libelle: 'Justificatif de pension', destination: 'État civil', portee: 'personne', date: 'mois',
      famille: 'etat_civil',
      mots: [['pension alimentaire', 6], ["contribution à l'entretien", 6], ['versement de pension', 4], ['créancier', 1], ['débiteur', 1]],
      nomFichier: [['pension', 4]]
    },
    {
      id: 'justificatif_domicile', libelle: 'Justificatif de domicile', destination: 'État civil', portee: 'commun', date: 'mois',
      famille: 'domicile', domicile: true,
      mots: [['justificatif de domicile', 8], ['attestation de domicile', 6], ['re:\\bfacture\\b', 3], ['re:\\bedf\\b', 3], ['engie', 3],
             ['électricité', 2], ['totalenergies', 2], ['re:\\borange\\b', 2], ['re:\\bsfr\\b', 2], ['bouygues telecom', 3],
             ['re:\\bfree\\b', 1], ['abonnement', 2], ['consommation', 2], ['re:\\bkwh\\b', 3], ['forfait mobile', 3],
             ['box internet', 3], ['point de livraison', 2], ['période de facturation', 3], ['numéro client', 1], ['montant ttc', 1],
             ['re:\\bfibre\\b', 1], ['adresse de consommation', 3], ['lieu de consommation', 3]],
      nomFichier: [['justificatif de domicile', 6], ['justif domicile', 6], ['facture', 2], ['edf', 3]],
      dateMotifs: ["date (?:de (?:la )?facture|d'emission|de l'avis)\\s*:?\\s*(\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{4})", 'facture du (\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{4})']
    },
    {
      id: 'domicile_etranger', libelle: "Justificatif de domicile à l'étranger", destination: 'État civil', portee: 'commun', date: 'mois',
      famille: 'domicile', domicile: true, etranger: true,
      mots: [['utility bill', 7], ['proof of address', 7], ['proof of residence', 7], ['electricity bill', 6], ['council tax', 5],
             ['billing period', 3], ['bill date', 3], ['amount due', 2], ['account number', 1], ['service address', 3]],
      nomFichier: [['utility bill', 5], ['proof of address', 5]],
      dateMotifs: ['(?:bill|invoice|statement) date\\s*:?\\s*(\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{4})']
    },
    {
      id: 'bail', libelle: 'Contrat de location', destination: 'État civil', portee: 'commun', date: 'mois',
      famille: 'location', conteneur: true, routage: 'role_bail',
      // client locataire : État civil, « Contrat de location ». Client bailleur : Patrimoine / Immobilier / {bien}, « Bail »
      bailleur: { destination: 'Patrimoine/Immobilier/{bien}', libelle: 'Bail' },
      mots: [['contrat de location', 8], ["bail d'habitation", 8], ['re:\\bbail\\b', 3], ['bailleur', 3], ['locataire', 3],
             ['preneur', 2], ['loyer mensuel', 3], ['dépôt de garantie', 2], ['durée du bail', 3], ['loi du 6 juillet 1989', 4],
             ['charges locatives', 2], ['logement loué', 2]],
      nomFichier: [['bail', 5], ['contrat de location', 6]]
    },
    {
      id: 'quittance', libelle: 'Quittance de loyer', destination: 'État civil', portee: 'commun', date: 'mois',
      famille: 'location', routage: 'role_bail', mensuel: true,
      bailleur: { destination: 'Revenus/Revenus fonciers', libelle: 'Quittance de loyer' },
      mots: [['quittance de loyer', 10], ['re:\\bquittance\\b', 5], ['avoir reçu', 2], ['re:\\bloyer\\b', 2], ['provision pour charges', 2],
             ['période de location', 2]],
      nomFichier: [['quittance', 6]],
      dateMotifs: ['(?:loyer|periode|mois)[^\\n]{0,25}?((?:janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre) \\d{4})',
                   'periode du (\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{4})']
    },
    {
      id: 'attestation_hebergement', libelle: "Attestation d'hébergement", destination: 'État civil', portee: 'personne', date: 'mois',
      famille: 'hebergement', hebergement: true,
      mots: [["attestation d'hébergement", 10], ['re:heberge', 3], ['à titre gratuit', 3], ['certifie héberger', 5], ["sur l'honneur", 2]],
      nomFichier: [['hebergement', 6]]
    },
    {
      id: 'residence_fiscale', libelle: 'Attestation de résidence fiscale', destination: 'État civil', portee: 'personne', date: 'annee',
      famille: 'non_resident',
      mots: [['attestation de résidence fiscale', 10], ['résidence fiscale', 6], ['certificate of residence', 7], ['tax residence', 7],
             ['tax residency', 7], ['resident for tax purposes', 7], ['certificate of tax residence', 8], ['for tax purposes', 4]],
      nomFichier: [['residence fiscale', 6], ['tax residence', 6]],
      anneeMotifs: ['(?:year|annee|for) (\\d{4})', '(\\d{4})']
    },

    // ---------------- Revenus / Avis d'imposition ----------------
    {
      id: 'avis_imposition', libelle: "Avis d'imposition", destination: "Revenus/Avis d'imposition", portee: 'commun', date: 'annee',
      famille: 'impot',
      mots: [["avis d'impôt", 7], ["avis d'imposition", 7], ['impôt sur le revenu', 3], ['revenu fiscal de référence', 6],
             ['nombre de parts', 3], ['direction générale des finances publiques', 2], ['numéro fiscal', 2],
             ['impôt sur les revenus', 3], ['situation de famille', 1],
             ['taxe foncière', -10], ['taxes foncières', -10], ['déclaration des revenus', -3]],
      nomFichier: [['avis d imposition', 6], ["avis d'imposition", 6], ['avis imposition', 6], ['impot', 3], ['impots', 3]],
      anneeMotifs: ["avis d'imp[oô]ts? (\\d{4})", "avis d'imposition (\\d{4})", 'impots? (\\d{4}) sur les revenus'],
      anneeRevenusMotifs: ["sur les revenus (?:de l'annee )?(\\d{4})", 'revenus (\\d{4})']
    },
    {
      id: 'declaration_revenus', libelle: 'Déclaration de revenus', destination: "Revenus/Avis d'imposition", portee: 'commun', date: 'annee',
      famille: 'impot',
      mots: [['déclaration des revenus', 8], ['déclaration de revenus', 8], ['re:\\b2042\\b', 4], ['revenus à déclarer', 3],
             ['accusé de réception', 2], ['déclaration en ligne', 2]],
      nomFichier: [['declaration de revenus', 6], ['declaration revenus', 6], ['2042', 4]],
      anneeMotifs: ["revenus (?:de l'annee )?(\\d{4})", 'declaration (?:des|de) revenus (\\d{4})']
    },
    {
      id: 'avis_etranger', libelle: "Avis d'imposition étranger", destination: "Revenus/Avis d'imposition", portee: 'commun', date: 'annee',
      famille: 'impot',
      mots: [['tax assessment', 7], ['notice of assessment', 7], ['income tax return', 6], ['tax return', 4], ['taxable income', 4],
             ['tax year', 3], ['hm revenue', 4], ['internal revenue service', 5], ['steuerbescheid', 7], ['einkommensteuer', 5],
             ['impuesto sobre la renta', 6], ['dichiarazione dei redditi', 6],
             ['certificate of residence', -8], ['résidence fiscale', -8]],
      nomFichier: [['tax', 3]],
      anneeMotifs: ['tax year (\\d{4})', '(\\d{4}) tax year', 'year (\\d{4})', '(\\d{4})']
    },

    // ---------------- Revenus / Bulletins de salaire et contrat ----------------
    {
      id: 'bulletin_salaire', libelle: 'Bulletin de salaire', destination: 'Revenus/Bulletins de salaire et contrat', portee: 'personne', date: 'mois',
      famille: 'salaire', mensuel: true, emploi: true,
      mots: [['bulletin de paie', 8], ['bulletin de salaire', 8], ['fiche de paie', 7], ['net à payer', 5], ['salaire brut', 4],
             ['net imposable', 3], ['cotisations salariales', 3], ['salaire de base', 3], ['traitement brut', 4],
             ['net à payer avant impôt', 3], ['congés payés', 1], ['re:\\burssaf\\b', 1],
             ['payslip', 8], ['pay slip', 8], ['net pay', 4], ['gross pay', 4], ['pay date', 2], ['national insurance', 2], ['tax code', 2], ['pay period', 2]],
      nomFichier: [['bulletin', 5], ['fiche de paie', 6], ['paie', 4], ['salaire', 3]],
      dateMotifs: ['periode\\s*(?:de paie)?\\s*:?\\s*du (\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{4})',
                   '(?:periode|mois|paie|salaire)[^\\n]{0,20}?((?:janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre) \\d{4})',
                   'pay period\\s*:?\\s*((?:january|february|march|april|may|june|july|august|september|october|november|december) \\d{4})']
    },
    {
      id: 'contrat_travail', libelle: 'Contrat de travail', destination: 'Revenus/Bulletins de salaire et contrat', portee: 'personne', date: 'mois',
      famille: 'contrat', conteneur: true, emploi: true,
      mots: [['contrat de travail', 8], ['contrat à durée indéterminée', 5], ['contrat à durée déterminée', 5], ["période d'essai", 2],
             ['entre les soussignés', 2], ["l'employeur", 2], ['le salarié', 2], ['re:\\bcdi\\b', 2], ['re:\\bcdd\\b', 2],
             ['contract of employment', 8], ['employment contract', 8], ['the employer', 2], ['the employee', 2], ['probation period', 2], ['permanent', 1],
             ['avenant', -6], ['fin de période d\'essai', -6]],
      nomFichier: [['contrat de travail', 6], ['contrat travail', 6], ['cdi', 4], ['cdd', 4]]
    },
    {
      id: 'avenant', libelle: 'Avenant au contrat de travail', destination: 'Revenus/Bulletins de salaire et contrat', portee: 'personne', date: 'mois',
      famille: 'contrat', emploi: true,
      mots: [['re:\\bavenant\\b', 9], ['avenant au contrat de travail', 5], ['nouvelle rémunération', 2], ['contrat de travail', 1]],
      nomFichier: [['avenant', 6]]
    },
    {
      id: 'fin_periode_essai', libelle: "Attestation de fin de période d'essai", destination: 'Revenus/Bulletins de salaire et contrat', portee: 'personne', date: 'mois',
      famille: 'contrat', emploi: true,
      mots: [["fin de période d'essai", 11], ["période d'essai", 2], ['définitivement', 2], ['confirmation', 1]],
      nomFichier: [['periode d essai', 6], ['fin de periode', 6]]
    },
    {
      id: 'titularisation', libelle: 'Arrêté de titularisation', destination: 'Revenus/Bulletins de salaire et contrat', portee: 'personne', date: 'mois',
      famille: 'contrat', emploi: true,
      mots: [['titularisation', 9], ['titularisé', 5], ['re:\\barrete\\b', 2], ['fonctionnaire', 2], ['fonction publique', 3], ['stagiaire', 1]],
      nomFichier: [['titularisation', 6]]
    },
    {
      id: 'contrat_collaboration', libelle: 'Contrat de collaboration', destination: 'Revenus/Bulletins de salaire et contrat', portee: 'personne', date: 'mois',
      famille: 'contrat', conteneur: true,
      mots: [['contrat de collaboration', 10], ['collaborateur libéral', 5], ['rétrocession', 4], ['collaboration libérale', 5]],
      nomFichier: [['collaboration', 6]]
    },

    // ---------------- Revenus (retraite) ----------------
    {
      id: 'justificatif_retraite', libelle: 'Justificatif de retraite', destination: 'Revenus', portee: 'personne', date: 'mois',
      famille: 'retraite',
      libelles: [{ si: 'estimation indicative globale', libelle: 'Prévisionnel de retraite' }, { si: 'relevé de situation individuelle', libelle: 'Prévisionnel de retraite' },
                 { si: 'estimation de votre retraite', libelle: 'Prévisionnel de retraite' }, { si: 'simulation de retraite', libelle: 'Prévisionnel de retraite' }],
      mots: [['estimation indicative globale', 9], ['relevé de situation individuelle', 8], ['estimation de votre retraite', 8], ['simulation de retraite', 8],
             ['prévisionnel de retraite', 9], ['trimestres', 2], ['départ à la retraite', 3],
             ['pension de retraite', 8], ['titre de pension', 8], ['notification de retraite', 8], ['attestation de paiement', 3],
             ['retraite de base', 5], ['assurance retraite', 5], ['re:\\bcarsat\\b', 4], ['re:\\bcnav\\b', 4],
             ['montant de votre retraite', 6], ['paiement de votre retraite', 6], ['pension nette', 4], ['retraite complémentaire', 2],
             ['bulletin de paie', -8], ['bulletin de salaire', -8]],
      nomFichier: [['retraite', 6], ['pension', 3]]
    },

    // ---------------- Revenus / Revenus fonciers ----------------
    {
      id: 'declaration_2044', libelle: 'Déclaration 2044', destination: 'Revenus/Revenus fonciers', portee: 'commun', date: 'annee',
      famille: 'foncier', bailleurSignal: true,
      mots: [['re:\\b2044\\b', 7], ['revenus fonciers', 5], ['loyers bruts', 3], ['micro-foncier', 2]],
      nomFichier: [['2044', 6], ['revenus fonciers', 5]],
      anneeMotifs: ["revenus (?:fonciers )?(?:de l'annee )?(\\d{4})", '(\\d{4})']
    },

    // ---------------- Revenus / {société} ou Patrimoine / {SCI} ----------------
    {
      id: 'statuts', libelle: 'Statuts', destination: 'Revenus/{societe}', portee: 'entite', date: null,
      famille: 'societe', conteneur: true, routage: 'forme', entiteSource: true,
      libelles: [{ si: 'projet de statuts', libelle: 'Projet de statuts' }],
      mots: [['re:\\bstatuts\\b', 8], ['objet social', 3], ['capital social', 3], ['siège social', 2], ['parts sociales', 3],
             ['gérance', 2], ['re:\\barticle 1\\b', 2], ['dénomination', 2]],
      nomFichier: [['statuts', 6]]
    },
    {
      id: 'kbis', libelle: 'K-bis', destination: 'Revenus/{societe}', portee: 'entite', date: 'mois',
      famille: 'societe', routage: 'forme', entiteSource: true,
      mots: [['extrait kbis', 9], ['re:\\bk ?-?bis\\b', 7], ['registre du commerce', 4], ['greffe du tribunal', 3],
             ["extrait d'immatriculation", 6], ['gestion et direction', 2], ['re:\\brcs\\b', 2]],
      nomFichier: [['kbis', 6], ['k-bis', 6], ['k bis', 6]]
    },
    {
      id: 'bilan', libelle: 'Bilan', destination: 'Revenus/{societe}', portee: 'entite', date: 'annee',
      famille: 'comptes', conteneur: true, routage: 'forme', entiteSource: true,
      mots: [['re:\\bbilan\\b', 5], ['compte de résultat', 5], ['liasse fiscale', 5], ['capitaux propres', 3], ["chiffre d'affaires", 2],
             ['exercice clos', 4], ["résultat de l'exercice", 3], ['immobilisations', 2], ['total actif', 2], ['total passif', 2]],
      nomFichier: [['bilan', 6], ['liasse', 5]],
      anneeMotifs: ['exercice clos le \\d{1,2}[/.-]\\d{1,2}[/.-](\\d{4})', 'exercice clos le \\d{1,2} [a-z]+ (\\d{4})', 'exercice (\\d{4})', 'bilan (\\d{4})']
    },
    {
      id: 'arrete_comptable', libelle: 'Arrêté comptable', destination: 'Revenus/{societe}', portee: 'entite', date: 'mois',
      famille: 'comptes', routage: 'forme',
      mots: [['arrêté comptable', 10], ['situation intermédiaire', 7], ['situation comptable', 7], ['arrêté au', 2]],
      nomFichier: [['arrete comptable', 6], ['situation', 2]]
    },
    {
      id: 'declaration_2035', libelle: 'Déclaration 2035', destination: 'Revenus/{societe}', portee: 'entite', date: 'annee',
      famille: 'comptes', activite: true, entiteSource: true,
      mots: [['re:\\b2035\\b', 7], ['bénéfices non commerciaux', 6], ['re:\\bbnc\\b', 4], ['déclaration contrôlée', 4],
             ['recettes encaissées', 3], ['profession libérale', 2]],
      nomFichier: [['2035', 6]],
      anneeMotifs: ["(?:revenus|exercice|annee) (?:de l'annee )?(\\d{4})", 'du \\d{1,2}[/.-]\\d{1,2}[/.-]\\d{4} au \\d{1,2}[/.-]\\d{1,2}[/.-](\\d{4})', '(\\d{4})']
    },

    // ---------------- Patrimoine / Relevés de compte ----------------
    {
      id: 'releve_compte', libelle: 'Relevé de compte', destination: 'Patrimoine/Relevés de compte', portee: 'commun', date: 'mois',
      famille: 'banque', routage: 'titulaire',
      mots: [['relevé de compte', 7], ['relevé de comptes', 7], ['extrait de compte', 7], ['solde créditeur', 3], ['solde débiteur', 3],
             ['ancien solde', 4], ['nouveau solde', 4], ['solde au', 2], ['re:\\biban\\b', 2], ['date valeur', 3], ['date opération', 2],
             ['total des opérations', 3], ['compte courant', 3], ['compte chèque', 3], ['compte de dépôt', 3],
             ['bank statement', 7], ['balance brought forward', 4], ['opening balance', 3], ['closing balance', 3], ['sort code', 3], ['current account', 3]],
      nomFichier: [['releve', 5], ['compte', 2]]
    },
    {
      id: 'frais_bancaires', libelle: 'Récapitulatif annuel des frais', destination: 'Patrimoine/Relevés de compte', portee: 'commun', date: 'annee',
      famille: 'banque_frais',
      mots: [['récapitulatif annuel des frais', 10], ['récapitulatif des frais', 8], ['frais bancaires', 4], ['total des frais', 4], ['frais perçus', 3]],
      nomFichier: [['frais', 5], ['recapitulatif', 4]],
      anneeMotifs: ['(?:annee|en) (\\d{4})', '(\\d{4})']
    },

    // ---------------- Patrimoine / Épargne ----------------
    {
      id: 'releve_epargne', libelle: "Relevé d'épargne", libelleImage: "Capture d'épargne", destination: 'Patrimoine/Épargne', portee: 'commun', date: 'mois',
      famille: 'epargne', routage: 'titulaire_epargne',
      mots: [['re:\\blivret a\\b', 5], ['re:\\bldds\\b', 5], ['livret de développement durable', 5], ['re:\\blep\\b', 4],
             ["plan d'épargne logement", 5], ['re:\\bpel\\b', 3], ['re:\\bcel\\b', 2], ['re:\\bpea\\b', 4], ['compte épargne', 5],
             ['re:\\bepargne\\b', 3], ['intérêts acquis', 3], ['taux de rémunération', 2], ['compte titres', 4], ['mes comptes', 2], ['relevé', 1]],
      nomFichier: [['epargne', 6], ['livret', 5], ['pel', 3]]
    },
    {
      id: 'assurance_vie', libelle: "Relevé d'assurance vie", destination: 'Patrimoine/Épargne', portee: 'commun', date: 'mois',
      famille: 'epargne',
      mots: [['assurance vie', 7], ['assurance-vie', 7], ['valeur de rachat', 4], ['unités de compte', 3], ['fonds en euros', 4],
             ['relevé de situation', 3], ['souscripteur', 2]],
      nomFichier: [['assurance vie', 6], ['av', 1]]
    },
    {
      id: 'justificatif_apport', libelle: "Justificatif d'apport", destination: 'Patrimoine/Épargne', portee: 'commun', date: 'mois',
      famille: 'epargne',
      mots: [["justificatif d'apport", 10], ['apport personnel', 5], ["attestation d'apport", 8]],
      nomFichier: [['apport', 6]]
    },
    {
      id: 'attestation_donation', libelle: 'Attestation de donation', destination: 'Patrimoine/Épargne', portee: 'commun', date: 'mois',
      famille: 'donation', donation: true,
      mots: [['attestation de donation', 10], ['re:\\bdonation\\b', 5], ['don manuel', 5], ['donateur', 4], ['donataire', 4],
             ['fait don', 4], ['don familial', 4], ['2735', -4]],
      nomFichier: [['donation', 6], ['don', 2]]
    },
    {
      id: 'cerfa_don', libelle: 'CERFA de don', destination: 'Patrimoine/Épargne', portee: 'commun', date: 'mois',
      famille: 'donation', donation: true,
      mots: [['re:\\b2735\\b', 7], ['déclaration de don manuel', 8], ['dons manuels', 4], ['re:\\bcerfa\\b', 2]],
      nomFichier: [['cerfa', 5], ['2735', 6]]
    },
    {
      id: 'provenance_fonds', libelle: 'Provenance des fonds', destination: 'Patrimoine/Épargne', portee: 'commun', date: 'mois',
      famille: 'donation',
      mots: [['provenance des fonds', 10], ['origine des fonds', 9]],
      nomFichier: [['provenance', 6], ['origine des fonds', 6]]
    },
    {
      id: 'succession', libelle: 'Justificatif de succession', destination: 'Patrimoine/Épargne', portee: 'commun', date: 'mois',
      famille: 'succession', conteneur: true,
      mots: [['re:\\bsuccession\\b', 5], ['acte de notoriété', 7], ['attestation de succession', 8], ['attestation immobilière', 4],
             ['héritier', 4], ['défunt', 4], ['déclaration de succession', 8], ['de cujus', 5]],
      nomFichier: [['succession', 6]]
    },

    // ---------------- Patrimoine / Immobilier / {bien} ----------------
    {
      id: 'titre_propriete', libelle: 'Titre de propriété', destination: 'Patrimoine/Immobilier/{bien}', portee: 'commun', date: 'mois',
      famille: 'propriete', conteneur: true, routage: 'bien', proprieteSignal: true,
      libelles: [{ si: 'attestation de propriété', libelle: 'Attestation de propriété' }],
      mots: [['titre de propriété', 8], ['attestation de propriété', 8], ['re:\\bacte de vente\\b', 5], ['publicité foncière', 4],
             ['partie normalisée', 5], ['re:\\bcadastr', 2], ['office notarial', 2],
             ['compromis de vente', -6], ['promesse de vente', -6], ['projet de compromis', -6]],
      nomFichier: [['titre de propriete', 6], ['acte', 3], ['attestation de propriete', 6]]
    },
    {
      id: 'taxe_fonciere', libelle: 'Taxe foncière', destination: 'Patrimoine/Immobilier/{bien}', portee: 'commun', date: 'annee',
      famille: 'propriete', routage: 'bien', proprieteSignal: true,
      mots: [['taxe foncière', 10], ['taxes foncières', 10], ['propriétés bâties', 4], ['valeur locative cadastrale', 3]],
      nomFichier: [['taxe fonciere', 6], ['tf', 1]],
      anneeMotifs: ['taxes? foncieres? (\\d{4})', "avis d'imp[oô]ts? (\\d{4})", 'annee (\\d{4})']
    },
    {
      id: 'mandat_vente', libelle: 'Mandat de vente', destination: 'Patrimoine/Immobilier/{bien}', portee: 'commun', date: 'mois',
      famille: 'vente', routage: 'bien', venteSignal: true,
      mots: [['mandat de vente', 10], ['mandat exclusif', 5], ['mandat simple', 5], ['mandant', 3], ['mandataire', 3]],
      nomFichier: [['mandat', 6]]
    },
    {
      id: 'offre_achat', libelle: "Offre d'achat", destination: 'Patrimoine/Immobilier/{bien}', portee: 'commun', date: 'mois',
      famille: 'vente', routage: 'bien', venteSignal: true,
      mots: [["offre d'achat", 10], ["proposition d'achat", 8], ["offre d'acquisition", 7], ["validité de l'offre", 3]],
      nomFichier: [['offre d achat', 6], ["offre d'achat", 6]]
    },
    {
      id: 'compromis', libelle: 'Compromis de vente', destination: 'Projet', portee: 'dossier', date: 'mois',
      famille: 'compromis', conteneur: true, routage: 'role_vente', projet: true,
      vendeur: { destination: 'Patrimoine/Immobilier/{bien}', libelle: 'Compromis de vente' },
      libelles: [{ si: 'projet de compromis', libelle: 'Projet de compromis' }],
      mots: [['compromis de vente', 10], ['promesse de vente', 7], ['promesse synallagmatique', 8], ['avant-contrat', 4],
             ['conditions suspensives', 4], ['acquéreur', 2], ['vendeur', 2], ['séquestre', 2]],
      nomFichier: [['compromis', 7], ['promesse', 5]]
    },
    {
      id: 'contrat_reservation', libelle: 'Contrat de réservation', destination: 'Projet', portee: 'dossier', date: 'mois',
      famille: 'compromis', conteneur: true, projet: true, neuf: true,
      mots: [['contrat de réservation', 10], ["vente en l'état futur d'achèvement", 7], ['re:\\bvefa\\b', 5], ['réservataire', 5], ['réservant', 4]],
      nomFichier: [['reservation', 6], ['vefa', 6]]
    },
    {
      id: 'accord_principe', libelle: 'Accord de principe des acquéreurs', destination: 'Patrimoine/Immobilier/{bien}', portee: 'dossier', date: 'mois',
      famille: 'vente', routage: 'acquereurs', venteSignal: true,
      mots: [['accord de principe', 10], ['accord de financement', 5]],
      nomFichier: [['accord de principe', 6]]
    },

    // ---------------- Patrimoine / Crédits ----------------
    {
      id: 'offre_pret', libelle: 'Offre de prêt immobilier', destination: 'Patrimoine/Crédits immo', portee: 'commun', date: 'mois',
      famille: 'credit', conteneur: true, routage: 'credit',
      conso: { destination: 'Patrimoine/Crédits conso', libelle: 'Offre de prêt à la consommation' },
      acquereurs: { destination: 'Patrimoine/Immobilier/{bien}', libelle: 'Offre de prêt des acquéreurs' },
      mots: [['offre de prêt', 8], ['offre de crédit', 7], ['re:\\btaeg\\b', 4], ['taux effectif global', 4], ['montant du prêt', 3],
             ['durée du prêt', 2], ['assurance emprunteur', 2], ['délai de réflexion', 3], ['délai de rétractation', 3], ['emprunteur', 1]],
      nomFichier: [['offre de pret', 6], ['offre pret', 6]]
    },
    {
      id: 'tableau_amortissement', libelle: "Tableau d'amortissement", destination: 'Patrimoine/Crédits immo', portee: 'commun', date: 'mois',
      famille: 'credit', routage: 'credit',
      conso: { destination: 'Patrimoine/Crédits conso', libelle: "Tableau d'amortissement" },
      mots: [["tableau d'amortissement", 10], ['échéancier', 5], ['capital restant dû', 5], ['re:\\bamortissement\\b', 3], ['re:\\bech[eé]ance', 2]],
      nomFichier: [['amortissement', 6], ['echeancier', 6]]
    },

    // ---------------- Projet ou bien actuel ----------------
    {
      id: 'estimation_locative', libelle: 'Estimation de valeur locative', destination: 'Projet', portee: 'dossier', date: 'mois',
      famille: 'estimation', routage: 'estimation',
      mots: [['estimation locative', 9], ['avis de valeur locative', 9], ['estimation de loyer', 8], ['re:\\bvaleur locative\\b(?! cadastrale)', 6],
             ['loyer estimé', 5], ['loyer de marché', 4]],
      nomFichier: [['estimation', 6], ['valeur locative', 6]]
    },

    // ---------------- Projet ----------------
    {
      id: 'diagnostic', libelle: 'Diagnostics', destination: 'Projet', portee: 'dossier', date: 'mois',
      famille: 'projet_annexe', conteneur: true, ancien: true,
      mots: [['dossier de diagnostic technique', 9], ['diagnostic de performance énergétique', 8], ['re:\\bdpe\\b', 4],
             ['re:\\bdiagnostic', 4], ['re:\\bamiante\\b', 3], ['re:\\btermites\\b', 3], ['état des risques', 4], ['diagnostiqueur', 4],
             ['classe énergie', 3], ['re:\\bcarrez\\b', 3]],
      nomFichier: [['diagnostic', 6], ['dpe', 6], ['ddt', 5]]
    },
    {
      id: 'notice_descriptive', libelle: 'Notice descriptive', destination: 'Projet', portee: 'dossier', date: 'mois',
      famille: 'projet_annexe', conteneur: true, neuf: true,
      mots: [['notice descriptive', 10], ['descriptif technique', 5], ['menuiseries', 2], ['revêtements de sol', 3]],
      nomFichier: [['notice', 6]]
    },
    {
      id: 'plans', libelle: 'Plans', destination: 'Projet', portee: 'dossier', date: null,
      famille: 'projet_annexe', neuf: true,
      mots: [['plan du logement', 8], ['plan de vente', 8], ['plan de masse', 5], ['re:\\bplans?\\b', 2], ['re:\\bechelle\\b', 3],
             ['surface habitable', 2], ['rez-de-chaussée', 1], ['re:\\bsejour\\b', 1], ['re:\\bchambre\\b', 1]],
      nomFichier: [['plan', 6]]
    },
    {
      id: 'devis_travaux', libelle: 'Devis travaux', destination: 'Projet', portee: 'dossier', date: 'mois',
      famille: 'projet_annexe',
      mots: [['re:\\bdevis\\b', 7], ['re:\\btravaux\\b', 3], ['montant ht', 3], ["main d'œuvre", 2], ["main d'oeuvre", 2],
             ['validité du devis', 4], ['bon pour accord', 4], ['fourniture et pose', 4]],
      nomFichier: [['devis', 6]]
    },
    {
      id: 'prorogation', libelle: 'Prorogation des conditions suspensives', destination: 'Projet', portee: 'dossier', date: 'mois',
      famille: 'projet_annexe',
      mots: [['re:\\bprorogation\\b', 9], ['re:\\bproroger\\b', 5], ['conditions suspensives', 2], ['avenant au compromis', 5]],
      nomFichier: [['prorogation', 6]]
    }
  ],

  // Pièces dérivées : un type reconnu change de destination ou de libellé selon les règles de partage
  derives: {
    identite_hebergeant: { libelle: "Pièce d'identité de l'hébergeant", destination: 'État civil' },
    domicile_hebergeant: { libelle: "Justificatif de domicile de l'hébergeant", destination: 'État civil' },
    identite_donateur: { libelle: "Pièce d'identité du donateur", destination: 'Patrimoine/Épargne' },
    releve_pro: { libelle: 'Relevé de compte', destination: 'Revenus/{societe}' },
    releve_sci: { libelle: 'Relevé de compte', destination: 'Patrimoine/{sci}' },
    offre_pret_acquereurs: { libelle: 'Offre de prêt des acquéreurs', destination: 'Patrimoine/Immobilier/{bien}' },
    piece_sci: { destination: 'Patrimoine/{sci}' }
  },

  // Types qui, lorsqu'ils concernent une SCI (nommée en tête du document), vont dans le dossier de la SCI
  typesPiecesSci: ['titre_propriete', 'taxe_fonciere', 'bail', 'quittance', 'releve_compte', 'offre_pret', 'tableau_amortissement',
                   'bilan', 'arrete_comptable', 'statuts', 'kbis', 'releve_epargne'],

  // Groupes de familles compatibles dans un même fichier (pas de « plusieurs documents »)
  famillesCompatibles: [
    ['credit'], ['compromis', 'projet_annexe'], ['societe', 'comptes'], ['identite'], ['impot'], ['location']
  ],

  // Pièces qui prouvent qu'une personne citée sans pièce d'identité fait partie du dossier (co-emprunteur)
  typesPreuvePersonne: ['bulletin_salaire', 'contrat_travail', 'avenant', 'avis_imposition', 'declaration_revenus', 'avis_etranger',
                        'releve_compte', 'justificatif_domicile', 'domicile_etranger', 'releve_epargne', 'assurance_vie', 'declaration_2035',
                        'titularisation', 'fin_periode_essai', 'residence_fiscale', 'justificatif_retraite'],

  // Rôles lus dans le texte pour les règles de partage
  roles: {
    locataire: ['locataire', 'preneur', 'reçu de', 'avoir reçu de', 'le locataire'],
    bailleur: ['bailleur', 'propriétaire', 'je soussigné', 'le bailleur', 'loueur'],
    vendeur: ['vendeur', 'le vendeur', 'promettant', 'cédant'],
    acquereur: ['acquéreur', "l'acquéreur", 'bénéficiaire', 'acheteur', 'cessionnaire', 'réservataire']
  },

  // Titulaire d'un relevé : repères lus en tête du document
  titulaire: {
    professionnel: ['compte professionnel', 'compte pro', 'entreprise individuelle', 'profession libérale', 'compte courant professionnel'],
    zoneEntete: 900  // nombre de caractères lus en tête pour trouver le titulaire
  },

  credit: {
    conso: ['crédit à la consommation', 'prêt personnel', 'crédit renouvelable', 'crédit auto', 'prêt auto', 'location avec option d\'achat', 'code de la consommation, articles l312'],
    immo: ['prêt immobilier', 'crédit immobilier', 'prêt habitat', 'acquisition immobilière', 'hypothèque', 'privilège de prêteur', 'l313', 'articles l313']
  },

  // Formes juridiques : SCI vers Patrimoine, les autres vers Revenus
  formes: {
    sci: ['sci', 'société civile immobilière'],
    societe: ['sas', 'sasu', 'sarl', 'eurl', 'sa', 'selarl', 'selas', 'snc', 'sci', 'scm', 'scp', 'société par actions simplifiée',
              'société à responsabilité limitée', 'entreprise unipersonnelle', 'société anonyme', "société d'exercice libéral"],
    abreviations: {
      'société par actions simplifiée unipersonnelle': 'SASU', 'société par actions simplifiée': 'SAS',
      'société à responsabilité limitée': 'SARL', 'entreprise unipersonnelle à responsabilité limitée': 'EURL',
      'société anonyme': 'SA', "société d'exercice libéral à responsabilité limitée": 'SELARL', 'société civile immobilière': 'SCI',
      'société civile de moyens': 'SCM', 'société civile professionnelle': 'SCP'
    }
  },

  // Libellés précédant un nom de personne, d'entité ou une adresse
  libelles: {
    nom: ['nom', 'nom de naissance', 'surname', 'nom d\'usage'],
    prenom: ['prénoms', 'prénom', 'given names', 'given name', 'prenom(s)'],
    denomination: ['dénomination sociale', 'dénomination ou raison sociale', 'dénomination', 'raison sociale', 'nom commercial', 'désignation', 'nom ou dénomination'],
    formeJuridique: ['forme juridique', 'forme'],
    employeur: ['employeur', 'raison sociale', 'société', 'entreprise', 'établissement'],
    bien: ['adresse du bien', 'situation du bien', 'lieu de situation', 'désignation du bien', 'adresse des locaux', 'bien situé', 'situé au', 'situé à', 'sis au',
           'sis à', 'adresse du logement', 'logement situé', 'immeuble situé', 'adresse de la propriété', 'propriété située', 'bien objet', 'le bien'],
    expiration: ["date d'expiration", "valable jusqu'au", 'expire le', 'date of expiry', "fin de validité"],
    signature: ['fait à', 'signé le', 'le']
  },

  civilites: {
    f: ['madame', 'mme', 'mlle', 'mademoiselle', 'mrs', 'ms'],
    m: ['monsieur', 'm.', 'mr', 'mr.']
  },

  // ---------------- Profils (par personne, cumulables) ----------------
  // types : la personne a au moins une pièce d'un de ces types
  // mots  : et une de ces pièces contient un de ces mots
  // entite: la personne est liée à une entité de ce genre (société)
  // role  : la personne a ce rôle dans une pièce (bailleur)
  profils: [
    { id: 'fonctionnaire', libelle: { m: 'Fonctionnaire', f: 'Fonctionnaire' }, famille: 'emploi',
      si: [{ types: ['titularisation'] }, { types: ['bulletin_salaire'], mots: ['traitement brut indiciaire', 'indice majoré', 'traitement indiciaire'] }] },
    { id: 'cdi', libelle: { m: 'Salarié CDI', f: 'Salariée CDI' }, famille: 'emploi', salarie: true,
      si: [{ types: ['bulletin_salaire', 'contrat_travail', 'avenant', 'fin_periode_essai'], mots: ['contrat à durée indéterminée', 're:\\bcdi\\b', 'durée indéterminée', 'permanent basis', 'permanent contract'] }] },
    { id: 'cdd', libelle: { m: 'Salarié CDD', f: 'Salariée CDD' }, famille: 'emploi', salarie: true,
      si: [{ types: ['bulletin_salaire', 'contrat_travail', 'avenant'], mots: ['contrat à durée déterminée', 're:\\bcdd\\b', 'durée déterminée'] }] },
    { id: 'salarie', libelle: { m: 'Salarié', f: 'Salariée' }, famille: 'emploi', salarie: true, defautFamille: true,
      si: [{ types: ['bulletin_salaire', 'contrat_travail', 'avenant', 'fin_periode_essai'] }] },
    { id: 'primes', libelle: { m: 'Primes', f: 'Primes' }, precision: 'salarie',
      si: [{ types: ['bulletin_salaire'], mots: ['re:\\bprimes?\\b(?! (de )?transport)', 're:\\bbonus\\b', 're:\\bcommissions?\\b', 'part variable', '13e mois', 'treizième mois', 'gratification'] }] },
    { id: 'independant', libelle: { m: 'Indépendant', f: 'Indépendante' },
      si: [{ types: ['declaration_2035', 'contrat_collaboration'] }, { activite: true }] },
    { id: 'dirigeant', libelle: { m: 'Dirigeant', f: 'Dirigeante' },
      si: [{ entite: 'societe' }] },
    { id: 'retraite', libelle: { m: 'Retraité', f: 'Retraitée' },
      si: [{ mots: ['pension de retraite', 'titre de pension', 'notification de retraite', 'paiement de votre retraite', 'montant de votre retraite'] }] },
    { id: 'sans_activite', libelle: { m: 'Sans activité', f: 'Sans activité' },
      si: [{ mots: ['sans activité professionnelle', 'sans emploi'] }] },
    { id: 'bailleur', libelle: { m: 'Bailleur', f: 'Bailleresse' },
      si: [{ role: 'bailleur' }, { types: ['declaration_2044'] }] },
    // Aucun profil d'activité lu dans les pièces (salarié, fonctionnaire, indépendant, dirigeant, retraité, sans activité)
    { id: 'activite_inconnue', libelle: { m: 'Activité non déterminée', f: 'Activité non déterminée' }, siAucun: ['fonctionnaire', 'cdi', 'cdd', 'salarie', 'independant', 'dirigeant', 'retraite', 'sans_activite'] },
    { id: 'non_resident', libelle: { m: 'Non-résident', f: 'Non-résidente' },
      si: [{ types: ['residence_fiscale', 'avis_etranger', 'domicile_etranger'] }] }
  ],

  // ---------------- Situations du dossier ----------------
  situations: [
    { id: 'marie', si: [{ types: ['contrat_mariage'] }, { types: ['livret_famille', 'avis_imposition'], mots: ['re:\\bmarie(e|s|es)?\\b', 'acte de mariage'] }] },
    { id: 'pacse', si: [{ types: ['pacs'] }, { types: ['avis_imposition'], mots: ['re:\\bpacse(e|s|es)?\\b'] }] },
    { id: 'divorce', si: [{ types: ['divorce'] }, { types: ['avis_imposition'], mots: ['re:\\bdivorce(e|s|es)?\\b'] }] },
    { id: 'enfants', si: [{ types: ['livret_famille'] }, { types: ['avis_imposition'], mots: ['re:personnes? a charge\\s*:?\\s*[1-9]'] }] },
    { id: 'locataire', si: [{ role: 'locataire' }] },
    { id: 'heberge', si: [{ types: ['attestation_hebergement'] }] },
    { id: 'proprietaire', si: [{ types: ['titre_propriete', 'taxe_fonciere'] }, { role: 'bailleur' }] },
    { id: 'sci', si: [{ entite: 'sci' }] },
    { id: 'vente', si: [{ types: ['mandat_vente', 'offre_achat', 'accord_principe'] }, { role: 'vendeur' }] },
    { id: 'donation', si: [{ types: ['attestation_donation', 'cerfa_don'] }] },
    { id: 'succession', si: [{ types: ['succession'] }] },
    { id: 'credit_immo', si: [{ destination: 'Patrimoine/Crédits immo' }] },
    { id: 'credit_conso', si: [{ destination: 'Patrimoine/Crédits conso' }] },
    { id: 'bien_neuf', si: [{ types: ['contrat_reservation', 'notice_descriptive'] }] },
    { id: 'bien_ancien', si: [{ types: ['diagnostic'] }, { types: ['compromis'], destination: 'Projet' }] },
    { id: 'travaux', si: [{ types: ['devis_travaux'] }] },
    { id: 'investissement', si: [{ types: ['estimation_locative'], destination: 'Projet' }, { types: ['compromis', 'contrat_reservation'], destination: 'Projet', mots: ['investissement locatif', 'destiné à la location'] }] },
    { id: 'apport', si: [{ types: ['releve_epargne', 'assurance_vie', 'justificatif_apport'] }] },
    { id: 'non_resident', si: [{ profil: 'non_resident' }] }
  ],

  // ---------------- Pièces potentiellement manquantes ----------------
  // D'après « Mail type - Demande de pièces.md ». Une ligne ne s'applique que si sa condition est détectée.
  //   si      : 'tous', un id de situation, ou 'profil:<id>'
  //   par     : 'personne', 'dossier', 'sci', 'societe'
  //   types   : au moins une pièce de ces types (rattachée à la personne ou à l'entité)
  //   min     : nombre minimum de pièces distinctes (mois ou années selon la pièce)
  //   recent  : ancienneté maximum en mois
  //   mois12  : bulletin de décembre dernier
  //   role    : pièce dont le client a ce rôle
  //   libelle : texte du rapport. {entite} est remplacé par le nom de l'entité
  manquantes: [
    { si: 'tous', par: 'personne', types: ['cni', 'passeport', 'titre_sejour'], libelle: "pièce d'identité" },
    { si: 'enfants', par: 'dossier', types: ['livret_famille'], libelle: 'livret de famille' },
    { si: 'pacse', par: 'dossier', types: ['pacs'], libelle: 'attestation de PACS' },
    { si: 'divorce', par: 'dossier', types: ['divorce'], libelle: 'convention ou jugement de divorce' },
    { si: 'tous', par: 'dossier', types: ['justificatif_domicile', 'domicile_etranger'], recent: 3, sauf: ['heberge'], libelle: 'justificatif de domicile de moins de 3 mois' },
    { si: 'locataire', par: 'dossier', types: ['bail'], role: 'locataire', libelle: 'contrat de location' },
    { si: 'locataire', par: 'dossier', types: ['quittance'], role: 'locataire', min: 3, libelle: '3 dernières quittances de loyer' },
    { si: 'heberge', par: 'dossier', types: ['identite_hebergeant'], libelle: "pièce d'identité de l'hébergeant" },
    { si: 'heberge', par: 'dossier', types: ['domicile_hebergeant'], libelle: "justificatif de domicile de l'hébergeant" },
    { si: 'profil:non_resident', par: 'personne', types: ['residence_fiscale'], libelle: 'attestation de résidence fiscale' },
    { si: 'profil:non_resident', par: 'personne', types: ['domicile_etranger'], libelle: "justificatif de domicile à l'étranger" },
    { si: 'profil:non_resident', par: 'personne', types: ['avis_etranger'], libelle: "avis d'imposition à l'étranger" },
    { si: 'tous', par: 'personne', types: ['avis_imposition', 'declaration_revenus', 'avis_etranger'], min: 3, libelle: "3 derniers avis d'imposition" },
    { si: 'profil:salarie', par: 'personne', types: ['bulletin_salaire'], min: 3, libelle: '3 derniers bulletins de salaire' },
    { si: 'profil:salarie', par: 'personne', types: ['bulletin_salaire'], mois12: true, libelle: 'bulletin de salaire de décembre dernier' },
    { si: 'profil:primes', par: 'personne', types: ['bulletin_salaire'], anneesMin: 3, libelle: 'bulletins de salaire des 3 dernières années' },
    { si: 'profil:salarie', par: 'personne', types: ['contrat_travail'], sauf: ['profil:fonctionnaire'], libelle: 'contrat de travail' },
    { si: 'profil:fonctionnaire', par: 'personne', types: ['titularisation'], libelle: 'arrêté de titularisation' },
    { si: 'profil:independant', par: 'personne', types: ['declaration_2035'], anneesMin: 3, libelle: '3 dernières déclarations 2035' },
    { si: 'profil:independant', par: 'personne', types: ['releve_pro'], min: 3, libelle: '3 derniers mois de relevés de comptes professionnels' },
    { si: 'profil:dirigeant', par: 'societe', types: ['statuts'], libelle: 'statuts de {entite}' },
    { si: 'profil:dirigeant', par: 'societe', types: ['kbis'], libelle: 'K-bis de {entite}' },
    { si: 'profil:dirigeant', par: 'societe', types: ['bilan'], anneesMin: 3, libelle: 'bilans de {entite}', bilans: true },
    { si: 'profil:bailleur', par: 'dossier', types: ['bail'], role: 'bailleur', libelle: 'baux des biens mis en location' },
    { si: 'profil:bailleur', par: 'dossier', types: ['quittance'], role: 'bailleur', min: 3, libelle: '3 dernières quittances de loyer de chaque bien loué' },
    { si: 'profil:bailleur', par: 'dossier', types: ['declaration_2044'], libelle: 'déclaration 2044' },
    { si: 'tous', par: 'dossier', types: ['releve_compte'], min: 3, libelle: '3 derniers mois de relevés de comptes' },
    { si: 'tous', par: 'dossier', types: ['frais_bancaires'], libelle: 'récapitulatif annuel des frais bancaires' },
    { si: 'donation', par: 'dossier', types: ['attestation_donation'], libelle: 'attestation de donation' },
    { si: 'donation', par: 'dossier', types: ['identite_donateur'], libelle: "pièce d'identité du donateur" },
    { si: 'donation', par: 'dossier', types: ['cerfa_don'], libelle: 'CERFA de don' },
    { si: 'credit_immo', par: 'dossier', types: ['tableau_amortissement'], destination: 'Patrimoine/Crédits immo', libelle: "tableau d'amortissement du prêt immobilier" },
    { si: 'credit_immo', par: 'dossier', types: ['offre_pret'], destination: 'Patrimoine/Crédits immo', libelle: 'offre de prêt immobilier' },
    { si: 'credit_conso', par: 'dossier', types: ['tableau_amortissement'], destination: 'Patrimoine/Crédits conso', libelle: "tableau d'amortissement du prêt à la consommation" },
    { si: 'credit_conso', par: 'dossier', types: ['offre_pret'], destination: 'Patrimoine/Crédits conso', libelle: 'offre de prêt à la consommation' },
    { si: 'proprietaire', par: 'dossier', types: ['titre_propriete'], libelle: 'titre de propriété' },
    { si: 'proprietaire', par: 'dossier', types: ['taxe_fonciere'], libelle: 'dernière taxe foncière' },
    { si: 'vente', par: 'dossier', types: ['mandat_vente'], libelle: 'mandat de vente' },
    { si: 'vente', par: 'dossier', types: ['offre_achat'], libelle: "offre d'achat" },
    { si: 'vente', par: 'dossier', types: ['compromis'], role: 'vendeur', libelle: 'compromis de vente du bien actuel' },
    { si: 'vente', par: 'dossier', types: ['accord_principe', 'offre_pret_acquereurs'], libelle: 'accord de principe et offre de prêt des acquéreurs' },
    { si: 'sci', par: 'sci', types: ['statuts'], libelle: 'statuts' },
    { si: 'sci', par: 'sci', types: ['kbis'], libelle: 'K-bis' },
    { si: 'tous', par: 'dossier', types: ['compromis', 'contrat_reservation'], destination: 'Projet', libelle: 'compromis de vente ou contrat de réservation' },
    { si: 'bien_ancien', par: 'dossier', types: ['diagnostic'], libelle: 'diagnostics' },
    { si: 'bien_neuf', par: 'dossier', types: ['notice_descriptive'], libelle: 'notice descriptive' },
    { si: 'bien_neuf', par: 'dossier', types: ['plans'], libelle: 'plans' }
  ],

  // Types d'épargne lus pour la fiche client
  epargne: [
    ['re:\\blivret a\\b', 'Livret A'], ['re:\\bldds\\b|livret de developpement durable', 'LDDS'], ['re:\\blep\\b', 'LEP'],
    ["re:\\bpel\\b|plan d'epargne logement", 'PEL'], ['re:\\bcel\\b', 'CEL'], ['re:\\bpea\\b', 'PEA'],
    ['re:assurance.vie', 'assurance vie'], ['compte titres', 'compte titres']
  ],

  // Pays étrangers reconnus dans une adresse (non-résident)
  paysEtrangers: ['royaume-uni', 'united kingdom', 'england', 'london', 'suisse', 'switzerland', 'belgique', 'belgium', 'luxembourg',
                  'allemagne', 'germany', 'espagne', 'spain', 'italie', 'italy', 'portugal', 'canada', 'usa', 'united states', 'maroc',
                  'dubai', 'emirats', 'singapore', 'singapour', 'monaco', 'pays-bas', 'netherlands', 'ireland', 'irlande']
};
