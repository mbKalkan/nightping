import { expect, test, type Page } from '@playwright/test';
import type { AgentKind } from '../../src/shared/protocol';
import { lowestTextContrast } from './contrast';
import { notSetUp, openPanel, ready, strings } from './harness';
import type { ThemeName } from './themes';

const SCREENS = 'test-results/screens';

const destinationCard = (page: Page) => page.getByRole('region', { name: strings.destination });
const notifyCard = (page: Page) => page.getByRole('region', { name: strings.whenToNotify });
const messageCard = (page: Page) => page.getByRole('region', { name: strings.message.title });
const server = (page: Page) => page.getByLabel(strings.server, { exact: true });
const topic = (page: Page) => page.getByLabel(strings.topic, { exact: true });
const token = (page: Page) => page.getByLabel(strings.token, { exact: true });
const saveButton = (page: Page) => page.getByRole('button', { name: strings.saveAndTest });
const testButton = (page: Page) => page.getByRole('button', { name: strings.sendTest });
const changeButton = (page: Page) =>
  page.getByRole('button', { name: strings.change, exact: true });
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
    test('walks through the setup steps while Nightping is not set up', async ({ page }) => {
      const panel = await openPanel(page, theme);
      await panel.init(notSetUp);

      await expect(page.getByRole('main', { name: strings.title })).toBeVisible();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(strings.title);
      await expect(page.getByText(strings.tagline)).toBeVisible();
      await expect(page.locator('.ng-header .ng-status')).toHaveText(strings.status.incomplete);
      await expect(stepTitles(page)).toHaveText([
        strings.steps.app.title,
        strings.steps.server.title,
        strings.steps.topic.title,
        strings.steps.test.title,
      ]);
      // No server is filled in for the user; a first setup starts from a topic nobody can guess.
      await expect(server(page)).toHaveValue('');
      await expect(topic(page)).toHaveValue(/^nightping-[a-z0-9]{20}$/);
      // The token waits until the user says the server needs one.
      await expect(token(page)).toBeHidden();
      await expect(page.getByRole('button', { name: strings.addToken })).toBeVisible();
      await expect(saveButton(page)).toBeDisabled();
      await expect(page.getByRole('button', { name: strings.cancel })).toBeHidden();
      await expect(page.getByText(strings.recentEmpty)).toBeVisible();
      // WCAG AA for every text, AAA in the dark high contrast theme.
      expect(await lowestTextContrast(page)).toBeGreaterThanOrEqual(contrastFor(theme));
      await page.screenshot({ path: `${SCREENS}/setup-${theme}.png` });
      await destinationCard(page).screenshot({ path: `${SCREENS}/setup-card-${theme}.png` });
      expect(panel.problems).toEqual([]);
    });

    test('says in one line where notifications go once it works', async ({ page }) => {
      const panel = await openPanel(page, theme);
      await panel.init(ready);

      await expect(page.locator('.ng-header .ng-status')).toHaveText(strings.status.ready);
      await expect(destinationCard(page).locator('.ng-summary-text')).toHaveText(
        'Notifications go to the topic my-topic on ntfy.example.com.',
      );
      await expect(destinationCard(page).locator('form')).toBeHidden();
      await expect(testButton(page)).toBeEnabled();
      await expect(changeButton(page)).toBeVisible();

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

test('fills in ntfy.sh on request and saves with a test', async ({ page }) => {
  const panel = await openPanel(page, 'dark');
  await panel.init(notSetUp);
  await page.getByRole('button', { name: strings.useNtfySh }).click();
  await expect(server(page)).toHaveValue('https://ntfy.sh');
  await expect(saveButton(page)).toBeEnabled();
  const suggested = await topic(page).inputValue();
  await saveButton(page).click();
  expect(await panel.sent()).toEqual([
    { type: 'save', server: 'https://ntfy.sh', topic: suggested, token: '', test: true },
  ]);
});

test('saves what was typed; an empty token keeps the saved one', async ({ page }) => {
  const panel = await openPanel(page, 'dark');
  await panel.init(notSetUp);
  await server(page).fill(' https://ntfy.example.com/ ');
  await topic(page).fill('my-topic');
  await server(page).press('Enter');
  expect(await panel.sent()).toEqual([
    {
      type: 'save',
      server: 'https://ntfy.example.com/',
      topic: 'my-topic',
      token: '',
      test: true,
    },
  ]);
});

test('checks the server once the field is left, not while typing', async ({ page }) => {
  const panel = await openPanel(page, 'dark');
  await panel.init(notSetUp);
  await server(page).fill('ntfy.example');
  await expect(page.getByText(strings.serverInvalid)).toBeHidden();
  await server(page).press('Tab');
  await expect(page.getByText(strings.serverInvalid)).toBeVisible();
  await expect(server(page)).toHaveAttribute('aria-invalid');
  await expect(saveButton(page)).toBeDisabled();

  await server(page).fill('https://ntfy.example.com');
  await expect(page.getByText(strings.serverInvalid)).toBeHidden();
  await expect(saveButton(page)).toBeEnabled();
});

test('shows a wrong saved setting at once', async ({ page }) => {
  const panel = await openPanel(page, 'dark');
  await panel.init({
    ...notSetUp,
    server: 'ntfy.example.com',
    topic: 'my topic',
    status: 'invalid',
  });
  await expect(page.locator('.ng-header .ng-status')).toHaveText(strings.status.invalid);
  await expect(page.getByText(strings.serverInvalid)).toBeVisible();
  await expect(page.getByText(strings.topicInvalid)).toBeVisible();
  await page.screenshot({ path: `${SCREENS}/invalid-dark.png` });
});

test('opens the app stores, copies the topic and suggests a new one', async ({ page }) => {
  const panel = await openPanel(page, 'dark');
  await panel.init(notSetUp);
  const card = destinationCard(page);
  await card.getByRole('button', { name: 'Google Play' }).click();
  await card.getByRole('button', { name: 'F-Droid' }).click();
  await card.getByRole('button', { name: 'App Store' }).click();
  const first = await topic(page).inputValue();
  const copy = card.getByRole('button', { name: strings.copyTopic, exact: true });
  await copy.click();
  await expect(card.getByRole('button', { name: strings.copied })).toBeVisible();
  await page.getByRole('button', { name: strings.randomTopic }).click();
  await expect(topic(page)).toHaveValue(/^nightping-[a-z0-9]{20}$/);
  await expect(topic(page)).not.toHaveValue(first);
  expect(await panel.sent()).toEqual([
    { type: 'openAppStore', store: 'google-play' },
    { type: 'openAppStore', store: 'f-droid' },
    { type: 'openAppStore', store: 'app-store' },
    { type: 'copyTopic', topic: first },
  ]);
});

test('points to ntfy.sh until there is a server, and says how to subscribe to one’s own', async ({
  page,
}) => {
  const panel = await openPanel(page, 'dark');
  await panel.init(notSetUp);
  const useNtfySh = page.getByRole('button', { name: strings.useNtfySh });
  await expect(useNtfySh).toHaveClass(/ng-primary/);
  await expect(page.getByText(strings.chooseServerFirst)).toBeVisible();
  const own = page.getByText(/^On your own server/);
  await expect(own).toBeHidden();

  await server(page).fill('https://ntfy.example.com');
  await expect(useNtfySh).toHaveClass(/ng-secondary/);
  await expect(page.getByText(strings.chooseServerFirst)).toBeHidden();
  await expect(own).toHaveText(
    'On your own server, also turn on “Use another server” in the app and enter https://ntfy.example.com.',
  );
  await useNtfySh.click();
  await expect(own).toBeHidden();
});

test('asks for a token only when the server needs one', async ({ page }) => {
  const panel = await openPanel(page, 'dark');
  await panel.init(notSetUp);
  await page.getByRole('button', { name: strings.addToken }).click();
  await expect(token(page)).toBeVisible();
  await expect(token(page)).toBeFocused();
  await expect(token(page)).toHaveAttribute('type', 'password');
  await expect(page.getByRole('button', { name: strings.addToken })).toBeHidden();
  await expect(page.getByRole('button', { name: strings.removeToken })).toBeHidden();
});

test('changes a working setup, or leaves it as it was', async ({ page }) => {
  const panel = await openPanel(page, 'dark');
  await panel.init(ready);
  await changeButton(page).click();
  // Whoever changes a working setup has the app already: three steps, numbered from one.
  await expect(stepTitles(page)).toHaveText([
    strings.steps.server.title,
    strings.steps.topic.title,
    strings.steps.test.title,
  ]);
  await expect(server(page)).toBeFocused();
  // The saved token is never shown; the field says one is saved.
  await expect(token(page)).toHaveValue('');
  await expect(token(page)).toHaveAttribute('placeholder', strings.tokenSaved);
  await expect(page.getByRole('button', { name: strings.removeToken })).toBeVisible();
  // Nothing changed yet, so there is nothing to save.
  await expect(saveButton(page)).toBeDisabled();
  await destinationCard(page).screenshot({ path: `${SCREENS}/change-dark.png` });

  await topic(page).fill('half-typed');
  await page.getByRole('button', { name: strings.cancel }).click();
  await expect(destinationCard(page).locator('form')).toBeHidden();
  await changeButton(page).click();
  await expect(topic(page)).toHaveValue('my-topic');

  await topic(page).fill('other-topic');
  await token(page).fill('tk_new');
  await saveButton(page).click();
  expect(await panel.sent()).toEqual([
    { type: 'save', server: ready.server, topic: 'other-topic', token: 'tk_new', test: true },
  ]);
  await panel.post({ type: 'saved' });
  await panel.post({ type: 'state', state: { ...ready, topic: 'other-topic' } });
  await expect(destinationCard(page).locator('.ng-summary-text')).toHaveText(
    'Notifications go to the topic other-topic on ntfy.example.com.',
  );
  await expect(destinationCard(page).locator('form')).toBeHidden();
  await changeButton(page).click();
  await expect(token(page)).toHaveValue('');
});

test('removes a saved token', async ({ page }) => {
  const panel = await openPanel(page, 'dark');
  await panel.init(ready);
  await changeButton(page).click();
  await page.getByRole('button', { name: strings.removeToken }).click();
  expect(await panel.sent()).toEqual([{ type: 'removeToken' }]);
});

test('rejects a token that cannot go into an HTTP header', async ({ page }) => {
  const panel = await openPanel(page, 'dark');
  await panel.init(ready);
  await changeButton(page).click();
  await token(page).fill('tk with spaces');
  await token(page).press('Tab');
  await expect(page.getByText(strings.tokenInvalid)).toBeVisible();
  await expect(saveButton(page)).toBeDisabled();
});

test('keeps what the user is typing when the settings change elsewhere', async ({ page }) => {
  const panel = await openPanel(page, 'dark');
  await panel.init(ready);
  await changeButton(page).click();
  await topic(page).fill('half-typed');
  await panel.post({
    type: 'state',
    state: { ...ready, server: 'https://ntfy.other.example', topic: 'changed-elsewhere' },
  });
  await expect(server(page)).toHaveValue('https://ntfy.other.example');
  await expect(topic(page)).toHaveValue('half-typed');
});

test('sends a test and tells how it went', async ({ page }) => {
  const panel = await openPanel(page, 'dark');
  await panel.init(ready);
  await testButton(page).click();
  expect(await panel.sent()).toEqual([{ type: 'sendTest' }]);
  await panel.post({ type: 'busy', busy: true });
  await expect(page.getByRole('button', { name: strings.sending })).toBeDisabled();

  const error = 'https://ntfy.example.com refused the access token (HTTP 401).';
  await panel.post({ type: 'result', time: Date.now(), error });
  await panel.post({ type: 'busy', busy: false });
  await expect(result(page)).toHaveText(error);
  await expect(result(page)).toHaveClass(/ng-failed/);
  await page.screenshot({ path: `${SCREENS}/failed-dark.png` });

  await panel.post({ type: 'result', time: new Date(2026, 10, 3, 14, 2).getTime() });
  // In the language VS Code shows (English here: a 12-hour clock).
  await expect(result(page)).toHaveText(
    /^Sent at 2:02\sPM\. If it is not on your phone, subscribe to this topic in the ntfy app\.$/,
  );
  await expect(result(page)).not.toHaveClass(/ng-failed/);
  await expect(testButton(page)).toBeEnabled();
});

test('shows the test result once the first setup collapses to one line', async ({ page }) => {
  const panel = await openPanel(page, 'dark');
  await panel.init(notSetUp);
  await page.getByRole('button', { name: strings.useNtfySh }).click();
  await saveButton(page).click();
  await panel.post({ type: 'saved' });
  await panel.post({ type: 'busy', busy: true });
  await panel.post({
    type: 'state',
    state: { ...ready, server: 'https://ntfy.sh', topic: 'nightping-abc', history: [] },
  });
  await panel.post({ type: 'result', time: Date.now() });
  await panel.post({ type: 'busy', busy: false });
  await expect(destinationCard(page).locator('.ng-summary-text')).toHaveText(
    'Notifications go to the topic nightping-abc on ntfy.sh.',
  );
  await expect(result(page)).toHaveText(/^Sent at /);
  await destinationCard(page).screenshot({ path: `${SCREENS}/first-test-dark.png` });
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

for (const [name, state] of [
  ['ready', ready],
  ['setup', notSetUp],
] as const) {
  test(`fits a narrow panel without scrolling sideways (${name})`, async ({ page }) => {
    await page.setViewportSize({ width: 380, height: 2600 });
    const panel = await openPanel(page, 'dark');
    await panel.init(state);
    await howItWorks(page, 'codex').click();
    await rules(page).click();
    const overflow = await page.evaluate(() => {
      const app = document.getElementById('app') as HTMLElement;
      return app.scrollWidth - app.clientWidth;
    });
    expect(overflow).toBeLessThanOrEqual(0);
    // The panel scrolls inside #app, so each card gets its own picture.
    await destinationCard(page).screenshot({ path: `${SCREENS}/narrow-${name}-phone-dark.png` });
    await notifyCard(page).screenshot({ path: `${SCREENS}/narrow-${name}-notify-dark.png` });
  });
}
