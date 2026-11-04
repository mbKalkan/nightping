// An agent's row in "When you get a notification". Until Nightping's hooks are in the agent's
// settings the row offers Connect; once they are, a checkbox turns its notifications on and off.
// Files, ports and Copy Settings wait under "How it works".
import type { AgentKind, AgentStatus, AgentStrings } from '../shared/protocol';
import { button, element } from './dom';
import { vscode } from './vscodeApi';

/** The status dot, as the header's status uses it. */
const DOT: Record<AgentStatus['hooks'], string> = {
  connected: 'ready',
  outdated: 'invalid',
  disconnected: 'incomplete',
  invalid: 'error',
};

export class AgentRow {
  readonly element = element('div', 'ng-agent');
  readonly input = element('input', 'ng-checkbox');
  private readonly state = element('span', 'ng-status');
  private readonly connect: HTMLButtonElement;
  private readonly disconnect: HTMLButtonElement;
  private readonly nextStep = element('p', 'ng-warning');
  private readonly portBusy = element('p', 'ng-warning');
  private readonly portBusyText = element('span');
  private readonly details = element('details', 'ng-details');
  private readonly help = element('p', 'ng-help');
  private readonly receiving = element('p', 'ng-help');
  private readonly receivingHelp: HTMLParagraphElement;
  private problem = false;

  constructor(
    agent: AgentKind,
    label: string,
    private readonly strings: AgentStrings,
    openSettings: string,
  ) {
    this.element.setAttribute('role', 'group');
    this.element.setAttribute('aria-label', strings.title);
    this.input.type = 'checkbox';
    this.input.id = `ng-source-${agent}`;
    const labelNode = element('label', 'ng-agent-label', label);
    labelNode.htmlFor = this.input.id;

    // The state and the buttons sit in columns of the whole list, so rows line up.
    this.connect = button(strings.connect, 'secondary');
    this.disconnect = button(strings.disconnect, 'link');
    this.state.setAttribute('role', 'status');
    const actions = element('div', 'ng-agent-actions');
    actions.append(this.connect, this.disconnect);
    const side = element('div', 'ng-agent-side');
    side.append(this.state, actions);

    const settings = button(openSettings, 'link');
    this.portBusy.append(this.portBusyText, ' ', settings);

    const copy = button(strings.copy, 'secondary');
    this.receivingHelp = element('p', 'ng-help', strings.receivingHelp);
    const body = element('div', 'ng-details-body');
    body.append(this.help, this.receiving, this.receivingHelp, copy);
    this.details.append(element('summary', undefined, strings.howItWorks), body);
    this.nextStep.textContent = strings.nextStep ?? '';

    this.element.append(this.input, labelNode, side, this.nextStep, this.portBusy, this.details);

    settings.addEventListener('click', () => vscode.postMessage({ type: 'openSettings' }));

    this.connect.addEventListener('click', () =>
      vscode.postMessage({ type: 'connectAgent', agent }),
    );
    this.disconnect.addEventListener('click', () =>
      vscode.postMessage({ type: 'disconnectAgent', agent }),
    );
    copy.addEventListener('click', () => vscode.postMessage({ type: 'copyAgentSettings', agent }));
  }

  show(status: AgentStatus, on: boolean): void {
    const s = this.strings;
    const linked = status.hooks === 'connected' || status.hooks === 'outdated';
    // Without hooks there is nothing to turn on; disabled, so the label cannot tick it either.
    this.input.hidden = !linked;
    this.input.disabled = !linked;
    this.input.checked = on;
    this.state.textContent = s.state[status.hooks];
    this.state.dataset.status = DOT[status.hooks];
    // Connect writes the file, so it is offered only where the file can take it.
    this.connect.hidden = status.hooks === 'connected' || status.hooks === 'invalid';
    this.connect.textContent = status.hooks === 'outdated' ? s.reconnect : s.connect;
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

    // A problem opens the explanation once; the user may close it again.
    const problem = status.hooks === 'outdated' || status.hooks === 'invalid';
    if (problem && !this.problem) this.details.open = true;
    this.problem = problem;
  }
}
