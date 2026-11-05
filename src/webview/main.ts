import './styles/panel.css';
import type {
  HostToWebviewMessage,
  PanelState,
  PanelStrings,
  SentEntry,
  SetupWay,
  TailscaleView,
} from '../shared/protocol';
import { AgentsCard } from './agent';
import { DestinationCard } from './destination';
import { button, element } from './dom';
import { MessageCard } from './message';
import { NotifyCard } from './notify';
import { vscode } from './vscodeApi';

const app = document.getElementById('app') as HTMLElement;

class PanelView {
  private readonly status = element('span', 'ng-status');
  private readonly pause: HTMLButtonElement;
  private readonly destination: DestinationCard;
  private readonly notify: NotifyCard;
  private readonly agents: AgentsCard;
  private readonly message: MessageCard;
  private readonly tagline: HTMLElement;
  /** Shown once a destination is set up; until then only where notifications go. */
  private readonly later: HTMLElement[];
  private readonly history = element('ol', 'ng-history');
  private readonly empty = element('p', 'ng-empty');
  private readonly clear: HTMLButtonElement;
  private readonly time: Intl.DateTimeFormat;
  private readonly dateTime: Intl.DateTimeFormat;
  private state: PanelState | undefined;
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
    const clock = (ms: number) => this.time.format(ms);

    const main = element('main', 'ng-main');
    main.setAttribute('aria-label', strings.title);

    const header = element('header', 'ng-header');
    const heading = element('div', 'ng-heading');
    this.tagline = element('p', 'ng-tagline', strings.tagline);
    heading.append(element('h1', 'ng-title', strings.title), this.tagline);
    this.status.setAttribute('role', 'status');
    // Pause opens VS Code's own list of lengths; Resume ends the pause at once.
    this.pause = button(strings.pause, 'secondary');
    this.pause.hidden = true;
    const side = element('div', 'ng-header-side');
    side.append(this.status, this.pause);
    header.append(heading, side);

    // Where notifications go, then when they come, then the agents, then the rest.
    this.destination = new DestinationCard(strings.destinations, strings.sending, clock);
    const destination = this.card(strings.destinations.title);
    destination.append(this.destination.element);

    this.notify = new NotifyCard(strings, locale);
    const notify = this.card(strings.whenToNotify);
    notify.append(this.notify.element);

    this.agents = new AgentsCard(strings);
    const agents = this.card(strings.agents);
    agents.append(this.agents.element);

    // Sending a message of one's own is for now and then: folded.
    this.message = new MessageCard(strings.message, strings.sending, clock);
    const message = element('details', 'ng-card ng-card-fold');
    const summary = element('summary', 'ng-card-summary');
    summary.append(element('h2', 'ng-card-title', strings.message.title));
    message.append(summary, this.message.element);

    this.clear = button(strings.clearRecent, 'link');
    this.empty.textContent = strings.recentEmpty;
    const recent = this.card(strings.recent, this.clear);
    recent.append(this.history, this.empty, element('p', 'ng-note', strings.recentNote));
    this.history.setAttribute('aria-label', strings.recent);

    const footer = element('footer', 'ng-footer');
    const settings = button(strings.allSettings, 'link');
    footer.append(element('p', 'ng-privacy', strings.privacy), settings);

    this.later = [notify, agents, message, recent];
    main.append(header, destination, notify, agents, message, recent, footer);
    app.replaceChildren(main);

    this.clear.addEventListener('click', () => vscode.postMessage({ type: 'clearHistory' }));
    settings.addEventListener('click', () => vscode.postMessage({ type: 'openSettings' }));
    this.pause.addEventListener('click', () =>
      vscode.postMessage({ type: this.state?.pause ? 'resume' : 'pause' }),
    );
  }

  show(state: PanelState): void {
    this.state = state;
    this.showStatus(state);
    this.destination.show(state);
    this.notify.show(state);
    this.agents.show(state);
    this.message.show(state);
    // First things first: until a destination works, the rest would only be in the way.
    const setUp = state.destinations.length > 0;
    for (const card of this.later) card.hidden = !setUp;
    this.tagline.hidden = setUp;
    this.renderHistory(state.history);
  }

  setBusy(busy: boolean): void {
    this.destination.setBusy(busy);
  }

  saved(): void {
    this.destination.saved();
  }

  notSaved(error: string): void {
    this.destination.notSaved(error);
  }

  sent(time: number, error?: string, to?: string, needsToken?: string): void {
    this.destination.sent(time, error, to, needsToken);
  }

  tailscale(status: TailscaleView): void {
    this.destination.showTailscale(status);
  }

  serverCheck(server: string, running: boolean): void {
    this.destination.serverCheck(server, running);
  }

  guide(way: SetupWay): void {
    this.destination.guide(way);
  }

  messageSent(time: number, error?: string): void {
    this.message.sent(time, error);
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

  private renderHistory(entries: SentEntry[]): void {
    this.history.replaceChildren(
      ...entries.map((entry) => {
        const kind =
          entry.error === undefined ? 'ng-ok' : entry.partial ? 'ng-partial' : 'ng-failed';
        const item = element('li', `ng-entry ${kind}`);
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
          entry.error === undefined
            ? this.strings.sent
            : entry.partial
              ? this.strings.partlySent
              : this.strings.notSent,
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
  } else if (message.type === 'notSaved') {
    panel?.notSaved(message.error);
  } else if (message.type === 'result') {
    panel?.sent(message.time, message.error, message.to, message.needsToken);
  } else if (message.type === 'tailscale') {
    panel?.tailscale(message.status);
  } else if (message.type === 'serverCheck') {
    panel?.serverCheck(message.server, message.running);
  } else if (message.type === 'guide') {
    panel?.guide(message.way);
  } else if (message.type === 'messageResult') {
    panel?.messageSent(message.time, message.error);
  }
});

vscode.postMessage({ type: 'ready' });
