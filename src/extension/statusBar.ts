import * as vscode from 'vscode';
import type { DestinationState } from './config';

/** Says whether Nightping can send; a click opens the panel. */
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

  show(state: DestinationState): void {
    if (state.kind === 'ready') {
      const { server, topic } = state.destination;
      // Not a bell: VS Code's own notification bell sits right next to it.
      this.item.text = '$(device-mobile)';
      this.item.tooltip = vscode.l10n.t(
        'Nightping sends notifications to {0}. Click to open Nightping.',
        `${server}/${topic}`,
      );
      this.item.backgroundColor = undefined;
    } else {
      this.item.text = '$(bell-slash) Nightping';
      this.item.tooltip =
        state.kind === 'incomplete'
          ? vscode.l10n.t('Nightping is not set up yet. Click to enter your ntfy server and topic.')
          : state.setting === 'server'
            ? vscode.l10n.t(
                'The ntfy server in the settings is not a valid http or https URL. Click to fix it.',
              )
            : vscode.l10n.t(
                'The ntfy topic in the settings can only use letters, numbers, - and _ (up to 64). Click to fix it.',
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
