# Cahier des charges v2 — Cotiz

Oct 27, 2026 · @Ndeye Penda SARR · mis à jour le 1er novembre 2026 (état réel de la v0 après les audits)

## Contexte et problème

Objectif : une web app mobile-first qui permet à une trésorière de tontines de capturer chaque paiement au moment où il arrive, puis de rapprocher le soir en 10 minutes au lieu d'une heure.

La trésorière gère 2 à 3 caisses de 30+ membres. Certaines personnes sont membres de plusieurs caisses. Elle traite environ 30 à 60 paiements par mois.

**Comment l'argent arrive aujourd'hui**

- **Wave (majoritaire)** : chaque paiement reçu déclenche en général un SMS Wave. Parfois le SMS arrive en retard ou pas du tout ; la transaction reste visible dans l'app Wave.
- **Orange Money (secondaire)**.
- **Cash (rare)**.
- Les membres envoient souvent une capture WhatsApp après avoir payé.

**Le problème** : tout est noté de mémoire puis recopié au cahier le soir. Résultat : oublis, erreurs de recopie, confusions entre membres aux noms proches, relances faites une par une.

**Point clé pour la conception** : tous les paiements arrivent sur **un seul compte Wave**, quelle que soit la caisse. Un SMS ne dit donc pas à quelle caisse ni à quel cycle il correspond. Un même envoi peut couvrir deux caisses ou deux cycles. Le modèle de données doit gérer ce cas.

**Hors objectifs** : remplacer Wave ou Orange Money, créer une preuve de paiement, intégrer l'API Wave.

## Périmètre par phases

On livre la v0 seule, on l'utilise sur un vrai cycle, puis on décide de la v1. Aucune fonctionnalité v1 n'est codée tant que la v0 n'est pas validée.

| Phase | Contenu | Utilisateurs |
| --- | --- | --- |
| **v0** | Login simple, caisses, personnes, membres, cycles, échéances, collage SMS Wave + parsing, saisie manuelle (Wave sans SMS, OM, cash), dédoublonnage, rapprochement proposé, tableau « qui a payé », relance par lien wa.me, journal d'audit | La trésorière seule |
| **v0 (ajouts demandés en cours de route)** | Import d'une liste collée (cellule, versé, canal), dépenses et bonnes volontés d'une collecte, rapprochement groupé (« sûrs »), historique des cycles, graphiques de l'accueil et des caisses, datation des versés importés (SMS Wave, modèles Wave et Orange Money, date à la main), doublons de la liste importée, limite des essais de connexion | La trésorière seule |
| **v1** | Upload de captures WhatsApp, vue membre en lecture seule (lien signé, sans compte), validation cash par le membre, bénéficiaire et versement de la cagnotte, export PDF par cycle, parser SMS Orange Money (format connu, voir plus bas) | Trésorière + membres |
| **v2** | Scoring de ponctualité, prévisions de trésorerie, PWA et notifications, raccourci iOS, OCR, multi-trésorières | — |

**Exclu partout** : OTP par SMS ou WhatsApp (coût et vérification Meta), app native, API Wave ou Orange Money, paiement intégré.

## Stack technique

Une seule plateforme pour la base, l'auth et le stockage : Supabase. Moins de services = moins de configuration.

| Couche | Choix | Remarque |
| --- | --- | --- |
| Framework | Next.js 16 (App Router, Turbopack, Cache Components, `proxy.ts`) | Suivre les API de la version installée (`node_modules/next/dist/docs/`) |
| Langage | TypeScript strict | Pas de dossier `src/` |
| UI | Tailwind CSS 4 + shadcn/ui (style `base-nova`, primitives Base UI) | Mobile-first, testé sur Safari iPhone ; version ordinateur avec barre latérale ; mode clair et sombre |
| Graphiques | Composants maison (HTML/SVG rendus côté serveur) | Aucune bibliothèque ; version texte pour les lecteurs d'écran |
| ORM | Prisma 7 (adaptateur `pg`, client généré dans `lib/generated/prisma`) | Migrations versionnées dans le dépôt, SQL complété à la main (RLS, contraintes) |
| Base | PostgreSQL sur Supabase | RLS activée sans policy sur toutes les tables |
| Auth (v0) | Supabase Auth, e-mail + mot de passe | Pas d'OTP. `Utilisatrice.id` = id de l'utilisateur Supabase |
| Stockage (v1) | Supabase Storage, bucket privé | Pour les captures WhatsApp |
| Validation | Zod | Sur chaque entrée d'API et de formulaire |
| Appels client | Server Actions (`useActionState`) | Pas de Redux ni de TanStack Query |
| Tests | Vitest | Tests unitaires purs (`npm test`) et tests d'intégration sur la base locale (`npm run test:isolation`) |
| Déploiement | Vercel (`dub1`) + Supabase (`eu-west-1`) |  |

## Format SMS Wave et parser

Le SMS Wave de réception contient le numéro de l'expéditeur : c'est la clé de rapprochement la plus fiable, avant le nom. Format observé sur de vrais SMS (octobre 2026) :

```text
Vous avez recu 2.000F
De Moussa Ndiaye (771234567)
27/10/2026 à 15h07
Nouveau solde: 9.500F
+infos: 200600
Avec WDF
T4VKYYABCD12K7MOX
```

(Valeurs fictives. Structure réelle.)

**Règles du format**

| Ligne | Contenu | Piège |
| --- | --- | --- |
| `Vous avez recu <montant>F` | Montant en FCFA | Point = séparateur de milliers (`2.000` = 2000). « recu » sans cédille, mais accepter « reçu » |
| `De <nom> (<numéro>)` | Nom Wave + numéro | Le nom peut être en minuscules. Le nom et le numéro peuvent être coupés sur 2 lignes |
| `JJ/MM/AAAA à HHhMM` | Date et heure | Heure de Dakar (UTC+0) |
| `Nouveau solde: …` | Solde de la trésorière | **Ne jamais extraire ni stocker** |
| `+infos: 200600` et `Avec WDF` | Mentions fixes | Ignorer |
| Dernière ligne | Référence de transaction | Exactement 17 caractères, lettres majuscules et chiffres |

**Contrat de `lib/parsers/smsWave.ts`**

```ts
type ResultatParsing =
  | { ok: true; montant: number; nomExpediteur: string | null;
      telephoneExpediteur: string | null; dateReception: Date;
      reference: string | null;
      champsManquants: ("nom" | "telephone" | "reference")[] }
  | { ok: false; raison: string };

export function parserSmsWave(texte: string): ResultatParsing;
export function retirerLigneSolde(texte: string): string;
```

- Ne jamais lever d'exception : un format inconnu renvoie `ok: false`.
- Seuls le **montant** et la **date** sont obligatoires. Si le nom, le numéro ou la référence manquent, le résultat est `ok: true` avec le champ à `null` et son nom dans `champsManquants` (décision du 28/10/2026).
- Plusieurs SMS collés d'un coup : `ok: false`, raison « 2 SMS détectés, colle-les un par un ».
- Normaliser avant de parser : retours chariot, espaces multiples, espaces insécables, lignes vides.
- Rechercher chaque champ indépendamment (pas une seule regex géante) : si un champ manque, les autres sont quand même extraits.
- Numéro normalisé en 9 chiffres (retirer espaces, `+221`, `00221`).
- Le texte brut, sans la ligne du solde, est toujours stocké : dans `Paiement.texteBrut` si le parsing réussit, dans `SmsNonLu.texteBrut` sinon (voir « Décisions du 28/10/2026 »).
- Un SMS collé plusieurs fois (même référence) ne crée jamais un 2e paiement.

**Cas de test Vitest obligatoires** (fixtures fictives dans `tests/fixtures/sms/`)

1. SMS standard, nom et numéro sur une ligne.
2. Nom en minuscules, numéro renvoyé à la ligne suivante.
3. Petits et grands montants : `500F`, `25.000F`, `1.250.000F`.
4. Texte collé depuis iPhone avec espaces parasites et lignes vides.
5. Référence absente : `ok: true`, `reference: null`, `champsManquants` contient `reference`.
6. Texte qui n'est pas un SMS de réception : `ok: false`.
7. Le solde n'apparaît nulle part dans le résultat.

9 SMS réels ont été fournis ; le dépôt n'en garde que la forme (`tests/fixtures/sms/format-wave.txt` : noms, numéros, références, dates et soldes inventés, mêmes pièges de format).

## Format SMS Orange Money (v1, pas encore codé)

Format fourni par la trésorière (31/10/2026), sur une seule ligne :

```text
Vous avez recu un transfert de 5000.00FCFA de 77…9 Diallo. Ref:PP260415.0932.C48217 .Votre solde… FCFA.Merci.OFMS
```

(Nom, numéro, référence et solde inventés ou masqués. Structure réelle.)

| Élément | Contenu | Piège |
| --- | --- | --- |
| `transfert de <montant>FCFA` | Montant | Point **décimal** (`5000.00` = 5 000), à l'inverse de Wave où le point sépare les milliers |
| `de <numéro> <nom>` | Numéro puis nom de l'expéditeur | Ordre inverse de Wave ; nom parfois réduit au nom de famille |
| `Ref:PP…` | Référence de transaction (commence par `PP`) | Contient des points |
| `Votre solde…` | Solde de la trésorière | **Ne jamais extraire ni stocker**, retiré avant tout comme pour Wave |
| — | **Aucune date** | La date de collage ne vaut pas date de paiement : la date viendra de l'application Orange Money ou sera saisie |

**Déjà en place en v0** : pour dater un versé importé payé par Orange Money, la trésorière complète un modèle Cotiz prérempli (montant, nom, numéro) avec la date, l'heure et la référence `PP…` lues dans l'application (`lib/capture/modele-orange-money.ts`). Le parser du SMS lui-même reste en v1. Avant de le coder : obtenir 5 à 10 SMS réels anonymisés et décider avec la trésorière d'où vient la date.

## Matching et rapprochement

Le système propose, la trésorière valide. Aucun paiement n'est affecté à une échéance sans un clic de confirmation.

**Étape 1 — Identifier la personne** (`lib/matching/personne.ts`)

| Priorité | Critère | Confiance |
| --- | --- | --- |
| 1 | Numéro de l'expéditeur = un numéro connu de la personne (`NumeroPersonne`) | Haute |
| 2 | Nom Wave = un alias connu de la personne (comparaison normalisée : minuscules, sans accents, espaces réduits) | Moyenne |
| 3 | Nom proche (distance de similarité) | Basse : afficher 3 suggestions maximum |

Quand la trésorière confirme une personne pour un numéro ou un nom inconnu, proposer d'enregistrer ce numéro ou cet alias pour la prochaine fois. C'est ce qui rend l'outil plus rapide à chaque cycle (ex. un mari qui paie pour sa femme).

**Étape 2 — Répartir sur les échéances** (`lib/matching/allocation.ts`)

- Lister les échéances ouvertes de la personne, toutes caisses confondues, de la plus ancienne à la plus récente.
- Si le montant = une échéance : la proposer.
- Si le montant = la somme de plusieurs échéances (2 caisses, ou 2 cycles) : proposer cette répartition.
- Sinon : proposer de remplir les plus anciennes d'abord ; le reste devient un paiement partiel. Un excédent est marqué « à rembourser » : pas d'avance sur le cycle suivant.
- La trésorière peut toujours modifier la répartition à la main.

**Statut d'une échéance** = calculé à partir des allocations : `EN_ATTENTE` (0), `PARTIEL` (0 < somme < dû), `PAYE` (somme ≥ dû).

**Étape 3 — Paiements « sûrs »** (`lib/matching/surete.ts`, ajouté au lot 4 du design)

- Un paiement est **sûr** quand il n'y a rien à décider : une seule personne, trouvée par son numéro ou déjà identifiée (confiance haute), et une répartition qui tombe juste (une échéance ou une combinaison exacte), sans excédent ni autre répartition possible. Un paiement partiel n'est jamais sûr.
- La page de rapprochement affiche d'abord les paiements « à vérifier », puis les « sûrs ». Confiance en 3 niveaux avec sa raison (Identifiée, Probable, À confirmer), jamais un pourcentage.
- **Valider les sûrs** : seuls des identifiants partent du navigateur (100 au maximum). Chaque paiement est refait et revérifié dans sa propre transaction ; celui qui n'est plus sûr est laissé de côté. Les SMS et saisies passent avant les versés repris d'une liste importée : quand les deux couvrent la même cotisation, le SMS est gardé et le versé repris reste « à vérifier ».
- `lib/matching/*` est pur (aucune base) : il tourne aussi dans le navigateur pour recalculer les propositions. La Server Action revérifie toujours tout (`verifierRepartition` sur le reste dû relu dans la transaction, après verrouillage).

**Tests Vitest obligatoires** : match par numéro, par alias, nom avec accents et casse différents, aucune correspondance, personne dans 2 caisses avec un paiement qui couvre les deux, montant partiel, montant supérieur au dû.

## Schéma de données (v0)

Le schéma sépare ce qui est dû (`Echeance`) de ce qui est reçu (`Paiement`), reliés par `Allocation`. Un paiement peut ainsi couvrir plusieurs caisses ou plusieurs cycles.

**La source de vérité est [prisma/schema.prisma](prisma/schema.prisma)** (commenté champ par champ) et ses migrations dans `prisma/migrations/`. Le schéma recopié ici en phase 1 a été retiré : il n'était plus à jour. Les enums s'écrivent une valeur par ligne et le générateur est `prisma-client` (Prisma 7).

**Changements par rapport à la v1 du cahier**

| Problème corrigé | Solution |
| --- | --- |
| Un paiement ne pouvait couvrir qu'une seule cotisation | `Paiement` + `Echeance` + `Allocation` |
| `Personne` sans propriétaire (fuite entre comptes) | `ownerId` sur `Personne` et `Paiement` |
| Statuts en texte libre | `enum` Prisma |
| `Decimal(12,2)` pour le FCFA | `Int` (pas de centimes) |
| Doublons de SMS | Contrainte unique sur la référence |
| Numéros multiples par personne non gérés | Table `NumeroPersonne` |

**Tables**

| Modèle (table) | Rôle | Points notables |
| --- | --- | --- |
| `Utilisatrice` (`utilisatrices`) | La trésorière | `id` = id Supabase Auth ; `nom` d'affichage modifiable |
| `Caisse` (`caisses`) | Tontine ou collecte | `type`, `montantCotisation`, `frequence` + `jourEcheance` (tontine) ou `dateLimite` (collecte), `modeleRelance`, `statut` ACTIVE / ARCHIVEE |
| `Personne` (`personnes`) | Une personne, partagée entre caisses | `aliasWave[]`, `cellule` |
| `NumeroPersonne` (`numeros_personne`) | Numéros d'une personne (9 chiffres) | Un numéro peut appartenir à 2 personnes |
| `MembreCaisse` (`membres_caisse`) | Inscription d'une personne dans une caisse | `ordrePassage` unique par caisse, `statut` ACTIF / INACTIF |
| `Cycle` (`cycles`) | Un tour de tontine, ou l'unique cycle d'une collecte | Un seul cycle `OUVERT` par caisse (index unique partiel) ; `beneficiaireId` réservé à la v1 |
| `Echeance` (`echeances`) | Ce qu'un membre doit pour un cycle | `montantDu` figé à la création |
| `Paiement` (`paiements`) | Argent reçu | Voir ci-dessous |
| `Allocation` (`allocations`) | Part d'un paiement affectée à une échéance | Clé (`paiementId`, `echeanceId`) |
| `SmsNonLu` (`sms_non_lus`) | SMS que le parser n'a pas su lire | Texte sans solde, `A_TRAITER` / `TRAITE` |
| `Depense` (`depenses`) | Sortie d'argent d'une collecte | Catégorie fixe, canal |
| `Don` (`dons`) | Bonne volonté versée à une collecte | `remisPar`, `paiementId` unique s'il vient d'un excédent |
| `JournalAudit` (`journal_audit`) | Historique de toute mutation d'argent et des changements de caisse, cycle, personne, membre | Écrit dans la même transaction |
| `TentativeConnexion` (`tentatives_connexion`) | Échecs de connexion récents | Adresse jamais en clair (empreinte SHA-256), purgée après un jour |

**`Paiement` en détail**

- `canal` (WAVE / ORANGE_MONEY / CASH), `source` (SMS_WAVE / SAISIE_MANUELLE), `statut` (A_RAPPROCHER / RAPPROCHE / IGNORE).
- `origine` : `CAPTURE` (SMS collé, saisie) ou `REPRISE_IMPORT` (colonne « Versé » d'une liste importée : le même argent, déjà reçu).
- `datation` (reprises seulement) : `NON_DATEE` (date de l'import, exclue du graphique « Reçu par jour »), `PAR_SMS` (date et référence d'un SMS ou d'une application), `A_LA_MAIN`.
- `dateRepriseId` : sur un SMS ignoré qui a servi à dater une reprise. Ce SMS ne revient jamais dans les comptes.
- `note` : texte libre de la trésorière, sans aucun effet sur le comportement.
- `rembourseLe` (excédent remboursé), `rapprocheLe` (date de validation).
- Contrainte unique (`ownerId`, `canal`, `reference`) : anti-doublon ; NULL autorisé plusieurs fois.
- Filtres partagés : `lib/paiements/origine.ts` (`REPRISE`, `REPRISE_NON_DATEE`, `CAPTURE_IGNOREE_LIBRE`).

**Garanties portées par la base**

- RLS activée sans policy sur toutes les tables, `_prisma_migrations` comprise : l'API REST publique de Supabase ne voit rien.
- `CHECK (montant > 0)` sur `paiements`, `allocations`, `dons` et `depenses`.
- Historique financier protégé : `echeances → membres_caisse`, `allocations → echeances` et `dons → paiements` sont en `NO ACTION DEFERRABLE INITIALLY DEFERRED`. Supprimer une caisse, une personne ou un cycle qui porte des affectations est refusé ; supprimer un compte entier reste possible. `echeances → cycles` reste en cascade.
- Index sur les clés étrangères les plus lues (`allocations(echeance_id)`, `echeances(membre_caisse_id)`, `membres_caisse(personne_id)`, `paiements(personne_id)`, `paiements(owner_id, origine)`).

**Règles métier liées au schéma**

- Ouvrir un cycle crée automatiquement une `Echeance` par membre actif de la caisse (`montantDu` = cotisation de la caisse).
- La somme des allocations d'un paiement ne dépasse jamais son montant.
- Un paiement passe à `RAPPROCHE` quand la trésorière valide sa répartition.
- Toute création, modification ou suppression de `Paiement` et `Allocation` (et le traitement d'un `SmsNonLu`) écrit une ligne dans `JournalAudit`, dans la même transaction Prisma. Sont aussi journalisés : clôture de cycle, modification de caisse, modification de personne, retrait et réactivation d'un membre, dépenses et bonnes volontés.
- Les mutations d'argent concurrentes (double appui, deux onglets) sont sérialisées par des verrous de ligne en tête de transaction (`lib/verrous.ts`) : un paiement n'est jamais affecté au-delà de son montant, une échéance jamais payée deux fois.
- Modèles `Piece` (captures) et `ValidationCash` : ajoutés en v1, pas avant.

**Deux types de caisse**

| Type | Exemple | Fonctionnement |
| --- | --- | --- |
| `TONTINE` | Caisse mensuelle avec ordre de passage | Cycles successifs, une échéance par membre et par cycle, un bénéficiaire par cycle (v1) |
| `COLLECTE` | Participation à un séminaire, 5 000 FCFA par membre | Un seul cycle, créé automatiquement avec la caisse. Paiement en une fois, par tranches, ou partiel. Clôture à la date limite ou à la main |

- Le montant dû est le même pour tous les membres d'une caisse (pas de demi-part).
- Tous les membres apparaissent dans le suivi, y compris ceux qui n'ont rien versé : c'est la différence avec le cahier Word actuel.
- Un excédent n'est jamais reporté : il est signalé « à rembourser » jusqu'à ce que la trésorière le marque comme remboursé.

## Parcours trésorière (v0)

Deux moments dans la journée : capturer en 10 secondes quand l'argent arrive, rapprocher le soir.

**Mise en place (une fois)**

1. Compte créé dans le tableau de bord Supabase (inscription fermée en v0), puis connexion par e-mail + mot de passe.
2. Création des caisses : type (tontine ou collecte), nom, montant par membre, puis fréquence et jour d'échéance (tontine) ou date limite (collecte).
3. Ajout des personnes : nom complet, un ou plusieurs numéros, alias Wave, cellule. Le plus souvent par **import** depuis la page d'une caisse : la liste du tableau Word est collée (colonnes détectées : nom, numéro, ordre, cellule, versé, canal), un aperçu classe chaque ligne, rien n'est écrit avant confirmation. Les montants « Versé » deviennent des paiements repris (`REPRISE_IMPORT`), déjà rapprochés.
4. Inscription des personnes dans les caisses, avec l'ordre de passage. Une personne existante est réutilisée, jamais dupliquée.
5. Ouverture du premier cycle de chaque caisse (numéro et échéance modifiables : les tontines tournent déjà).

**Accueil** (`/tableau-de-bord`)

- Bandeau : anneau de l'argent reçu sur l'attendu des cycles ouverts et nombre de membres à jour, puis quatre chiffres clés.
- « À faire » : paiements à rapprocher, SMS non lus, excédents à rembourser.
- « Reçu par jour » (14 jours, heure de Dakar, SMS ignorés et versés repris non datés exclus) et répartition par canal. Sous le graphique, le lien vers les versés à dater et, quand c'est possible, « Dater N versés avec leurs SMS ignorés ».

**Dans la journée : capturer**

1. Bouton central **« Paiement »** de la barre du bas (or) : coller un SMS Wave ou saisie manuelle.
2. Le SMS est parsé (solde retiré avant tout) et enregistré comme `Paiement` à rapprocher. Si le parsing échoue, le texte brut est gardé dans `SmsNonLu` et signalé.
3. Si la référence existe déjà : message « Déjà enregistré », rien n'est créé. Doublon probable (même canal, montant, jour et personne) : « Peut-être déjà enregistré », avec le choix de compléter l'existant.
4. **Saisie manuelle** (Wave sans SMS, Orange Money, cash) : canal, montant, date et heure, personne si connue (recherche par nom, alias ou numéro), référence facultative.

**Le soir : rapprocher** (page `/rapprochement`)

1. Paiements `A_RAPPROCHER` en deux groupes : **à vérifier**, puis **sûrs** (voir « Matching »).
2. Pour chacun : personne proposée avec sa confiance, répartition proposée (barre), autres options en un clic. Avertissement si la personne est déjà payée par la liste importée.
3. Actions : **Valider** (un clic), **Modifier** (autre personne ou autre répartition), **Ignorer** (réversible), et **Valider les sûrs** pour tout le groupe.
4. « Derniers rapprochés » (7 jours) avec **Annuler** tant que le cycle est ouvert et l'excédent non remboursé.

**Après un import : dater les versés** (page `/a-dater`)

- Les versés repris portent la date de l'import. Ils restent comptés partout mais sont exclus de « Reçu par jour » tant qu'ils ne sont pas datés.
- Automatique : un versé repris est daté par le SMS ignoré qui était le même argent (un SMS du même montant, ou des SMS dont la somme fait le montant). Aucun autre cas n'est deviné.
- À la main, selon le canal : Wave (coller le SMS, ou compléter le modèle prérempli avec la date, l'heure et l'ID de transaction de l'application), Orange Money (modèle prérempli avec la date, l'heure et la référence `PP…`), espèces (date seule). Aucun paiement n'est créé : seules la date et la référence sont reportées.
- Un SMS ou un ID déjà dans Cotiz est signalé précisément ; s'il date déjà un autre versé, « C'est bien son paiement : le rattacher ici » déplace la datation.

**Excédents** (page `/a-rembourser`)

- Excédent = montant − allocations − bonne volonté éventuelle, calculé. **Marquer remboursé**, ou **Garder comme bonne volonté** (collecte).
- Doublons de la liste importée (SMS validé pour une personne déjà payée par un versé repris) : signalés, avec « Ignorer, c'est le même argent » et « Ignorer les doublons » pour tous.

**Suivre et relancer** (page d'une caisse)

- Onglets : **Membres** (anneau payés / partiels / en attente, tableau triable avec reste dû, filtre et totaux par cellule, relance), **Historique** (tontines : 12 derniers cycles, ✓ payé, ½ partiel, × non payé, sans notion de retard), **Dépenses** (collectes), **Caisse** (infos, clôture, gestion des membres).
- Collecte : cascade cotisations + bonnes volontés − dépenses par catégorie = restant, et bonnes volontés par donateur.
- Bouton **Relancer** sur chaque membre pas à jour : ouvre `https://wa.me/221XXXXXXXXX?text=...` avec un message pré-rempli. Modèle modifiable par caisse. « Relancer tout le monde » enchaîne les conversations.
- **Copier le récap** pour le groupe WhatsApp.
- Bouton **Clôturer le cycle** : avertit s'il reste des échéances non payées, puis ouvre le cycle suivant (tontine uniquement ; une collecte se termine).

**Fiche personne** : contact WhatsApp, versé dans l'année, situation et grille des cycles dans chaque caisse, derniers paiements.

**Contraintes d'interface** : utilisable à une main sur iPhone, boutons d'au moins 44 px de haut, montants formatés `25 000 FCFA`, texte de 13 px minimum, contrastes vérifiés en clair et en sombre. Sur ordinateur : barre latérale, tableaux, page d'import en deux colonnes.

## Critères d'acceptation (v0)

La v0 est terminée quand chaque case est cochée et qu'un vrai cycle a été géré avec l'app, sans cahier papier.

État au 3 novembre 2026 : **tout est implémenté** et couvert par les tests automatiques (456 tests unitaires, 29 tests d'intégration). 21 critères sur 24 vérifiés par la trésorière. Une case n'est cochée qu'après vérification par la trésorière sur l'application en ligne ; les cases vides restent à confirmer en usage réel.

- [x] Connexion et déconnexion par e-mail + mot de passe (comptes créés dans le tableau de bord Supabase).
- [x] Une utilisatrice ne voit jamais les données d'une autre (testé avec 2 comptes).
- [ ] 3 caisses de types différents en usage réel (collecte du séminaire, compte gardé, mensualité de la cellule), dont une de plus de 30 membres, sans doublon de personnes. Reformulé le 03/11/2026 avec la trésorière (ancien critère : 3 caisses de 30+ membres chacune).
- [x] Ouvrir un cycle crée les échéances de tous les membres actifs.
- [x] Coller un SMS Wave réel crée un paiement avec montant, nom, numéro, date et référence corrects.
- [x] Coller deux fois le même SMS ne crée qu'un paiement.
- [x] Un SMS illisible est conservé en texte brut et signalé, sans planter.
- [x] Saisie manuelle fonctionnelle pour Wave, Orange Money et cash.
- [x] Un numéro connu propose la bonne personne ; un numéro inconnu peut être enregistré après confirmation.
- [x] Un paiement unique peut être réparti sur 2 caisses.
- [x] Statuts payé / partiel / en attente justes sur la page de chaque caisse.
- [x] Le bouton Relancer ouvre WhatsApp avec le bon numéro et le bon message.
- [x] Chaque modification de paiement ou d'allocation apparaît dans le journal d'audit.
- [x] Tous les tests Vitest passent (`npm test`).
- [x] Déployé sur Vercel, utilisable sur Safari iPhone.

- [x] Une caisse `COLLECTE` accepte des versements par tranches et affiche payé / partiel / rien versé pour chaque membre.
- [x] Un excédent apparaît comme « à rembourser ».

**Ajouts en cours de v0**

- [x] L'import d'une liste Word (cellule, versé, canal) crée les membres et les versés sans doublon ; un réimport ne compte rien deux fois.
- [x] Dépenses et bonnes volontés d'une collecte : encaissé, dépensé et restant justes.
- [x] « Valider les sûrs » ne valide que des paiements sans décision à prendre.
- [x] Les versés importés peuvent être datés (SMS ignoré, SMS ou modèle Wave, modèle Orange Money, date à la main).
- [x] Deux validations simultanées du même paiement n'affectent jamais plus que son montant (testé : `tests/concurrence.integration.ts`).
- [ ] Au 5e échec de connexion pour une adresse depuis un même réseau, la connexion est bloquée 10 minutes à partir de cet instant ; chaque essai pendant le blocage affiche les minutes restantes sans le prolonger, puis le compteur repart de zéro (30 échecs par réseau, toutes adresses confondues, bloquent le réseau). Un autre réseau n'est pas bloqué.
- [ ] Un vrai cycle géré de bout en bout avec Cotiz, sans cahier papier.

## Instructions pour Claude Code

Tu travailles avec une développeuse qui doit pouvoir expliquer chaque choix en entretien. Avance phase par phase, et explique avant de coder.

**Méthode de travail (à respecter à chaque phase)**

1. Avant de coder : résume en 5 lignes ce que tu vas faire et les fichiers touchés. Attends la validation.
2. Une phase = un commit (ou une branche + merge) avec un message clair.
3. Après la phase : explique les 2 ou 3 choix techniques importants, puis pose 2 questions de compréhension à la développeuse.
4. Ne passe jamais à la phase suivante sans validation.
5. Ne code rien de la v1 ou de la v2.
6. En cas de doute sur une règle métier : demande, n'invente pas.

**Ordre des phases (v0)**

| Phase | Contenu | Terminée quand |
| --- | --- | --- |
| 0 | Projet Next.js, Tailwind, shadcn/ui, Prisma, Vitest, `.env.example`, `CLAUDE.md` reprenant ce cahier | `npm run dev` et `npm test` passent |
| 1 | Schéma Prisma, migration, client singleton `lib/prisma.ts`, seed de démo | La base contient les données de démo |
| 2 | Auth Supabase, création de `Utilisatrice` à la première connexion, protection des routes, helper `exigerUtilisatrice()` | Pages privées inaccessibles sans connexion |
| 3 | Parser SMS Wave : **tests d'abord**, puis le code | Les 7 cas de test passent |
| 4 | Caisses, personnes (numéros, alias), membres, import d'une liste collée (en 3 étapes : 4a caisses, 4b personnes et membres, 4c import) | Une personne partagée n'est pas dupliquée |
| 5 | Cycles et génération des échéances | Ouvrir un cycle crée les échéances |
| 6 | Capture : coller un SMS, saisie manuelle, anti-doublon | Un SMS collé 2 fois = 1 paiement |
| 7 | Matching + page rapprochement + allocation | Tests de matching verts, répartition sur 2 caisses possible |
| 8 | Page caisse : statuts, relance wa.me, clôture de cycle | Statuts justes sur le seed |
| 9 | Journal d'audit dans toutes les mutations, README, déploiement Vercel | Toutes les cases des critères d'acceptation cochées |
| 10 | Cellule et versés à l'import (ajout demandé par la trésorière) | Fait |
| 11 | Dépenses d'une collecte, puis bonnes volontés | Fait |
| Design 1 à 4 | Identité visuelle, composants maison, graphiques, rapprochement groupé, historique des cycles, fiche personne | Fait |
| Usage réel | Canal à l'import, doublons de la liste importée, datation des versés (SMS, modèles Wave et Orange Money) | Fait |
| Audit 1 à 3 | Verrous contre la double affectation, origine des paiements en colonnes, historique protégé, connexion limitée, performance | Fait |

**Prochaines étapes possibles** (à décider avec la trésorière) : gérer un vrai cycle complet et cocher les critères ; nettoyer les données de démo ; préparer la v1 (parser SMS Orange Money en premier, format ci-dessus).

**Règles techniques**

- Sécurité : chaque requête Prisma filtre par `ownerId` de l'utilisatrice connectée. Jamais d'id reçu du client utilisé sans cette vérification.
- Aucun secret dans le dépôt. Variables listées dans `.env.example`.
- Validation Zod sur toute entrée.
- Les mutations liées (paiement + allocations + audit) se font dans une `prisma.$transaction`.
- Pas de dépendance ajoutée sans expliquer pourquoi.
- Auth : toute page privée et toute Server Action appelle `exigerUtilisatrice()` et utilise son `id` comme `ownerId` ; `proxy.ts` n'est qu'un contrôle rapide. Toute lecture de session se fait sous `<Suspense>` (Cache Components).
- Mutations d'argent : verrouiller en tête de transaction (`lib/verrous.ts` : paiement, échéances de la personne, échéance) avant de relire un reste dû.
- Journal d'audit : `journaliser(tx, …)` (`lib/audit.ts`) dans la même transaction ; un test statique (`tests/audit-couverture.test.ts`) le vérifie.
- Origine d'un paiement : colonnes `origine`, `datation`, `dateRepriseId` et filtres de `lib/paiements/origine.ts`, jamais un marqueur dans la note.
- Cycles : dates par `lib/cycles/dates.ts` (UTC = heure de Dakar) ; tout changement de membre passe par `lib/cycles/echeances.ts`, dans la même transaction.
- Migrations : `prisma migrate dev` échoue (RLS sur `_prisma_migrations`, la base fantôme ne peut pas la rejouer). Générer le SQL avec `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` dans un nouveau dossier daté, le compléter à la main (RLS, contraintes, reprise de données), puis `npx prisma migrate deploy` en local et `npm run db:migrate:prod` en production (lancé par la trésorière).
- Après une mutation qui change des données affichées ailleurs (compteurs, derniers paiements) : `refresh()` (`next/cache`) dans la Server Action.
- Seed de démo entièrement fictif : 1 trésorière, 3 caisses de 32 membres, dont 6 personnes partagées entre au moins 2 caisses (environ 90 personnes au total), 1 cycle ouvert par caisse, 15 paiements dont 5 à rapprocher et 1 qui couvre 2 caisses.

**Décisions de la trésorière**

- Cotisation identique pour tous les membres d'une caisse ; versement en une fois, par tranches ou partiel.
- Deux types de caisse : `TONTINE` et `COLLECTE` (voir le schéma).
- Excédent : remboursé, jamais reporté.
- Nom de l'app : Cotiz (dépôt cotiz-app). Disponibilité du nom à vérifier.

**Décisions du 28/10/2026 (à appliquer au schéma en phase 1)**

- **Excédent** : il n'est pas stocké, il est calculé (`montant` du paiement − somme de ses allocations). On ajoute seulement `rembourseLe DateTime?` sur `Paiement` pour le marquer comme remboursé.
- **Modèle de relance** : on ajoute `modeleRelance String?` sur `Caisse`. Si le champ est vide, un modèle par défaut défini dans le code est utilisé.
- **`NumeroPersonne`** : on ajoute la relation `owner` vers `Utilisatrice` (`onDelete: Cascade`), comme pour les autres tables qui portent un `ownerId`.
- **Seed** : 3 caisses de 32 membres, dont 6 personnes partagées entre au moins 2 caisses (environ 90 personnes au total). Le reste du seed ne change pas.
- **Prisma 7** : on utilise la dernière version stable de Prisma. Les URL de connexion passent dans `prisma.config.ts` et le générateur devient `prisma-client`. Les modèles du schéma ne changent pas. Les enums s'écrivent une valeur par ligne (la notation sur une ligne du premier schéma n'était pas une syntaxe Prisma valide).
- **Seed, types de caisse** : une tontine mensuelle, une tontine hebdomadaire et une collecte. Le seed refuse de s'exécuter si `NODE_ENV=production` et n'efface que les données de la trésorière de démo. Il utilise `SEED_UTILISATRICE_ID` (id d'un compte Supabase de démo) ; sans cette variable, il prend un UUID fixe et affiche un avertissement : ce compte ne pourra pas se connecter.
- **Sécurité Supabase (RLS)** : la RLS est activée, sans policy, sur toutes les tables du schéma `public`, y compris `_prisma_migrations`. L'API REST publique de Supabase ne voit donc rien ; l'application passe par Prisma (rôle `postgres`). Toute nouvelle table doit avoir la RLS activée dans la migration qui la crée.
- **SMS illisible → table `SmsNonLu`** : `Paiement.montant` et `Paiement.dateReception` restent obligatoires. Un SMS que le parser ne sait pas lire est enregistré dans `SmsNonLu` (`ownerId`, `texteBrut`, `dateCollage`, `statut` `A_TRAITER` / `TRAITE`, avec RLS). La trésorière crée ensuite le paiement à la main, puis marque le SMS comme traité.
- **Solde Wave** : la mention du solde et sa valeur (« Nouveau solde », « Votre solde », où qu'elles soient dans le texte) sont retirées **en tout premier**, avant le parsing, y compris pour les SMS qui iront dans `SmsNonLu`. Aucun texte stocké (`Paiement.texteBrut`, `SmsNonLu.texteBrut`) ne contient donc le solde.
- **Caisses, personnes, membres (phase 4)** :
  - **Collecte** : en phase 4, la caisse est créée seule ; la création automatique de son cycle unique est ajoutée en phase 5.
  - **Fréquence `BIMENSUELLE`** : masquée en v0 (aucune tontine de ce type). Elle reste dans le schéma ; le formulaire ne propose que `MENSUELLE` et `HEBDOMADAIRE` (`FREQUENCES_PROPOSEES`).
  - **Type de caisse** : non modifiable après la création (tontine et collecte n'ont pas les mêmes cycles).
  - **Alias Wave** : une personne peut en avoir plusieurs (nom de jeune fille, nom d'épouse, surnom, proche qui paie pour elle) ; l'écran permet d'en ajouter et d'en retirer.
  - **Ordre de passage** : unique dans une caisse (tontines), contrainte `@@unique([caisseId, ordrePassage])`. L'échange de deux ordres se fait en une seule opération, dans une transaction (passage par une valeur temporaire `NULL`). Un nouveau membre prend l'ordre suivant le plus grand. Un membre retiré (`INACTIF`) libère son ordre (`null`) pour qu'il puisse être réattribué ; s'il est réactivé, il revient sans ordre et la trésorière lui en attribue un à la main (le plus petit ordre libre est suggéré ; un ordre déjà pris est refusé, il faut alors passer par l'échange). L'historique des passages sera porté par le bénéficiaire du cycle (v1).
  - **Personne partagée** : inscrire une personne dans une autre caisse réutilise la même ligne `Personne` (jamais de copie). À la création, si le numéro ou le nom existe déjà, l'écran le signale et propose d'inscrire la personne existante.
  - **Jamais de suppression** : un membre qu'on retire passe `INACTIF` (plus d'échéance dans les cycles suivants, historique conservé) ; une caisse est `ARCHIVEE`, jamais supprimée.
  - **Montant de cotisation modifié** : le nouveau montant ne s'applique qu'aux cycles futurs ; les échéances déjà créées gardent leur `montantDu`.
  - **Doublons de personnes** : même numéro qu'une personne existante → elle est réutilisée automatiquement (si ce numéro appartient à 2 personnes, la trésorière choisit). Même nom mais numéro différent → jamais de fusion automatique (homonymes fréquents) : « doublon possible », la trésorière choisit entre réutiliser et créer.
  - **Import (remplace l'import CSV)** : la trésorière tient ses comptes dans un tableau Word, pas en CSV.
    - L'import se fait **depuis la page d'une caisse** (pas de colonne « caisse »).
    - La liste est **collée dans une zone de texte** ; l'envoi d'un fichier est facultatif.
    - Séparateurs acceptés : tabulation (copier-coller depuis Word ou Excel), `;` et `,`.
    - Colonnes : **nom ; numéro ; ordre (facultatif)**. Sans ordre, on suit l'ordre des lignes, à la suite des membres existants.
    - Aperçu avant enregistrement : chaque ligne est classée (nouvelle personne, personne existante, doublon possible, erreur) ; rien n'est écrit avant confirmation, puis tout est enregistré en une seule transaction.
    - Tests : un extrait anonymisé du tableau Word, fourni par la trésorière (`tests/fixtures/import/word.txt`, colonnes N° ; Prénom ; Nom ; Cellule ; Montant, sans téléphone).
    - **Colonnes détectées automatiquement**, corrigeables dans l'aperçu : par l'en-tête (synonymes, sans accents ni majuscules : Prénom, Nom, Nom complet, Téléphone / Tél / Contact / Wave, N° / Ordre / Rang), puis par le contenu pour « Numéro » (9 chiffres → téléphone, sinon ordre). Prénom et Nom sont assemblés. Sans en-tête reconnu : nom ; numéro ; ordre. Les autres colonnes (Cellule, Montant…) sont ignorées en v0, les lignes vides et de total sont écartées. La colonne Téléphone est facultative.
    - **Ordre** (tontines) : le N° du tableau devient l'ordre de passage ; un N° déjà pris → membre importé sans ordre (à attribuer à la main). Une collecte n'a pas d'ordre : le N° est ignoré.
    - L'import ne crée que des personnes et des membres, **jamais de paiements** (la colonne Montant n'est pas reprise). Les noms sont gardés tels quels (majuscules comprises).
    - Erreurs (ligne non importée) : numéro illisible, même nom ou même numéro deux fois dans la liste, même personne existante sur deux lignes.
- **Parser SMS Wave (phase 3)** :
  - Champs obligatoires : seulement le montant (> 0) et la date. Nom, numéro et référence sont facultatifs : s'ils manquent (ou si le numéro n'a pas 9 chiffres), `ok: true`, champ à `null`, nom du champ (`nom`, `telephone`, `reference`) dans `champsManquants`. La trésorière complète au rapprochement.
  - Plusieurs SMS collés d'un coup : refusés avec la raison « 2 SMS détectés, colle-les un par un » (pour ne jamais en perdre un en silence).
  - Tests : 9 SMS au format réel, données inventées (`tests/fixtures/sms/format-wave.txt`, noms, numéros, références, dates et soldes remplacés le 02/11/2026 avant publication du code, gardé octet pour octet par `.gitattributes`), complétés par des cas fictifs (`tests/fixtures/sms/fictifs.ts`). Les SMS à refuser sont fictifs ; de vrais exemples seront ajoutés s'ils sont trouvés.
- **Authentification v0 (phase 2)** :
  - **Inscription fermée** : « Allow new users to sign up » est désactivé dans Supabase ; pas de page `/inscription` ni d'action d'inscription. Les comptes sont créés dans le tableau de bord Supabase (Authentication → Users). Raison : avec l'inscription ouverte, n'importe qui pourrait appeler l'API d'inscription de Supabase avec la clé publique, puis obtenir une ligne `Utilisatrice` grâce à la création automatique ci-dessous.
  - **Confirmation d'e-mail désactivée** dans Supabase (le service d'envoi intégré est trop limité).
  - **Mot de passe : 8 caractères minimum**, réglé dans Supabase et vérifié par Zod au formulaire de connexion.
  - **`exigerUtilisatrice()`** crée la ligne `Utilisatrice` si elle manque (même `id` que le compte Supabase, e-mail du compte, nom = partie avant le `@`).
  - **Routes** : `/connexion` (seule route publique), `/tableau-de-bord`, et `/` qui redirige selon la session.
- **Environnements (avant la phase 9)** : la limite gratuite de Supabase ne permet pas un 2e projet cloud.
  - **Production** = le projet Supabase cloud « cotiz ». Variables dans `.env.prod`, que Next ne charge jamais automatiquement ; seul `npm run db:migrate:prod` le lit, explicitement.
  - **Développement** = Supabase en local (CLI + Docker), variables dans `.env` (valeurs locales, non secrètes). `supabase/config.toml` reproduit l'auth de la production : inscription fermée, mot de passe de 8 caractères minimum, pas de confirmation d'e-mail.
  - **Seed** : local uniquement. Il crée le compte de démo dans Supabase Auth local s'il manque, et refuse de tourner si `NODE_ENV=production` ou si `DATABASE_URL` ou `NEXT_PUBLIC_SUPABASE_URL` ne pointent pas vers `localhost`/`127.0.0.1`.
  - **Sauvegardes** de la base cloud : hors du projet, sur le poste de la trésorière (jamais dans le dépôt).
  - Le compte de démo et ses données ont été retirés de la production le 29/10/2026, après sauvegarde et validation de la liste. Le compte de la trésorière est conservé, sans donnée.
- **Phase 10 (ajout au v0, demandé par la trésorière) : cellule et versés à l'import**
  - **Cellule** : champ facultatif de la personne (`Personne.cellule`, 50 caractères), la même dans toutes ses caisses (cellule de la commission : Organisation, Technique…). Saisie sur la fiche ou lue à l'import (colonne « Cellule »). À l'import, elle complète une cellule vide, ne remplace jamais. Dans le suivi d'une caisse : affichée sous chaque nom, filtre par cellule, totaux par cellule (reçu / attendu, à jour), et récap WhatsApp regroupé par cellule.
  - **Déjà versé à l'import** : la couleur d'une cellule Word ne survit pas au copier-coller, donc une colonne « Versé » (ou « Payé », « Montant versé ») donne le montant reçu ; « Montant » seul reste la somme convenue, ignorée. Chaque versé > 0 devient un paiement rapproché sur l'échéance du cycle ouvert : canal choisi pour tout l'import, date du jour de l'import, note « Repris du tableau importé », journal d'audit. Le surplus au-delà du montant dû devient un excédent à rembourser.
  - **Jamais deux fois** : le versé n'est enregistré que si l'échéance n'a encore aucun paiement (réimport d'une liste mise à jour possible ; les membres déjà inscrits sont complétés). Sans cycle ouvert, le versé est ignoré avec un avertissement.
  - **Réimport (30/10/2026)** : le numéro de la liste est ajouté à la fiche d'une personne existante qui ne l'a pas encore. Une personne retrouvée par son nom seul (sans numéro commun) est reconnue automatiquement si c'est la **seule** personne de ce nom et qu'elle est **déjà membre active de cette caisse** ; sinon (homonymes, ou personne hors de la caisse) la règle de la phase 4 s'applique : à choisir.
  - **Homonymes (30/10/2026)** : deux lignes de même nom dans une liste sont deux personnes si leurs numéros ou leurs cellules diffèrent (sinon : erreur, sans doute la même personne écrite deux fois). La reconnaissance automatique par le nom ne se fait jamais si le numéro ou la cellule de la ligne contredit la fiche existante : la ligne est alors « à choisir », avec une explication.
- **Audit du design, lot 1 (30/10/2026)** :
  - **Caisse en onglets** : Membres (récap, relance, suivi) · Dépenses (collectes) · Caisse (infos, clôture, gestion des membres), via `?vue=`.
  - **Nom d'affichage** modifiable dans « Mon profil » (initiales en haut à droite) : remplace le nom tiré de l'e-mail.
  - **Message de confirmation** après chaque action réussie (« Paiement rapproché ✓ ») : cookie de courte durée (`lib/annonce.ts`), affiché puis effacé par le navigateur.
  - **Choix d'une personne avec recherche** (nom, alias ou bout de numéro) en saisie manuelle et au rapprochement, à la place des listes déroulantes.
- **Audit du design, lot 2 (30/10/2026)** : fiche personne en lecture (contact WhatsApp, situation dans chaque caisse, derniers paiements ; modification sur `/personnes/[id]/modifier`), sous-titres d'en-tête en texte normal (capitales réservées aux titres de section), reste dû mis en avant dans le suivi, carte de rapprochement épurée (Valider en grand, Ignorer éloigné).
- **Audit du design, lot 3 (30/10/2026)** : blocs animés pendant les chargements, bouton central « Paiement » (coller un SMS Wave ou saisie manuelle), numéros pré-remplis au format « 77 123 45 67 » dans le formulaire, sélecteur de caisse discret dans l'en-tête.
- **Relances (30/10/2026)** : balise `{a_verser}` (« tu dois verser … » si rien n'est versé, sinon « il te reste … à verser sur … »), utilisée par les messages par défaut ; celui d'une collecte ne mentionne pas de cycle.
  - **Relance en série** : WhatsApp ne permet pas d'envoyer plusieurs messages d'un coup depuis un lien (l'envoi automatique demanderait l'API WhatsApp Business : v2). Un bouton « Relancer tout le monde » ouvre la conversation de chaque personne pas à jour, l'une après l'autre (suit le tri et le filtre de cellule). « Relancé aujourd'hui » est mémorisé sur le téléphone seulement (stockage du navigateur), pas dans la base.
- **Phase 11 (ajout au v0, demandé par la trésorière) : sorties de caisse d'une collecte**
  - Une dépense (`Depense`, RLS activée) : date, montant, motif, bénéficiaire (texte libre, facultatif), canal (Wave, Orange Money, cash) et catégorie fixe (Nourriture, Transport, Matériel, Logement, Communication, Avance, Autre). Collectes seulement : dans une tontine, l'argent revient au bénéficiaire du tour (v1).
  - **Restant** = cotisations encaissées (allocations sur les échéances de la caisse, excédents exclus) − dépenses ; jamais stocké. Un restant négatif est autorisé et affiché « dépassement ».
  - Création, modification et suppression libres, chacune écrite dans le journal d'audit (avant / après pour une modification). Date dans le futur refusée.
  - Page de la collecte : restant dans l'en-tête, bloc Dépenses (encaissé, dépensé, restant, totaux par catégorie, liste). Récap WhatsApp : encaissé, dépensé et restant ajoutés.
- **Bonnes volontés (31/10/2026, demandé par la trésorière)** : dons à une collecte, en plus des cotisations (« 3 000 ABK », « 30 000 Ibou »).
  - Un don (`Don`, RLS activée) : date, montant, donateur (nom libre, pas forcément une personne de Cotiz), **remis à** (facultatif, colonne `remis_par` : la personne à qui le don a été remis quand il n'a pas été donné directement à la trésorière, ex. « ABK », « Lamine » ; traçabilité seulement, le don compte dans les totaux de la même façon), canal, note facultative ; `paiementId` s'il vient du surplus d'un paiement (un seul don par paiement). Collectes seulement. Création, modification et suppression libres, journalisées.
  - **Encaissé** = cotisations + bonnes volontés ; **restant** = encaissé − dépenses (les dons paient les dépenses aussi). « Reçu sur attendu » reste la part des cotisations dues (les dons n'y entrent pas). Bandeau de la collecte : case « Bonnes volontés » ; récap WhatsApp : lignes « Cotisations » et « Bonnes volontés » avant le total quand il y a des dons.
  - **Surplus d'un versé à l'import** (collecte) : 5 000 versés pour 2 000 de cotisation → 2 000 sur la cotisation, 3 000 en bonne volonté au nom de la personne (signalé dans l'aperçu). Dans une tontine, le surplus reste un excédent à rembourser.
  - **Excédent d'un paiement déjà rapproché** : bouton « Garder comme bonne volonté » sur `/a-rembourser` si ses cotisations vont toutes à une seule collecte active ; l'excédent n'est alors plus à rembourser. Supprimer ce don le remet à rembourser ; annuler le rapprochement du paiement supprime aussi son don.
- **Import, colonne « Canal » (31/10/2026)** : une colonne Canal (en-têtes « Canal », « Moyen de paiement », « Mode de paiement »…) donne le moyen de paiement de chaque versé : Wave, OM / Orange Money, cash / espèces. Une ligne sans canal (ou illisible, signalée) prend le canal choisi pour l'import, demandé seulement s'il reste de telles lignes. Le canal ne concerne que les versés réellement enregistrés : une échéance déjà payée dans Cotiz est ignorée, quel que soit le canal. « Wave » seul comme en-tête reste la colonne du numéro.
  - **Page d'import** : sur grand écran (1 280 px et plus), étapes numérotées dans un panneau collant à gauche (coller, colonnes, canal, boutons toujours visibles) et aperçu filtrable à droite (Tous, À choisir, Erreurs, Nouvelles, Existantes, Déjà membres), lignes à trancher en premier. Plus étroit : les étapes, l'aperçu, puis les boutons.
- **Refonte visuelle (après la phase 9)** : charte inspirée d'une maquette d'app bancaire fournie par la trésorière. *Couleurs, police et navigation remplacées le 31/10/2026 par l'identité visuelle décrite plus bas ; le reste tient toujours.*
  - Teal profond `#0b6b74`, police Montserrat (hébergée par `next/font`), en-tête « héros » arrondi avec un grand montant en haut de chaque page (`components/cotiz/en-tete.tsx`), listes groupées à fins séparateurs (`components/cotiz/section.tsx`).
  - Navigation : barre d'onglets fixe en bas (Accueil, Caisses, **Coller** au centre, Rapprocher, Personnes) ; « SMS non lus » et « À rembourser » sont atteints par le bloc « À faire » de l'accueil.
  - Refonte visuelle uniquement : ni la logique métier, ni les Server Actions, ni la base ne changent. Mode clair seulement.
- **Phase 9 (journal, tableau de bord, déploiement)** :
  - **Historique** : par paiement uniquement (page `/paiements/[id]`, lien « Voir l'historique » depuis la capture, le rapprochement et « À rembourser »). Pas de page `/journal` globale en v0.
  - **Tableau de bord minimal** : ce qui attend une action (paiements à rapprocher, SMS non lus, excédents à rembourser) et, pour chaque cycle ouvert, reçu sur attendu et nombre de membres pas à jour.
  - **Contrôles** : un test statique vérifie que chaque mutation de `Paiement`, `Allocation` ou `SmsNonLu` est journalisée dans une transaction ; un test d'intégration (`npm run test:isolation`, base locale) vérifie l'isolation entre deux comptes.
  - **Vercel** : région `dub1` (Dublin, à côté de Supabase `eu-west-1`), adresse `vercel.app`. Variables (seulement `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) définies pour l'environnement Production uniquement. Déploiements de prévisualisation désactivés en v0 (`ignoreCommand` dans `vercel.json`).
  - **Supabase production** : *Authentication → URL Configuration* renseigné avec l'adresse `vercel.app` (Site URL et Redirect URLs) après le premier déploiement.
- **Suivi, relance et clôture (phase 8)** :
  - **Relancer** : bouton pour tous les membres qui ne sont pas à jour (en attente ou partiel), avec la mention « en retard » après l'échéance. Numéro : le premier de la personne ; s'il y en a plusieurs, choix dans une liste ; sans numéro, bouton grisé.
  - **Modèle de relance** : balises `{nom}`, `{caisse}`, `{cycle}`, `{montant}` (cotisation), `{reste}` (reste à verser), `{echeance}` (date en toutes lettres, ex. « 5 novembre 2026 »). Modèle par défaut (si la caisse n'a pas le sien) : « Bonjour {nom}, petit rappel pour la caisse « {caisse} » (cycle {cycle}) : il te reste {reste} à verser sur {montant}, avant le {echeance}. Tu peux l'envoyer par Wave au {numéro Wave}. Merci ! » (numéro lu dans `NEXT_PUBLIC_NUMERO_WAVE_RELANCE`, jamais dans le code ; sans lui, la phrase est retirée)
  - **Collecte** : clôture à la main uniquement en v0, avec un bandeau quand la date limite est passée.
  - **Arriérés** : badge « arriéré » sur le membre, hors des totaux du cycle ; total des arriérés de la caisse affiché à part dans le bandeau.
  - **Membres retirés** ayant une échéance dans le cycle : section « Membres retirés », sans bouton Relancer.
  - **Excédents** : page `/a-rembourser` (un paiement peut couvrir plusieurs caisses), bouton « Marquer remboursé » (date + journal d'audit).
  - **Copier le récap** : texte à coller dans le groupe WhatsApp, fonction pure et testée. Contenu : **détaillé** (nom de la caisse, cycle et échéance ; nombre de membres à jour ; liste des personnes qui doivent encore, avec leur reste). Le format « totaux seulement » existe aussi dans `construireRecap` mais n'est pas utilisé.
  - **Clôture** : la confirmation affiche le nombre d'impayés, le montant restant, et « Cette action ne peut pas être annulée ». Tontine : le cycle suivant s'ouvre (début = lendemain de l'échéance) ; les impayés deviennent des arriérés. Collecte : elle se termine.
- **Matching et rapprochement (phase 7)** :
  - **Nom proche** : similarité (Jaro-Winkler) avec plus de poids sur le nom de famille ; une initiale vaut un prénom qui commence par elle (« K Mbaye » ≈ « Khadim Mbaye ») ; un nom Wave d'un seul mot (« rokh ») est comparé à chaque mot du nom et des alias. Toujours « confiance basse », 3 suggestions au maximum, à choisir explicitement. Testée sur des noms de la même forme que ceux des SMS réels (K Mbaye, M Thiam, rokh, Abdou ndao, Bay Mbengué, Bou Ndaiye).
  - **Échéances considérées** : toutes celles de la personne qui ne sont pas entièrement payées, arriérés des cycles clôturés compris, de la plus ancienne à la plus récente.
  - **Plusieurs options équivalentes** (même montant, caisses ou cycles différents) : la carte affiche les autres possibilités (« Autre option : caisse B, cycle 9 »), sélectionnables en un clic sans passer par Modifier.
  - **Plafond** : une allocation ne dépasse jamais ce qui reste dû sur l'échéance ; le surplus est l'excédent « à rembourser ».
  - **Mémoriser** : case « Enregistrer ce numéro » cochée par défaut (avertissement si le numéro est déjà celui d'une autre personne) ; case « Enregistrer cet alias » décochée par défaut.
  - **Ignorer** est réversible (liste « Paiements ignorés », bouton « Remettre à rapprocher »).
  - **Annuler un rapprochement** : possible pour tout paiement rapproché dont les échéances appartiennent à des cycles encore ouverts, depuis la liste « Derniers rapprochés » (7 jours). Les allocations sont supprimées (tracé dans le journal d'audit) et le paiement redevient « à rapprocher ». Après la clôture du cycle (phase 8), plus d'annulation.
  - **Valider** est désactivé tant qu'aucune personne n'est choisie.
  - Le schéma gagne `Paiement.rapprocheLe DateTime?` (date de validation, utilisée par « Derniers rapprochés »).
- **Capture des paiements (phase 6)** :
  - **Journal d'audit dès la phase 6** : chaque création ou complétion de `Paiement` (et le traitement d'un `SmsNonLu`) écrit une ligne dans `JournalAudit`, dans la même transaction.
  - **Doublon probable** (pas de référence commune, mais même canal, même montant, même jour, et même numéro ou même personne) : avertissement « Peut-être déjà enregistré » avec 3 choix. « C'est le même : compléter » ajoute au paiement existant la référence, le numéro et le nom Wave du SMS, sans créer de paiement (cas typique : saisie manuelle, puis SMS en retard) ; la complétion est tracée dans le journal d'audit et ne remplace jamais une valeur déjà présente. « Enregistrer quand même » crée un nouveau paiement. « Annuler » ne fait rien. Deux références différentes ne sont jamais un doublon.
  - **Rien n'est enregistré** pour un texte vide ou pour plusieurs SMS collés d'un coup (message affiché) ; tout autre SMS illisible va dans `SmsNonLu`.
  - **Saisie manuelle** : date et heure séparées, pré-remplies avec maintenant ; une date future est refusée. Référence facultative (jamais pour le cash).
  - **Barre de capture** fixe en bas de toutes les pages privées (sauf les pages de capture), avec la marge `safe-area-inset-bottom` de l'iPhone. Bouton « Coller » qui lit le presse-papiers ; caché si l'accès est refusé ou indisponible (le champ reste utilisable).
- **Cycles et échéances (phase 5)** :
  - **Dates d'un cycle de tontine** : début = date d'ouverture (cycles suivants, phase 8 : lendemain de l'échéance précédente) ; échéance = prochaine date d'échéance à partir du début, le jour même compris (mensuelle le 5 ouverte le 28/10 → 5/11 ; ouverte le 5 → le 5).
  - **Premier cycle d'une tontine** : ouvert par un petit formulaire pré-rempli, **numéro du cycle** (1 par défaut) et **date d'échéance** (date calculée par défaut), tous deux modifiables, car les tontines tournent déjà quand Cotiz commence (ex. 8e tour). Validation : numéro entier ≥ 1, date non vide. Les cycles suivants sont calculés automatiquement (phase 8).
  - **Un seul cycle ouvert par caisse**, garanti par la base (index unique partiel).
  - **Collecte** : son cycle unique est créé avec la caisse (début = création, échéance = date limite) ; modifier la date limite déplace l'échéance du cycle ouvert. Une date limite déjà passée est acceptée, avec un avertissement.
  - **Membre ajouté, importé ou réactivé pendant un cycle ouvert** : il reçoit une échéance tout de suite (collecte comme tontine), au montant actuel de la cotisation.
  - **Membre retiré pendant un cycle ouvert** : son échéance est supprimée si aucun paiement n'y est alloué, gardée sinon (l'argent reçu reste tracé). Réactivé, son échéance est recréée si elle manque.
  - **Seed** : les dates des cycles de démo utilisent les mêmes calculs que l'application.
- **Jour d'échéance** (à appliquer en phase 5) : pour une tontine hebdomadaire, `jourEcheance` suit la convention ISO (1 = lundi … 7 = dimanche). Pour une tontine mensuelle, si `jourEcheance` dépasse le nombre de jours du mois, on prend le dernier jour du mois (ex. 31 → 30 avril, 28 ou 29 février).
- **Identité visuelle et design, lots 1 à 4 (31/10/2026)** :
  - **Couleurs** : teal nuit pour les bandeaux et les barres, or réservé au bouton « Paiement » et à la progression de l'argent reçu, fond sable. « Partiel » en bleu, « avertissement » en ocre (à rembourser, arriérés, dates passées). Mode clair et sombre, contrastes vérifiés.
  - **Polices** : Inter pour le texte, Sora pour les titres et les grands montants (hébergées par `next/font`), chiffres à largeur fixe, 13 px minimum. Monogramme (cercle ouvert et point or) comme logo.
  - **Navigation** : barre du bas sur téléphone (Accueil, Caisses, **Paiement** au centre, Rapprocher, Personnes), barre latérale sur ordinateur.
  - **Composants maison** : pastilles, styles partagés (`components/cotiz/styles.ts`), cases de chiffres, graphiques sans bibliothèque (`components/cotiz/graphiques.tsx` : anneau, barres, répartition, cascade, grille d'historique).
  - **Rapprochement groupé**, **historique des cycles** et **fiche personne** : voir « Matching » et « Parcours ».
- **Import et doublons (31/10/2026)** :
  - **Réimport** : si la liste donne un autre canal pour un versé déjà repris, seul le canal est corrigé (et celui de la bonne volonté qui en est issue). Un paiement venu d'un SMS ou d'une saisie n'est jamais modifié.
  - **Doublons de la liste importée** : un SMS validé pour une personne déjà payée par un versé repris finit tout entier « à rembourser ». `/a-rembourser` le signale, avec « Ignorer, c'est le même argent » (un par un ou tous d'un coup, réversible) ; la carte de rapprochement prévient avant de valider.
  - **Validation groupée** : le SMS passe avant le versé repris (vraie date, vrai canal).
- **Datation des versés importés (31/10/2026)** : voir « Après un import : dater les versés ». Règles :
  - Rien ne vient du navigateur pour la datation automatique ; chaque datation est revérifiée dans sa transaction, seule la date (et la référence) change, journal d'audit des deux côtés.
  - Un SMS qui a servi à dater ne peut plus être remis à rapprocher : le même argent compterait deux fois.
  - ID de l'application Wave (« T_…-… ») = référence du SMS avec des `_` et des `-` : normalisé, il sert d'anti-doublon entre les deux.
  - Le montant du SMS ou du modèle doit être identique à celui du versé. Date saisie ni future, ni de plus d'un an.
  - Aucune capture d'écran n'est demandée ni gardée : elle montre le solde.
- **Audit technique, lots 1 à 3 (31/10/2026)** :
  - **Argent** : verrous de ligne contre la double affectation (validation, validation groupée, annulation, remboursement, bonne volonté, reprise à l'import). « Marquer remboursé » retire la bonne volonté de l'excédent ; un rapprochement dont l'excédent est remboursé ne peut plus être annulé.
  - **Données** : origine des paiements en colonnes (reprise automatique des anciens marqueurs de la note), historique financier protégé, index, `CHECK (montant > 0)`. Voir « Schéma de données ».
  - **Sécurité** : limite des échecs de connexion (règle à jour dans les critères d'acceptation et le lot 2 du 05/11/2026). Pages d'erreur en français. `npm audit --omit=dev` : 0 vulnérabilité.
  - **Performance** : les cotisations dues sont lues en une seule requête SQL paramétrée (seules les échéances encore dues remontent) ; compteurs de navigation mis en cache par page ; historique limité aux 12 derniers cycles.
- **Audit du 05/11/2026, lot 1 (argent et solde)** :
  - **Solde** : retiré où qu'il soit (SMS Orange Money, SMS collé d'un bloc, valeur à la ligne suivante). Les textes déjà stockés et le journal d'audit sont purgés par migration.
  - **Référence Wave** : une saisie manuelle prend la forme des SMS (`T_QWE…-IOP…` → `TQWE…IOP…`), donc le SMS du même paiement est reconnu. Migration : si la forme normalisée existe déjà, rien n'est fusionné ; les deux lignes restent pour que la trésorière tranche.
  - **Mensualité** : une modification qui mettrait le dû sous le versé d'un membre est refusée, en nommant les membres (décision du 05/11/2026). Une fois clôturée, montant, durée et premier mois sont figés ; le nom reste modifiable. Journal : avant et après.
  - **Datation** : un SMS choisi à la main ou un modèle Orange Money d'un autre montant est refusé. La liste ne propose que les SMS du même montant.
  - **Bonne volonté** : montant figé et suppression refusée une fois l'excédent du paiement remboursé.
  - **Montants** : le point ne sépare que les milliers. `5000.00` = 5 000, `1.5` est refusé (formulaires, import, historique d'un compte). Un SMS au-dessus de 10 000 000 FCFA ou daté dans le futur va dans les SMS non lus.
- **Audit du 05/11/2026, lot 2 (connexion et robustesse)** :
  - **Cookies de session** : illisibles par JavaScript, HTTPS exigé en production, 30 jours sans utilisation au lieu de 400.
  - **Connexion** : seul un mauvais mot de passe compte comme un échec ; une panne ou une limite de Supabase affiche « Connexion impossible pour le moment ». Chaque essai est réservé avant d'interroger Supabase, et un bloc IPv6 /64 compte comme un seul réseau.
  - **Blocage entre réseaux** : pas de compteur par adresse tous réseaux confondus (décision du 05/11/2026) : personne, ailleurs, ne doit pouvoir bloquer la trésorière. Risque accepté : un botnet garde 5 essais par adresse IP.
  - **Limites** : modèle de datation à 2 000 caractères, historique d'un compte à 500 lignes par import.
  - **Compte gardé** : ni 2e membre (ajout, création de personne, import de liste), ni retrait du titulaire. Sur un compte ancien à 2 membres, le titulaire reste le premier inscrit.
