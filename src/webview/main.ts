import './styles/panel.css';
import {
  isServerUrl,
  isToken,
  isTopic,
  normalizeServer,
  suggestTopic,
} from '../shared/destination';
import type { HostToWebviewMessage, PanelState, PanelStrings, SentEntry } from '../shared/protocol';
import { button, element } from './dom';
import { NotifyCard } from './notify';
import { vscode } from './vscodeApi';

const app = document.getElementById('app') as HTMLElement;

/** A labelled input with its help line, an error line and an optional button beside it. */
class Field {
  readonly input = element('input', 'ng-input');
  readonly element = element('div', 'ng-field');
  private readonly error = element('p', 'ng-error');
  /** Errors wait until the user leaves the field once, so typing is not scolded. */
  touched = false;

  constructor(id: string, label: string, help: string, side?: HTMLButtonElement) {
    const labelNode = element('label', 'ng-label', label);
    labelNode.htmlFor = id;
    this.input.id = id;
    this.input.spellcheck = false;
    this.input.autocomplete = 'off';
    const helpNode = element('p', 'ng-help', help);
    helpNode.id = `${id}-help`;
    this.error.id = `${id}-error`;
    this.error.hidden = true;
    this.input.setAttribute('aria-describedby', `${helpNode.id} ${this.error.id}`);
    this.input.addEventListener('blur', () => (this.touched = true));
    const control = element('div', 'ng-control');
    control.append(this.input);
    if (side) control.append(side);
    const body = element('div', 'ng-field-body');
    body.append(control, this.error, helpNode);
    this.element.append(labelNode, body);
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

class PanelView {
  private readonly status = element('span', 'ng-status');
  private readonly server: Field;
  private readonly topic: Field;
  private readonly token: Field;
  private readonly removeToken: HTMLButtonElement;
  private readonly save: HTMLButtonElement;
  private readonly sendTest: HTMLButtonElement;
  private readonly result = element('p', 'ng-result');
  private readonly history = element('ol', 'ng-history');
  private readonly empty = element('p', 'ng-empty');
  private readonly clear: HTMLButtonElement;
  private readonly notify: NotifyCard;
  private readonly time: Intl.DateTimeFormat;
  private readonly dateTime: Intl.DateTimeFormat;
  private state: PanelState | undefined;
  private busy = false;
  private cards = 0;

  constructor(
    private readonly strings: PanelStrings,
    locale: string,
  ) {
    this.time = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' });
    this.dateTime = new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });

    const main = element('main', 'ng-main');
    main.setAttribute('aria-label', strings.title);

    const header = element('header', 'ng-header');
    const heading = element('div', 'ng-heading');
    heading.append(
      element('h1', 'ng-title', strings.title),
      element('p', 'ng-tagline', strings.tagline),
    );
    this.status.setAttribute('role', 'status');
    header.append(heading, this.status);

    // Destination: the settings and the token, saved together.
    const random = button(strings.randomTopic, 'secondary');
    this.removeToken = button(strings.removeToken, 'secondary');
    this.server = new Field('ng-server', strings.server, strings.serverHelp);
    this.server.input.type = 'url';
    this.server.input.placeholder = 'https://ntfy.sh';
    this.topic = new Field('ng-topic', strings.topic, strings.topicHelp, random);
    this.token = new Field('ng-token', strings.token, strings.tokenHelp, this.removeToken);
    this.token.input.type = 'password';

    this.save = button(strings.save, 'primary');
    this.save.type = 'submit';
    this.sendTest = button(strings.sendTest, 'secondary');
    this.result.setAttribute('role', 'status');
    this.result.setAttribute('aria-live', 'polite');
    const actions = element('div', 'ng-actions');
    actions.append(this.save, this.sendTest, this.result);

    const form = element('form', 'ng-form');
    form.noValidate = true;
    form.append(this.server.element, this.topic.element, this.token.element, actions);

    const destination = this.card(strings.destination);
    destination.append(form);

    this.notify = new NotifyCard(strings, locale);
    const notify = this.card(strings.whenToNotify);
    notify.append(this.notify.element);

    // Recent notifications.
    this.clear = button(strings.clearRecent, 'link');
    this.empty.textContent = strings.recentEmpty;
    const recent = this.card(strings.recent, this.clear);
    recent.append(this.history, this.empty, element('p', 'ng-note', strings.recentNote));
    this.history.setAttribute('aria-label', strings.recent);

    const footer = element('footer', 'ng-footer');
    const settings = button(strings.allSettings, 'link');
    footer.append(element('p', 'ng-privacy', strings.privacy), settings);

    main.append(header, destination, notify, recent, footer);
    app.replaceChildren(main);

    for (const field of [this.server, this.topic, this.token]) {
      field.input.addEventListener('input', () => this.check());
      field.input.addEventListener('blur', () => this.check());
    }
    random.addEventListener('click', () => {
      this.topic.input.value = suggestTopic();
      this.topic.touched = true;
      this.check();
      this.topic.input.focus();
    });
    this.removeToken.addEventListener('click', () => vscode.postMessage({ type: 'removeToken' }));
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      this.submit(false);
    });
    this.sendTest.addEventListener('click', () => {
      if (this.dirty()) {
        this.submit(true);
      } else {
        vscode.postMessage({ type: 'sendTest' });
      }
    });
    this.clear.addEventListener('click', () => vscode.postMessage({ type: 'clearHistory' }));
    settings.addEventListener('click', () => vscode.postMessage({ type: 'openSettings' }));
  }

  show(state: PanelState): void {
    const previous = this.state;
    // Fields the user has not edited follow the settings; edited ones keep what was typed.
    if (!previous || this.server.input.value === previous.server) {
      this.server.input.value = state.server;
    }
    if (!previous || this.topic.input.value === previous.topic) {
      // A first setup starts from a name nobody can guess.
      this.topic.input.value = state.topic !== '' ? state.topic : suggestTopic();
    }
    this.state = state;

    this.status.textContent = this.strings.status[state.status];
    this.status.dataset.status = state.status;
    this.token.input.placeholder = state.hasToken
      ? this.strings.tokenSaved
      : this.strings.tokenPlaceholder;
    this.removeToken.hidden = !state.hasToken;
    this.notify.show(state);
    this.renderHistory(state.history);
    this.check();
  }

  setBusy(busy: boolean): void {
    this.busy = busy;
    this.sendTest.textContent = busy ? this.strings.sending : this.strings.sendTest;
    this.check();
  }

  saved(): void {
    // As the settings store them, so the fields follow the settings again.
    this.server.input.value = normalizeServer(this.server.input.value);
    this.topic.input.value = this.topic.value;
    this.token.input.value = '';
    this.token.touched = false;
    this.say(this.strings.saved);
    this.check();
  }

  sent(time: number, error?: string): void {
    if (error === undefined) {
      this.say(this.strings.sentAt.replace('{0}', this.time.format(time)));
    } else {
      this.say(error, true);
    }
  }

  private say(text: string, failed = false): void {
    this.result.textContent = text;
    this.result.classList.toggle('ng-failed', failed);
  }

  private card(title: string, action?: HTMLElement): HTMLElement {
    const section = element('section', 'ng-card');
    const header = element('div', 'ng-card-header');
    const heading = element('h2', 'ng-card-title', title);
    heading.id = `ng-card-${++this.cards}`;
    section.setAttribute('aria-labelledby', heading.id);
    header.append(heading);
    if (action) header.append(action);
    section.append(header);
    return section;
  }

  private dirty(): boolean {
    const state = this.state;
    if (!state) return false;
    return (
      normalizeServer(this.server.value) !== normalizeServer(state.server) ||
      this.topic.value !== state.topic.trim() ||
      this.token.value !== ''
    );
  }

  /** Shows errors and turns the buttons on and off for what the form holds now. */
  private check(): void {
    const state = this.state;
    const server = normalizeServer(this.server.value);
    const topic = this.topic.value;
    const token = this.token.value;
    const serverOk = isServerUrl(server);
    const topicOk = isTopic(topic);
    const tokenOk = token === '' || isToken(token);
    // A saved value that is wrong shows its error at once; a new one after the field is left.
    const visible = (field: Field, saved: string | undefined) =>
      field.touched || (saved !== undefined && saved.trim() !== '' && field.input.value === saved);
    this.server.showError(
      server !== '' && !serverOk && visible(this.server, state?.server)
        ? this.strings.serverInvalid
        : undefined,
    );
    this.topic.showError(
      topic !== '' && !topicOk && visible(this.topic, state?.topic)
        ? this.strings.topicInvalid
        : undefined,
    );
    this.token.showError(!tokenOk && this.token.touched ? this.strings.tokenInvalid : undefined);

    const valid = serverOk && topicOk && tokenOk;
    const dirty = this.dirty();
    this.save.disabled = this.busy || !dirty || !valid;
    this.sendTest.disabled = this.busy || (dirty ? !valid : state?.status !== 'ready');
  }

  private submit(test: boolean): void {
    this.server.touched = this.topic.touched = this.token.touched = true;
    this.check();
    if (this.save.disabled && !test) return;
    if (test && this.sendTest.disabled) return;
    vscode.postMessage({
      type: 'save',
      server: this.server.value,
      topic: this.topic.value,
      token: this.token.value,
      test,
    });
  }

  private renderHistory(entries: SentEntry[]): void {
    const today = new Date().toDateString();
    this.history.replaceChildren(
      ...entries.map((entry) => {
        const item = element('li', `ng-entry ${entry.error === undefined ? 'ng-ok' : 'ng-failed'}`);
        const when = element('time', 'ng-when');
        const date = new Date(entry.time);
        when.dateTime = date.toISOString();
        when.textContent = (date.toDateString() === today ? this.time : this.dateTime).format(date);
        const body = element('div', 'ng-entry-body');
        const line = element('p', 'ng-entry-line');
        line.append(
          element('span', 'ng-entry-title', entry.title),
          element('span', 'ng-entry-message', entry.message),
        );
        body.append(line);
        if (entry.error !== undefined) {
          body.append(element('p', 'ng-entry-error', entry.error));
        }
        const outcome = element(
          'span',
          'ng-outcome',
          entry.error === undefined ? this.strings.sent : this.strings.notSent,
        );
        item.append(when, body, outcome);
        return item;
      }),
    );
    this.history.hidden = entries.length === 0;
    this.empty.hidden = entries.length > 0;
    this.clear.hidden = entries.length === 0;
  }
}

let panel: PanelView | undefined;

window.addEventListener('message', (event: MessageEvent<HostToWebviewMessage>) => {
  const message = event.data;
  if (message.type === 'init') {
    document.documentElement.lang = message.locale;
    panel = new PanelView(message.strings, message.locale);
  } else if (message.type === 'state') {
    panel?.show(message.state);
  } else if (message.type === 'busy') {
    panel?.setBusy(message.busy);
  } else if (message.type === 'saved') {
    panel?.saved();
  } else if (message.type === 'result') {
    panel?.sent(message.time, message.error);
  }
});

vscode.postMessage({ type: 'ready' });
