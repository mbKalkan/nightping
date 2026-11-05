import * as vscode from 'vscode';
import type { SentEntry } from '../shared/protocol';
import { displayName, type DestinationEntry, type DestinationsState } from './config';
import type { Pause } from './pause';

/**
 * Says whether Nightping can send or is paused; a click opens the panel. When it is set up, the
 * hover shows the last notification and links to pause or resume.
 */
export class StatusBar implements vscode.Disposable {
  private readonly item = vscode.window.createStatusBarItem(
    'nightping.status',
    vscode.StatusBarAlignment.Right,
    100,
  );

  constructor() {
    this.item.name = 'Nightping';
    this.item.command = 'nightping.open';
  }

  show(state: DestinationsState, pause: Pause | undefined, last: SentEntry | undefined): void {
    if (state.kind === 'ready') {
      // Not a bell: VS Code's own notification bell sits right next to it.
      this.item.text = pause ? `$(device-mobile) ${vscode.l10n.t('Paused')}` : '$(device-mobile)';
      const on = state.entries.filter((entry) => entry.enabled && entry.problem === undefined);
      this.item.tooltip = readyTooltip(on, pause, last);
      this.item.backgroundColor = undefined;
    } else {
      this.item.text = '$(bell-slash) Nightping';
      this.item.tooltip =
        state.kind === 'incomplete'
          ? vscode.l10n.t('Nightping is not set up yet. Click to choose where notifications go.')
          : state.kind === 'off'
            ? vscode.l10n.t('Every destination is turned off. Click to turn one on.')
            : vscode.l10n.t(
                'The ntfy server or topic in the settings is not valid. Click to fix it.',
              );
      this.item.backgroundColor =
        state.kind === 'invalid'
          ? new vscode.ThemeColor('statusBarItem.warningBackground')
          : undefined;
    }
    this.item.show();
  }

  dispose(): void {
    this.item.dispose();
  }
}

function readyTooltip(
  destinations: DestinationEntry[],
  pause: Pause | undefined,
  last: SentEntry | undefined,
): vscode.MarkdownString {
  const tip = new vscode.MarkdownString();
  tip.isTrusted = { enabledCommands: ['nightping.open', 'nightping.pause', 'nightping.resume'] };
  // Server, topic, titles and errors are plain text: a command line may hold Markdown.
  tip.appendText(
    pause === undefined
      ? vscode.l10n.t(
          'Nightping sends notifications to {0}.',
          destinations.length === 1
            ? `${destinations[0].server}/${destinations[0].topic}`
            : destinations.map((entry) => displayName(entry)).join(', '),
        )
      : pause.until === undefined
        ? vscode.l10n.t('Nightping is paused until you resume.')
        : vscode.l10n.t('Nightping is paused until {0}.', time(pause.until)),
  );
  if (last) {
    tip.appendMarkdown('\n\n');
    tip.appendText(
      last.error === undefined
        ? vscode.l10n.t('Last sent at {0}: {1}', time(last.time), `${last.title} · ${last.message}`)
        : vscode.l10n.t('Not sent at {0}: {1}', time(last.time), last.error),
    );
  }
  const action =
    pause === undefined
      ? link(vscode.l10n.t('Pause…'), 'nightping.pause')
      : link(vscode.l10n.t('Resume'), 'nightping.resume');
  tip.appendMarkdown(`\n\n${action} · ${link(vscode.l10n.t('Open Nightping'), 'nightping.open')}`);
  return tip;
}

function link(text: string, command: string): string {
  return `[${text.replace(/[[\]\\]/g, '\\$&')}](command:${command})`;
}

function time(ms: number): string {
  const date = new Date(ms);
  const today = date.toDateString() === new Date().toDateString();
  return new Intl.DateTimeFormat(vscode.env.language, {
    ...(today ? {} : { month: 'short', day: 'numeric' }),
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}
