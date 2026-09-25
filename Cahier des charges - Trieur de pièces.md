# Cahier des charges : Trieur de pièces

Outil de tri automatique des pièces justificatives d'un dossier de prêt immobilier, pour courtiers en crédit et assurance. Démo préparée pour Emérite Groupe.

Ce document rassemble toutes les décisions prises pendant le cadrage. Il suffit pour lancer la construction sans autre contexte.

---

## 1. Objectif

Le courtier reçoit les pièces d'un client en vrac. L'outil les lit, reconnaît chaque pièce, la renomme, la rattache à la bonne personne ou entité et la range dans l'arborescence du dossier de prêt. Il rend un ZIP prêt à l'emploi, avec un rapport de tri et une fiche client.

Le but est de gagner du temps. L'outil trie, il n'analyse pas.

### Ce que l'outil ne fait pas

- Aucun calcul : pas de taux d'endettement, de reste à vivre ni de seuil
- Aucune vérification de montants ou de cohérence entre pièces
- Aucun avis de faisabilité et aucune notation des refus bancaires
- Aucun découpage d'un PDF qui contient plusieurs documents (il part dans « À vérifier »)

Ces contrôles passent par un autre outil et restent humains.

---

## 2. Public et ton

- Destiné aux professionnels. L'utilisateur sait à quoi sert l'outil : aucun texte explicatif, aucune phrase de présentation, aucune garantie affichée
- Propre, rapide, intuitif, sans détail superflu
- Pas de badge « 100 % local » dans la version finale

---

## 3. Contraintes techniques

- Application web locale : un dossier `index.html` avec un sous-dossier `libs/`, ouvert par double-clic, sans serveur
- Aucune donnée envoyée en ligne : lecture, OCR, tri et génération des PDF se font dans le navigateur
- Toutes les bibliothèques sont embarquées dans `libs/`, aucun appel à un CDN au lancement
- Le logo est intégré dans l'application (fichier fourni : `Logo Emérite Groupe.jpg`)
- Navigateurs cibles : Chrome et Edge récents

### Bibliothèques proposées

| Besoin | Bibliothèque |
|---|---|
| Lecture des PDF texte et rendu des pages en image | pdf.js (`pdfjs-dist`) |
| OCR des scans et photos, français et anglais | Tesseract.js avec les packs `fra` et `eng` |
| Lecture des Word (.docx) | mammoth.js |
| Lecture des Excel (.xlsx) | SheetJS |
| Photos iPhone (.heic) | heic2any |
| Lecture des ZIP reçus et création du ZIP de sortie | JSZip |
| Génération des deux PDF de sortie | jsPDF (ou pdf-lib) |
| Détection de doublons | empreinte SHA-256 via l'API Web Crypto |

---

## 4. Entrées acceptées

- Dépôt d'un dossier entier (sous-dossiers inclus) ou d'une sélection de fichiers, par glisser-déposer ou via deux boutons « Dossier » et « Fichiers »
- Formats : PDF (texte ou scanné), JPG, JPEG, PNG, HEIC, TIFF, WebP, captures d'écran, DOCX, XLSX, ZIP
- Anciens formats DOC et XLS : lecture tentée, sinon le fichier part dans « À vérifier » avec la raison
- Les ZIP reçus sont ouverts et leur contenu est trié comme le reste (ZIP imbriqués compris)
- Les photos de documents sont redressées et améliorées (contraste, rotation) avant l'OCR

---

## 5. Principes de conception du moteur

Le moteur est adaptatif, jamais rigide.

1. Règles en données, pas en code : types de pièces, mots-clés français et anglais, dossier de destination et profils sont décrits dans un fichier de configuration lisible (par exemple `regles.json`). On ajoute ou modifie une règle sans toucher au moteur
2. Reconnaissance par score : chaque fichier reçoit un score par type de pièce (mots-clés, structure, en-têtes, nom du fichier d'origine). Sous un seuil de confiance, le fichier part dans « À vérifier »
3. Dossiers créés à la demande : jamais de dossier vide. « À vérifier » n'existe que s'il contient au moins un fichier. Les dossiers par bien, par SCI et par société prennent le nom lu dans les pièces (adresse du bien, dénomination sociale), et les variantes proches sont regroupées
4. Profils cumulables, déduits des pièces présentes : un client peut être salarié et bailleur, ou dirigeant avec une SCI
5. Une pièce inconnue ou ambiguë n'est jamais forcée dans une catégorie : elle part dans « À vérifier », avec la raison dans le rapport
6. Aucune pièce potentiellement manquante demandée si elle ne correspond pas au profil détecté

### Garantie « aucun fichier oublié »

- Inventaire de départ de tous les fichiers déposés, sous-dossiers et contenu des ZIP compris
- Contrôle de bouclage en fin de tri : fichiers reçus = fichiers classés + fichiers à vérifier. Si le compte ne tombe pas juste, une alerte s'affiche et le ZIP n'est pas généré sans le signaler
- Rien n'est ignoré en silence : fichier illisible, protégé par mot de passe, corrompu, vide ou dans un format non géré part dans « À vérifier » avec la raison
- Doublons : les deux exemplaires sont conservés, le second est signalé
- Les fichiers d'origine ne sont jamais modifiés, le ZIP contient des copies renommées

---

## 6. Rattachement aux personnes et entités

- Détection des personnes (emprunteur 1, emprunteur 2) et des entités (SCI, société d'exploitation) à partir des pièces d'identité et des noms lus dans les documents
- Couples : chaque pièce nominative va à la personne concernée. Les pièces communes (avis d'imposition commun, livret de famille) portent les deux noms
- SCI : tout ce qui touche à la SCI va dans son dossier, les pièces personnelles de chaque associé restent à leur personne
- Nom mal lu ou homonyme incertain : le fichier part dans « À vérifier » plutôt qu'à la mauvaise personne
- Cas couverts : personne seule, couple, co-emprunteurs, SCI (une ou plusieurs), société d'exploitation (une ou plusieurs), non-résident

---

## 7. Arborescence de sortie

```
NOM Prénom et NOM Prénom.zip
├── Fiche client.pdf
├── Rapport de tri.pdf
├── À vérifier/                              (seulement s'il y a des fichiers à vérifier)
├── État civil/
├── Patrimoine/
│   ├── Épargne/
│   ├── Relevés de compte/
│   ├── Immobilier/
│   │   └── [un sous-dossier par bien]/
│   ├── Crédits immo/
│   ├── Crédits conso/
│   └── [un sous-dossier par SCI]/
├── Projet/
└── Revenus/
    ├── Avis d'imposition/
    ├── Bulletins de salaire et contrat/
    ├── Revenus fonciers/
    └── [un sous-dossier par société]/
```

- Un dossier n'apparaît que s'il contient au moins un fichier
- Pas de dossier par personne : le nom en tête de chaque fichier suffit à distinguer les pièces
- Plusieurs crédits immo ou conso : un seul dossier, les noms de fichiers les distinguent

### Nom du ZIP

Nom du ou des clients : `NOM Prénom.zip` ou `NOM Prénom et NOM Prénom.zip`.

### Nommage des fichiers

`NOM Prénom - Type de fichier - date`, avec l'extension d'origine conservée.

- La date est celle du document (mois ou année selon la pièce) quand elle est trouvable. Sinon, elle est omise
- Pièce d'une entité : le nom de l'entité remplace `NOM Prénom`, par exemple `SCI LES TILLEULS - Statuts`
- Exemples : `LEROY Camille - Bulletin de salaire - 08-2026.pdf`, `BENHAMOU Julien - Avis d'imposition - 2025.jpg`

---

## 8. Catalogue des pièces et destination

| Pièce | Destination |
|---|---|
| Carte d'identité recto/verso, passeport | État civil |
| Livret de famille | État civil |
| Contrat de mariage, attestation de PACS | État civil |
| Convention ou jugement de divorce, justificatifs de pension | État civil |
| Justificatif de domicile de moins de 3 mois | État civil |
| Contrat de location et quittances de loyer personnelles (client locataire) | État civil |
| Attestation d'hébergement, pièce d'identité et justificatif de domicile de l'hébergeant | État civil |
| Non-résident : attestation de résidence fiscale, justificatif de domicile à l'étranger, titre de séjour | État civil |
| Avis d'imposition, déclaration de revenus, avis d'imposition étranger | Revenus / Avis d'imposition |
| Bulletins de salaire, contrat de travail, avenant, attestation de fin de période d'essai, arrêté de titularisation, contrat de collaboration | Revenus / Bulletins de salaire et contrat |
| Quittances de loyer des biens mis en location, déclaration 2044 | Revenus / Revenus fonciers |
| Statuts, K-bis, bilans, arrêté comptable, déclarations 2035, relevés de comptes professionnels d'une société | Revenus / [Nom de la société] |
| Relevés de comptes courants personnels et joints, récapitulatifs annuels de frais bancaires | Patrimoine / Relevés de compte |
| Relevés d'épargne, assurances vie, captures d'épargne, justificatifs d'apport | Patrimoine / Épargne |
| Donation (pièce d'identité du donateur, attestation, provenance des fonds, CERFA), succession | Patrimoine / Épargne |
| Titre de propriété ou attestation de propriétaire, taxe foncière, baux, mandat de vente, offre d'achat, compromis de vente du bien actuel, accord de principe et offre de prêt des acquéreurs, estimations de valeur locative du bien actuel | Patrimoine / Immobilier / [Bien] |
| Offres et tableaux d'amortissement des prêts immobiliers en cours | Patrimoine / Crédits immo |
| Offres et tableaux d'amortissement des prêts à la consommation en cours | Patrimoine / Crédits conso |
| Statuts de la SCI, projet de statuts, K-bis de la SCI, relevés de compte de la SCI et toute pièce de la SCI | Patrimoine / [Nom de la SCI] |
| Compromis de vente ou contrat de réservation du bien acheté, diagnostics, notice descriptive et plans, devis travaux, prorogation des conditions suspensives, estimations de valeur locative du bien acheté | Projet |
| Pièce non reconnue, illisible, ambiguë, plusieurs documents dans un seul fichier | À vérifier |

### Règles de partage

- Quittances de loyer : celles que paie le client (locataire) vont en État civil, celles qu'il perçoit (bailleur) vont en Revenus fonciers
- Baux des biens loués : Patrimoine / Immobilier / [Bien]
- Relevés bancaires : titulaire personne physique, donc Patrimoine / Relevés de compte. Titulaire société ou compte professionnel, donc Revenus / [Société]. Titulaire SCI, donc Patrimoine / [SCI]
- Statuts et K-bis : forme juridique SCI, donc Patrimoine / [SCI]. Société d'exploitation, donc Revenus / [Société]
- Estimations de valeur locative : bien actuel, donc Patrimoine / Immobilier / [Bien]. Bien acheté, donc Projet

---

## 9. Profils

Profils détectés et cumulables, par personne :

- Salarié CDI, salarié CDD, fonctionnaire
- Indépendant, libéral, TNS
- Dirigeant de société
- Retraité
- Sans activité
- Bailleur
- Non-résident
- Primes ou part variable (précision d'un profil salarié)

Situations détectées pour le dossier : personne seule ou couple, marié, pacsé, divorcé, enfants, locataire, hébergé, propriétaire, SCI, vente du bien actuel, donation, succession, crédits en cours, bien ancien ou neuf, travaux.

### Pièces potentiellement manquantes

Calculées à partir des profils et situations détectés, en s'appuyant sur le mail type (`Mail type - Demande de pièces.md`). Seules les pièces qui correspondent au profil sont signalées. Exemples :

- Salarié sans contrat de travail trouvé, ou sans bulletin de décembre dernier
- Salarié avec primes sans bulletins des 3 dernières années
- Indépendant sans ses 3 dernières déclarations 2035
- Dirigeant sans ses 3 derniers bilans
- SCI sans K-bis
- Propriétaire sans taxe foncière
- Crédit en cours sans tableau d'amortissement

Le rapport écrit « pièces potentiellement manquantes », jamais « dossier incomplet ».

---

## 10. Documents générés

### Rapport de tri.pdf

Une seule page, concise, dans la charte graphique :

- En-tête noir avec le logo Emérite Groupe, titre « Rapport de tri » et date
- Noms des clients et des entités
- Trois compteurs : reçus, classés, à vérifier
- Fichiers à vérifier, chacun avec sa raison en une ligne
- Pièces potentiellement manquantes, par personne ou entité
- Pied de page : « Tri automatique, contrôle humain requis » et « Page 1 / 1 »
- Ce qui a été classé sans problème n'est pas listé
- Si la liste dépasse une page, elle est plafonnée (par exemple 10 lignes puis « et X autres »), le détail complet reste à l'écran

### Fiche client.pdf

Une seule page, même charte, uniquement ce qui se lit dans les pièces, sans aucun montant :

- En-tête noir avec logo, titre « Fiche client » et date
- Noms des emprunteurs, situation familiale et logement actuel (par exemple « Pacsés, 1 enfant. Locataires, Paris 11e »)
- Un bloc par emprunteur : profil, employeur ou société, validité de la pièce d'identité
- Bloc « Patrimoine » au sens large : biens détenus, SCI (une ligne parmi les autres, avec ses associés), crédits en cours, types d'épargne
- Bloc « Projet » : type de bien, adresse, date du compromis
- Pied de page : « Page 1 / 1 » uniquement
- Une ligne sans information trouvée n'apparaît pas

---

## 11. Interface

La maquette validée est fournie : `Maquette - Trieur de pièces.html`. La construction reprend sa structure et son style.

### Structure

- En-tête noir avec le logo, deux onglets : « Trieur » et « Mail type »
- Barre latérale : bouton « Nouveau dossier », puis la liste des dossiers traités, classés par jour, avec leur état (en cours avec pourcentage, nombre de fichiers à vérifier, OK). Un clic rouvre un dossier sans le perdre
- Écran de dépôt : une zone « Déposer les pièces » et deux boutons « Dossier » et « Fichiers », rien d'autre
- Écran de tri : nom du dossier, compteur, barre de progression, journal fichier par fichier (nom d'origine, nouveau nom, destination, état)
- Écran de résultat : noms des clients, compteurs, bouton « Télécharger le ZIP », profils détectés, contenu du ZIP en arbre, aperçu des deux PDF en onglets « Fiche client » et « Rapport de tri »
- Onglet « Mail type » : le mail de demande de pièces, copiable en un clic

### Mémoire des dossiers

- Version locale : les dossiers restent disponibles tant que l'outil est ouvert, ils sont perdus à la fermeture
- Version déployée : les dossiers sont conservés entre les sessions

### Charte graphique

Reprise du site emerite-groupe.com, en version adoucie.

| Rôle | Couleur |
|---|---|
| En-tête et en-tête des PDF | `#000000` (fond du logo) |
| Fond de page | `#F5F1EC` |
| Panneaux | `#FFFFFF` |
| Traits | `#E8E0D8` |
| Beige clair | `#ECE4DC` |
| Beige très clair | `#F8F4F0` |
| Doré (boutons principaux, progression) | `#B08D63` |
| Doré texte | `#7D5D38` |
| Texte | `#2A2522` |
| Texte secondaire | `#756A61` |
| À vérifier | `#A4502F` sur `#F8EBE5` |
| OK | `#5B7F5C` |

Couleurs d'origine du site pour référence : beige `#D8CCC2`, crème `#FBF8F5`, doré `#AC865C`, brun `#775226`.

- Police système classique : Segoe UI, Helvetica Neue, Arial
- Boutons en pilule, animations courtes (150 à 250 ms), retour visuel au clic
- Contrastes conformes WCAG AA, navigation au clavier, focus visible, aucune information portée par la seule couleur
- Aucun tiret long dans les textes affichés

---

## 12. Tests

- Générer un ou plusieurs dossiers fictifs (faux PDF texte, faux scans, photos, Word, Excel, un ZIP, un PDF à plusieurs documents, un fichier illisible, un doublon), sans aucune donnée réelle
- Couvrir au minimum : une personne seule salariée, un couple avec SCI et société, un indépendant, un non-résident
- Vérifier sur chaque dossier : bouclage du compte, aucun dossier vide, nommage, rattachement aux bonnes personnes, rapport et fiche client sur une seule page

---

## 13. Fichiers fournis avec ce document

- `Logo Emérite Groupe.jpg` : logo, fond noir
- `Maquette - Trieur de pièces.html` : maquette validée, sans moteur
- `Mail type - Demande de pièces.md` : mail de demande de pièces, base de l'onglet « Mail type » et des pièces potentiellement manquantes
