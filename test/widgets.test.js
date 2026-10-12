import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { WIDGET_KEYS, WIDGETS } from '../src/widgets.js';
import { linkedConfig } from './helpers/fakeStrava.js';
import { setup } from './helpers/setup.js';

const getContent = async (gladys, key, settings = {}) => {
  const ack = await gladys.fake.widgetGet(key, { settings });
  assert.equal(ack.success, true, ack.error);
  return ack.data.content;
};

test('the weekly summary is rendered exactly as sent', async (t) => {
  const { gladys } = await setup(t, { config: linkedConfig({ weekly_goal: 50 }) });
  const content = await getContent(gladys, WIDGET_KEYS.WEEKLY_SUMMARY);
  // [] = nothing the core would drop, truncate or trim to the content budget.
  assert.deepEqual(validateWidgetContent(content), []);
  const tiles = content.components.filter((c) => c.type === 'value');
  assert.deepEqual(
    tiles.map((tile) => tile.value),
    [52.2, '2h22', 2, 495],
  );
  const status = content.components.find((c) => c.type === 'status');
  assert.equal(status.items[0].value, '52.2 / 50 km');
  assert.equal(status.items[0].color, 'success');
});

test('the weekly summary in imperial units, with a failing Strava', async (t) => {
  const { gladys, strava, ctx } = await setup(t, { config: linkedConfig({ units: 'imperial' }) });
  strava.failNext(429);
  await ctx.sync.refresh().catch(() => {});
  const content = await getContent(gladys, WIDGET_KEYS.WEEKLY_SUMMARY);
  assert.deepEqual(validateWidgetContent(content), []);
  assert.equal(content.components[0].unit, 'mi');
  const status = content.components.find((c) => c.type === 'status');
  assert.equal(status.items[0].color, 'warning', 'the rate limit shows first');
});

test('the recent activities follow the widget settings', async (t) => {
  const { gladys } = await setup(t);
  const all = await getContent(gladys, WIDGET_KEYS.RECENT_ACTIVITIES, { count: '3' });
  assert.deepEqual(validateWidgetContent(all), []);
  const [list] = all.components;
  assert.equal(list.type, 'card-list');
  assert.deepEqual(
    list.items.map((item) => item.title),
    ['Evening Run', 'Morning Ride', 'Sunday swim'],
  );
  assert.equal(list.items[0].badge.text, '1 PR');
  assert.equal(list.items[0].links[0].url, 'https://www.strava.com/activities/101');

  const rides = await getContent(gladys, WIDGET_KEYS.RECENT_ACTIVITIES, { sport: 'ride' });
  assert.deepEqual(
    rides.components[0].items.map((item) => item.title),
    ['Morning Ride'],
  );

  const none = await getContent(gladys, WIDGET_KEYS.RECENT_ACTIVITIES, { sport: 'other' });
  assert.deepEqual(validateWidgetContent(none), []);
  assert.equal(none.components[0].type, 'text');
});

test('without a linked account, every widget explains how to link it', async (t) => {
  const { gladys } = await setup(t, { config: {} });
  for (const key of Object.keys(WIDGETS)) {
    const content = await getContent(gladys, key);
    assert.deepEqual(validateWidgetContent(content), []);
    assert.match(content.components[0].text.en, /Link your Strava account/);
  }
});

test('every button action of the contents is handled and answers a short toast', async (t) => {
  const { gladys } = await setup(t);
  for (const key of Object.keys(WIDGETS)) {
    const content = await getContent(gladys, key);
    for (const { action } of content.components.filter((c) => c.type === 'button' && c.action)) {
      const ack = await gladys.fake.widgetAction(key, action.key, action.params ?? {});
      assert.equal(ack.success, true, ack.error);
      assert.ok(ack.data.message.en.length <= 200);
      assert.ok(ack.data.message.fr);
    }
  }
});

test('an unknown widget action fails, so the user sees the error', async (t) => {
  const { gladys } = await setup(t);
  const ack = await gladys.fake.widgetAction(WIDGET_KEYS.WEEKLY_SUMMARY, 'unknown');
  assert.equal(ack.success, false);
  assert.match(ack.error, /Unknown widget action/);
});

test('every refresh nudges every widget', async (t) => {
  const { gladys, ctx } = await setup(t);
  const before = gladys.fake.widgetRefreshes.length;
  await ctx.sync.refresh();
  assert.deepEqual(gladys.fake.widgetRefreshes.slice(before), Object.keys(WIDGETS));
});
