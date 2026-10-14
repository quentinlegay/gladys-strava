# Strava

Holen Sie Ihre [Strava](https://www.strava.com)-Aktivitäten in Gladys:
Sensoren mit Ihrer letzten Aktivität und Ihren Wochen-, Monats- und
Jahresdistanzen, Szenen-Auslöser, wenn Sie eine Aktivität beenden oder einen
persönlichen Rekord brechen, und zwei Dashboard-Widgets.

Erfordert Gladys 5.1 oder neuer und ein Strava-Konto (ein kostenloses Konto
genügt).

## 1. Erstellen Sie Ihre Strava-API-Anwendung

Strava gibt jedem Nutzer eine eigene API-Anwendung: Die Integration verwendet
Ihre, sodass Ihre Daten nur zwischen Strava und Ihrem Gladys übertragen werden.

1. Melden Sie sich auf strava.com an und öffnen Sie
   [Einstellungen → Meine API-Anwendung](https://www.strava.com/settings/api).
2. Füllen Sie das Formular aus:
   - **Application Name**: zum Beispiel `Gladys`;
   - **Category**: `Other`;
   - **Website**: die Adresse Ihres Gladys oder `https://gladysassistant.com`;
   - **Authorization Callback Domain**: der **Hostname**, den Sie im Browser
     eingeben, um Gladys zu öffnen, ohne `http://`, Port oder Pfad — zum
     Beispiel `192.168.1.20` oder `gladys.local`. Wenn Sie Gladys über Gladys
     Plus öffnen, verwenden Sie stattdessen den Hostnamen dieser Adresse.
     `localhost` wird von Strava immer akzeptiert.
3. Laden Sie ein beliebiges Symbol hoch, falls Strava danach fragt, und
   speichern Sie.
4. Lassen Sie die Seite geöffnet: Sie benötigen die **Client ID** und das
   **Client Secret**.

## 2. Die Integration konfigurieren

1. Öffnen Sie in Gladys **Integrationen → Strava → Konfiguration**.
2. Fügen Sie die **Client ID** und das **Client Secret** ein und **speichern**
   Sie.
3. Klicken Sie neben „Strava-Konto“ auf **Verbinden**: Strava bittet Sie, die
   Anwendung zu autorisieren. **Lassen Sie alle Berechtigungen angehakt** (auch
   die für private Aktivitäten, sonst fehlen Ihre privaten Aktivitäten) und
   bestätigen Sie.
4. Zurück in Gladys wechselt der Status auf „verbunden“ und im Tab
   **Erkennung** erscheint ein Gerät **Strava**: Fügen Sie es hinzu, um seine
   Sensoren zu erhalten.

Optionen:

- **Einheiten**: metrisch (km, m, km/h) oder imperial (mi, ft, mph). Eine
  Änderung aktualisiert die Gerätedefinition: Übernehmen Sie das im Tab
  Erkennung angebotene Update.
- **Aktualisierungsintervall**: wie oft Strava gelesen wird, standardmäßig
  alle 15 Minuten (mindestens 5 Minuten, Strava begrenzt die Anzahl der
  Anfragen).
- **Wöchentliches Distanzziel**: alle Sportarten zusammen, in km (oder
  Meilen). Wird vom Auslöser „Strava-Wochenziel erreicht“ und vom
  Dashboard-Widget verwendet; 0 deaktiviert es.

## 3. Sofortige Benachrichtigungen mit Gladys Plus (optional)

Ohne Gladys Plus erscheint eine neue Aktivität bei der nächsten
Aktualisierung. Mit Gladys Plus fügen Sie Ihren Gladys-Plus-**Open-API-Schlüssel**
im Block „Gladys Plus Webhooks“ der Konfigurationsseite ein: Die Integration
registriert dann einen Strava-Webhook, und Strava meldet jede neue Aktivität
innerhalb von Sekunden.

Strava erlaubt einen Webhook pro API-Anwendung: Verwenden Sie für jedes Gladys
eine eigene Anwendung.

## Das Strava-Gerät

| Sensor                                         | Einheit           |
| ---------------------------------------------- | ----------------- |
| Letzte Aktivität (Name) / Sportart             | Text              |
| Distanz der letzten Aktivität                  | km oder mi        |
| Bewegungszeit der letzten Aktivität            | Minuten           |
| Höhenmeter der letzten Aktivität               | m oder ft         |
| Durchschnittsgeschwindigkeit der letzten Akt.  | km/h oder mph     |
| Distanz / Bewegungszeit dieser Woche           | km oder mi / Min. |
| Lauf-, Rad-, Schwimmdistanzen, letzte 4 Wochen | km oder mi        |
| Lauf-, Rad-, Schwimmdistanzen dieses Jahr      | km oder mi        |

Die Woche beginnt am Montag, in der Zeitzone Ihrer letzten Aktivität. Die
Summen der 4 Wochen und des Jahres stammen von Strava selbst: Sie zählen nur
Lauf-, Rad- und Schwimmaktivitäten und nur die für alle sichtbaren
Aktivitäten.

## Szenen

Die Integration fügt dem Szenen-Editor eigene Karten in der Kategorie
**Integrationen** hinzu.

Auslöser:

- **Neue Strava-Aktivität** — eine Aktivität wurde aufgezeichnet oder
  hochgeladen. Optional nach Sportart filterbar (Laufen, Radfahren, Schwimmen,
  Gehen oder Wandern, andere). Die folgenden Aktionen können
  `{{triggerEvent.data.name}}`, `sport`, `sport_type`, `distance`,
  `distance_unit`, `moving_time` (Minuten), `elevation_gain`,
  `average_speed`, `pr_count`, `activity_id` und `url` verwenden.
- **Persönlicher Strava-Rekord** — eine neue Aktivität hat mindestens einen
  Ihrer Rekorde gebrochen (`name`, `sport`, `pr_count`, `url`...).
- **Strava-Wochenziel erreicht** — die Distanz der Woche hat Ihr Ziel
  erreicht, einmal pro Woche (`week_distance`, `goal`, `week_activities`).

Jede Aktivität wird einmal gemeldet, auch nach einem Neustart; Aktivitäten,
die vor der Verknüpfung des Kontos existierten, werden nicht gemeldet.

Aktionen:

- **Strava synchronisieren** — liest Strava sofort; gibt `new_activities`
  zurück.
- **Strava-Statistiken abrufen** — Distanz, Bewegungszeit, Höhenmeter und
  Anzahl eines Zeitraums (diese Woche, letzte 4 Wochen, dieses Jahr, gesamt)
  für eine Sportart oder alle, zur Verwendung in einer Nachricht:
  „{{...distance}} {{...distance_unit}} diese Woche!“.
- **Letzte Strava-Aktivität abrufen** — Name, Sportart, Distanz, Dauer und
  Link Ihrer letzten Aktivität.

Jede Aktion gibt außerdem `linked` zurück: false, wenn kein Konto verknüpft
ist, sodass eine Szene dies prüfen kann, statt fehlzuschlagen.

Beispiel: „Wenn ein neuer Lauf aufgezeichnet wird, schicke mir eine
Telegram-Nachricht mit seiner Distanz und lass das Wohnzimmerlicht blinken,
wenn es ein persönlicher Rekord war“.

## Dashboard

- **Strava diese Woche**: Distanz, Bewegungszeit, Anzahl der Aktivitäten und
  Höhenmeter der Woche, ein Distanzdiagramm über 7 Tage, Ihr Wochenziel, die
  letzte Aktivität und Ihre Lauf- und Raddistanzen des Jahres.
  **Synchronisieren** aktualisiert sofort, **Strava öffnen** öffnet Ihr Profil.
- **Strava-Aktivitäten**: Ihre letzten Aktivitäten (3, 5 oder 8, optional nur
  eine Sportart); tippen Sie auf eine für die Details und einen Link zu
  Strava.

## Aktionen der Konfigurationsseite

- **Verbindung testen** — liest Strava und zeigt, wer verbunden ist, und die
  Aktivitäten der Woche.
- **Jetzt synchronisieren** — aktualisiert alles sofort.
- **Strava-Konto trennen** — widerruft den Zugriff bei Strava und vergisst die
  Tokens. Klicken Sie auf **Verbinden**, um erneut ein Konto zu verknüpfen.

## Fehlerbehebung

- **„redirect_uri invalid“ auf der Strava-Seite**: Die Authorization Callback
  Domain Ihrer Strava-Anwendung stimmt nicht mit der Adresse überein, über die
  Sie Gladys öffnen. Setzen Sie sie auf diesen Hostnamen (Schritt 1).
- **Der Status meldet, dass Strava den Zugriff verweigert hat**: Der Zugriff
  wurde auf strava.com widerrufen oder die Anwendung hat sich geändert.
  Klicken Sie erneut auf **Verbinden**.
- **Das Abzeichen des Geräts zeigt einen orangefarbenen Punkt**: Das
  Strava-Anfragelimit wurde erreicht; die nächste Aktualisierung holt es nach.
  Erhöhen Sie das Aktualisierungsintervall, wenn das häufig vorkommt.
- Prüfen Sie die Logs der Integration in der Gladys-Oberfläche (oder mit
  `docker logs` auf dem Host); starten Sie den Container mit `LOG_LEVEL=debug`
  für alle Details.

Sie können den Zugriff der Integration jederzeit unter
[strava.com/settings/apps](https://www.strava.com/settings/apps) widerrufen.

_Strava ist eine Marke von Strava, Inc. Diese Integration steht in keiner
Verbindung zu Strava._
