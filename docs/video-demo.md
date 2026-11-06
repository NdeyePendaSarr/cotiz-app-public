# Vidéo de démonstration : plan de tournage

Durée visée : **1 min 30 à 2 min**, sans son ou avec une voix off courte. Données **inventées** uniquement.

## Avant de tourner (5 minutes)

1. Lancer Docker Desktop, puis Supabase local et la version de production locale :

   ```bash
   npm run supabase:start
   npm run build
   npx next start -p 3001
   ```

2. Créer le compte de démonstration (à refaire avant chaque nouvelle prise : il repart de zéro) :

   ```bash
   npm run demo:creer
   ```

   Le terminal affiche l'e-mail et le mot de passe ; le SMS à coller est dans `demo-sms.txt`. Ouvrir ce fichier et copier tout son contenu.

3. Dans Chrome : `http://localhost:3001`, se connecter, puis fermer les autres onglets et masquer la barre de favoris (`Ctrl + Maj + B`).
4. Format téléphone, plus parlant pour une app pensée pour le pouce : `F12`, icône téléphone/tablette (`Ctrl + Maj + M`), modèle **iPhone 12 Pro**, zoom 100 %. Ou bien plein écran ordinateur (`F11`) : les deux marchent, en choisir un seul.
5. Enregistrer avec la Barre de jeux Windows : `Win + G`, puis bouton d'enregistrement (`Win + Alt + R` pour démarrer et arrêter). La vidéo arrive dans `Vidéos\Captures`.

## Le parcours, plan par plan

| Temps | À l'écran | Geste | Message (sous-titre ou voix) |
| --- | --- | --- | --- |
| 0:00 – 0:10 | Accueil | Rien, laisser voir | « Cotiz : le carnet d'une trésorière de tontines, sur son téléphone. » |
| 0:10 – 0:15 | Accueil | Montrer « À faire » | « Le soir, ce qu'il reste à faire est en haut. » |
| 0:15 – 0:35 | Bouton or **Paiement**, puis « Coller un SMS » | Coller le SMS de `demo-sms.txt`, puis **Enregistrer** | « Un SMS Wave reçu : on le colle, montant, nom, numéro et référence sont lus tout seuls. Le solde n'est jamais gardé. » |
| 0:35 – 0:55 | **Rapprocher** | Montrer les paiements « sûrs », puis **Valider les 3 sûrs** | « Cotiz propose qui a payé et pour quelle caisse. Quand il n'y a rien à décider, tout se valide d'un geste. » |
| 0:55 – 1:05 | Le paiement « à vérifier » restant | Le montrer sans le valider | « Le reste, c'est la trésorière qui décide. » |
| 1:05 – 1:25 | **Caisses**, puis « Tontine des amies » | Liste des membres : Rokhaya Ba est maintenant à jour | « Les statuts se mettent à jour : payé, partiel, en attente. » |
| 1:25 – 1:35 | Même page | Bouton **Relancer** d'un membre en attente (ne pas envoyer : fermer WhatsApp aussitôt) | « Une relance WhatsApp, avec le bon numéro et le message prêt. » |
| 1:35 – 1:50 | « Cellule Technique », onglet **Mois** | Laisser voir la grille | « Une mensualité, mois par mois : payé, en retard, à venir. » |
| 1:50 – 2:00 | Accueil | Fin | « Next.js, TypeScript, PostgreSQL. Code : github.com/NdeyePendaSarr/cotiz-app-public » |

## Conseils

- **Gestes lents** : attendre une seconde après chaque clic, le spectateur doit voir le résultat.
- **Souris** : la poser hors de l'écran entre deux gestes.
- **Ratée** : relancer `npm run demo:creer` (tout repart de zéro, nouveau mot de passe) et recommencer.
- **Montage** : l'application Clipchamp (fournie avec Windows) suffit pour couper le début et la fin et ajouter les sous-titres du tableau ci-dessus.
- **Publication** : YouTube en « non répertoriée » (seuls ceux qui ont le lien la voient), ou Loom. Mettre ce lien sur le CV, à côté du lien GitHub.
- **Après le tournage** : `npm run demo:supprimer`.

Ne jamais filmer le site en production : il contient les vraies données de la trésorière.
