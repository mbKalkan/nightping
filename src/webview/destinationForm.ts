// The guide for one destination: numbered steps for the way the user chose (ntfy.sh, their own
// server, their own server over Tailscale), or the plain fields when they edit one.
import {
  destinationKey,
  hostOf,
  isName,
  isServerUrl,
  isToken,
  isTopic,
  NTFY_SH,
  normalizeServer,
  suggestTopic,
} from '../shared/destination';
import { fillPrompt, serverCommands } from '../shared/guide';
import {
  APP_STORES,
  type AppStore,
  type DestinationStrings,
  type DestinationView,
  type ServerCheck,
  type SetupWay,
  type StepText,
  type TailscaleView,
} from '../shared/protocol';
import { button, element, fill } from './dom';
import { Delegate } from './delegate';
import { Field } from './field';
import { vscode } from './vscodeApi';

/** A new destination the way the user chose, or a change to one in the list. */
export type FormMode = { way: SetupWay } | { way: 'edit'; destination: DestinationView };

export class DestinationForm {
  readonly element = element('form', 'ng-form');
  private readonly back: HTMLButtonElement;
  private readonly tailscaleStep: Step;
  private readonly appStep: Step;
  private readonly serverStep: Step;
  private readonly runStep: Step;
  private readonly topicStep: Step;
  private readonly topicStores: HTMLElement;
  private readonly server: Field;
  private readonly topic: Field;
  private readonly token: Field;
  private readonly name: Field;
  private readonly addToken: HTMLButtonElement;
  private readonly removeToken: HTMLButtonElement;
  private readonly copyTopic: HTMLButtonElement;
  private readonly submit: HTMLButtonElement;
  private readonly cancel: HTMLButtonElement;
  /** Only when editing: removing a destination is part of changing it. */
  private readonly remove: HTMLButtonElement;
  private readonly tailscaleState = element('p', 'ng-help');
  private readonly devices = element('div', 'ng-stack ng-devices');
  private readonly noMagicDns = element('p', 'ng-warning');
  private readonly offline = element('p', 'ng-warning');
  /** Whether ntfy already runs on the chosen server. */
  private readonly serverState = element('p', 'ng-help');
  /** Steps an AI agent can do, each with its ready prompt. */
  private readonly tailscaleAgent: Delegate;
  private readonly ntfyAgent: Delegate;
  private readonly tokenAgent: Delegate;
  private readonly commands: Array<{ code: HTMLElement; copy: HTMLButtonElement }> = [];
  private mode: FormMode = { way: 'ntfy-sh' };
  private destinations: DestinationView[] = [];
  private busy = false;
  private tokenOpen = false;
  /** The answer about the server in the field, once asked: then its setup step is not needed. */
  private running: { server: string; name: string; state: ServerCheck } | undefined;
  /** The topic the form started with, for when the topic of the phone is not asked for after all. */
  private suggested = '';
  /** Shows the cancel button: there is a list to go back to. */
  private canCancel = false;

  constructor(
    private readonly s: DestinationStrings,
    private readonly sending: string,
    private readonly onClose: (how: 'cancel' | 'back') => void,
  ) {
    this.back = button(s.otherWays, 'link');
    this.back.classList.add('ng-back');

    const download = button(s.tailscale.download, 'secondary');
    const check = button(s.tailscale.check, 'secondary');
    this.tailscaleState.setAttribute('role', 'status');
    this.tailscaleStep = step(s.steps.tailscale);
    const tailscaleRow = element('div', 'ng-row');
    tailscaleRow.append(download, check);
    this.tailscaleAgent = new Delegate(s.delegate, s.delegate.help.tailscale, 'ng-agent-tailscale');
    this.tailscaleAgent.set(fillPrompt(s.prompts.tailscale, []));
    this.tailscaleStep.body.append(tailscaleRow, this.tailscaleState, this.tailscaleAgent.element);

    this.appStep = step(s.steps.app);
    this.appStep.body.append(stores());

    this.server = new Field('ng-server', s.server, { stacked: true });
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
    this.tokenAgent = new Delegate(s.delegate, s.delegate.help.token, 'ng-agent-token');
    const openDns = button(s.tailscale.openDns, 'link');
    this.noMagicDns.append(s.tailscale.noMagicDns, ' ', openDns);
    this.devices.setAttribute('role', 'radiogroup');
    this.devices.setAttribute('aria-label', s.steps.pickServer.title);
    this.serverStep = step(s.steps.server);
    this.serverState.setAttribute('role', 'status');
    this.serverStep.body.append(
      this.devices,
      this.offline,
      this.serverState,
      this.noMagicDns,
      this.server.element,
      this.addToken,
      this.token.element,
      this.tokenAgent.element,
    );

    this.runStep = step(s.steps.run);
    for (let index = 0; index < 2; index++) {
      const code = element('code', 'ng-code');
      const copy = button(s.copy, 'secondary');
      const line = element('div', 'ng-command');
      line.append(code, copy);
      this.runStep.body.append(line);
      this.commands.push({ code, copy });
      copy.addEventListener('click', () => this.copied(copy, code.textContent ?? ''));
    }
    const otherInstall = button(s.run.otherWays, 'link');
    this.ntfyAgent = new Delegate(s.delegate, s.delegate.help.ntfy, 'ng-agent-ntfy');
    this.runStep.body.append(
      element('p', 'ng-help', s.run.note),
      otherInstall,
      this.ntfyAgent.element,
    );

    this.copyTopic = button(s.copy, 'secondary');
    const random = button(s.randomTopic, 'secondary');
    this.topic = new Field('ng-topic', s.topic, {
      help: s.topicHelp,
      sides: [this.copyTopic, random],
      hideLabel: true,
    });
    this.topicStep = step(s.steps.topic);
    this.topicStores = stores();
    this.topicStep.body.append(this.topicStores, this.topic.element);

    this.name = new Field('ng-name', s.name, { stacked: true });
    this.submit = button(s.saveAndTest, 'primary');
    this.submit.type = 'submit';
    this.cancel = button(s.cancel, 'secondary');
    this.remove = button(s.remove, 'secondary');
    this.remove.classList.add('ng-remove');
    const actions = element('div', 'ng-row ng-form-actions');
    actions.append(this.submit, this.cancel, this.remove);
    const save = step(s.steps.save);
    save.body.append(this.name.element, actions);

    const steps = element('ol', 'ng-steps');
    steps.append(
      this.tailscaleStep.element,
      this.appStep.element,
      this.serverStep.element,
      this.runStep.element,
      this.topicStep.element,
      save.element,
    );
    this.element.noValidate = true;
    this.element.append(this.back, steps);

    for (const field of [this.server, this.topic, this.token, this.name]) {
      field.input.addEventListener('input', () => this.check());
      field.input.addEventListener('blur', () => this.check());
    }
    this.server.input.addEventListener('input', () => {
      this.markDevice();
      if (this.running && this.running.server !== normalizeServer(this.server.value)) {
        this.running = undefined;
        this.matchTopic();
        this.layout();
      }
    });
    // Typed rather than picked: asked once the address is complete.
    this.server.input.addEventListener('change', () => this.askServer());
    download.addEventListener('click', () =>
      vscode.postMessage({ type: 'openGuide', link: 'tailscale-download' }),
    );
    check.addEventListener('click', () => this.findTailscale());
    openDns.addEventListener('click', () =>
      vscode.postMessage({ type: 'openGuide', link: 'tailscale-dns' }),
    );
    otherInstall.addEventListener('click', () =>
      vscode.postMessage({ type: 'openGuide', link: 'ntfy-install' }),
    );
    this.addToken.addEventListener('click', () => {
      this.tokenOpen = true;
      this.layout();
      this.token.input.focus();
    });
    this.removeToken.addEventListener('click', () => {
      if (this.mode.way === 'edit') {
        vscode.postMessage({ type: 'removeToken', key: this.mode.destination.key });
      }
    });
    this.copyTopic.addEventListener('click', () => this.copied(this.copyTopic, this.topic.value));
    random.addEventListener('click', () => {
      this.topic.input.value = suggestTopic();
      this.topic.touched = true;
      this.check();
      this.topic.input.focus();
    });
    this.element.addEventListener('submit', (event) => {
      event.preventDefault();
      this.save();
    });
    this.cancel.addEventListener('click', () => this.onClose('cancel'));
    // The command asks first; once it is gone, the next state closes the form.
    this.remove.addEventListener('click', () => {
      if (this.mode.way === 'edit') {
        vscode.postMessage({ type: 'removeDestination', key: this.mode.destination.key });
      }
    });
    this.back.addEventListener('click', () => this.onClose('back'));
  }

  /** Starts the form afresh for a new destination or a change to one. */
  open(mode: FormMode, destinations: DestinationView[]): void {
    this.mode = mode;
    this.destinations = destinations;
    this.canCancel = destinations.length > 0;
    const editing = mode.way === 'edit' ? mode.destination : undefined;
    this.server.input.value = editing?.server ?? (mode.way === 'ntfy-sh' ? NTFY_SH : '');
    // A new destination starts from a topic nobody can guess.
    this.suggested = suggestTopic();
    this.topic.input.value = editing?.topic ?? this.suggested;
    this.running = undefined;
    this.name.input.value = editing?.name ?? '';
    this.token.input.value = '';
    for (const field of [this.server, this.topic, this.token, this.name]) field.touched = false;
    this.tokenOpen = false;
    for (const agent of [this.tailscaleAgent, this.ntfyAgent, this.tokenAgent]) agent.reset();
    this.devices.replaceChildren();
    this.offline.hidden = true;
    this.noMagicDns.hidden = true;
    this.tailscaleState.textContent = '';
    if (mode.way === 'tailscale') this.findTailscale();
    this.layout();
  }

  /** The settings changed meanwhile: the list to check duplicates against, and saved tokens. */
  update(destinations: DestinationView[]): void {
    this.destinations = destinations;
    this.canCancel = destinations.length > 0;
    if (this.mode.way === 'edit') {
      const key = this.mode.destination.key;
      const now = destinations.find((item) => item.key === key);
      if (!now) {
        // Removed: an open form goes back to the list.
        if (!this.element.hidden) this.onClose('cancel');
        return;
      }
      this.mode = { way: 'edit', destination: now };
    }
    this.layout();
  }

  setBusy(busy: boolean): void {
    this.busy = busy;
    this.check();
  }

  focus(): void {
    const first = this.mode.way === 'tailscale' ? undefined : this.firstField();
    (first?.input ?? this.element.querySelector<HTMLElement>('button:not([hidden])'))?.focus();
  }

  showTailscale(status: TailscaleView): void {
    const t = this.s.tailscale;
    this.tailscaleState.textContent =
      status.kind === 'ready' ? t.state.ready.replace('{0}', status.name) : t.state[status.kind];
    this.tailscaleState.classList.toggle('ng-warning', status.kind !== 'ready');
    this.noMagicDns.hidden = status.kind !== 'ready' || status.magicDns;
    const devices = status.kind === 'ready' ? status.devices.filter((d) => d.address) : [];
    this.devices.replaceChildren(
      ...devices.map((device, index) => {
        const id = `ng-device-${index}`;
        const radio = element('input', 'ng-radio');
        radio.type = 'radio';
        radio.name = 'ng-device';
        radio.id = id;
        radio.value = device.address;
        radio.dataset.name = device.name;
        if (!device.online) radio.dataset.offline = 'true';
        const label = element('label', undefined, device.name);
        label.htmlFor = id;
        const notes = [
          device.self ? t.thisComputer : '',
          device.os,
          device.online ? '' : t.offline,
        ];
        const extra = notes.filter((note) => note !== '').join(' · ');
        if (extra) label.append(' ', element('span', 'ng-quiet', `(${extra})`));
        radio.addEventListener('change', () => {
          this.server.input.value = device.address;
          this.server.touched = true;
          this.markDevice();
          this.askServer();
        });
        const row = element('div', 'ng-check');
        row.append(radio, label);
        return row;
      }),
    );
    this.devices.hidden = devices.length === 0;
    this.markDevice();
  }

  private findTailscale(): void {
    this.tailscaleState.textContent = this.s.tailscale.checking;
    this.tailscaleState.classList.remove('ng-warning');
    vscode.postMessage({ type: 'findTailscale' });
  }

  /** The answer to `checkServer`; one about an address no longer in the field is dropped. */
  serverCheck(server: string, running: boolean): void {
    if (this.running?.server !== server || this.running.state !== 'checking') return;
    this.running.state = running ? 'running' : 'none';
    this.matchTopic();
    this.layout();
  }

  /**
   * A phone that reads from a server where ntfy already runs has its topic: that one is wanted, so
   * the suggested topic gives way, and comes back when the server changes. A typed one stays.
   */
  private matchTopic(): void {
    if (this.topic.touched) return;
    const value = this.topic.input.value;
    if (this.running?.state === 'running') {
      if (value === this.suggested) this.topic.input.value = '';
    } else if (value === '') {
      this.topic.input.value = this.suggested;
    }
  }

  /** Shows the access token field, for a server that refused a test without one. */
  openToken(): void {
    this.tokenOpen = true;
    this.layout();
    this.token.input.focus();
  }

  /**
   * On the Tailscale way, asks whether ntfy already runs on the server in the field. For this
   * computer the extension asks its ntfy where `tailscale serve` passes the address on to.
   */
  private askServer(): void {
    const server = normalizeServer(this.server.value);
    const device = [...this.devices.querySelectorAll<HTMLInputElement>('input')].find(
      (radio) => radio.value === server,
    );
    if (this.mode.way !== 'tailscale' || !isServerUrl(server)) {
      this.running = undefined;
    } else if (this.running?.server !== server) {
      this.running = { server, name: device?.dataset.name ?? hostOf(server), state: 'checking' };
      vscode.postMessage({ type: 'checkServer', server });
    }
    this.matchTopic();
    this.layout();
  }

  /** Checks the device whose address is in the field, if any, and says when it is offline. */
  private markDevice(): void {
    const server = normalizeServer(this.server.input.value);
    let offline = '';
    for (const radio of this.devices.querySelectorAll<HTMLInputElement>('input')) {
      radio.checked = radio.value === server;
      if (radio.checked && radio.dataset.offline) {
        offline = this.s.tailscale.offlineChosen.replace('{0}', radio.dataset.name ?? '');
      }
    }
    this.offline.textContent = offline;
    this.offline.hidden = offline === '' || this.devices.hidden;
  }

  /** Shows the steps of the way, numbered from 1. */
  private layout(): void {
    const s = this.s;
    const way = this.mode.way;
    const editing = way === 'edit';
    this.back.hidden = editing;
    this.tailscaleStep.element.hidden = way !== 'tailscale';
    // Whoever edits a destination has the app; the Tailscale way names it with the phone.
    this.appStep.element.hidden = way !== 'ntfy-sh' && way !== 'own-server';
    this.serverStep.element.hidden = way === 'ntfy-sh';
    const running = way === 'tailscale' && this.running?.state === 'running';
    this.runStep.element.hidden = way !== 'tailscale' || running;
    this.serverState.hidden = way !== 'tailscale' || this.running === undefined;
    this.serverState.textContent = this.running
      ? s.tailscale.server[this.running.state].replaceAll('{0}', this.running.name)
      : '';
    this.topic.help.hidden = running;
    this.topicStores.hidden = way !== 'tailscale';
    setStep(this.serverStep, way === 'tailscale' ? s.steps.pickServer : s.steps.server);
    this.devices.hidden = way !== 'tailscale' || this.devices.childElementCount === 0;
    this.noMagicDns.hidden ||= way !== 'tailscale';
    const hasToken = this.mode.way === 'edit' && this.mode.destination.hasToken;
    const token = hasToken || this.tokenOpen || this.token.value !== '';
    this.token.element.hidden = !token;
    this.addToken.hidden = token;
    this.token.input.placeholder = hasToken ? s.tokenSaved : '';
    this.removeToken.hidden = !hasToken;
    // Offered where a token is asked for and none is saved yet.
    this.tokenAgent.element.hidden = !token || hasToken;
    this.cancel.hidden = !this.canCancel;
    this.remove.hidden = !editing;
    if (this.mode.way === 'edit') {
      const name = this.mode.destination.name.trim() || hostOf(this.mode.destination.server);
      this.remove.setAttribute('aria-label', `${s.remove}: ${name}`);
    }
    this.check();
  }

  private firstField(): Field {
    return this.mode.way === 'ntfy-sh' ? this.topic : this.server;
  }

  /** Shows errors and turns the buttons on and off for what the form holds now. */
  private check(): void {
    const s = this.s;
    const server = normalizeServer(this.server.value);
    const topic = this.topic.value;
    const token = this.token.value;
    const serverOk = isServerUrl(server);
    const topicOk = isTopic(topic);
    const tokenOk = token === '' || isToken(token);
    const nameOk = isName(this.name.input.value);
    const previous = this.mode.way === 'edit' ? this.mode.destination.key : undefined;
    const key = destinationKey({ server, topic });
    const duplicate = this.destinations.some((item) => item.key === key && item.key !== previous);
    // A saved value that is wrong shows its error at once; a new one after the field is left.
    const shown = (field: Field) => field.touched || previous !== undefined;

    this.server.showError(
      server !== '' && !serverOk && shown(this.server) ? s.serverInvalid : undefined,
    );
    this.topic.showError(
      topic !== '' && !topicOk && shown(this.topic)
        ? s.topicInvalid
        : duplicate && serverOk && topicOk
          ? s.duplicate
          : undefined,
    );
    this.token.showError(!tokenOk && this.token.touched ? s.tokenInvalid : undefined);
    this.name.showError(nameOk ? undefined : s.nameInvalid);
    this.name.input.placeholder = serverOk ? hostOf(server) : '';
    // Says what the list shows without a name, once there is an address to show.
    this.name.help.textContent = s.nameHelp.replace('{0}', hostOf(server));
    this.name.help.hidden = !serverOk;

    const address = serverOk ? server : s.run.placeholder;
    serverCommands(address).forEach((command, index) => {
      this.commands[index].code.textContent = command;
      // The server's own command needs its address; serve works without it.
      this.commands[index].copy.disabled = index === 0 && !serverOk;
    });
    const subscribe =
      this.mode.way === 'ntfy-sh' || (this.mode.way === 'edit' && hostOf(server) === 'ntfy.sh')
        ? s.steps.topic
        : this.mode.way === 'tailscale'
          ? this.running?.state === 'running'
            ? s.steps.topicExisting
            : s.steps.topicTailscale
          : s.steps.topicOwn;
    setStep(this.topicStep, subscribe, serverOk ? server : s.server);

    const changed =
      this.mode.way !== 'edit' ||
      key !== this.mode.destination.key ||
      this.name.value !== this.mode.destination.name ||
      token !== '';
    this.submit.disabled =
      this.busy || !serverOk || !topicOk || !tokenOk || !nameOk || duplicate || !changed;
    this.submit.textContent = this.busy ? this.sending : s.saveAndTest;
    this.copyTopic.disabled = !topicOk;
    // The prompts wait for the values they name.
    this.ntfyAgent.set(
      serverOk ? fillPrompt(s.prompts.ntfy, [server, ...serverCommands(server)]) : undefined,
    );
    this.tokenAgent.set(
      serverOk && topicOk ? fillPrompt(s.prompts.token, [server, topic]) : undefined,
    );
  }

  private save(): void {
    for (const field of [this.server, this.topic, this.token, this.name]) field.touched = true;
    this.check();
    if (this.submit.disabled) return;
    vscode.postMessage({
      type: 'save',
      ...(this.mode.way === 'edit' ? { previous: this.mode.destination.key } : {}),
      name: this.name.value,
      server: this.server.value,
      topic: this.topic.value,
      token: this.token.value,
      test: true,
    });
  }

  private copiedTimer: ReturnType<typeof setTimeout> | undefined;

  private copied(copy: HTMLButtonElement, text: string): void {
    vscode.postMessage({ type: 'copy', text });
    for (const other of [this.copyTopic, ...this.commands.map((c) => c.copy)]) {
      other.textContent = this.s.copy;
    }
    copy.textContent = this.s.copied;
    clearTimeout(this.copiedTimer);
    this.copiedTimer = setTimeout(() => (copy.textContent = this.s.copy), 2000);
  }
}

interface Step {
  element: HTMLLIElement;
  title: HTMLElement;
  help: HTMLParagraphElement;
  body: HTMLElement;
}

/** A numbered step: its title, what to do, and its controls. */
function step(text: StepText): Step {
  const node = element('li', 'ng-step');
  const title = element('h3', 'ng-step-title', text.title);
  const help = element('p', 'ng-help', text.help);
  const body = element('div', 'ng-step-body');
  node.append(title, help, body);
  return { element: node, title, help, body };
}

/** `{0}` in the help, if any, is the address in bold. */
function setStep(target: Step, text: StepText, address?: string): void {
  target.title.textContent = text.title;
  target.help.replaceChildren(...fill(text.help, element('strong', undefined, address ?? '')));
}

/** Links to the ntfy app in each store. */
function stores(): HTMLElement {
  const row = element('div', 'ng-row ng-stores');
  for (const [store, name] of Object.entries(APP_STORES) as [AppStore, string][]) {
    const link = button(name, 'link');
    link.addEventListener('click', () => vscode.postMessage({ type: 'openAppStore', store }));
    row.append(link);
  }
  return row;
}
