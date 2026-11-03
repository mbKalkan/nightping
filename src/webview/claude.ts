// The "Claude Code" card: whether Nightping's hooks are in Claude Code's settings, buttons to
// connect, disconnect or copy them, and which window receives the events.
import type { ClaudeStatus, PanelStrings } from '../shared/protocol';
import { button, element } from './dom';
import { vscode } from './vscodeApi';

/** The status dot, as the header's status uses it. */
const DOT: Record<ClaudeStatus['hooks'], string> = {
  connected: 'ready',
  outdated: 'invalid',
  disconnected: 'incomplete',
  invalid: 'error',
};

export class ClaudeCard {
  readonly element = element('div', 'ng-claude');
  private readonly state = element('span', 'ng-status');
  private readonly help = element('p', 'ng-help');
  private readonly connect: HTMLButtonElement;
  private readonly disconnect: HTMLButtonElement;
  private readonly receivingField = element('div', 'ng-field');
  private readonly receiving = element('p', 'ng-claude-receiving');

  constructor(private readonly strings: PanelStrings['claude']) {
    this.connect = button(strings.connect, 'primary');
    this.disconnect = button(strings.disconnect, 'secondary');
    const copy = button(strings.copy, 'secondary');
    this.connect.addEventListener('click', () => vscode.postMessage({ type: 'connectClaude' }));
    this.disconnect.addEventListener('click', () =>
      vscode.postMessage({ type: 'disconnectClaude' }),
    );
    copy.addEventListener('click', () => vscode.postMessage({ type: 'copyClaudeSettings' }));

    const hooks = field('ng-claude-hooks', strings.hooks);
    this.state.setAttribute('role', 'status');
    const stateRow = element('div', 'ng-claude-state');
    stateRow.append(this.state);
    const actions = element('div', 'ng-claude-actions');
    actions.append(this.connect, this.disconnect, copy);
    hooks.body.append(stateRow, actions, this.help);

    const receivingLabel = element('span', 'ng-label', strings.receiving);
    receivingLabel.id = 'ng-claude-receiving-label';
    const receivingBody = element('div', 'ng-field-body ng-stack');
    receivingBody.setAttribute('role', 'group');
    receivingBody.setAttribute('aria-labelledby', receivingLabel.id);
    this.receiving.setAttribute('aria-live', 'polite');
    receivingBody.append(this.receiving, element('p', 'ng-help', strings.receivingHelp));
    this.receivingField.append(receivingLabel, receivingBody);

    this.element.append(hooks.element, this.receivingField);
  }

  show(status: ClaudeStatus): void {
    const s = this.strings;
    this.state.textContent = s.state[status.hooks];
    this.state.dataset.status = DOT[status.hooks];
    this.help.textContent = s.help[status.hooks].replace('{0}', status.file);
    // Connect writes the file, so it is offered only where the file can take it.
    this.connect.hidden = status.hooks === 'connected' || status.hooks === 'invalid';
    this.connect.textContent = status.hooks === 'outdated' ? s.reconnect : s.connect;
    this.disconnect.hidden = status.hooks === 'disconnected' || status.hooks === 'invalid';

    this.receivingField.hidden = status.receiving === 'off';
    this.receiving.textContent = s.receivingState[status.receiving].replace(
      '{0}',
      String(status.port),
    );
    this.receiving.classList.toggle('ng-warning', status.receiving === 'other-program');
  }
}

function field(id: string, label: string) {
  const node = element('div', 'ng-field');
  const labelNode = element('span', 'ng-label', label);
  labelNode.id = `${id}-label`;
  const body = element('div', 'ng-field-body ng-stack');
  body.setAttribute('role', 'group');
  body.setAttribute('aria-labelledby', labelNode.id);
  node.append(labelNode, body);
  return { element: node, body };
}
