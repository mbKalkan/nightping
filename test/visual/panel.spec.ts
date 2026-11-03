import { expect, test, type Page } from '@playwright/test';
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
      await expect(page.locator('.ng-status')).toHaveText(strings.status.incomplete);
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

      await expect(page.locator('.ng-status')).toHaveText(strings.status.ready);
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
  });
}

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
  await expect(page.locator('.ng-status')).toHaveText(strings.status.invalid);
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
  const result = page.locator('.ng-result');
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
});
