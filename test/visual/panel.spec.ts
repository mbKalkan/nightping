import { expect, test, type Page } from '@playwright/test';
import { fillPrompt, serverCommands } from '../../src/shared/guide';
import type { AgentKind, SetupWay } from '../../src/shared/protocol';
import { lowestTextContrast } from './contrast';
import {
  notSetUp,
  openPanel,
  ownServer,
  ready,
  strings,
  tailscaleReady,
  twoDestinations,
} from './harness';
import type { ThemeName } from './themes';

const SCREENS = 'test-results/screens';

const d = strings.destinations;
const destinationCard = (page: Page) => page.getByRole('region', { name: d.title });
const notifyCard = (page: Page) => page.getByRole('region', { name: strings.whenToNotify });
const messageCard = (page: Page) => page.getByRole('region', { name: strings.message.title });
const server = (page: Page) => page.getByLabel(d.server, { exact: true });
const topic = (page: Page) => page.getByLabel(d.topic, { exact: true });
const token = (page: Page) => page.getByLabel(d.token, { exact: true });
const name = (page: Page) => page.getByLabel(d.name, { exact: true });
const saveButton = (page: Page) => page.getByRole('button', { name: d.saveAndTest });
const testButton = (page: Page) => destinationCard(page).getByRole('button', { name: d.sendTest });
const editButton = (page: Page) => destinationCard(page).getByRole('button', { name: d.edit });
const way = (page: Page, which: SetupWay) =>
  destinationCard(page).getByRole('button', { name: d.ways[which].title });
const rows = (page: Page) => destinationCard(page).locator('.ng-dest');
const result = (page: Page) => page.locator('.ng-destination > .ng-result');
const stepTitles = (page: Page) => destinationCard(page).locator('.ng-step:visible .ng-step-title');
const agentRow = (page: Page, agent: AgentKind) =>
  page.getByRole('group', { name: strings[agent].title, exact: true });
const howItWorks = (page: Page, agent: AgentKind) =>
  agentRow(page, agent).getByText(strings[agent].howItWorks);
const rules = (page: Page) => page.getByText(strings.changeRules);
const rule = (page: Page) => page.locator('.ng-rule');
const conditions = (page: Page) => page.locator('.ng-conditions li');
const minimum = (page: Page) => page.getByLabel(strings.minimum);
const preview = (page: Page) => page.locator('.ng-preview p');
const messageInput = (page: Page) => page.getByLabel(strings.message.label, { exact: true });
const sendButton = (page: Page) =>
  messageCard(page).getByRole('button', { name: strings.message.send, exact: true });

const contrastFor = (theme: ThemeName) => (theme === 'hcDark' ? 7 : 4.5);

for (const theme of ['dark', 'light', 'hcDark', 'hcLight'] as ThemeName[]) {
  test.describe(`${theme} theme`, () => {
    test('asks how notifications should reach the phone while Nightping is not set up', async ({
      page,
    }) => {
      const panel = await openPanel(page, theme);
      await panel.init(notSetUp);

      await expect(page.getByRole('main', { name: strings.title })).toBeVisible();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(strings.title);
      await expect(page.getByText(strings.tagline)).toBeVisible();
      await expect(page.locator('.ng-header .ng-status')).toHaveText(strings.status.incomplete);
      await expect(page.getByText(d.chooseLead)).toBeVisible();
      // No server is chosen for the user: nothing is filled in until a way is picked.
      for (const which of ['ntfy-sh', 'own-server', 'tailscale'] as const) {
        await expect(way(page, which)).toContainText(d.ways[which].help);
      }
      await expect(way(page, 'ntfy-sh')).toContainText(d.easiest);
      await expect(destinationCard(page).locator('form')).toBeHidden();
      // There is no list to go back to.
      await expect(page.getByRole('button', { name: d.cancel })).toBeHidden();
      await expect(page.getByText(strings.recentEmpty)).toBeVisible();
      // WCAG AA for every text, AAA in the dark high contrast theme.
      expect(await lowestTextContrast(page)).toBeGreaterThanOrEqual(contrastFor(theme));
      await page.screenshot({ path: `${SCREENS}/setup-${theme}.png` });
      await destinationCard(page).screenshot({ path: `${SCREENS}/setup-card-${theme}.png` });
      expect(panel.problems).toEqual([]);
    });

    test('lists where notifications go once it works', async ({ page }) => {
      const panel = await openPanel(page, theme);
      await panel.init(ready);

      await expect(page.locator('.ng-header .ng-status')).toHaveText(strings.status.ready);
      await expect(rows(page)).toHaveCount(1);
      await expect(rows(page)).toContainText('ntfy.example.com');
      // Without a name the host is the title, so the line under it names the topic alone.
      await expect(rows(page)).toContainText('Topic my-topic');
      await expect(rows(page)).not.toContainText('on ntfy.example.com');
      // One destination has nothing to turn on and off.
      await expect(rows(page).getByRole('checkbox')).toHaveCount(0);
      await expect(destinationCard(page).locator('form')).toBeHidden();
      await expect(testButton(page)).toBeEnabled();
      await expect(editButton(page)).toBeVisible();
      await expect(page.getByRole('button', { name: d.add })).toBeVisible();

      const entries = page.getByRole('list', { name: strings.recent }).getByRole('listitem');
      await expect(entries).toHaveCount(3);
      await expect(entries.nth(0)).toContainText(strings.sent);
      await expect(entries.nth(1)).toContainText(strings.notSent);
      await expect(entries.nth(1)).toContainText('needs an access token');
      expect(await lowestTextContrast(page)).toBeGreaterThanOrEqual(contrastFor(theme));
      await page.screenshot({ path: `${SCREENS}/ready-${theme}.png` });
      expect(panel.problems).toEqual([]);
    });

    test('says when a notification comes, with an example', async ({ page }) => {
      // Tall enough for the whole card in one picture: the panel scrolls inside #app.
      await page.setViewportSize({ width: 1100, height: 1500 });
      const panel = await openPanel(page, theme);
      await panel.init({ ...ready, terminals: { open: 1, reporting: 0 } });

      await expect(rule(page)).toHaveText(strings.rules.lead);
      await expect(conditions(page)).toHaveText([
        'Only while you are not using VS Code.',
        'Only if it ran for 30 seconds or longer, unless it failed or needs you.',
      ]);
      await expect(preview(page)).toHaveText(['❌Task', 'Failed (exit 1) · 4m 12s']);
      for (const kind of ['task', 'terminal', 'notebook', 'debug'] as const) {
        await expect(page.getByLabel(strings.sources[kind])).toBeChecked();
      }
      await expect(page.getByText(strings.terminalNone)).toBeVisible();
      // The rules stay folded until asked for.
      await expect(page.getByLabel(strings.onlyWhenAway)).toBeHidden();
      await rules(page).click();
      await expect(page.getByLabel(strings.onlyWhenAway)).toBeChecked();
      await expect(minimum(page)).toHaveValue('30');
      await expect(page.getByLabel(strings.contentLevels.result)).toBeChecked();
      expect(await lowestTextContrast(page)).toBeGreaterThanOrEqual(contrastFor(theme));
      await notifyCard(page).screenshot({ path: `${SCREENS}/notify-${theme}.png` });
      expect(panel.problems).toEqual([]);
    });

    test('offers to connect each agent, and turns a connected one on and off', async ({ page }) => {
      await page.setViewportSize({ width: 1100, height: 1500 });
      const panel = await openPanel(page, theme);
      await panel.init({ ...ready, claude: notSetUp.claude });
      await expect(page.getByText(strings.agentsHelp)).toBeVisible();

      const claude = agentRow(page, 'claude');
      await expect(claude.getByRole('status')).toHaveText(strings.claude.state.disconnected);
      await expect(
        claude.getByRole('button', { name: strings.claude.connect, exact: true }),
      ).toBeVisible();
      // Nothing to turn on before the hooks are in.
      await expect(claude.getByRole('checkbox')).toBeHidden();
      // Files and buttons for doing it by hand wait under "How it works".
      await expect(claude.getByText('~/.claude/settings.json')).toBeHidden();
      await howItWorks(page, 'claude').click();
      await expect(claude).toContainText('~/.claude/settings.json');
      await expect(claude.getByRole('button', { name: strings.claude.copy })).toBeVisible();

      const copilot = agentRow(page, 'copilot');
      await expect(copilot.getByRole('status')).toHaveText(strings.copilot.state.connected);
      await expect(copilot.getByLabel(strings.sources.copilot)).toBeChecked();
      await expect(copilot.getByRole('button', { name: strings.copilot.disconnect })).toBeVisible();
      expect(await lowestTextContrast(page)).toBeGreaterThanOrEqual(contrastFor(theme));
      await page
        .locator('#ng-agents-title')
        .locator('..')
        .screenshot({
          path: `${SCREENS}/agents-${theme}.png`,
        });
      expect(panel.problems).toEqual([]);
    });

    test('offers to send a message of one’s own', async ({ page }) => {
      const panel = await openPanel(page, theme);
      await panel.init(ready);
      const card = messageCard(page);
      await expect(messageInput(page)).toHaveAttribute('placeholder', strings.message.placeholder);
      await expect(sendButton(page)).toBeDisabled();
      await messageInput(page).fill('Back in five minutes');
      await expect(sendButton(page)).toBeEnabled();
      expect(await lowestTextContrast(page)).toBeGreaterThanOrEqual(contrastFor(theme));
      await card.screenshot({ path: `${SCREENS}/message-${theme}.png` });
      expect(panel.problems).toEqual([]);
    });

    test('lists several destinations, each on or off', async ({ page }) => {
      const panel = await openPanel(page, theme);
      await panel.init(twoDestinations);
      await expect(rows(page)).toHaveCount(2);
      await expect(page.getByRole('checkbox', { name: 'Phone' })).toBeChecked();
      await expect(page.getByRole('checkbox', { name: 'Home server' })).not.toBeChecked();
      await expect(rows(page).nth(1)).toContainText('Topic alerts on box.tail1234.ts.net');
      await expect(rows(page).nth(1)).toContainText(d.offNote);
      await expect(rows(page).nth(0)).not.toContainText(d.offNote);
      expect(await lowestTextContrast(page)).toBeGreaterThanOrEqual(contrastFor(theme));
      await destinationCard(page).screenshot({ path: `${SCREENS}/destinations-${theme}.png` });
      expect(panel.problems).toEqual([]);
    });

    test('walks through one’s own server over Tailscale', async ({ page }) => {
      // The guide is long; the card's picture holds all of it.
      await page.setViewportSize({ width: 1100, height: 2600 });
      const panel = await openPanel(page, theme);
      await panel.init(notSetUp);
      await way(page, 'tailscale').click();
      await panel.post({ type: 'tailscale', status: tailscaleReady });
      await page.getByRole('radiogroup').getByLabel('box').check();
      await expect(page.locator('.ng-command').first()).toContainText('box.tail1234.ts.net');
      expect(await lowestTextContrast(page)).toBeGreaterThanOrEqual(contrastFor(theme));
      await destinationCard(page).screenshot({ path: `${SCREENS}/tailscale-${theme}.png` });
      expect(panel.problems).toEqual([]);
    });

    test('says when notifications are paused', async ({ page }) => {
      const panel = await openPanel(page, theme);
      await panel.init({ ...ready, pause: {} });
      await expect(page.locator('.ng-header .ng-status')).toHaveText(strings.pausedUntilResumed);
      await expect(page.getByRole('button', { name: strings.resume })).toBeVisible();
      expect(await lowestTextContrast(page)).toBeGreaterThanOrEqual(contrastFor(theme));
      await page.locator('.ng-header').screenshot({ path: `${SCREENS}/paused-${theme}.png` });
      expect(panel.problems).toEqual([]);
    });
  });
}

test('walks through ntfy.sh in three steps and saves with a test', async ({ page }) => {
  const panel = await openPanel(page, 'dark');
  await panel.init(notSetUp);
  await way(page, 'ntfy-sh').click();
  await expect(stepTitles(page)).toHaveText([
    d.steps.app.title,
    d.steps.topic.title,
    d.steps.save.title,
  ]);
  // A first destination starts from a topic nobody can guess; ntfy.sh needs no address.
  await expect(topic(page)).toHaveValue(/^nightping-[a-z0-9]{20}$/);
  await expect(topic(page)).toBeFocused();
  await expect(server(page)).toBeHidden();
  await expect(page.getByRole('button', { name: d.cancel })).toBeHidden();
  await expect(name(page)).toHaveAttribute('placeholder', 'ntfy.sh');
  await expect(saveButton(page)).toBeEnabled();
  const suggested = await topic(page).inputValue();
  await saveButton(page).click();
  expect(await panel.sent()).toEqual([
    { type: 'save', name: '', server: 'https://ntfy.sh', topic: suggested, token: '', test: true },
  ]);
});

test('asks for one’s own server and says how to subscribe to it', async ({ page }) => {
  const panel = await openPanel(page, 'dark');
  await panel.init(notSetUp);
  await way(page, 'own-server').click();
  await expect(stepTitles(page)).toHaveText([
    d.steps.app.title,
    d.steps.server.title,
    d.steps.topicOwn.title,
    d.steps.save.title,
  ]);
  await expect(server(page)).toBeFocused();
  await expect(server(page)).toHaveValue('');
  await expect(saveButton(page)).toBeDisabled();
  // The token waits until the user says the server needs one.
  await expect(token(page)).toBeHidden();
  await server(page).fill(' https://ntfy.example.com/ ');
  await expect(
    destinationCard(page).getByText(/^Open the ntfy app on your phone and tap \+/),
  ).toHaveText(
    'Open the ntfy app on your phone and tap +. Turn on “Use another server”, enter https://ntfy.example.com, then this topic.',
  );
  await page.getByRole('button', { name: d.addToken }).click();
  await expect(token(page)).toBeFocused();
  await expect(token(page)).toHaveAttribute('type', 'password');
  await expect(page.getByRole('button', { name: d.removeToken })).toBeHidden();
  await token(page).fill('tk_abc');
  await topic(page).fill('my-topic');
  await name(page).fill('Work phone');
  await name(page).press('Enter');
  expect(await panel.sent()).toEqual([
    {
      type: 'save',
      name: 'Work phone',
      server: 'https://ntfy.example.com/',
      topic: 'my-topic',
      token: 'tk_abc',
      test: true,
    },
  ]);
});

test('checks the server once the field is left, not while typing', async ({ page }) => {
  const panel = await openPanel(page, 'dark');
  await panel.init(notSetUp);
  await way(page, 'own-server').click();
  await server(page).fill('ntfy.example');
  await expect(page.getByText(d.serverInvalid)).toBeHidden();
  await server(page).press('Tab');
  await expect(page.getByText(d.serverInvalid)).toBeVisible();
  await expect(server(page)).toHaveAttribute('aria-invalid');
  await expect(saveButton(page)).toBeDisabled();

  await server(page).fill('https://ntfy.example.com');
  await expect(page.getByText(d.serverInvalid)).toBeHidden();
  await expect(saveButton(page)).toBeEnabled();
});

test('goes back to the three ways', async ({ page }) => {
  const panel = await openPanel(page, 'dark');
  await panel.init(notSetUp);
  await way(page, 'own-server').click();
  await page.getByRole('button', { name: d.otherWays }).click();
  await expect(way(page, 'tailscale')).toBeVisible();
  await expect(destinationCard(page).locator('form')).toBeHidden();
});

test('opens the app stores, copies the topic and suggests a new one', async ({ page }) => {
  const panel = await openPanel(page, 'dark');
  await panel.init(notSetUp);
  await way(page, 'ntfy-sh').click();
  const card = destinationCard(page);
  await card.getByRole('button', { name: 'Google Play' }).click();
  await card.getByRole('button', { name: 'F-Droid' }).click();
  await card.getByRole('button', { name: 'App Store' }).click();
  const first = await topic(page).inputValue();
  const copy = card.getByRole('button', { name: d.copy, exact: true });
  await copy.click();
  await expect(card.getByRole('button', { name: d.copied })).toBeVisible();
  await page.getByRole('button', { name: d.randomTopic }).click();
  await expect(topic(page)).toHaveValue(/^nightping-[a-z0-9]{20}$/);
  await expect(topic(page)).not.toHaveValue(first);
  expect(await panel.sent()).toEqual([
    { type: 'openAppStore', store: 'google-play' },
    { type: 'openAppStore', store: 'f-droid' },
    { type: 'openAppStore', store: 'app-store' },
    { type: 'copy', text: first },
  ]);
});

test('asks Tailscale for the devices and fills in the chosen server', async ({ page }) => {
  const panel = await openPanel(page, 'dark');
  await panel.init(notSetUp);
  await way(page, 'tailscale').click();
  await expect(stepTitles(page)).toHaveText([
    d.steps.tailscale.title,
    d.steps.pickServer.title,
    d.steps.run.title,
    d.steps.topicTailscale.title,
    d.steps.save.title,
  ]);
  await expect(page.getByText(d.tailscale.checking)).toBeVisible();
  await panel.post({ type: 'tailscale', status: tailscaleReady });
  await expect(page.getByText('This computer is on Tailscale as desk.')).toBeVisible();
  const devices = page.getByRole('radiogroup', { name: d.steps.pickServer.title });
  await expect(devices.getByRole('radio')).toHaveCount(2);
  await expect(devices).toContainText('desk (this computer · windows)');
  await expect(devices).toContainText('box (linux · offline)');
  // The commands wait for the server's address.
  const commands = page.locator('.ng-command');
  await expect(commands.nth(0).getByRole('button', { name: d.copy })).toBeDisabled();
  await expect(commands.nth(0)).toContainText('NTFY_BASE_URL=https://SERVER.TAILNET.ts.net');

  await devices.getByLabel('box').check();
  await expect(server(page)).toHaveValue('https://box.tail1234.ts.net');
  await expect(page.getByText(d.tailscale.offlineChosen.replace('{0}', 'box'))).toBeVisible();
  await expect(page.getByText(d.tailscale.server.checking.replace('{0}', 'box'))).toBeVisible();
  await expect(commands.nth(0)).toContainText('-e NTFY_BASE_URL=https://box.tail1234.ts.net');
  await expect(commands.nth(1)).toHaveText(/tailscale serve --bg 2586/);
  await expect(
    destinationCard(page).getByText(/^Install the ntfy app and turn Tailscale on/),
  ).toContainText('enter https://box.tail1234.ts.net, then this topic');
  // Typing another address unchecks the device.
  await server(page).fill('https://desk.tail1234.ts.net');
  await expect(devices.getByLabel('desk', { exact: false })).toBeChecked();
  await expect(devices.getByLabel('box')).not.toBeChecked();
  await expect(page.getByText(/is offline right now/)).toBeHidden();

  await commands.nth(1).getByRole('button', { name: d.copy }).click();
  await expect(commands.nth(1).getByRole('button', { name: d.copied })).toBeVisible();
  await page.getByRole('button', { name: d.tailscale.download }).click();
  await page.getByRole('button', { name: d.run.otherWays }).click();
  await destinationCard(page).screenshot({ path: `${SCREENS}/tailscale-dark.png` });
  await saveButton(page).click();
  const sent = await panel.sent();
  // This computer is not asked whether ntfy runs on it.
  expect(sent.slice(0, 2)).toEqual([
    { type: 'findTailscale' },
    { type: 'checkServer', server: 'https://box.tail1234.ts.net' },
  ]);
  expect(sent.slice(2, 5)).toEqual([
    { type: 'copy', text: 'tailscale serve --bg 2586' },
    { type: 'openGuide', link: 'tailscale-download' },
    { type: 'openGuide', link: 'ntfy-install' },
  ]);
  expect(sent[5]).toMatchObject({ type: 'save', server: 'https://desk.tail1234.ts.net' });
});

test('skips setting up a server where ntfy already runs, and asks for the phone’s topic', async ({
  page,
}) => {
  const nas = 'https://nas.tail1234.ts.net';
  await page.setViewportSize({ width: 1100, height: 1600 });
  const panel = await openPanel(page, 'dark');
  await panel.init(notSetUp);
  await way(page, 'tailscale').click();
  await panel.post({
    type: 'tailscale',
    status: {
      ...tailscaleReady,
      devices: [
        ...tailscaleReady.devices,
        { name: 'nas', os: 'linux', online: true, self: false, address: nas },
      ],
    },
  });
  const devices = page.getByRole('radiogroup', { name: d.steps.pickServer.title });
  const suggested = await topic(page).inputValue();
  await devices.getByLabel('nas').check();
  await expect(page.getByText(d.tailscale.server.checking.replace('{0}', 'nas'))).toBeVisible();
  await panel.post({ type: 'serverCheck', server: nas, running: true });
  await expect(page.getByText(d.tailscale.server.running.replace('{0}', 'nas'))).toBeVisible();
  await expect(stepTitles(page)).toHaveText([
    d.steps.tailscale.title,
    d.steps.pickServer.title,
    d.steps.topicExisting.title,
    d.steps.save.title,
  ]);
  await expect(destinationCard(page).getByText(/^If your phone already gets/)).toContainText(
    `notifications from ${nas}, enter the topic it is subscribed to`,
  );
  // The phone's topic is wanted, not a new one; nothing can be saved without it.
  await expect(topic(page)).toHaveValue('');
  await expect(page.getByText(d.topicHelp)).toBeHidden();
  await expect(saveButton(page)).toBeDisabled();
  // An answer about another address changes nothing.
  await panel.post({ type: 'serverCheck', server: 'https://box.tail1234.ts.net', running: false });
  await expect(page.getByText(d.tailscale.server.running.replace('{0}', 'nas'))).toBeVisible();
  await destinationCard(page).screenshot({ path: `${SCREENS}/tailscale-existing-dark.png` });

  // This computer is not asked; the guide goes back to setting ntfy up, with the suggested topic.
  await devices.getByLabel('desk', { exact: false }).check();
  await expect(page.getByText(/^ntfy already runs on/)).toBeHidden();
  await expect(stepTitles(page)).toContainText([d.steps.run.title]);
  await expect(topic(page)).toHaveValue(suggested);

  await devices.getByLabel('box').check();
  await panel.post({ type: 'serverCheck', server: 'https://box.tail1234.ts.net', running: false });
  await expect(page.getByText(d.tailscale.server.none.replaceAll('{0}', 'box'))).toBeVisible();
  await expect(stepTitles(page)).toContainText([d.steps.run.title, d.steps.topicTailscale.title]);

  await devices.getByLabel('nas').check();
  await panel.post({ type: 'serverCheck', server: nas, running: true });
  await topic(page).fill('phone-topic');
  await saveButton(page).click();
  const sent = await panel.sent();
  expect(sent.filter((message) => message.type === 'checkServer')).toEqual([
    { type: 'checkServer', server: nas },
    { type: 'checkServer', server: 'https://box.tail1234.ts.net' },
    { type: 'checkServer', server: nas },
  ]);
  expect(sent.at(-1)).toMatchObject({ type: 'save', server: nas, topic: 'phone-topic' });
});

test('says what to do when Tailscale is missing, off or signed out, or has no MagicDNS', async ({
  page,
}) => {
  const panel = await openPanel(page, 'dark');
  await panel.init(notSetUp);
  await way(page, 'tailscale').click();
  for (const kind of ['missing', 'off', 'signed-out'] as const) {
    await panel.post({ type: 'tailscale', status: { kind } });
    await expect(page.getByText(d.tailscale.state[kind])).toBeVisible();
    await expect(page.getByRole('radiogroup')).toBeHidden();
  }
  await page.getByRole('button', { name: d.tailscale.check }).click();
  await expect(page.getByText(d.tailscale.checking)).toBeVisible();
  await panel.post({
    type: 'tailscale',
    status: { kind: 'ready', name: 'desk', magicDns: false, devices: [] },
  });
  await expect(page.getByText(/^MagicDNS is off/)).toBeVisible();
  await page.getByRole('button', { name: d.tailscale.openDns }).click();
  // The address can always be typed.
  await expect(server(page)).toBeVisible();
  expect(await panel.sent()).toEqual([
    { type: 'findTailscale' },
    { type: 'findTailscale' },
    { type: 'openGuide', link: 'tailscale-dns' },
  ]);
});

test('hands the steps an AI agent can do to it as ready prompts', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 2600 });
  const panel = await openPanel(page, 'dark');
  await panel.init(notSetUp);
  const delegates = destinationCard(page).locator('.ng-delegate:visible');
  const delegate = (index: number) =>
    delegates.nth(index).getByRole('button', { name: d.delegate.button });
  const copied = async () =>
    (await panel.sent()).flatMap((message) => (message.type === 'copy' ? [message.text] : []));

  await way(page, 'tailscale').click();
  await panel.post({ type: 'tailscale', status: tailscaleReady });
  // Putting Tailscale on a computer, and running ntfy on the server.
  await expect(delegates).toHaveCount(2);
  await expect(delegates.nth(0)).toContainText(d.delegate.help.tailscale);
  await expect(delegates.nth(1)).toContainText(d.delegate.help.ntfy);
  // The server's prompt waits for its address.
  await expect(delegate(1)).toBeDisabled();
  await page.getByRole('radiogroup').getByLabel('box').check();
  await delegate(1).click();
  await expect(delegates.nth(1).getByText(d.delegate.copied)).toBeVisible();
  // What the agent is asked can be read before it is pasted.
  await delegates.nth(1).getByText(d.delegate.show).click();
  await expect(delegates.nth(1).locator('pre')).toContainText('tailscale serve --bg 2586');
  await delegate(0).click();
  const box = 'https://box.tail1234.ts.net';
  expect(await copied()).toEqual([
    fillPrompt(d.prompts.ntfy, [box, ...serverCommands(box)]),
    fillPrompt(d.prompts.tailscale, []),
  ]);
  await destinationCard(page).screenshot({ path: `${SCREENS}/delegate-dark.png` });

  // On one's own server, where a token is asked for.
  await page.getByRole('button', { name: d.otherWays }).click();
  await way(page, 'own-server').click();
  await expect(delegates).toHaveCount(0);
  await expect(delegates.nth(0)).toBeHidden();
  await page.getByRole('button', { name: d.addToken }).click();
  await expect(delegates).toHaveCount(1);
  await expect(delegates.nth(0)).toContainText(d.delegate.help.token);
  await expect(delegate(0)).toBeDisabled();
  await server(page).fill('https://ntfy.example.com');
  await delegate(0).click();
  const topicName = await topic(page).inputValue();
  expect((await copied())[2]).toBe(
    fillPrompt(d.prompts.token, ['https://ntfy.example.com', topicName]),
  );
  // A new form starts without the line of the last copy.
  await page.getByRole('button', { name: d.otherWays }).click();
  await way(page, 'ntfy-sh').click();
  // ntfy.sh needs nothing done on a computer.
  await expect(delegates).toHaveCount(0);
});

test('opens the guide the Command Palette asks for', async ({ page }) => {
  const panel = await openPanel(page, 'dark');
  await panel.init(ready);
  await panel.post({ type: 'guide', way: 'tailscale' });
  await expect(stepTitles(page).first()).toHaveText(d.steps.tailscale.title);
  // There is a list to go back to.
  await expect(page.getByRole('button', { name: d.cancel })).toBeVisible();
  expect(await panel.sent()).toEqual([{ type: 'findTailscale' }]);
});

test('refuses the same topic on the same server twice', async ({ page }) => {
  const panel = await openPanel(page, 'dark');
  await panel.init(ready);
  await page.getByRole('button', { name: d.add }).click();
  await way(page, 'own-server').click();
  await server(page).fill('https://ntfy.example.com/');
  await topic(page).fill('my-topic');
  await expect(page.getByText(d.duplicate)).toBeVisible();
  await expect(saveButton(page)).toBeDisabled();
  await topic(page).fill('my-other-topic');
  await expect(page.getByText(d.duplicate)).toBeHidden();
  await expect(saveButton(page)).toBeEnabled();
  // Should the host refuse anyway, the card says why.
  await panel.post({ type: 'notSaved', error: d.duplicate });
  await expect(result(page)).toHaveText(d.duplicate);
});

test('adds another destination, or goes back to the list', async ({ page }) => {
  const panel = await openPanel(page, 'dark');
  await panel.init(ready);
  await page.getByRole('button', { name: d.add }).click();
  await expect(way(page, 'ntfy-sh')).toBeFocused();
  await expect(rows(page)).toBeHidden();
  await page.getByRole('button', { name: d.cancel }).click();
  await expect(rows(page)).toHaveCount(1);
  await way(page, 'ntfy-sh').isHidden();
});

test('edits a destination, or leaves it as it was', async ({ page }) => {
  const panel = await openPanel(page, 'dark');
  await panel.init(ready);
  await editButton(page).click();
  // Whoever edits a destination has the app already: three steps, numbered from one.
  await expect(stepTitles(page)).toHaveText([
    d.steps.server.title,
    d.steps.topicOwn.title,
    d.steps.save.title,
  ]);
  await expect(page.getByRole('button', { name: d.otherWays })).toBeHidden();
  await expect(server(page)).toBeFocused();
  // The saved token is never shown; the field says one is saved.
  await expect(token(page)).toHaveValue('');
  await expect(token(page)).toHaveAttribute('placeholder', d.tokenSaved);
  await expect(page.getByRole('button', { name: d.removeToken })).toBeVisible();
  // Nothing changed yet, so there is nothing to save; a saved token needs no prompt for one.
  await expect(saveButton(page)).toBeDisabled();
  await expect(destinationCard(page).locator('.ng-delegate:visible')).toHaveCount(0);
  await destinationCard(page).screenshot({ path: `${SCREENS}/edit-dark.png` });

  await topic(page).fill('half-typed');
  await page.getByRole('button', { name: d.cancel }).click();
  await expect(destinationCard(page).locator('form')).toBeHidden();
  await editButton(page).click();
  await expect(topic(page)).toHaveValue('my-topic');

  await topic(page).fill('other-topic');
  await token(page).fill('tk_new');
  await saveButton(page).click();
  expect(await panel.sent()).toEqual([
    {
      type: 'save',
      previous: ownServer.key,
      name: '',
      server: ownServer.server,
      topic: 'other-topic',
      token: 'tk_new',
      test: true,
    },
  ]);
  const changed = {
    ...ownServer,
    key: 'https://ntfy.example.com/other-topic',
    topic: 'other-topic',
  };
  await panel.post({ type: 'saved' });
  await panel.post({ type: 'state', state: { ...ready, destinations: [changed] } });
  await expect(rows(page)).toContainText('Topic other-topic');
  await expect(destinationCard(page).locator('form')).toBeHidden();
  await editButton(page).click();
  await expect(token(page)).toHaveValue('');
});

test('removes a saved token', async ({ page }) => {
  const panel = await openPanel(page, 'dark');
  await panel.init(ready);
  await editButton(page).click();
  await page.getByRole('button', { name: d.removeToken }).click();
  expect(await panel.sent()).toEqual([{ type: 'removeToken', key: ownServer.key }]);
});

test('rejects a token that cannot go into an HTTP header', async ({ page }) => {
  const panel = await openPanel(page, 'dark');
  await panel.init(ready);
  await editButton(page).click();
  await token(page).fill('tk with spaces');
  await token(page).press('Tab');
  await expect(page.getByText(d.tokenInvalid)).toBeVisible();
  await expect(saveButton(page)).toBeDisabled();
});

test('keeps what the user is typing when the settings change elsewhere', async ({ page }) => {
  const panel = await openPanel(page, 'dark');
  await panel.init(ready);
  await editButton(page).click();
  await topic(page).fill('half-typed');
  await panel.post({ type: 'state', state: twoDestinations });
  await expect(topic(page)).toHaveValue('half-typed');
  await expect(destinationCard(page).locator('form')).toBeVisible();
});

test('shows a wrong saved setting in its row', async ({ page }) => {
  const panel = await openPanel(page, 'dark');
  const wrong = { ...ownServer, server: 'ntfy.example.com', problem: 'server' as const };
  await panel.init({ ...ready, destinations: [wrong], status: 'invalid' });
  await expect(page.locator('.ng-header .ng-status')).toHaveText(strings.status.invalid);
  await expect(rows(page)).toContainText(d.problem.server);
  await expect(testButton(page)).toBeDisabled();
  await editButton(page).click();
  await expect(page.getByText(d.serverInvalid)).toBeVisible();
  await page.screenshot({ path: `${SCREENS}/invalid-dark.png` });
});

test('sends a test to one destination and tells how it went', async ({ page }) => {
  const panel = await openPanel(page, 'dark');
  await panel.init(ready);
  await testButton(page).click();
  expect(await panel.sent()).toEqual([{ type: 'sendTest', key: ownServer.key }]);
  await panel.post({ type: 'busy', busy: true });
  await expect(page.getByRole('button', { name: strings.sending })).toBeDisabled();

  const error = 'https://ntfy.example.com refused the access token (HTTP 401).';
  await panel.post({ type: 'result', time: Date.now(), error });
  await panel.post({ type: 'busy', busy: false });
  await expect(result(page)).toHaveText(error);
  await expect(result(page)).toHaveClass(/ng-failed/);
  await page.screenshot({ path: `${SCREENS}/failed-dark.png` });

  await panel.post({
    type: 'result',
    time: new Date(2026, 10, 3, 14, 2).getTime(),
    to: 'ntfy.example.com',
  });
  // In the language VS Code shows (English here: a 12-hour clock).
  await expect(result(page)).toHaveText(
    /^Sent to ntfy\.example\.com at 2:02\sPM\. If it is not on your phone, check that the app is subscribed to its topic\.$/,
  );
  await expect(result(page)).not.toHaveClass(/ng-failed/);
  await expect(testButton(page)).toBeEnabled();
});

test('offers the access token when the server refused a test for want of one', async ({ page }) => {
  const panel = await openPanel(page, 'dark');
  const noToken = { ...ownServer, hasToken: false };
  await panel.init({ ...ready, destinations: [noToken] });
  const setToken = destinationCard(page).getByRole('button', { name: d.enterToken });
  const error = 'https://ntfy.example.com needs an access token for this topic (HTTP 403).';
  await panel.post({ type: 'result', time: Date.now(), error });
  await expect(result(page)).toHaveText(error);
  await expect(setToken).toBeHidden();

  await panel.post({ type: 'result', time: Date.now(), error, needsToken: noToken.key });
  await expect(setToken).toBeVisible();
  await destinationCard(page).screenshot({ path: `${SCREENS}/needs-token-dark.png` });
  await setToken.click();
  await expect(token(page)).toBeVisible();
  await expect(token(page)).toBeFocused();
  await expect(server(page)).toHaveValue(noToken.server);
  await token(page).fill('tk_example');
  await saveButton(page).click();
  expect(await panel.sent()).toEqual([
    {
      type: 'save',
      previous: noToken.key,
      name: '',
      server: noToken.server,
      topic: noToken.topic,
      token: 'tk_example',
      test: true,
    },
  ]);
  await panel.post({ type: 'saved' });
  await panel.post({ type: 'result', time: Date.now(), to: 'ntfy.example.com' });
  await expect(result(page)).toHaveText(/^Sent to ntfy\.example\.com at /);
  await expect(setToken).toBeHidden();
});

test('shows the test result once the first destination is saved', async ({ page }) => {
  const panel = await openPanel(page, 'dark');
  await panel.init(notSetUp);
  await way(page, 'ntfy-sh').click();
  await saveButton(page).click();
  await panel.post({ type: 'saved' });
  await panel.post({ type: 'busy', busy: true });
  const first = {
    key: 'https://ntfy.sh/nightping-abc',
    name: '',
    server: 'https://ntfy.sh',
    topic: 'nightping-abc',
    enabled: true,
    hasToken: false,
  };
  await panel.post({
    type: 'state',
    state: { ...ready, destinations: [first], history: [] },
  });
  await panel.post({ type: 'result', time: Date.now(), to: 'ntfy.sh' });
  await panel.post({ type: 'busy', busy: false });
  await expect(rows(page)).toContainText('Topic nightping-abc');
  await expect(result(page)).toHaveText(/^Sent to ntfy\.sh at /);
  await destinationCard(page).screenshot({ path: `${SCREENS}/first-test-dark.png` });
});

test('turns a destination on and off, and removes one', async ({ page }) => {
  const panel = await openPanel(page, 'dark');
  await panel.init(twoDestinations);
  const [phone, home] = twoDestinations.destinations;
  await expect(page.getByRole('checkbox', { name: 'Phone' })).toBeChecked();
  await page.getByRole('checkbox', { name: 'Home server' }).check();
  await page.getByRole('button', { name: `${d.remove}: Phone` }).click();
  expect(await panel.sent()).toEqual([
    { type: 'setEnabled', key: home.key, enabled: true },
    { type: 'removeDestination', key: phone.key },
  ]);
});

test('offers the box of the only destination once it is off', async ({ page }) => {
  const panel = await openPanel(page, 'dark');
  await panel.init({ ...ready, destinations: [{ ...ownServer, enabled: false }], status: 'off' });
  await expect(page.locator('.ng-header .ng-status')).toHaveText(strings.status.off);
  await expect(rows(page)).toContainText(d.offNote);
  await page.getByRole('checkbox', { name: 'ntfy.example.com' }).check();
  expect(await panel.sent()).toEqual([{ type: 'setEnabled', key: ownServer.key, enabled: true }]);
});

test('marks a notification that reached only some destinations', async ({ page }) => {
  const panel = await openPanel(page, 'dark');
  await panel.init({
    ...twoDestinations,
    history: [
      {
        time: Date.now(),
        title: 'Build',
        message: 'failed · 4m 12s',
        error: 'Home server: Could not reach https://box.tail1234.ts.net (ENOTFOUND).',
        partial: true,
      },
    ],
  });
  const entry = page.getByRole('list', { name: strings.recent }).getByRole('listitem');
  await expect(entry).toContainText(strings.partlySent);
  await expect(entry).toContainText('Home server: Could not reach');
});

test('connects, disconnects and copies the Claude Code hooks', async ({ page }) => {
  const panel = await openPanel(page, 'dark');
  await panel.init({ ...ready, claude: notSetUp.claude });
  const row = agentRow(page, 'claude');
  await row.getByRole('button', { name: strings.claude.connect, exact: true }).click();
  await howItWorks(page, 'claude').click();
  await row.getByRole('button', { name: strings.claude.copy }).click();

  await panel.post({ type: 'state', state: ready });
  await expect(row.getByRole('status')).toHaveText(strings.claude.state.connected);
  await expect(row.getByRole('button', { name: strings.claude.connect, exact: true })).toBeHidden();
  await expect(row.getByLabel(strings.sources.claude)).toBeChecked();
  await expect(row.getByText('In this window, on port 47391.')).toBeVisible();
  await row.getByRole('button', { name: strings.claude.disconnect }).click();
  expect(await panel.sent()).toEqual([
    { type: 'connectAgent', agent: 'claude' },
    { type: 'copyAgentSettings', agent: 'claude' },
    { type: 'disconnectAgent', agent: 'claude' },
  ]);
});

test('turns a connected agent off; an agent not connected has nothing to turn', async ({
  page,
}) => {
  const panel = await openPanel(page, 'dark');
  await panel.init(ready);
  await agentRow(page, 'claude').getByLabel(strings.sources.claude).click();
  // Codex is not connected: its name is not a switch.
  await agentRow(page, 'codex').getByText(strings.sources.codex).click({ force: true });
  expect(await panel.sent()).toEqual([
    { type: 'setPref', change: { key: 'source', source: 'claude', on: false } },
  ]);
});

test('offers to connect Codex, and says to trust the hooks once', async ({ page }) => {
  const panel = await openPanel(page, 'dark');
  // Claude Code is connected, so the endpoint runs; Codex is not.
  await panel.init(ready);
  const row = agentRow(page, 'codex');
  await expect(row.getByRole('status')).toHaveText(strings.codex.state.disconnected);
  await expect(row.getByText(strings.codex.nextStep ?? '')).toBeHidden();
  await howItWorks(page, 'codex').click();
  await expect(row).toContainText('~/.codex/hooks.json');
  await expect(row.getByText(/^In this window/)).toBeHidden();
  await expect(row.getByRole('button', { name: strings.codex.disconnect })).toBeHidden();
  await row.getByRole('button', { name: strings.codex.connect, exact: true }).click();
  await row.getByRole('button', { name: strings.codex.copy }).click();
  await row.screenshot({ path: `${SCREENS}/codex-dark.png` });

  await panel.post({
    type: 'state',
    state: { ...ready, codex: { ...ready.codex, hooks: 'connected' } },
  });
  await expect(row.getByRole('status')).toHaveText(strings.codex.state.connected);
  // The step only the user can take stays in sight, not under "How it works".
  await expect(row.getByText(strings.codex.nextStep ?? '')).toBeVisible();
  await expect(row.getByText(strings.codex.nextStep ?? '')).toContainText('/hooks');
  await expect(
    row.getByText(strings.codex.receivingState.listening.replace('{0}', '47391')),
  ).toBeVisible();
  await row.getByRole('button', { name: strings.codex.disconnect }).click();
  expect(await panel.sent()).toEqual([
    { type: 'connectAgent', agent: 'codex' },
    { type: 'copyAgentSettings', agent: 'codex' },
    { type: 'disconnectAgent', agent: 'codex' },
  ]);
  await row.screenshot({ path: `${SCREENS}/codex-connected-dark.png` });
  expect(panel.problems).toEqual([]);
});

test('offers to connect GitHub Copilot with a file of its own', async ({ page }) => {
  const panel = await openPanel(page, 'dark');
  await panel.init({ ...ready, copilot: notSetUp.copilot });
  const row = agentRow(page, 'copilot');
  await expect(row.getByRole('status')).toHaveText(strings.copilot.state.disconnected);
  await howItWorks(page, 'copilot').click();
  await expect(row).toContainText('~/.copilot/hooks/nightping.json');
  await expect(row.getByRole('button', { name: strings.copilot.disconnect })).toBeHidden();
  await row.getByRole('button', { name: strings.copilot.connect, exact: true }).click();
  await row.getByRole('button', { name: strings.copilot.copy }).click();
  await row.screenshot({ path: `${SCREENS}/copilot-dark.png` });

  await panel.post({ type: 'state', state: ready });
  await expect(row.getByRole('status')).toHaveText(strings.copilot.state.connected);
  await expect(row).toContainText('trusted workspaces');
  await expect(
    row.getByText(strings.copilot.receivingState.listening.replace('{0}', '47391')),
  ).toBeVisible();
  await row.getByRole('button', { name: strings.copilot.disconnect }).click();
  expect(await panel.sent()).toEqual([
    { type: 'connectAgent', agent: 'copilot' },
    { type: 'copyAgentSettings', agent: 'copilot' },
    { type: 'disconnectAgent', agent: 'copilot' },
  ]);
  await row.screenshot({ path: `${SCREENS}/copilot-connected-dark.png` });
  expect(panel.problems).toEqual([]);
});

test('shows what is wrong with the Claude Code hooks, and the way out', async ({ page }) => {
  const panel = await openPanel(page, 'dark');
  await panel.init(ready);
  const row = agentRow(page, 'claude');
  const show = (claude: Partial<typeof ready.claude>) =>
    panel.post({ type: 'state', state: { ...ready, claude: { ...ready.claude, ...claude } } });

  await show({ hooks: 'outdated', receiving: 'other-program' });
  await expect(row.getByRole('status')).toHaveText(strings.claude.state.outdated);
  await expect(row.getByRole('button', { name: strings.claude.reconnect })).toBeVisible();
  // A problem opens the explanation by itself.
  await expect(row.getByText(/are incomplete or use another port/)).toBeVisible();
  const busy = row.locator('.ng-warning', { hasText: /^Port 47391 is used by another program/ });
  await expect(busy).toBeVisible();
  await expect(busy).toHaveClass(/ng-warning/);
  await busy.getByRole('button', { name: strings.openSettings }).click();
  expect(await panel.sent()).toEqual([{ type: 'openSettings' }]);
  await row.screenshot({ path: `${SCREENS}/claude-outdated-dark.png` });

  await show({ receiving: 'other-window' });
  await expect(row.getByText('In another VS Code window, on port 47391.')).toBeVisible();

  // A file Nightping cannot read is left alone: only copying is offered.
  await show({ hooks: 'invalid', receiving: 'off' });
  await expect(row.getByRole('status')).toHaveText(strings.claude.state.invalid);
  await expect(row.getByRole('button', { name: strings.claude.connect, exact: true })).toBeHidden();
  await expect(row.getByRole('button', { name: strings.claude.disconnect })).toBeHidden();
  await expect(row.getByRole('button', { name: strings.claude.copy })).toBeVisible();
});

test('pauses and resumes from the header', async ({ page }) => {
  const panel = await openPanel(page, 'dark');
  await panel.init(notSetUp);
  // Nothing to pause before Nightping is set up.
  await expect(page.getByRole('button', { name: strings.pause })).toBeHidden();

  await panel.post({ type: 'state', state: ready });
  await page.getByRole('button', { name: strings.pause }).click();
  // In the language VS Code shows (English here: a 12-hour clock); the date only when not today.
  const today = new Date();
  today.setHours(23, 59, 0, 0);
  await panel.post({ type: 'state', state: { ...ready, pause: { until: today.getTime() } } });
  await expect(page.locator('.ng-header .ng-status')).toHaveText(/^Paused until 11:59\sPM$/);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  tomorrow.setHours(9, 30);
  const day = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(tomorrow);
  await panel.post({ type: 'state', state: { ...ready, pause: { until: tomorrow.getTime() } } });
  await expect(page.locator('.ng-header .ng-status')).toHaveText(
    new RegExp(`^Paused until ${day}, 9:30\\sAM$`),
  );
  await page.getByRole('button', { name: strings.resume }).click();
  expect(await panel.sent()).toEqual([{ type: 'pause' }, { type: 'resume' }]);

  await panel.post({ type: 'state', state: ready });
  await expect(page.locator('.ng-header .ng-status')).toHaveText(strings.status.ready);
  await expect(page.getByRole('button', { name: strings.pause })).toBeVisible();
});

test('writes each choice at once', async ({ page }) => {
  const panel = await openPanel(page, 'dark');
  await panel.init(ready);
  await page.getByLabel(strings.sources.terminal).click();
  await rules(page).click();
  await minimum(page).selectOption('120');
  await page.getByLabel(strings.onlyWhenAway).click();
  await page.getByLabel(strings.contentLevels.details).click();
  expect(await panel.sent()).toEqual([
    { type: 'setPref', change: { key: 'source', source: 'terminal', on: false } },
    { type: 'setPref', change: { key: 'minimumSeconds', seconds: 120 } },
    { type: 'setPref', change: { key: 'onlyWhenAway', on: false } },
    { type: 'setPref', change: { key: 'content', content: 'details' } },
  ]);
  // The example follows the choice before the settings answer.
  await expect(preview(page)).toHaveText(['❌build · my-project', 'Failed (exit 1) · 4m 12s']);
});

test('follows the settings when they change elsewhere', async ({ page }) => {
  const panel = await openPanel(page, 'dark');
  await panel.init(ready);
  await rules(page).click();
  await panel.post({
    type: 'state',
    state: {
      ...ready,
      prefs: {
        sources: {
          task: false,
          terminal: true,
          notebook: true,
          debug: false,
          claude: false,
          codex: true,
          copilot: false,
        },
        minimumSeconds: 45,
        onlyWhenAway: false,
        content: 'folder',
      },
    },
  });
  await expect(page.getByLabel(strings.sources.task)).not.toBeChecked();
  await expect(page.getByLabel(strings.sources.debug)).not.toBeChecked();
  await expect(page.getByLabel(strings.sources.claude)).not.toBeChecked();
  // A minimum the list does not offer is added to it, in order.
  await expect(minimum(page)).toHaveValue('45');
  await expect(minimum(page).locator('option')).toHaveText([
    'None',
    '10 seconds',
    '30 seconds',
    '45 seconds',
    '1 minute',
    '2 minutes',
    '5 minutes',
    '10 minutes',
    '30 minutes',
  ]);
  await expect(page.getByLabel(strings.onlyWhenAway)).not.toBeChecked();
  await expect(page.getByLabel(strings.contentLevels.folder)).toBeChecked();
  await expect(preview(page).first()).toHaveText('❌Task · my-project');
  await expect(conditions(page)).toHaveText([
    'Also while you are using VS Code.',
    'Only if it ran for 45 seconds or longer, unless it failed or needs you.',
  ]);
});

test('says the rules in plain lines for each choice', async ({ page }) => {
  const panel = await openPanel(page, 'dark');
  await panel.init(ready);
  const prefs = (onlyWhenAway: boolean, minimumSeconds: number) =>
    panel.post({
      type: 'state',
      state: { ...ready, prefs: { ...ready.prefs, onlyWhenAway, minimumSeconds } },
    });
  await prefs(true, 60);
  await expect(conditions(page)).toHaveText([
    strings.rules.away,
    strings.rules.minimum.replace('{0}', '1 minute'),
  ]);
  await prefs(false, 0);
  await expect(conditions(page)).toHaveText([strings.rules.present, strings.rules.anyDuration]);
});

test('says why terminal commands cannot notify, and links the fix', async ({ page }) => {
  const panel = await openPanel(page, 'dark');
  await panel.init(ready);
  // One of two terminals reports commands: nothing to warn about.
  await expect(page.getByText(strings.terminalNone)).toBeHidden();
  await panel.post({ type: 'state', state: { ...ready, terminals: { open: 2, reporting: 0 } } });
  await expect(page.getByText(strings.terminalNone)).toBeVisible();
  await notifyCard(page).getByRole('button', { name: strings.learnMore }).click();
  expect(await panel.sent()).toEqual([{ type: 'openShellIntegrationHelp' }]);
});

test('sends a typed message and says how it went', async ({ page }) => {
  const panel = await openPanel(page, 'dark');
  await panel.init(notSetUp);
  await messageInput(page).fill('Back in five minutes');
  // Nowhere to send it yet.
  await expect(sendButton(page)).toBeDisabled();

  await panel.post({ type: 'state', state: ready });
  await messageInput(page).press('Enter');
  const card = messageCard(page);
  await expect(card.getByRole('button', { name: strings.sending })).toBeDisabled();
  expect(await panel.sent()).toEqual([{ type: 'send', message: 'Back in five minutes' }]);

  // A failure keeps the text, so it can go again once the problem is fixed.
  const error = 'Could not reach https://ntfy.example.com (ECONNREFUSED).';
  await panel.post({ type: 'messageResult', time: Date.now(), error });
  const status = card.getByRole('status');
  await expect(status).toHaveText(error);
  await expect(status).toHaveClass(/ng-failed/);
  await expect(messageInput(page)).toHaveValue('Back in five minutes');
  await expect(sendButton(page)).toBeEnabled();
  await card.screenshot({ path: `${SCREENS}/message-failed-dark.png` });

  await sendButton(page).click();
  await panel.post({ type: 'messageResult', time: new Date(2026, 10, 4, 9, 5).getTime() });
  await expect(status).toHaveText(/^Sent at 9:05\sAM\.$/);
  await expect(status).not.toHaveClass(/ng-failed/);
  await expect(messageInput(page)).toHaveValue('');
  await expect(sendButton(page)).toBeDisabled();
  // The test notification's line is the other card's own.
  await expect(result(page)).toHaveText('');
});

test('clears the history and opens the settings', async ({ page }) => {
  const panel = await openPanel(page, 'dark');
  await panel.init(ready);
  await page.getByRole('button', { name: strings.clearRecent }).click();
  await page.getByRole('button', { name: strings.allSettings }).click();
  expect(await panel.sent()).toEqual([{ type: 'clearHistory' }, { type: 'openSettings' }]);
});

for (const [label, state, open] of [
  ['ready', ready, undefined],
  ['setup', notSetUp, undefined],
  ['two', twoDestinations, undefined],
  ['tailscale', notSetUp, 'tailscale'],
] as const) {
  test(`fits a narrow panel without scrolling sideways (${label})`, async ({ page }) => {
    await page.setViewportSize({ width: 380, height: 2600 });
    const panel = await openPanel(page, 'dark');
    await panel.init(state);
    if (open) {
      await way(page, open).click();
      await panel.post({ type: 'tailscale', status: tailscaleReady });
      await page.getByRole('radiogroup').getByLabel('box').check();
    }
    await howItWorks(page, 'codex').click();
    await rules(page).click();
    const overflow = await page.evaluate(() => {
      const app = document.getElementById('app') as HTMLElement;
      return app.scrollWidth - app.clientWidth;
    });
    expect(overflow).toBeLessThanOrEqual(0);
    // The panel scrolls inside #app, so each card gets its own picture.
    await destinationCard(page).screenshot({ path: `${SCREENS}/narrow-${label}-phone-dark.png` });
    await notifyCard(page).screenshot({ path: `${SCREENS}/narrow-${label}-notify-dark.png` });
  });
}
