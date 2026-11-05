// The "When you get a notification" card: the rules in plain sentences, and under "Change the
// rules" everything that sets them: what can notify (VS Code's own events, then each connected
// AI agent), when, and what the notification says, with an example. A problem the user has to
// act on stays outside the fold. Every control writes its setting at once, as VS Code's own
// settings do; the next state from the host confirms it.
import {
  AGENT_KINDS,
  CONTENT_LEVELS,
  type AgentKind,
  type ContentLevel,
  type PanelState,
  type PanelStrings,
  type PrefChange,
  type SourceKind,
} from '../shared/protocol';
import { button, element } from './dom';
import { vscode } from './vscodeApi';

/** The minimum durations the list offers, in seconds; a value set elsewhere is added. */
const MINIMUMS = [0, 10, 30, 60, 120, 300, 600, 1800];

/** What VS Code itself reports; the agents follow in rows of their own. */
const VSCODE_KINDS: readonly SourceKind[] = ['task', 'terminal', 'notebook', 'debug'];

export class NotifyCard {
  readonly element = element('div', 'ng-notify');
  private readonly conditions = element('ul', 'ng-conditions');
  private readonly sources = new Map<SourceKind, HTMLInputElement>();
  private readonly agents = new Map<AgentKind, { element: HTMLElement; input: HTMLInputElement }>();
  private readonly agentGroup: HTMLElement;
  private readonly terminalNone = element('p', 'ng-warning');
  private readonly minimum = element('select', 'ng-select');
  private readonly away: HTMLInputElement;
  private readonly levels = new Map<ContentLevel, HTMLInputElement>();
  private readonly previewEmoji = element('span', 'ng-preview-emoji');
  private readonly previewTitle = element('span');
  private readonly previewMessage = element('p', 'ng-preview-message');
  private readonly number: Intl.NumberFormat;
  private state: PanelState | undefined;

  constructor(
    private readonly strings: PanelStrings,
    locale: string,
  ) {
    this.number = new Intl.NumberFormat(locale);

    // The rules, folded under the sentences that say them.
    const rules = element('details', 'ng-details');
    const rulesBody = element('div', 'ng-details-body ng-stack');
    rules.append(element('summary', undefined, strings.changeRules), rulesBody);

    const away = checkbox('ng-away', strings.onlyWhenAway, strings.onlyWhenAwayHelp);
    this.away = away.input;
    this.away.addEventListener('change', () =>
      change({ key: 'onlyWhenAway', on: this.away.checked }),
    );

    const minimum = element('div', 'ng-option');
    const minimumRow = element('div', 'ng-inline');
    const minimumLabel = element('label', 'ng-option-title', strings.minimum);
    minimumLabel.htmlFor = this.minimum.id = 'ng-minimum';
    this.minimum.setAttribute('aria-describedby', 'ng-minimum-help');
    minimumRow.append(minimumLabel, this.minimum);
    const minimumHelp = element('p', 'ng-help', strings.minimumHelp);
    minimumHelp.id = 'ng-minimum-help';
    minimum.append(minimumRow, minimumHelp);
    this.minimum.addEventListener('change', () =>
      change({ key: 'minimumSeconds', seconds: Number(this.minimum.value) }),
    );

    // Three levels, each adding to the one before; the example follows the choice.
    const content = element('div', 'ng-option ng-stack');
    const contentTitle = element('span', 'ng-option-title', strings.content);
    contentTitle.id = 'ng-content-label';
    content.setAttribute('role', 'radiogroup');
    content.setAttribute('aria-labelledby', contentTitle.id);
    content.append(contentTitle);
    for (const level of CONTENT_LEVELS) {
      const radio = choice(`ng-content-${level}`, 'ng-content', strings.contentLevels[level]);
      this.levels.set(level, radio.input);
      content.append(radio.element);
      radio.input.addEventListener('change', () => {
        if (!radio.input.checked) return;
        this.showPreview(level);
        change({ key: 'content', content: level });
      });
    }
    content.append(element('p', 'ng-help', strings.contentHelp));

    // The example follows the level chosen above it.
    const example = element('figure', 'ng-example');
    const card = element('div', 'ng-preview');
    const title = element('p', 'ng-preview-title');
    this.previewEmoji.setAttribute('aria-hidden', 'true');
    title.append(this.previewEmoji, this.previewTitle);
    card.append(title, this.previewMessage);
    example.append(element('figcaption', 'ng-help', strings.previewHelp), card);
    content.append(example);

    // A sentence, then one line for each condition, so each can be read on its own.
    const text = element('div', 'ng-rules');
    text.append(element('p', 'ng-rule', strings.rules.lead), this.conditions);

    // VS Code's events: one checkbox each; the terminal says when it cannot see commands.
    const events = section('ng-events', strings.vscodeEvents);
    for (const kind of VSCODE_KINDS) {
      const check = checkbox(`ng-source-${kind}`, strings.sources[kind]);
      this.sources.set(kind, check.input);
      events.body.append(check.element);
      check.input.addEventListener('change', () =>
        change({ key: 'source', source: kind, on: check.input.checked }),
      );
      if (kind === 'terminal') {
        const learnMore = button(strings.learnMore, 'link');
        learnMore.addEventListener('click', () =>
          vscode.postMessage({ type: 'openShellIntegrationHelp' }),
        );
        this.terminalNone.append(element('span', undefined, strings.terminalNone), ' ', learnMore);
        this.terminalNone.id = 'ng-terminal-none';
        this.terminalNone.hidden = true;
        const help = element('p', 'ng-help', strings.terminalHelp);
        help.id = 'ng-terminal-help';
        check.input.setAttribute('aria-describedby', `${help.id} ${this.terminalNone.id}`);
        check.element.append(help);
      }
    }

    // Only the agents that are connected can notify; the AI agents card connects the others.
    const agents = section('ng-agent-sources', strings.agents);
    this.agentGroup = agents.element;
    for (const agent of AGENT_KINDS) {
      const check = checkbox(`ng-source-${agent}`, strings.sources[agent]);
      this.agents.set(agent, check);
      agents.body.append(check.element);
      check.input.addEventListener('change', () =>
        change({ key: 'source', source: agent, on: check.input.checked }),
      );
    }

    const what = element('div', 'ng-stack');
    what.append(events.element, agents.element);
    rulesBody.append(what, away.element, minimum, content);
    this.element.append(text, this.terminalNone, rules);
  }

  show(state: PanelState): void {
    this.state = state;
    const { prefs, terminals } = state;
    for (const [kind, input] of this.sources) input.checked = prefs.sources[kind];
    for (const [agent, check] of this.agents) {
      const hooks = state[agent].hooks;
      check.element.hidden = hooks !== 'connected' && hooks !== 'outdated';
      check.input.checked = prefs.sources[agent];
    }
    this.agentGroup.hidden = [...this.agents.values()].every((check) => check.element.hidden);
    this.terminalNone.hidden = !(terminals.open > 0 && terminals.reporting === 0);

    const options = MINIMUMS.includes(prefs.minimumSeconds)
      ? MINIMUMS
      : [...MINIMUMS, prefs.minimumSeconds].sort((a, b) => a - b);
    this.minimum.replaceChildren(
      ...options.map((seconds) => {
        const option = element('option', undefined, this.duration(seconds));
        option.value = String(seconds);
        return option;
      }),
    );
    this.minimum.value = String(prefs.minimumSeconds);
    this.away.checked = prefs.onlyWhenAway;
    const rules = this.strings.rules;
    this.conditions.replaceChildren(
      element('li', undefined, prefs.onlyWhenAway ? rules.away : rules.present),
      element(
        'li',
        undefined,
        prefs.minimumSeconds > 0
          ? rules.minimum.replace('{0}', this.duration(prefs.minimumSeconds))
          : rules.anyDuration,
      ),
    );

    for (const [level, input] of this.levels) input.checked = level === prefs.content;
    this.showPreview(prefs.content);
  }

  private showPreview(level: ContentLevel): void {
    const preview = this.state?.previews[level];
    if (!preview) return;
    this.previewEmoji.textContent = preview.emoji;
    this.previewTitle.textContent = preview.title;
    this.previewMessage.textContent = preview.message;
  }

  private duration(seconds: number): string {
    const s = this.strings;
    if (seconds === 0) return s.noMinimum;
    if (seconds === 60) return s.oneMinute;
    return seconds % 60 === 0
      ? s.minutes.replace('{0}', this.number.format(seconds / 60))
      : s.seconds.replace('{0}', this.number.format(seconds));
  }
}

function change(change: PrefChange): void {
  vscode.postMessage({ type: 'setPref', change });
}

/** A titled list of checkboxes. */
function section(id: string, title: string) {
  const node = element('div', 'ng-group');
  const heading = element('h3', 'ng-group-title', title);
  heading.id = `${id}-title`;
  const body = element('div', 'ng-stack');
  body.setAttribute('role', 'group');
  body.setAttribute('aria-labelledby', heading.id);
  node.append(heading, body);
  return { element: node, body };
}

function checkbox(id: string, label: string, help?: string) {
  return toggle('checkbox', id, undefined, label, help);
}

function choice(id: string, name: string, label: string) {
  return toggle('radio', id, name, label);
}

function toggle(
  type: 'checkbox' | 'radio',
  id: string,
  name: string | undefined,
  label: string,
  help?: string,
) {
  const wrapper = element('div', 'ng-check');
  const input = element('input', `ng-${type}`);
  input.type = type;
  input.id = id;
  if (name) input.name = name;
  const labelNode = element('label', undefined, label);
  labelNode.htmlFor = id;
  wrapper.append(input, labelNode);
  if (help) {
    const helpNode = element('p', 'ng-help', help);
    helpNode.id = `${id}-help`;
    input.setAttribute('aria-describedby', helpNode.id);
    wrapper.append(helpNode);
  }
  return { element: wrapper, input };
}
