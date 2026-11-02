# Cotiz

Web app mobile-first pour une trésorière de tontines : capturer chaque paiement au moment où il arrive (SMS Wave collé, ou saisie manuelle pour Wave, Orange Money et cash), puis rapprocher le soir en quelques minutes, suivre qui a payé et relancer par WhatsApp.

Tout arrive sur un seul compte Wave : un paiement est réparti sur une ou plusieurs échéances (plusieurs caisses, plusieurs cycles). Le système propose, la trésorière valide.

Fonctionnalités de la v0 :

- **Capture** : SMS Wave collé (solde retiré avant tout), saisie manuelle, anti-doublon, SMS illisibles gardés à part.
- **Rapprochement** : personne et répartition proposées, paiements « sûrs » validés d'un coup, annulation possible.
- **Caisses** : tontines (cycles, ordre de passage, historique) et collectes (dépenses, bonnes volontés), statuts, relances WhatsApp, récap, clôture.
- **Import** d'une liste collée depuis Word (cellule, déjà versé, canal), puis datation des versés repris (SMS, modèles Wave et Orange Money).
- **Accueil** : argent reçu, à faire, reçu par jour, répartition par canal.
- **Journal d'audit** de chaque mutation d'argent.

La spécification complète, avec toutes les décisions, est dans [CAHIER_DES_CHARGES.md](CAHIER_DES_CHARGES.md).

## Stack

- Next.js 16 (App Router, Turbopack, Server Actions, Cache Components), React 19, TypeScript strict
- Tailwind CSS 4 + shadcn/ui (`base-nova`), graphiques maison en HTML/SVG (aucune bibliothèque)
- Prisma 7 (adaptateur `pg`) sur PostgreSQL, Supabase (base + Auth)
- Zod pour toute entrée, Vitest pour les tests

## Environnements

| | Développement | Production |
| --- | --- | --- |
| Supabase | **local** (CLI + Docker) | projet cloud « cotiz » |
| Fichier de variables | `.env` | `.env.prod` |
| Qui le lit | `npm run dev`, Prisma (migrations, seed, studio) | **seulement** `npm run db:migrate:prod` (chargement explicite) |

Next charge `.env` automatiquement, jamais `.env.prod` : aucune commande courante (`dev`, `build`, `start`, `prisma …`) ne peut toucher la production par accident. Les deux fichiers sont ignorés par Git ; le modèle est [.env.example](.env.example).

## Démarrer en local

Prérequis : Node.js 24, Docker Desktop lancé.

```bash
npm install
```

```bash
npm run supabase:start
```

Le premier lancement télécharge les images Docker de Supabase (plusieurs Go). Ensuite :

1. Copier `.env.example` en `.env`, puis y reporter la *publishable key* et la *secret key* affichées par `npx supabase status`, et choisir un mot de passe de démo (8 caractères minimum).
2. Appliquer les migrations et remplir la base de démo :

```bash
npx prisma migrate deploy
```

```bash
npm run db:seed
```

3. Lancer l'application, puis se connecter avec le compte de démo (`SEED_UTILISATRICE_EMAIL` / `SEED_UTILISATRICE_MOT_DE_PASSE`) :

```bash
npm run dev
```

Adresses locales : application http://localhost:3000, API http://127.0.0.1:54321, base `postgresql://postgres:postgres@127.0.0.1:54322/postgres`. Pour explorer la base : `npx prisma studio`.

Seuls la base, l'Auth et l'API sont démarrés : Studio, Storage, Realtime, Analytics et les Edge Functions sont désactivés dans `supabase/config.toml` (inutiles pour Cotiz, et ils ralentissaient ou bloquaient `supabase start`).

Arrêter Supabase (les données sont gardées pour le prochain démarrage) :

```bash
npm run supabase:stop
```

L'authentification locale reprend les réglages de la production (`supabase/config.toml`) : inscription fermée, mot de passe de 8 caractères minimum, pas de confirmation d'e-mail. Attention : l'inscription se ferme avec `[auth] enable_signup = false` ; `[auth.email] enable_signup` doit rester à `true`, sinon toute connexion par e-mail est refusée en local.

### Le seed

`npm run db:seed` crée le compte de démo s'il n'existe pas, efface les données de ce seul compte, puis recrée 3 caisses de 32 membres, leurs cycles et 15 paiements. Il **refuse de tourner** si `NODE_ENV=production`, si `DATABASE_URL` ou `NEXT_PUBLIC_SUPABASE_URL` ne pointent pas vers `localhost`/`127.0.0.1`, ou si le compte visé n'a pas été créé par le seed.

### Tester depuis un téléphone (même Wi-Fi)

Ouvrir `http://<adresse du PC>:3000` (affichée par `npm run dev` sur la ligne `Network:`). Le bouton « Coller » (presse-papiers) n'apparaît qu'en HTTPS : en local, utiliser l'appui long dans le champ.

## Commandes

| Commande | Rôle |
| --- | --- |
| `npm run dev` | Serveur de développement (base locale) |
| `npm test` | Tests unitaires Vitest (sans base) |
| `npm run test:isolation` | Tests d'intégration : isolation, import, concurrence, connexion (base locale) |
| `npm run lint` | ESLint |
| `npm run build` | Build de production |
| `npm run supabase:start` / `supabase:stop` | Démarrer / arrêter Supabase en local |
| `npm run db:seed` | Données de démo (local uniquement) |
| `npx prisma migrate deploy` | Appliquer les migrations en **local** |
| `npm run db:migrate:prod` | Appliquer les migrations en **production** (lit `.env.prod`) |
| `npx prisma studio` | Explorer la base locale |

## Migrations

Les migrations sont versionnées dans `prisma/migrations/`. `npx prisma migrate dev` **ne fonctionne pas** sur ce projet : la migration initiale active la RLS sur `_prisma_migrations`, et la base fantôme de Prisma ne peut pas la rejouer. Pour une nouvelle migration :

1. Modifier `prisma/schema.prisma`.
2. Générer le SQL dans un nouveau dossier daté (`prisma/migrations/AAAAMMJJHHMMSS_nom/migration.sql`) :

```bash
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
```

3. Compléter le SQL à la main : **activer la RLS** sur toute nouvelle table (`ALTER TABLE "…" ENABLE ROW LEVEL SECURITY;`, sans policy), contraintes (`CHECK`, clés étrangères différées) et reprise des données existantes.
4. Appliquer en local avec `npx prisma migrate deploy`, puis en production avec `npm run db:migrate:prod`.

Garanties portées par la base : RLS sur toutes les tables, `CHECK (montant > 0)` sur les tables d'argent, un seul cycle ouvert par caisse (index partiel), historique financier protégé (clés étrangères `NO ACTION DEFERRABLE INITIALLY DEFERRED` : on ne supprime pas une caisse, une personne ou un cycle qui porte des paiements).

## Tests

- `npm test` : 447 tests unitaires (parser SMS, modèles Wave et Orange Money, matching et paiements « sûrs », import, datation des versés, dates, statuts, statistiques…) et contrôle statique du journal d'audit (`tests/audit-couverture.test.ts` : toute mutation de `Paiement`, `Allocation` ou `SmsNonLu` doit être dans une transaction et appeler `journaliser`). Aucune base nécessaire.
- `npm run test:isolation` : 26 tests d'intégration sur la base **locale** (Supabase démarré). Refusé si la base n'est pas locale ; les données de test sont supprimées à la fin.
  - `tests/isolation.integration.ts` : deux trésorières ; l'une ne peut ni lire ni modifier les données de l'autre via les Server Actions, et l'API publique de Supabase ne renvoie rien (RLS).
  - `tests/import-reprise.integration.ts` : import avec Cellule, Versé et Canal de bout en bout, réimport sans double comptage.
  - `tests/concurrence.integration.ts` : validations simultanées du même paiement, jamais plus que son montant.
  - `tests/connexion.integration.ts` : limite des essais de connexion.

## Sécurité

- Chaque requête filtre par l'`ownerId` de l'utilisatrice connectée (`exigerUtilisatrice()`), chaque entrée est validée par Zod.
- Mutations d'argent en transaction, avec verrous de ligne (`lib/verrous.ts`) et journal d'audit.
- Connexion : 5 échecs en 15 minutes pour une adresse → refus temporaire (adresse stockée en empreinte SHA-256 seulement).
- Le solde Wave n'est jamais extrait ni stocké : la ligne est retirée avant toute lecture.

## Déploiement (Vercel)

Région : `dub1` (Dublin), à côté de la base Supabase (`eu-west-1`, Irlande), réglée dans [vercel.json](vercel.json).

### Variables d'environnement sur Vercel

Seules quatre variables sont lues. Les copier depuis `.env.prod`, en cochant **uniquement l'environnement « Production »** (ni « Preview », ni « Development ») : sinon un déploiement de prévisualisation d'une branche se connecterait à la vraie base.

| Variable | Valeur |
| --- | --- |
| `DATABASE_URL` | URL du pooler Supabase (port 6543) |
| `NEXT_PUBLIC_SUPABASE_URL` | URL du projet Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | clé publique (*publishable key*) |
| `NEXT_PUBLIC_NUMERO_WAVE_RELANCE` | numéro Wave cité dans les relances par défaut (facultatif ; lu au build : redéployer après un changement) |

À ne **pas** mettre : `DIRECT_URL` (seulement pour les migrations, lancées depuis le PC avec `npm run db:migrate:prod`), `SUPABASE_SERVICE_ROLE_KEY` et `SEED_*` (seed local uniquement).

### Déploiements de prévisualisation désactivés (v0)

`vercel.json` contient `ignoreCommand` : Vercel ne construit que la branche `main` (condition sur `$VERCEL_GIT_COMMIT_REF` ; si la branche est inconnue, il construit). Les branches ne créent pas de déploiement de prévisualisation : il n'y a pas de base de prévisualisation, et cela évite toute connexion accidentelle à la production.

### Première mise en ligne

1. Vérifier que les migrations de production sont à jour : `npm run db:migrate:prod` (doit répondre « No pending migrations to apply »).
2. Sur vercel.com : *Add New → Project*, importer le dépôt GitHub `cotiz-app`. Framework détecté : Next.js, aucune commande à changer.
3. *Settings → Environment Variables* : ajouter les trois variables ci-dessus, environnement **Production** seulement.
4. Déployer, puis noter l'adresse `https://<projet>.vercel.app`.
5. Dans Supabase (projet de production) : *Authentication → URL Configuration* :
   - **Site URL** : `https://<projet>.vercel.app`
   - **Redirect URLs** : `https://<projet>.vercel.app/**`
6. Sur le site en ligne : se connecter, naviguer, se déconnecter. Vérifier que l'on reste sur l'adresse `vercel.app` à chaque étape (jamais de renvoi vers `localhost`).
7. Ouvrir le site sur Safari iPhone et dérouler les critères d'acceptation du [cahier des charges](CAHIER_DES_CHARGES.md#critères-dacceptation-v0).

### En-têtes de sécurité

Définis dans [next.config.ts](next.config.ts) : `Content-Security-Policy` (production : ressources du site uniquement, pas d'iframe), `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security`.

## Organisation du code

| Dossier | Contenu |
| --- | --- |
| `app/(prive)/` | Pages privées (accueil, caisses, personnes, capture, rapprochement, à rembourser, à dater, SMS non lus…) |
| `app/(public)/connexion/` | Seule page publique |
| `app/actions/` | Server Actions : `exigerUtilisatrice()`, Zod, filtre `ownerId`, transaction + verrous + journal d'audit |
| `components/cotiz/` | Composants de l'app : en-têtes, pastilles, graphiques, styles partagés, logo |
| `components/ui/` | Primitives shadcn/ui |
| `lib/parsers/`, `lib/capture/` | Parser SMS Wave, modèles Wave et Orange Money, doublons |
| `lib/matching/` | Identification, répartition, paiements « sûrs » (pur, tourne aussi dans le navigateur) |
| `lib/import/` | Lecture et analyse d'une liste collée, datation des versés repris |
| `lib/cycles/`, `lib/echeances/`, `lib/suivi/` | Dates des cycles, échéances des membres, statuts et suivi |
| `lib/donnees/` | Lectures en base, toujours filtrées par `ownerId` |
| `lib/audit.ts`, `lib/verrous.ts` | Journal d'audit, verrous de ligne |
| `prisma/` | Schéma, migrations, seed |
| `tests/` | Tests Vitest et fixtures (SMS et tableau Word au format réel, données inventées) |
