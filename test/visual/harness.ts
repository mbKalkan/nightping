import { readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import type { Page } from '@playwright/test';
import { samplePreviews } from '../../src/extension/format';
import { DEFAULT_PREFS } from '../../src/extension/prefs';
import { panelStrings, type Translate } from '../../src/extension/texts';
import { buildWebviewHtml } from '../../src/extension/webviewHtml';
import type {
  HostToWebviewMessage,
  PanelState,
  WebviewToHostMessage,
} from '../../src/shared/protocol';
import { themes, type ThemeName } from './themes';

interface Theme {
  kind: string;
  classes: readonly string[];
  variables: Record<string, string>;
}

const ORIGIN = 'http://webview.test';

const CONTENT_TYPES: Record<string, string> = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.map': 'application/json',
};

/** English, as VS Code shows it without a language pack. */
export const english: Translate = (message, ...args) =>
  message.replace(/\{(\d+)\}/g, (_, index: string) => String(args[Number(index)]));

export const strings = panelStrings(english);

/**
 * Loads the built webview (dist/webview) the way VS Code does: same HTML, same CSP,
 * a stubbed `acquireVsCodeApi`, and theme variables on the root element.
 */
export async function openPanel(page: Page, theme: ThemeName) {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text());
  });
  page.on('pageerror', (error) => problems.push(error.message));

  await page.route(`${ORIGIN}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/index.html') {
      await route.fulfill({
        contentType: 'text/html',
        body: buildWebviewHtml({
          cspSource: ORIGIN,
          scriptUri: `${ORIGIN}/dist/webview/main.js`,
          styleUri: `${ORIGIN}/dist/webview/main.css`,
          lang: 'en',
        }),
      });
      return;
    }
    try {
      const body = readFileSync(join(process.cwd(), path));
      await route.fulfill({ body, contentType: CONTENT_TYPES[extname(path)] });
    } catch {
      await route.fulfill({ status: 404 });
    }
  });

  await page.addInitScript(
    ({ theme }) => {
      const sent: unknown[] = [];
      // VS Code replaces all theme variables and classes on a theme change.
      const applyTheme = ({ kind, classes, variables }: typeof theme) => {
        const root = document.documentElement;
        for (const name of [...root.style]) {
          if (name.startsWith('--vscode-')) root.style.removeProperty(name);
        }
        for (const [name, value] of Object.entries(variables)) root.style.setProperty(name, value);
        document.body.classList.remove(
          'vscode-dark',
          'vscode-light',
          'vscode-high-contrast',
          'vscode-high-contrast-light',
        );
        document.body.classList.add(...classes);
        document.body.dataset.vscodeThemeKind = kind;
      };
      Object.assign(window, {
        __sent: sent,
        __applyTheme: applyTheme,
        acquireVsCodeApi: () => {
          let state: unknown;
          return {
            postMessage: (message: unknown) => sent.push(message),
            getState: () => state,
            setState: (value: unknown) => void (state = value),
          };
        },
      });
      // Init scripts run before the document exists, so theme it once parsing is done.
      document.addEventListener('DOMContentLoaded', () => applyTheme(theme));
    },
    { theme: themes[theme] as Theme },
  );

  await page.goto(`${ORIGIN}/index.html`);
  await page.waitForFunction(() =>
    (window as unknown as { __sent: { type: string }[] }).__sent.some((m) => m.type === 'ready'),
  );

  return {
    problems,
    /** Delivers a message as if it came from the extension host. */
    async post(message: HostToWebviewMessage) {
      await page.evaluate(
        (data) => window.dispatchEvent(new MessageEvent('message', { data })),
        message,
      );
    },
    /** Sends what the host sends once the webview says it is ready. */
    async init(state: PanelState) {
      await this.post({ type: 'init', locale: 'en', strings });
      await this.post({ type: 'state', state });
    },
    /** What the panel sent to the host, after its first `ready`. */
    sent: () =>
      page.evaluate(() =>
        (window as unknown as { __sent: WebviewToHostMessage[] }).__sent.filter(
          (message) => message.type !== 'ready',
        ),
      ),
  };
}

export const notSetUp: PanelState = {
  server: '',
  topic: '',
  hasToken: false,
  status: 'incomplete',
  history: [],
  prefs: DEFAULT_PREFS,
  previews: samplePreviews(english, 'my-project'),
  terminals: { open: 0, reporting: 0 },
  claude: {
    hooks: 'disconnected',
    found: true,
    file: '~/.claude/settings.json',
    receiving: 'off',
    port: 47391,
  },
  codex: {
    hooks: 'disconnected',
    found: true,
    file: '~/.codex/hooks.json',
    receiving: 'off',
    port: 47391,
  },
};

const NOW = Date.now();
const MINUTE = 60_000;

export const ready: PanelState = {
  server: 'https://ntfy.example.com',
  topic: 'my-topic',
  hasToken: true,
  status: 'ready',
  prefs: DEFAULT_PREFS,
  previews: samplePreviews(english, 'my-project'),
  terminals: { open: 2, reporting: 1 },
  claude: {
    hooks: 'connected',
    found: true,
    file: '~/.claude/settings.json',
    receiving: 'listening',
    port: 47391,
  },
  codex: {
    hooks: 'disconnected',
    found: true,
    file: '~/.codex/hooks.json',
    receiving: 'listening',
    port: 47391,
  },
  history: [
    {
      time: NOW - 2 * MINUTE,
      title: 'Nightping test',
      message: 'Notifications from VS Code will arrive like this.',
    },
    {
      time: NOW - 9 * MINUTE,
      title: 'Nightping test',
      message: 'Notifications from VS Code will arrive like this.',
      error: 'https://ntfy.example.com needs an access token for this topic (HTTP 403).',
    },
    {
      time: NOW - 26 * 60 * MINUTE,
      title: 'Nightping test',
      message: 'Notifications from VS Code will arrive like this.',
      error: 'Could not reach https://ntfy.example.com (ENOTFOUND).',
    },
  ],
};
