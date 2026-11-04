import './styles/panel.css';
import {
  isServerUrl,
  isToken,
  isTopic,
  normalizeServer,
  suggestTopic,
} from '../shared/destination';
import type { HostToWebviewMessage, PanelState, PanelStrings, SentEntry } from '../shared/protocol';
import { ClaudeCard } from './claude';
import { button, element } from './dom';
import { Field } from './field';
import { MessageCard } from './message';
import { NotifyCard } from './notify';
import { vscode } from './vscodeApi';

const app = document.getElementById('app') as HTMLElement;

class PanelView {
  private readonly status = element('span', 'ng-status');
  private readonly pause: HTMLButtonElement;
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
  private readonly claude: ClaudeCard;
  private readonly message: MessageCard;
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
    // Pause opens VS Code's own list of lengths; Resume ends the pause at once.
    this.pause = button(strings.pause, 'secondary');
    this.pause.hidden = true;
    const side = element('div', 'ng-header-side');
    side.append(this.status, this.pause);
    header.append(heading, side);

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

    this.claude = new ClaudeCard(strings.claude);
    const claude = this.card(strings.claude.title);
    claude.append(this.claude.element);

    this.notify = new NotifyCard(strings, locale);
    const notify = this.card(strings.whenToNotify);
    notify.append(this.notify.element);

    this.message = new MessageCard(strings.message, strings.sending, (ms) => this.time.format(ms));
    const message = this.card(strings.message.title);
    message.append(this.message.element);

    // Recent notifications.
    this.clear = button(strings.clearRecent, 'link');
    this.empty.textContent = strings.recentEmpty;
    const recent = this.card(strings.recent, this.clear);
    recent.append(this.history, this.empty, element('p', 'ng-note', strings.recentNote));
    this.history.setAttribute('aria-label', strings.recent);

    const footer = element('footer', 'ng-footer');
    const settings = button(strings.allSettings, 'link');
    footer.append(element('p', 'ng-privacy', strings.privacy), settings);

    main.append(header, destination, claude, notify, message, recent, footer);
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
    this.pause.addEventListener('click', () =>
      vscode.postMessage({ type: this.state?.pause ? 'resume' : 'pause' }),
    );
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

    this.showStatus(state);
    this.token.input.placeholder = state.hasToken
      ? this.strings.tokenSaved
      : this.strings.tokenPlaceholder;
    this.removeToken.hidden = !state.hasToken;
    this.claude.show(state.claude);
    this.notify.show(state);
    this.message.show(state);
    this.renderHistory(state.history);
    this.check();
  }

  private showStatus(state: PanelState): void {
    const ready = state.status === 'ready';
    const until = state.pause?.until;
    this.status.textContent =
      ready && state.pause
        ? until === undefined
          ? this.strings.pausedUntilResumed
          : this.strings.pausedUntil.replace('{0}', this.when(until))
        : this.strings.status[state.status];
    this.status.dataset.status = ready && state.pause ? 'paused' : state.status;
    this.pause.hidden = !ready;
    this.pause.textContent = state.pause ? this.strings.resume : this.strings.pause;
  }

  /** The time, with the date when it is not today. */
  private when(ms: number): string {
    const date = new Date(ms);
    return (date.toDateString() === new Date().toDateString() ? this.time : this.dateTime).format(
      date,
    );
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

  messageSent(time: number, error?: string): void {
    this.message.sent(time, error);
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
    this.history.replaceChildren(
      ...entries.map((entry) => {
        const item = element('li', `ng-entry ${entry.error === undefined ? 'ng-ok' : 'ng-failed'}`);
        const when = element('time', 'ng-when');
        const date = new Date(entry.time);
        when.dateTime = date.toISOString();
        when.textContent = this.when(entry.time);
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
  } else if (message.type === 'messageResult') {
    panel?.messageSent(message.time, message.error);
  }
});

vscode.postMessage({ type: 'ready' });
