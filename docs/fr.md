# Strava

Consultez vos activités [Strava](https://www.strava.com) depuis Gladys : le
détail de votre dernière activité, ainsi que vos totaux d'entraînement
glissants sur 7 et 30 jours — rafraîchis automatiquement, sans
synchronisation manuelle.

## Ce que vous obtenez

Deux appareils apparaissent après l'installation :

- **Strava - Latest activity** : nom, sport, distance, temps de mouvement,
  dénivelé positif, vitesse moyenne et date de départ de votre dernière
  activité Strava. Comme cet appareil conserve un historique de ses
  fonctionnalités numériques, le graphique du tableau de bord Gladys sert
  aussi de frise chronologique légère de vos activités dans le temps.
- **Strava - Training totals** : nombre d'activités et distance parcourue
  sur les 7 et 30 derniers jours, tous sports confondus (course, vélo,
  natation, randonnée...).

## Configuration

1. Créez gratuitement une application API Strava sur
   [strava.com/settings/api](https://www.strava.com/settings/api)
   (n'importe quel compte Strava peut en créer une — pas de processus
   d'approbation).
2. Dans les paramètres de votre application Strava, indiquez comme
   **« Authorization Callback Domain »** le domaine affiché dans votre
   navigateur lorsque vous ouvrez cette instance Gladys (sans `https://` et
   sans chemin — par exemple `my-gladys.com` ou `app.gladysassistant.com`).
3. Ouvrez l'onglet **Configuration** de l'intégration dans Gladys, collez le
   **Client ID** et le **Client Secret** de votre application Strava, puis
   enregistrez.
4. Cliquez sur **Se connecter à Strava** et approuvez la demande d'accès en
   lecture seule.
5. Les deux appareils apparaissent dans l'onglet **Découverte**, prêts à
   être ajoutés.

Vous pouvez aussi choisir le **système d'unités** (métrique km/km/h ou
impérial mi/mph) et l'**intervalle de rafraîchissement**. Cet intervalle est
borné entre 5 minutes et 1 heure pour rester largement sous les limites
d'appels de l'API Strava (100 requêtes / 15 min, 1000 / jour) — l'intégration
n'a besoin que d'une ou deux requêtes par rafraîchissement.

## Actions

- **Tester la connexion Strava** — effectue une requête en direct vers
  l'API Strava et affiche le nom de l'athlète connecté sous le bouton.
  Pratique juste après la connexion, ou pour vérifier qu'un jeton enregistré
  est toujours valide.

## Confidentialité

Gladys ne demande que le scope `activity:read_all` : il peut lire vos
activités (y compris privées), jamais en modifier, supprimer ou en publier
en votre nom. Vous pouvez révoquer l'accès à tout moment depuis vos
[paramètres d'applications Strava](https://www.strava.com/settings/apps).

## Dépannage

- **« Pas encore connecté à Strava »** dans l'écran de configuration :
  cliquez sur **Se connecter à Strava** et terminez l'autorisation.
- **Échec du renouvellement du jeton** : le Client ID/Secret de votre
  application Strava a peut-être changé, ou la connexion a été révoquée côté
  Strava — reconnectez-vous depuis l'écran de configuration.
- L'intégration journalise tout ce qu'elle fait : consultez les logs de
  l'intégration depuis l'interface Gladys (ou `docker logs` sur l'hôte) avec
  `LOG_LEVEL=debug` pour le détail complet.
