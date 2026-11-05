// "Delegate to Agent" under a step an AI agent can do: one line on what it gives, the button that
// copies the ready prompt, and the prompt itself in a fold, so the user sees what the agent is
// asked before pasting it.
import type { DestinationStrings } from '../shared/protocol';
import { button, element } from './dom';
import { vscode } from './vscodeApi';

export class Delegate {
  readonly element = element('div', 'ng-delegate');
  private readonly button: HTMLButtonElement;
  private readonly prompt = element('pre', 'ng-code ng-prompt');
  private readonly status = element('p', 'ng-help');
  private text: string | undefined;

  constructor(s: DestinationStrings['delegate'], help: string, id: string) {
    const line = element('p', 'ng-help', help);
    line.id = `${id}-help`;
    this.button = button(s.button, 'secondary');
    this.button.setAttribute('aria-describedby', line.id);
    this.status.setAttribute('role', 'status');
    // Long prompts scroll inside the box, by keyboard too.
    this.prompt.tabIndex = 0;
    this.prompt.setAttribute('aria-label', s.show);
    const details = element('details', 'ng-details');
    const body = element('div', 'ng-details-body');
    body.append(this.prompt);
    details.append(element('summary', undefined, s.show), body);
    const row = element('div', 'ng-row');
    row.append(this.button, this.status);
    this.element.append(line, row, details);
    this.button.addEventListener('click', () => {
      if (this.text === undefined) return;
      vscode.postMessage({ type: 'copy', text: this.text });
      this.status.textContent = s.copied;
    });
  }

  /** A new form: no "copied" line from before. */
  reset(): void {
    this.status.textContent = '';
  }

  /** The prompt as it is now; `undefined` while it still needs a value, such as the address. */
  set(text: string | undefined): void {
    if (text !== this.text) this.status.textContent = '';
    this.text = text;
    this.button.disabled = text === undefined;
    this.prompt.textContent = text ?? '';
    this.prompt.closest('details')!.hidden = text === undefined;
  }
}
