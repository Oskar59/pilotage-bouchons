# Pilotage Bouchons

Outil de pilotage pour le jeu d'entreprise « distributeur de bouchons de liège ».

## Fonctionnalités

- **Tableau de bord** : trésorerie fin de mois (réelle + prévision), stock, résultat, alertes de trésorerie négative.
- **Saisie du mois** : phase de planification (prix ramené dans la fourchette, délai comptant / 30 / 60 jours par segment, publicité), puis étape A « répartir les livraisons » (demande par segment, pénurie, demande perdue, répartition automatique), étape B « négociations » (achats avec statut en négociation / validée / refusée), autres ventes, délais de paiement / d'encaissement, transport, autres dépenses, notes de planification et de négociation.
- **Stock** : mouvements, coût moyen pondéré (CMUP), couverture, frais de stockage (0,33 %), bilan RSE des transports.
- **Coût de revient** : méthode des coûts complets (coûts de production + hors production ÷ quantité vendue), répartition des charges indirectes par CA ou par lots, par produit, par marché et par produit × marché, prix à pratiquer pour une marge visée.
- **Simulateur d'offre** : tester une offre avant de signer et voir son impact sur la trésorerie de tous les mois suivants.
- **Aides à la décision** : alerte de commande (livraison industriel 30 jours), aide au choix des prix par segment (demande estimée d'après les mois passés), prévu / réalisé, fiche « jusqu'où négocier » (prix max, lots max sans trésorerie négative, comparaison des délais de paiement), historique des fournisseurs, rapport imprimable (PDF).
- **Conseiller IA** : diagnostic automatique gratuit + discussion avec Gemini (clé gratuite Google AI Studio) ou Claude (payant), questions rapides, et bouton « Copier pour l'IA » pour utiliser n'importe quel chat gratuit sans clé. Les clés restent dans le navigateur.

## Hypothèses de calcul

- Les lots achetés chez un industriel arrivent 30 jours plus tard (le mois suivant), chez un distributeur instantanément ; le paiement sort au mois choisi (mois même, M+1…).
- Les ventes sont encaissées au mois choisi.
- Salaires (40 000 €) et frais de structure (20 000 €) sont payés chaque mois.
- CMUP calculé comme le jeu : un achat entre dans le coût moyen dès la commande (lots en transit compris) ; les frais de tri sont une charge du mois.
- Stockage = 0,33 % de la valeur du stock final, transit compris (au CMUP).
- Le stock de départ (12 000 lots × 25 €) est payé fin janvier.
- Les fourchettes de prix clients (Informations Clients) sont modifiables dans Paramètres.

Tous les paramètres sont modifiables dans l'onglet **Paramètres & partage**.

## Synchronisation en ligne (Supabase)

1. Créer un projet sur supabase.com.
2. SQL Editor → coller le contenu de [`supabase.sql`](supabase.sql) → Run.
3. Sur le site : Paramètres & partage → Synchronisation en ligne → URL du projet + clé publique (anon / publishable) → Générer un code d'équipe → Connecter.
4. « Copier le lien d'invitation » et l'envoyer au groupe.

Les données ne sont accessibles qu'avec le code d'équipe (fonctions `security definer`, tables fermées à l'accès direct). Historique en ligne : une copie toutes les 10 min au plus.

## Sauvegardes

Bouton **Sauvegarder** (en haut) : copie datée dans le navigateur + fichier `.json` téléchargé. Copies automatiques chaque jour et avant tout import, lien de partage, restauration ou réinitialisation. Restauration dans Paramètres & partage → Sauvegardes.

## Partage dans le groupe

Les données sont enregistrées dans le navigateur de chacun. Pour synchroniser : **Copier un lien de partage** (les données sont dans le lien) ou **Exporter / Importer** un fichier `.json`.
