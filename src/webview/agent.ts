// The "AI agents" card: one row per agent with its state and one action (Connect, or Disconnect
// once Nightping's hooks are in the agent's settings), and one "How it works" for all of them.
// Turning an agent's notifications on and off is a rule, so its checkbox is under the rules.
import {
  AGENT_KINDS,
  type AgentKind,
  type AgentStatus,
  type AgentStrings,
  type PanelState,
  type PanelStrings,
} from '../shared/protocol';
import { button, element } from './dom';
import { vscode } from './vscodeApi';

/** The status dot, as the header's status uses it. */
const DOT: Record<AgentStatus['hooks'], string> = {
  connected: 'ready',
  outdated: 'invalid',
  disconnected: 'incomplete',
  invalid: 'error',
};

export class AgentsCard {
  readonly element = element('div', 'ng-agents');
  private readonly rows = new Map<AgentKind, AgentRow>();
  private readonly details = element('details', 'ng-details');
  private problem = false;

  constructor(strings: PanelStrings) {
    const list = element('div', 'ng-agent-list');
    list.setAttribute('role', 'list');
    const body = element('div', 'ng-details-body ng-explain');
    for (const agent of AGENT_KINDS) {
      const row = new AgentRow(agent, strings[agent], strings.openSettings);
      this.rows.set(agent, row);
      list.append(row.element);
      body.append(row.explain);
    }
    this.details.append(element('summary', undefined, strings.claude.howItWorks), body);
    this.element.append(
      element('p', 'ng-help ng-card-help', strings.agentsHelp),
      list,
      this.details,
    );
  }

  show(state: PanelState): void {
    let problem = false;
    for (const [agent, row] of this.rows) problem = row.show(state[agent]) || problem;
    // A problem opens the explanation once; the user may close it again.
    if (problem && !this.problem) this.details.open = true;
    this.problem = problem;
  }
}

class AgentRow {
  readonly element = element('div', 'ng-agent');
  /** What this agent's hooks do and where they are, under the card's "How it works". */
  readonly explain = element('div', 'ng-explain-item');
  private readonly state = element('span', 'ng-status');
  private readonly connect: HTMLButtonElement;
  private readonly disconnect: HTMLButtonElement;
  private readonly nextStep = element('p', 'ng-warning');
  private readonly portBusy = element('p', 'ng-warning');
  private readonly portBusyText = element('span');
  private readonly help = element('p', 'ng-help');
  private readonly receiving = element('p', 'ng-help');
  private readonly receivingHelp: HTMLParagraphElement;

  constructor(
    agent: AgentKind,
    private readonly strings: AgentStrings,
    openSettings: string,
  ) {
    this.element.setAttribute('role', 'listitem');
    this.element.setAttribute('aria-label', strings.title);
    const name = element('span', 'ng-agent-name', strings.title);
    this.state.setAttribute('role', 'status');
    // The same kind of button in the same place, whichever it offers.
    this.connect = button(strings.connect, 'secondary');
    this.disconnect = button(strings.disconnect, 'secondary');
    for (const action of [this.connect, this.disconnect]) {
      action.setAttribute('aria-label', `${action.textContent}: ${strings.title}`);
    }
    const actions = element('div', 'ng-agent-actions');
    actions.append(this.connect, this.disconnect);

    const settings = button(openSettings, 'link');
    this.portBusy.append(this.portBusyText, ' ', settings);
    this.nextStep.textContent = strings.nextStep ?? '';
    this.element.append(name, this.state, actions, this.nextStep, this.portBusy);

    const copy = button(strings.copy, 'secondary');
    copy.setAttribute('aria-label', `${strings.copy}: ${strings.title}`);
    this.receivingHelp = element('p', 'ng-help', strings.receivingHelp);
    this.explain.append(
      element('h3', 'ng-explain-title', strings.title),
      this.help,
      this.receiving,
      this.receivingHelp,
      copy,
    );

    settings.addEventListener('click', () => vscode.postMessage({ type: 'openSettings' }));
    this.connect.addEventListener('click', () =>
      vscode.postMessage({ type: 'connectAgent', agent }),
    );
    this.disconnect.addEventListener('click', () =>
      vscode.postMessage({ type: 'disconnectAgent', agent }),
    );
    copy.addEventListener('click', () => vscode.postMessage({ type: 'copyAgentSettings', agent }));
  }

  /** Shows the agent's state; true when it has a problem the explanation is about. */
  show(status: AgentStatus): boolean {
    const s = this.strings;
    const linked = status.hooks === 'connected' || status.hooks === 'outdated';
    this.state.textContent = s.state[status.hooks];
    this.state.dataset.status = DOT[status.hooks];
    // Connect writes the file, so it is offered only where the file can take it.
    this.connect.hidden = status.hooks === 'connected' || status.hooks === 'invalid';
    this.connect.textContent = status.hooks === 'outdated' ? s.reconnect : s.connect;
    this.connect.setAttribute('aria-label', `${this.connect.textContent}: ${s.title}`);
    this.disconnect.hidden = !linked;
    this.nextStep.hidden = !linked || s.nextStep === undefined;

    // The endpoint is shared: it may run for another agent while this one is not connected.
    this.portBusy.hidden = !linked || status.receiving !== 'other-program';
    this.portBusyText.textContent = s.receivingState['other-program'].replace(
      '{0}',
      String(status.port),
    );
    const listening = status.receiving === 'listening' || status.receiving === 'other-window';
    this.receiving.hidden = this.receivingHelp.hidden = !linked || !listening;
    this.receiving.textContent = s.receivingState[status.receiving].replace(
      '{0}',
      String(status.port),
    );
    this.help.textContent = s.help[status.hooks].replace('{0}', status.file);
    return status.hooks === 'outdated' || status.hooks === 'invalid';
  }
}
