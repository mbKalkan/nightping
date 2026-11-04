import { expect, test, type Page } from '@playwright/test';
import { SOURCE_KINDS } from '../../src/shared/protocol';
import { lowestTextContrast } from './contrast';
import { notSetUp, openPanel, ready, strings } from './harness';
import type { ThemeName } from './themes';

const SCREENS = 'test-results/screens';

const server = (page: Page) => page.getByLabel(strings.server, { exact: true });
const topic = (page: Page) => page.getByLabel(strings.topic, { exact: true });
const token = (page: Page) => page.getByLabel(strings.token, { exact: true });
const saveButton = (page: Page) => page.getByRole('button', { name: strings.save, exact: true });
const testButton = (page: Page) => page.getByRole('button', { name: strings.sendTest });

for (const theme of ['dark', 'light', 'hcDark', 'hcLight'] as ThemeName[]) {
  test.describe(`${theme} theme`, () => {
    test('shows the setup form while Nightping is not set up', async ({ page }) => {
      const panel = await openPanel(page, theme);
      await panel.init(notSetUp);

      await expect(page.getByRole('main', { name: strings.title })).toBeVisible();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(strings.title);
      await expect(page.locator('.ng-header .ng-status')).toHaveText(strings.status.incomplete);
      await expect(server(page)).toHaveValue('');
      // A first setup starts from a random topic that nobody can guess.
      await expect(topic(page)).toHaveValue(/^nightping-[a-z0-9]{20}$/);
      await expect(token(page)).toHaveAttribute('type', 'password');
      await expect(saveButton(page)).toBeDisabled();
      await expect(testButton(page)).toBeDisabled();
      await expect(page.getByText(strings.recentEmpty)).toBeVisible();
      await expect(page.getByRole('button', { name: strings.removeToken })).toBeHidden();
      // WCAG AA for every text, AAA in the dark high contrast theme.
      expect(await lowestTextContrast(page)).toBeGreaterThanOrEqual(theme === 'hcDark' ? 7 : 4.5);
      await page.screenshot({ path: `${SCREENS}/setup-${theme}.png` });
      expect(panel.problems).toEqual([]);
    });

    test('shows where notifications go and what was sent', async ({ page }) => {
      const panel = await openPanel(page, theme);
      await panel.init(ready);

      await expect(page.locator('.ng-header .ng-status')).toHaveText(strings.status.ready);
      await expect(server(page)).toHaveValue(ready.server);
      await expect(topic(page)).toHaveValue(ready.topic);
      // The token itself never reaches the panel; it only knows one is saved.
      await expect(token(page)).toHaveValue('');
      await expect(token(page)).toHaveAttribute('placeholder', strings.tokenSaved);
      await expect(page.getByRole('button', { name: strings.removeToken })).toBeVisible();
      await expect(saveButton(page)).toBeDisabled();
      await expect(testButton(page)).toBeEnabled();

      const entries = page.getByRole('list', { name: strings.recent }).getByRole('listitem');
      await expect(entries).toHaveCount(3);
      await expect(entries.nth(0)).toContainText(strings.sent);
      await expect(entries.nth(1)).toContainText(strings.notSent);
      await expect(entries.nth(1)).toContainText('needs an access token');
      expect(await lowestTextContrast(page)).toBeGreaterThanOrEqual(theme === 'hcDark' ? 7 : 4.5);
      await page.screenshot({ path: `${SCREENS}/ready-${theme}.png` });
      expect(panel.problems).toEqual([]);
    });

    test('shows when to notify, with a preview of the notification', async ({ page }) => {
      const panel = await openPanel(page, theme);
      await panel.init({ ...ready, terminals: { open: 1, reporting: 0 } });

      for (const kind of SOURCE_KINDS) {
        await expect(page.getByLabel(strings.sources[kind])).toBeChecked();
      }
      await expect(minimum(page)).toHaveValue('30');
      await expect(page.getByLabel(strings.onlyWhenAway)).toBeChecked();
      await expect(page.getByLabel(strings.contentLevels.result)).toBeChecked();
      await expect(preview(page)).toHaveText(['❌Task', 'Failed (exit 1) · 4m 12s']);
      await expect(page.getByText(strings.terminalNone)).toBeVisible();
      expect(await lowestTextContrast(page)).toBeGreaterThanOrEqual(theme === 'hcDark' ? 7 : 4.5);
      await notifyCard(page).screenshot({ path: `${SCREENS}/notify-${theme}.png` });
      expect(panel.problems).toEqual([]);
    });

    test('offers to connect Claude Code', async ({ page }) => {
      const panel = await openPanel(page, theme);
      await panel.init({ ...ready, claude: notSetUp.claude });
      const card = claudeCard(page);
      await expect(card.getByRole('status')).toHaveText(strings.claude.state.disconnected);
      await expect(card.getByRole('button', { name: strings.claude.connect })).toBeVisible();
      await expect(card.getByRole('button', { name: strings.claude.copy })).toBeVisible();
      await expect(card.getByRole('button', { name: strings.claude.disconnect })).toBeHidden();
      await expect(card).toContainText('~/.claude/settings.json');
      await expect(card.getByText(strings.claude.receiving)).toBeHidden();
      expect(await lowestTextContrast(page)).toBeGreaterThanOrEqual(theme === 'hcDark' ? 7 : 4.5);
      await card.screenshot({ path: `${SCREENS}/claude-${theme}.png` });
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
      expect(await lowestTextContrast(page)).toBeGreaterThanOrEqual(theme === 'hcDark' ? 7 : 4.5);
      await card.screenshot({ path: `${SCREENS}/message-${theme}.png` });
      expect(panel.problems).toEqual([]);
    });

    test('says when notifications are paused', async ({ page }) => {
      const panel = await openPanel(page, theme);
      await panel.init({ ...ready, pause: {} });
      await expect(page.locator('.ng-header .ng-status')).toHaveText(strings.pausedUntilResumed);
      await expect(page.getByRole('button', { name: strings.resume })).toBeVisible();
      expect(await lowestTextContrast(page)).toBeGreaterThanOrEqual(theme === 'hcDark' ? 7 : 4.5);
      await page.locator('.ng-header').screenshot({ path: `${SCREENS}/paused-${theme}.png` });
      expect(panel.problems).toEqual([]);
    });
  });
}

const notifyCard = (page: Page) => page.getByRole('region', { name: strings.whenToNotify });
const claudeCard = (page: Page) => page.getByRole('region', { name: strings.claude.title });
const codexCard = (page: Page) => page.getByRole('region', { name: strings.codex.title });
const copilotCard = (page: Page) => page.getByRole('region', { name: strings.copilot.title });
const messageCard = (page: Page) => page.getByRole('region', { name: strings.message.title });
const messageInput = (page: Page) => page.getByLabel(strings.message.label, { exact: true });
const sendButton = (page: Page) =>
  messageCard(page).getByRole('button', { name: strings.message.send, exact: true });

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
  const result = card.getByRole('status');
  await expect(result).toHaveText(error);
  await expect(result).toHaveClass(/ng-failed/);
  await expect(messageInput(page)).toHaveValue('Back in five minutes');
  await expect(sendButton(page)).toBeEnabled();
  await card.screenshot({ path: `${SCREENS}/message-failed-dark.png` });

  await sendButton(page).click();
  await panel.post({ type: 'messageResult', time: new Date(2026, 10, 4, 9, 5).getTime() });
  await expect(result).toHaveText(/^Sent at 9:05\sAM\.$/);
  await expect(result).not.toHaveClass(/ng-failed/);
  await expect(messageInput(page)).toHaveValue('');
  await expect(sendButton(page)).toBeDisabled();
  // The test notification's line is the form's own.
  await expect(page.locator('.ng-actions .ng-result')).toHaveText('');
});

test('connects, disconnects and copies the Claude Code hooks', async ({ page }) => {
  const panel = await openPanel(page, 'dark');
  await panel.init({ ...ready, claude: notSetUp.claude });
  const card = claudeCard(page);
  await card.getByRole('button', { name: strings.claude.connect }).click();
  await card.getByRole('button', { name: strings.claude.copy }).click();

  await panel.post({ type: 'state', state: ready });
  await expect(card.getByRole('status')).toHaveText(strings.claude.state.connected);
  await expect(card.getByRole('button', { name: strings.claude.connect })).toBeHidden();
  await expect(card.getByText('In this window, on port 47391.')).toBeVisible();
  await card.getByRole('button', { name: strings.claude.disconnect }).click();
  expect(await panel.sent()).toEqual([
    { type: 'connectAgent', agent: 'claude' },
    { type: 'copyAgentSettings', agent: 'claude' },
    { type: 'disconnectAgent', agent: 'claude' },
  ]);
});

test('offers to connect Codex, and says to trust the hooks once', async ({ page }) => {
  const panel = await openPanel(page, 'dark');
  // Claude Code is connected, so the endpoint runs; Codex is not.
  await panel.init(ready);
  const card = codexCard(page);
  await expect(card.getByRole('status')).toHaveText(strings.codex.state.disconnected);
  await expect(card).toContainText('~/.codex/hooks.json');
  await expect(card).toContainText('/hooks');
  await expect(card.getByText(strings.codex.receiving)).toBeHidden();
  await expect(card.getByRole('button', { name: strings.codex.disconnect })).toBeHidden();
  await card.getByRole('button', { name: strings.codex.connect }).click();
  await card.getByRole('button', { name: strings.codex.copy }).click();
  await card.screenshot({ path: `${SCREENS}/codex-dark.png` });

  await panel.post({
    type: 'state',
    state: { ...ready, codex: { ...ready.codex, hooks: 'connected' } },
  });
  await expect(card.getByRole('status')).toHaveText(strings.codex.state.connected);
  await expect(
    card.getByText(strings.codex.receivingState.listening.replace('{0}', '47391')),
  ).toBeVisible();
  await card.getByRole('button', { name: strings.codex.disconnect }).click();
  expect(await panel.sent()).toEqual([
    { type: 'connectAgent', agent: 'codex' },
    { type: 'copyAgentSettings', agent: 'codex' },
    { type: 'disconnectAgent', agent: 'codex' },
  ]);
  await card.screenshot({ path: `${SCREENS}/codex-connected-dark.png` });
  expect(panel.problems).toEqual([]);
});

test('offers to connect GitHub Copilot with a file of its own', async ({ page }) => {
  const panel = await openPanel(page, 'dark');
  await panel.init({ ...ready, copilot: notSetUp.copilot });
  const card = copilotCard(page);
  await expect(card.getByRole('status')).toHaveText(strings.copilot.state.disconnected);
  await expect(card).toContainText('~/.copilot/hooks/nightping.json');
  await expect(card.getByText(strings.copilot.receiving)).toBeHidden();
  await expect(card.getByRole('button', { name: strings.copilot.disconnect })).toBeHidden();
  await card.getByRole('button', { name: strings.copilot.connect }).click();
  await card.getByRole('button', { name: strings.copilot.copy }).click();
  await card.screenshot({ path: `${SCREENS}/copilot-dark.png` });

  await panel.post({ type: 'state', state: ready });
  await expect(card.getByRole('status')).toHaveText(strings.copilot.state.connected);
  await expect(card).toContainText('trusted workspaces');
  await expect(
    card.getByText(strings.copilot.receivingState.listening.replace('{0}', '47391')),
  ).toBeVisible();
  await card.getByRole('button', { name: strings.copilot.disconnect }).click();
  expect(await panel.sent()).toEqual([
    { type: 'connectAgent', agent: 'copilot' },
    { type: 'copyAgentSettings', agent: 'copilot' },
    { type: 'disconnectAgent', agent: 'copilot' },
  ]);
  await card.screenshot({ path: `${SCREENS}/copilot-connected-dark.png` });
  expect(panel.problems).toEqual([]);
});

test('shows what is wrong with the Claude Code hooks, and the way out', async ({ page }) => {
  const panel = await openPanel(page, 'dark');
  await panel.init(ready);
  const card = claudeCard(page);
  const show = (claude: Partial<typeof ready.claude>) =>
    panel.post({ type: 'state', state: { ...ready, claude: { ...ready.claude, ...claude } } });

  await show({ hooks: 'outdated', receiving: 'other-program' });
  await expect(card.getByRole('status')).toHaveText(strings.claude.state.outdated);
  await expect(card.getByRole('button', { name: strings.claude.reconnect })).toBeVisible();
  const busy = card.getByText(/^Port 47391 is used by another program/);
  await expect(busy).toHaveClass(/ng-warning/);
  await card.screenshot({ path: `${SCREENS}/claude-outdated-dark.png` });

  await show({ receiving: 'other-window' });
  await expect(card.getByText('In another VS Code window, on port 47391.')).toBeVisible();

  // A file Nightping cannot read is left alone: only copying is offered.
  await show({ hooks: 'invalid', receiving: 'off' });
  await expect(card.getByRole('status')).toHaveText(strings.claude.state.invalid);
  await expect(card.getByRole('button', { name: strings.claude.connect })).toBeHidden();
  await expect(card.getByRole('button', { name: strings.claude.disconnect })).toBeHidden();
  await expect(card.getByRole('button', { name: strings.claude.copy })).toBeVisible();
});
const minimum = (page: Page) => page.getByLabel(strings.minimum);
const preview = (page: Page) => page.locator('.ng-preview p');

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
  await minimum(page).selectOption('120');
  await page.getByLabel(strings.onlyWhenAway).click();
  await page.getByLabel(strings.contentLevels.details).click();
  expect(await panel.sent()).toEqual([
    { type: 'setPref', change: { key: 'source', source: 'terminal', on: false } },
    { type: 'setPref', change: { key: 'minimumSeconds', seconds: 120 } },
    { type: 'setPref', change: { key: 'onlyWhenAway', on: false } },
    { type: 'setPref', change: { key: 'content', content: 'details' } },
  ]);
  // The preview follows the choice before the settings answer.
  await expect(preview(page)).toHaveText(['❌build · my-project', 'Failed (exit 1) · 4m 12s']);
});

test('follows the settings when they change elsewhere', async ({ page }) => {
  const panel = await openPanel(page, 'dark');
  await panel.init(ready);
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
          claude: true,
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
});

test('says why terminal commands cannot notify, and links the fix', async ({ page }) => {
  const panel = await openPanel(page, 'dark');
  await panel.init(ready);
  // One of two terminals reports commands: nothing to warn about.
  await expect(page.getByText(strings.terminalNone)).toBeHidden();
  await panel.post({ type: 'state', state: { ...ready, terminals: { open: 2, reporting: 0 } } });
  await expect(page.getByText(strings.terminalNone)).toBeVisible();
  await page.getByRole('button', { name: strings.learnMore }).click();
  expect(await panel.sent()).toEqual([{ type: 'openShellIntegrationHelp' }]);
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
  await expect(testButton(page)).toBeEnabled();
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

test('saves what was typed; an empty token keeps the saved one', async ({ page }) => {
  const panel = await openPanel(page, 'dark');
  await panel.init(notSetUp);
  await server(page).fill(' https://ntfy.example.com/ ');
  await topic(page).fill('my-topic');
  await saveButton(page).click();
  expect(await panel.sent()).toEqual([
    {
      type: 'save',
      server: 'https://ntfy.example.com/',
      topic: 'my-topic',
      token: '',
      test: false,
    },
  ]);
});

test('saves first when a test runs with changes not yet saved', async ({ page }) => {
  const panel = await openPanel(page, 'dark');
  await panel.init(ready);
  await testButton(page).click();
  await topic(page).fill('other-topic');
  await token(page).fill('tk_new');
  await testButton(page).click();
  expect(await panel.sent()).toEqual([
    { type: 'sendTest' },
    { type: 'save', server: ready.server, topic: 'other-topic', token: 'tk_new', test: true },
  ]);
});

test('clears the token field once it is saved', async ({ page }) => {
  const panel = await openPanel(page, 'dark');
  await panel.init({ ...ready, hasToken: false });
  await expect(token(page)).toHaveAttribute('placeholder', strings.tokenPlaceholder);
  await token(page).fill('tk_secret');
  await saveButton(page).click();
  await panel.post({ type: 'state', state: ready });
  await panel.post({ type: 'saved' });
  await expect(token(page)).toHaveValue('');
  await expect(token(page)).toHaveAttribute('placeholder', strings.tokenSaved);
  await expect(page.getByRole('status').filter({ hasText: strings.saved })).toBeVisible();
  await expect(saveButton(page)).toBeDisabled();

  await page.getByRole('button', { name: strings.removeToken }).click();
  expect((await panel.sent()).at(-1)).toEqual({ type: 'removeToken' });
});

test('rejects a token that cannot go into an HTTP header', async ({ page }) => {
  const panel = await openPanel(page, 'dark');
  await panel.init(ready);
  await token(page).fill('tk with spaces');
  await token(page).press('Tab');
  await expect(page.getByText(strings.tokenInvalid)).toBeVisible();
  await expect(saveButton(page)).toBeDisabled();
});

test('keeps what the user is typing when the settings change elsewhere', async ({ page }) => {
  const panel = await openPanel(page, 'dark');
  await panel.init(ready);
  await topic(page).fill('half-typed');
  await panel.post({
    type: 'state',
    state: { ...ready, server: 'https://ntfy.other.example', topic: 'changed-elsewhere' },
  });
  await expect(server(page)).toHaveValue('https://ntfy.other.example');
  await expect(topic(page)).toHaveValue('half-typed');
});

test('suggests a new random topic on request', async ({ page }) => {
  const panel = await openPanel(page, 'dark');
  await panel.init(ready);
  await page.getByRole('button', { name: strings.randomTopic }).click();
  await expect(topic(page)).toHaveValue(/^nightping-[a-z0-9]{20}$/);
  await expect(saveButton(page)).toBeEnabled();
});

test('tells how the test went', async ({ page }) => {
  const panel = await openPanel(page, 'dark');
  await panel.init(ready);
  await panel.post({ type: 'busy', busy: true });
  await expect(page.getByRole('button', { name: strings.sending })).toBeDisabled();

  const error = 'https://ntfy.example.com refused the access token (HTTP 401).';
  await panel.post({ type: 'result', time: Date.now(), error });
  await panel.post({ type: 'busy', busy: false });
  const result = page.locator('.ng-actions .ng-result');
  await expect(result).toHaveText(error);
  await expect(result).toHaveClass(/ng-failed/);
  await page.screenshot({ path: `${SCREENS}/failed-dark.png` });

  await panel.post({ type: 'result', time: new Date(2026, 10, 3, 14, 2).getTime() });
  // In the language VS Code shows (English here: a 12-hour clock).
  await expect(result).toHaveText(/^Sent at 2:02\sPM\. Check your phone\.$/);
  await expect(result).not.toHaveClass(/ng-failed/);
  await expect(testButton(page)).toBeEnabled();
});

test('clears the history and opens the settings', async ({ page }) => {
  const panel = await openPanel(page, 'dark');
  await panel.init(ready);
  await page.getByRole('button', { name: strings.clearRecent }).click();
  await page.getByRole('button', { name: strings.allSettings }).click();
  expect(await panel.sent()).toEqual([{ type: 'clearHistory' }, { type: 'openSettings' }]);
});

test('fits a narrow panel without scrolling sideways', async ({ page }) => {
  await page.setViewportSize({ width: 380, height: 1100 });
  const panel = await openPanel(page, 'dark');
  await panel.init(ready);
  const overflow = await page.evaluate(() => {
    const app = document.getElementById('app') as HTMLElement;
    return app.scrollWidth - app.clientWidth;
  });
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: `${SCREENS}/narrow-dark.png`, fullPage: true });
  // The panel scrolls inside #app, so the lower cards get their own pictures.
  await messageCard(page).screenshot({ path: `${SCREENS}/narrow-message-dark.png` });
});
