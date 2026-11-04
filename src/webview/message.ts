// The "Send a message" card: a line of text that goes to the phone at once, even while paused.
import { MESSAGE_LIMIT, type PanelState, type PanelStrings } from '../shared/protocol';
import { button, element } from './dom';
import { Field } from './field';
import { vscode } from './vscodeApi';

export class MessageCard {
  readonly element = element('form', 'ng-form ng-message');
  private readonly field: Field;
  private readonly send: HTMLButtonElement;
  private readonly result = element('p', 'ng-result');
  private ready = false;
  private sending = false;

  constructor(
    private readonly strings: PanelStrings['message'],
    private readonly sendingText: string,
    private readonly time: (ms: number) => string,
  ) {
    this.send = button(strings.send, 'primary');
    this.send.type = 'submit';
    this.field = new Field('ng-message', strings.label, { help: strings.help, sides: [this.send] });
    this.field.input.placeholder = strings.placeholder;
    this.field.input.maxLength = MESSAGE_LIMIT;
    this.field.input.spellcheck = true;
    this.result.setAttribute('role', 'status');
    this.result.setAttribute('aria-live', 'polite');
    this.field.body.insertBefore(this.result, this.field.help);
    this.element.noValidate = true;
    this.element.append(this.field.element);

    this.field.input.addEventListener('input', () => this.check());
    this.element.addEventListener('submit', (event) => {
      event.preventDefault();
      if (this.send.disabled) return;
      this.sending = true;
      this.say('');
      this.check();
      vscode.postMessage({ type: 'send', message: this.field.value });
    });
  }

  show(state: PanelState): void {
    this.ready = state.status === 'ready';
    this.check();
  }

  sent(time: number, error?: string): void {
    this.sending = false;
    if (error === undefined) {
      this.field.input.value = '';
      this.say(this.strings.sentAt.replace('{0}', this.time(time)));
    } else {
      // The text stays, so it can be sent again once the problem is fixed.
      this.say(error, true);
    }
    this.check();
  }

  private say(text: string, failed = false): void {
    // Empty rather than hidden, so screen readers keep hearing the live region.
    this.result.textContent = text;
    this.result.classList.toggle('ng-failed', failed);
  }

  private check(): void {
    this.send.textContent = this.sending ? this.sendingText : this.strings.send;
    this.send.disabled = this.sending || !this.ready || this.field.value === '';
  }
}
