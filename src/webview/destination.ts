// The "Your phone" card. Until Nightping is set up it walks through the steps in order: the app,
// the server, the topic, a test. Once it works it is one line that says where notifications go,
// with a test and a way to change it.
import {
  isServerUrl,
  isToken,
  isTopic,
  normalizeServer,
  suggestTopic,
} from '../shared/destination';
import { APP_STORES, type AppStore, type PanelState, type PanelStrings } from '../shared/protocol';
import { button, element, fill } from './dom';
import { Field } from './field';
import { vscode } from './vscodeApi';

const NTFY_SH = 'https://ntfy.sh';

export class DestinationCard {
  readonly element = element('div', 'ng-destination');
  private readonly summary = element('div', 'ng-summary');
  private readonly summaryText = element('p', 'ng-summary-text');
  private readonly form = element('form', 'ng-form');
  private readonly appStep: HTMLLIElement;
  private readonly useNtfySh: HTMLButtonElement;
  private readonly server: Field;
  private readonly topic: Field;
  /** How to subscribe on one's own server, with its address. */
  private readonly ownServer = element('p', 'ng-help');
  private readonly token: Field;
  private readonly noServer = element('p', 'ng-help');
  private readonly addToken: HTMLButtonElement;
  private readonly removeToken: HTMLButtonElement;
  private readonly copy: HTMLButtonElement;
  private readonly submit: HTMLButtonElement;
  private readonly cancel: HTMLButtonElement;
  private readonly sendTest: HTMLButtonElement;
  private readonly result = element('p', 'ng-result');
  private state: PanelState | undefined;
  private busy = false;
  /** The user asked to change a destination that works. */
  private editing = false;
  private tokenOpen = false;
  private copiedTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly strings: PanelStrings,
    private readonly time: (ms: number) => string,
  ) {
    const s = strings;

    this.sendTest = button(s.sendTest, 'secondary');
    const change = button(s.change, 'secondary');
    const summaryActions = element('div', 'ng-row');
    summaryActions.append(this.sendTest, change);
    this.summary.append(this.summaryText, summaryActions);

    const stores = element('div', 'ng-row ng-stores');
    for (const [store, name] of Object.entries(APP_STORES) as [AppStore, string][]) {
      const link = button(name, 'link');
      link.addEventListener('click', () => vscode.postMessage({ type: 'openAppStore', store }));
      stores.append(link);
    }
    const app = step(s.steps.app);
    app.body.append(stores);
    this.appStep = app.element;

    // No server is filled in for the user: ntfy.sh is one click, and nothing is sent before Save.
    this.useNtfySh = button(s.useNtfySh, 'secondary');
    this.server = new Field('ng-server', s.server, { sides: [this.useNtfySh], hideLabel: true });
    this.server.input.type = 'url';
    this.server.input.placeholder = 'https://…';
    this.addToken = button(s.addToken, 'link');
    this.removeToken = button(s.removeToken, 'secondary');
    this.token = new Field('ng-token', s.token, {
      help: s.tokenHelp,
      sides: [this.removeToken],
      stacked: true,
    });
    this.token.input.type = 'password';
    const server = step(s.steps.server);
    server.body.append(this.server.element, this.addToken, this.token.element);

    this.copy = button(s.copyTopic, 'secondary');
    const random = button(s.randomTopic, 'secondary');
    this.topic = new Field('ng-topic', s.topic, {
      help: s.topicHelp,
      sides: [this.copy, random],
      hideLabel: true,
    });
    const topic = step(s.steps.topic);
    topic.help.after(this.ownServer);
    topic.body.append(this.topic.element);

    this.submit = button(s.saveAndTest, 'primary');
    this.submit.type = 'submit';
    this.cancel = button(s.cancel, 'secondary');
    const actions = element('div', 'ng-row');
    actions.append(this.submit, this.cancel, this.noServer);
    const test = step(s.steps.test);
    test.body.append(actions);

    const steps = element('ol', 'ng-steps');
    steps.append(app.element, server.element, topic.element, test.element);
    this.form.noValidate = true;
    this.form.append(steps);

    this.result.setAttribute('role', 'status');
    this.result.setAttribute('aria-live', 'polite');
    this.element.append(this.summary, this.form, this.result);

    for (const field of [this.server, this.topic, this.token]) {
      field.input.addEventListener('input', () => this.check());
      field.input.addEventListener('blur', () => this.check());
    }
    this.useNtfySh.addEventListener('click', () => {
      this.server.input.value = NTFY_SH;
      this.server.touched = true;
      this.check();
    });
    this.addToken.addEventListener('click', () => {
      this.tokenOpen = true;
      this.render();
      this.token.input.focus();
    });
    this.removeToken.addEventListener('click', () => vscode.postMessage({ type: 'removeToken' }));
    this.copy.addEventListener('click', () => {
      vscode.postMessage({ type: 'copyTopic', topic: this.topic.value });
      this.copy.textContent = s.copied;
      clearTimeout(this.copiedTimer);
      this.copiedTimer = setTimeout(() => (this.copy.textContent = s.copyTopic), 2000);
    });
    random.addEventListener('click', () => {
      this.topic.input.value = suggestTopic();
      this.topic.touched = true;
      this.check();
      this.topic.input.focus();
    });
    this.form.addEventListener('submit', (event) => {
      event.preventDefault();
      this.save();
    });
    this.cancel.addEventListener('click', () => this.stopEditing());
    change.addEventListener('click', () => {
      this.editing = true;
      this.render();
      this.server.input.focus();
    });
    this.sendTest.addEventListener('click', () => vscode.postMessage({ type: 'sendTest' }));
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
    this.token.input.placeholder = state.hasToken ? this.strings.tokenSaved : '';
    this.removeToken.hidden = !state.hasToken;
    this.summaryText.replaceChildren(
      ...fill(
        this.strings.sendingTo,
        element('strong', undefined, state.topic),
        element('strong', undefined, hostOf(state.server)),
      ),
    );
    this.render();
  }

  setBusy(busy: boolean): void {
    this.busy = busy;
    this.check();
  }

  saved(): void {
    // As the settings store them, so the fields follow the settings again.
    this.server.input.value = normalizeServer(this.server.input.value);
    this.topic.input.value = this.topic.value;
    this.token.input.value = '';
    this.token.touched = false;
    this.editing = false;
    this.tokenOpen = false;
    this.render();
  }

  sent(time: number, error?: string): void {
    if (error === undefined) {
      this.say(this.strings.sentAt.replace('{0}', this.time(time)));
    } else {
      this.say(error, true);
    }
  }

  private say(text: string, failed = false): void {
    this.result.textContent = text;
    this.result.classList.toggle('ng-failed', failed);
  }

  /** Steps until it works, or while the user changes it; one line once it works. */
  private render(): void {
    const ready = this.state?.status === 'ready';
    const open = !ready || this.editing;
    this.summary.hidden = open;
    this.form.hidden = !open;
    // Whoever changes a working setup has the app already.
    this.appStep.hidden = ready;
    this.cancel.hidden = !ready;
    const token = this.state?.hasToken === true || this.tokenOpen || this.token.value !== '';
    this.token.element.hidden = !token;
    this.addToken.hidden = token;
    this.check();
  }

  private stopEditing(): void {
    const state = this.state;
    if (state) {
      this.server.input.value = state.server;
      this.topic.input.value = state.topic;
    }
    this.token.input.value = '';
    this.server.touched = this.topic.touched = this.token.touched = false;
    this.editing = false;
    this.tokenOpen = false;
    this.render();
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
    const s = this.strings;
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
        ? s.serverInvalid
        : undefined,
    );
    this.topic.showError(
      topic !== '' && !topicOk && visible(this.topic, state?.topic) ? s.topicInvalid : undefined,
    );
    this.token.showError(!tokenOk && this.token.touched ? s.tokenInvalid : undefined);

    // Without a server the next click is Use ntfy.sh, so it stands out until one is entered.
    this.useNtfySh.classList.toggle('ng-primary', server === '');
    this.useNtfySh.classList.toggle('ng-secondary', server !== '');
    this.noServer.textContent = server === '' ? s.chooseServerFirst : '';
    const own = serverOk && hostOf(server) !== 'ntfy.sh';
    this.ownServer.hidden = !own;
    this.ownServer.textContent = own ? s.topicOwnServer.replace('{0}', server) : '';

    const ready = state?.status === 'ready';
    const valid = serverOk && topicOk && tokenOk;
    this.submit.disabled = this.busy || !valid || (ready && !this.dirty());
    this.submit.textContent = this.busy ? s.sending : s.saveAndTest;
    this.sendTest.disabled = this.busy || !ready;
    this.sendTest.textContent = this.busy ? s.sending : s.sendTest;
    this.copy.disabled = !topicOk;
  }

  private save(): void {
    this.server.touched = this.topic.touched = this.token.touched = true;
    this.check();
    if (this.submit.disabled) return;
    vscode.postMessage({
      type: 'save',
      server: this.server.value,
      topic: this.topic.value,
      token: this.token.value,
      test: true,
    });
  }
}

/** A numbered step: its title, what to do, and its controls. */
function step(text: { title: string; help: string }) {
  const node = element('li', 'ng-step');
  const help = element('p', 'ng-help', text.help);
  const body = element('div', 'ng-step-body');
  node.append(element('h3', 'ng-step-title', text.title), help, body);
  return { element: node, help, body };
}

/** "ntfy.sh" for https://ntfy.sh: the name people know the server by. */
function hostOf(server: string): string {
  try {
    return new URL(server).host || server;
  } catch {
    return server;
  }
}
