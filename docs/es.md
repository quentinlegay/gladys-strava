# Strava

Lleva tus actividades de [Strava](https://www.strava.com) a Gladys: sensores
con tu última actividad y tus distancias semanales, mensuales y anuales,
disparadores de escenas cuando terminas una actividad o bates un récord
personal, y dos widgets para el panel.

Requiere Gladys 5.1 o posterior y una cuenta de Strava (basta con una cuenta
gratuita).

## 1. Crea tu aplicación de API de Strava

Strava da a cada usuario su propia aplicación de API: la integración usa la
tuya, así que tus datos solo viajan entre Strava y tu Gladys.

1. Inicia sesión en strava.com y abre
   [Ajustes → Mi aplicación de API](https://www.strava.com/settings/api).
2. Rellena el formulario:
   - **Application Name**: por ejemplo `Gladys`;
   - **Category**: `Other`;
   - **Website**: la dirección de tu Gladys, o `https://gladysassistant.com`;
   - **Authorization Callback Domain**: el **nombre de host** que escribes en
     el navegador para abrir Gladys, sin `http://`, puerto ni ruta — por
     ejemplo `192.168.1.20` o `gladys.local`. Si abres Gladys a través de
     Gladys Plus, usa el nombre de host de esa dirección. Strava siempre
     acepta `localhost`.
3. Sube un icono cualquiera si Strava lo pide y guarda.
4. Deja la página abierta: necesitas el **Client ID** y el **Client Secret**.

## 2. Configura la integración

1. En Gladys, abre **Integraciones → Strava → Configuración**.
2. Pega el **Client ID** y el **Client Secret** y **guarda**.
3. Haz clic en **Conectar** junto a «Cuenta de Strava»: Strava te pide que
   autorices la aplicación. **Deja marcados todos los permisos** (también el
   de las actividades privadas, o tus actividades privadas quedarán fuera) y
   confirma.
4. De vuelta en Gladys, el estado pasa a «conectado» y aparece un dispositivo
   **Strava** en la pestaña **Descubrimiento**: añádelo para obtener sus
   sensores.

Opciones:

- **Unidades**: métrico (km, m, km/h) o imperial (mi, ft, mph). Cambiarlas
  actualiza la definición del dispositivo: acepta la actualización propuesta
  en la pestaña Descubrimiento.
- **Intervalo de actualización**: frecuencia de lectura de Strava, cada 15
  minutos por defecto (5 minutos como mínimo, Strava limita el número de
  solicitudes).
- **Objetivo de distancia semanal**: todos los deportes juntos, en km (o
  millas). Lo usan el disparador «Objetivo semanal de Strava alcanzado» y el
  widget del panel; 0 lo desactiva.

## 3. Notificaciones instantáneas con Gladys Plus (opcional)

Sin Gladys Plus, una nueva actividad aparece en la siguiente actualización. Con
Gladys Plus, pega tu **clave Open API** de Gladys Plus en el bloque «Webhooks
de Gladys Plus» de la pantalla de configuración: la integración registra
entonces un webhook de Strava, y Strava anuncia cada nueva actividad en
segundos.

Strava permite un webhook por aplicación de API: usa una aplicación dedicada
para cada Gladys.

## El dispositivo Strava

| Sensor                                               | Unidad            |
| ---------------------------------------------------- | ----------------- |
| Última actividad (nombre) / deporte                  | texto             |
| Distancia de la última actividad                     | km o mi           |
| Tiempo en movimiento de la última actividad          | minutos           |
| Desnivel positivo de la última actividad             | m o ft            |
| Velocidad media de la última actividad               | km/h o mph        |
| Distancia / tiempo en movimiento de esta semana      | km o mi / minutos |
| Distancias de carrera, ciclismo, natación, 4 semanas | km o mi           |
| Distancias de carrera, ciclismo, natación este año   | km o mi           |

La semana empieza el lunes, en la zona horaria de tu última actividad. Los
totales de 4 semanas y del año son los de Strava: solo cuentan las
actividades de carrera, ciclismo y natación, y solo las actividades visibles
para todos.

## Escenas

La integración añade sus propias tarjetas al editor de escenas, en la
categoría **Integraciones**.

Disparadores:

- **Nueva actividad de Strava** — se ha registrado o subido una actividad.
  Opcionalmente, filtra por deporte (carrera, ciclismo, natación, caminata o
  senderismo, otro). Las acciones siguientes pueden usar
  `{{triggerEvent.data.name}}`, `sport`, `sport_type`, `distance`,
  `distance_unit`, `moving_time` (minutos), `elevation_gain`,
  `average_speed`, `pr_count`, `activity_id` y `url`.
- **Récord personal de Strava** — una nueva actividad ha batido al menos uno
  de tus récords (`name`, `sport`, `pr_count`, `url`...).
- **Objetivo semanal de Strava alcanzado** — la distancia de la semana ha
  alcanzado tu objetivo, una vez por semana (`week_distance`, `goal`,
  `week_activities`).

Cada actividad se anuncia una sola vez, incluso tras un reinicio; las
actividades que existían antes de vincular la cuenta no se anuncian.

Acciones:

- **Sincronizar Strava** — lee Strava ahora; devuelve `new_activities`.
- **Obtener las estadísticas de Strava** — distancia, tiempo en movimiento,
  desnivel y número de un periodo (esta semana, últimas 4 semanas, este año,
  desde siempre) para un deporte o todos, para usar en un mensaje:
  «¡{{...distance}} {{...distance_unit}} esta semana!».
- **Obtener la última actividad de Strava** — nombre, deporte, distancia,
  duración y enlace de tu última actividad.

Cada acción devuelve también `linked`: false cuando no hay ninguna cuenta
vinculada, para que una escena pueda comprobarlo en lugar de fallar.

Ejemplo: «Cuando se registre una nueva carrera, envíame un mensaje de Telegram
con su distancia y haz parpadear la luz del salón si ha sido un récord
personal».

## Panel

- **Strava esta semana**: distancia, tiempo en movimiento, número de
  actividades y desnivel de la semana, un gráfico de distancia de 7 días, tu
  objetivo semanal, la última actividad y tus distancias anuales de carrera y
  ciclismo. **Sincronizar** actualiza al instante, **Abrir Strava** abre tu
  perfil.
- **Actividades de Strava**: tus últimas actividades (3, 5 u 8,
  opcionalmente de un solo deporte); toca una para ver los detalles y un
  enlace a Strava.

## Acciones de la pantalla de configuración

- **Probar la conexión** — lee Strava y muestra quién está conectado y las
  actividades de la semana.
- **Sincronizar ahora** — actualiza todo al instante.
- **Desvincular la cuenta de Strava** — revoca el acceso en Strava y olvida
  los tokens. Haz clic en **Conectar** para volver a vincular una cuenta.

## Solución de problemas

- **«redirect_uri invalid» en la página de Strava**: el Authorization Callback
  Domain de tu aplicación de Strava no coincide con la dirección con la que
  abres Gladys. Pon ese nombre de host (paso 1).
- **El estado indica que Strava ha denegado el acceso**: el acceso se revocó
  en strava.com o la aplicación ha cambiado. Haz clic de nuevo en
  **Conectar**.
- **La insignia del dispositivo muestra un punto naranja**: se alcanzó el
  límite de solicitudes de Strava; la siguiente actualización se pondrá al
  día. Aumenta el intervalo de actualización si ocurre a menudo.
- Consulta los registros de la integración desde la interfaz de Gladys (o con
  `docker logs` en el host); inicia el contenedor con `LOG_LEVEL=debug` para
  ver todos los detalles.

Puedes revocar el acceso de la integración en cualquier momento desde
[strava.com/settings/apps](https://www.strava.com/settings/apps).

_Strava es una marca registrada de Strava, Inc. Esta integración no está
afiliada a Strava._
