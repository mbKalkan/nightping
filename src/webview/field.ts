import { element } from './dom';

/** A labelled input with its help line, an error line and an optional button beside it. */
export class Field {
  readonly input = element('input', 'ng-input');
  readonly element = element('div', 'ng-field');
  /** The input, its lines and anything a card adds under them. */
  readonly body = element('div', 'ng-field-body');
  readonly help: HTMLParagraphElement;
  private readonly error = element('p', 'ng-error');
  /** Errors wait until the user leaves the field once, so typing is not scolded. */
  touched = false;

  constructor(id: string, label: string, help: string, side?: HTMLButtonElement) {
    const labelNode = element('label', 'ng-label', label);
    labelNode.htmlFor = id;
    this.input.id = id;
    this.input.spellcheck = false;
    this.input.autocomplete = 'off';
    this.help = element('p', 'ng-help', help);
    this.help.id = `${id}-help`;
    this.error.id = `${id}-error`;
    this.error.hidden = true;
    this.input.setAttribute('aria-describedby', `${this.help.id} ${this.error.id}`);
    this.input.addEventListener('blur', () => (this.touched = true));
    const control = element('div', 'ng-control');
    control.append(this.input);
    if (side) control.append(side);
    this.body.append(control, this.error, this.help);
    this.element.append(labelNode, this.body);
  }

  get value(): string {
    return this.input.value.trim();
  }

  showError(text: string | undefined): void {
    this.error.hidden = text === undefined;
    this.error.textContent = text ?? '';
    this.input.toggleAttribute('aria-invalid', text !== undefined);
  }
}
