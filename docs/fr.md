# Strava

Retrouvez vos activités [Strava](https://www.strava.com) dans Gladys : des
capteurs avec votre dernière activité et vos distances de la semaine, du mois
et de l'année, des déclencheurs de scène quand vous terminez une activité ou
battez un record personnel, et deux widgets de tableau de bord.

Nécessite Gladys 5.1 ou plus récent et un compte Strava (un compte gratuit
suffit).

## 1. Créez votre application d'API Strava

Strava donne à chaque utilisateur sa propre application d'API : l'intégration
utilise la vôtre, vos données ne circulent qu'entre Strava et votre Gladys.

1. Connectez-vous sur strava.com et ouvrez
   [Paramètres → Mon application d'API](https://www.strava.com/settings/api).
2. Remplissez le formulaire :
   - **Application Name** : par exemple `Gladys` ;
   - **Category** : `Other` ;
   - **Website** : l'adresse de votre Gladys, ou `https://gladysassistant.com` ;
   - **Authorization Callback Domain** : le **nom d'hôte** que vous tapez dans
     votre navigateur pour ouvrir Gladys, sans `http://`, port ni chemin — par
     exemple `192.168.1.20` ou `gladys.local`. Si vous ouvrez Gladys via
     Gladys Plus, utilisez le nom d'hôte de cette adresse. `localhost` est
     toujours accepté par Strava.
3. Ajoutez une icône si Strava en demande une, puis enregistrez.
4. Gardez la page ouverte : il vous faut le **Client ID** et le **Client
   Secret**.

## 2. Configurez l'intégration

1. Dans Gladys, ouvrez **Intégrations → Strava → Configuration**.
2. Collez le **Client ID** et le **Client Secret**, puis **enregistrez**.
3. Cliquez sur **Connecter** à côté de « Compte Strava » : Strava vous demande
   d'autoriser l'application. **Laissez toutes les autorisations cochées**
   (y compris celle des activités privées, sinon elles sont ignorées), puis
   validez.
4. De retour dans Gladys, le statut passe à « connecté » et un appareil
   **Strava** apparaît dans l'onglet **Découverte** : ajoutez-le pour obtenir
   ses capteurs.

Options :

- **Unités** : métriques (km, m, km/h) ou impériales (mi, ft, mph). Les
  changer modifie la définition de l'appareil : acceptez la mise à jour
  proposée dans l'onglet Découverte.
- **Intervalle de rafraîchissement** : fréquence de lecture de Strava, toutes
  les 15 minutes par défaut (5 minutes minimum, Strava limite le nombre de
  requêtes).
- **Type d'objectif hebdomadaire** : un objectif de distance (km ou miles) ou
  de temps actif (heures).
- **Objectif hebdomadaire** : tous sports confondus, en km (ou en miles) pour
  un objectif de distance, en heures pour un objectif de durée (ex. `4.5`).
  Utilisé par le déclencheur « Objectif hebdo Strava atteint » et par le
  widget ; 0 le désactive.

## 3. Notifications instantanées avec Gladys Plus (facultatif)

Sans Gladys Plus, une nouvelle activité apparaît au rafraîchissement suivant.
Avec Gladys Plus, collez votre **clé Open API** Gladys Plus dans le bloc
« Webhooks Gladys Plus » de l'écran de configuration : l'intégration
enregistre alors un webhook Strava, et Strava annonce chaque nouvelle activité
en quelques secondes.

Strava n'autorise qu'un webhook par application d'API : utilisez une
application dédiée pour chaque Gladys.

## L'appareil Strava

| Capteur                                         | Unité              |
| ----------------------------------------------- | ------------------ |
| Dernière activité (nom) / sport                 | texte              |
| Distance de la dernière activité                | km ou mi           |
| Temps en mouvement de la dernière activité      | minutes            |
| Dénivelé de la dernière activité                | m ou ft            |
| Vitesse moyenne de la dernière activité         | km/h ou mph        |
| Distance / temps en mouvement de la semaine     | km ou mi / minutes |
| Distances course, vélo, natation sur 4 semaines | km ou mi           |
| Distances course, vélo, natation de l'année     | km ou mi           |

La semaine commence le lundi, dans le fuseau horaire de votre dernière
activité. Les totaux sur 4 semaines et sur l'année sont ceux de Strava : ils ne
comptent que la course, le vélo et la natation, et seulement les activités
visibles par tout le monde.

## Scènes

L'intégration ajoute ses propres cartes à l'éditeur de scènes, dans la
catégorie **Intégrations**.

Déclencheurs :

- **Nouvelle activité Strava** — une activité a été enregistrée ou importée.
  Filtrez éventuellement sur le sport (course, vélo, natation, marche ou
  randonnée, autre). Les actions suivantes peuvent utiliser
  `{{triggerEvent.data.name}}`, `sport`, `sport_type`, `distance`,
  `distance_unit`, `moving_time` (minutes), `elevation_gain`,
  `average_speed`, `pr_count`, `activity_id` et `url`.
- **Record personnel Strava** — une nouvelle activité a battu au moins un de
  vos records (`name`, `sport`, `pr_count`, `url`...).
- **Objectif hebdo Strava atteint** — la distance ou le temps actif de la
  semaine a atteint votre objectif, une fois par semaine (`goal_type` =
  `distance` ou `time`, `goal`, `goal_unit`, `week_distance`, `week_hours`,
  `week_activities`).

Chaque activité n'est annoncée qu'une fois, même après un redémarrage ; les
activités antérieures à la liaison du compte ne sont pas annoncées.

Actions :

- **Synchroniser Strava** — lit Strava maintenant ; renvoie `new_activities`.
- **Obtenir les statistiques Strava** — distance, temps en mouvement, dénivelé
  et nombre d'activités d'une période (cette semaine, 4 dernières semaines,
  cette année, depuis toujours) pour un sport ou tous, à utiliser dans un
  message : « {{...distance}} {{...distance_unit}} cette semaine ! ».
- **Obtenir la dernière activité Strava** — nom, sport, distance, durée et
  lien de votre dernière activité.

Chaque action renvoie aussi `linked` : faux quand aucun compte n'est lié, pour
qu'une scène puisse le vérifier au lieu d'échouer.

Exemple : « Quand une nouvelle course est enregistrée, m'envoyer un message
Telegram avec sa distance, et faire clignoter la lumière du salon si c'est un
record personnel ».

## Tableau de bord

- **Strava cette semaine** : distance, temps en mouvement, nombre
  d'activités et dénivelé de la semaine, un graphique des distances sur 7
  jours, votre objectif hebdomadaire, la dernière activité et vos distances de
  course et de vélo de l'année. **Synchroniser** rafraîchit tout de suite,
  **Ouvrir Strava** ouvre votre profil.
- **Activités Strava** : vos dernières activités (3, 5 ou 8, éventuellement
  d'un seul sport) ; touchez-en une pour le détail et un lien vers Strava.

## Actions de l'écran de configuration

- **Tester la connexion** — lit Strava et affiche qui est connecté et les
  activités de la semaine.
- **Synchroniser maintenant** — rafraîchit tout immédiatement.
- **Délier le compte Strava** — révoque l'accès sur Strava et oublie les
  jetons. Cliquez sur **Connecter** pour lier à nouveau un compte.

## Dépannage

- **« redirect_uri invalid » sur la page Strava** : l'Authorization Callback
  Domain de votre application Strava ne correspond pas à l'adresse par
  laquelle vous ouvrez Gladys. Mettez-y ce nom d'hôte (étape 1).
- **Le statut indique que Strava a refusé l'accès** : l'accès a été révoqué
  sur strava.com ou l'application a changé. Cliquez à nouveau sur
  **Connecter**.
- **Le badge de l'appareil affiche un point orange** : la limite de requêtes
  Strava est atteinte ; le rafraîchissement suivant rattrape. Augmentez
  l'intervalle de rafraîchissement si cela arrive souvent.
- Consultez les logs de l'intégration depuis l'interface de Gladys (ou
  `docker logs` sur l'hôte) ; démarrez le conteneur avec `LOG_LEVEL=debug`
  pour le détail complet.

Vous pouvez révoquer l'accès de l'intégration à tout moment depuis
[strava.com/settings/apps](https://www.strava.com/settings/apps).

_Strava est une marque de Strava, Inc. Cette intégration n'est pas affiliée à
Strava._
