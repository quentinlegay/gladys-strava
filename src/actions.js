// -----------------------------------------------------------------------------
// Manifest actions: the buttons of the Configuration screen. Each handler is
// keyed by the action `key` declared in the manifest `actions` field and
// resolves the multi-language message shown under the button (a thrown error
// is shown too).
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { hasApplication, isLinked } from './config.js';
import { athleteName, distanceUnit, toDistance } from './strava/summary.js';

const logger = createLogger({ name: 'actions' });

const NOT_LINKED = {
  en: 'No Strava account is linked: click Connect first.',
  fr: "Aucun compte Strava n'est lié : cliquez d'abord sur Connecter.",
  de: 'Kein Strava-Konto ist verknüpft: Klicken Sie zuerst auf Verbinden.',
  es: 'No hay ninguna cuenta de Strava vinculada: haz clic primero en Conectar.',
};

export const ACTIONS = {
  async test_connection(ctx) {
    logger.info('Action test_connection');
    if (!hasApplication(ctx.getConfig())) {
      return {
        en: 'Fill in and save the Client ID and Client Secret first.',
        fr: "Renseignez et enregistrez d'abord le Client ID et le Client Secret.",
        de: 'Tragen Sie zuerst die Client ID und das Client Secret ein und speichern Sie sie.',
        es: 'Introduce y guarda primero el Client ID y el Client Secret.',
      };
    }
    if (!isLinked(ctx.getConfig())) {
      return NOT_LINKED;
    }
    const { snapshot } = await ctx.sync.refresh({ reason: 'test' });
    const units = ctx.getConfig().units;
    const week = `${toDistance(snapshot.week.all.distance, units)} ${distanceUnit(units)}`;
    const name = athleteName(snapshot);
    return {
      en: `Connected to Strava as ${name}: ${snapshot.week.all.count} activities, ${week} this week.`,
      fr: `Connecté à Strava en tant que ${name} : ${snapshot.week.all.count} activité(s), ${week} cette semaine.`,
      de: `Mit Strava verbunden als ${name}: ${snapshot.week.all.count} Aktivität(en), ${week} diese Woche.`,
      es: `Conectado a Strava como ${name}: ${snapshot.week.all.count} actividad(es), ${week} esta semana.`,
    };
  },

  async sync_now(ctx) {
    logger.info('Action sync_now');
    if (!isLinked(ctx.getConfig())) {
      return NOT_LINKED;
    }
    const { newActivities } = await ctx.sync.refresh({ reason: 'action' });
    return {
      en: `Strava synchronized: ${newActivities} new activities.`,
      fr: `Strava synchronisé : ${newActivities} nouvelle(s) activité(s).`,
      de: `Strava synchronisiert: ${newActivities} neue Aktivität(en).`,
      es: `Strava sincronizado: ${newActivities} actividad(es) nueva(s).`,
    };
  },

  async disconnect(ctx) {
    logger.info('Action disconnect');
    if (!isLinked(ctx.getConfig())) {
      return NOT_LINKED;
    }
    await ctx.unlink();
    return {
      en: 'Strava account unlinked. Click Connect to link an account again.',
      fr: 'Compte Strava délié. Cliquez sur Connecter pour lier à nouveau un compte.',
      de: 'Strava-Konto getrennt. Klicken Sie auf Verbinden, um erneut ein Konto zu verknüpfen.',
      es: 'Cuenta de Strava desvinculada. Haz clic en Conectar para volver a vincular una cuenta.',
    };
  },
};
