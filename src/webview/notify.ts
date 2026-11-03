// The "When to notify" card. Every control writes its setting at once, as VS Code's own
// settings do; the next state from the host confirms it.
import {
  CONTENT_LEVELS,
  SOURCE_KINDS,
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

export class NotifyCard {
  readonly element = element('div', 'ng-notify');
  private readonly sources = new Map<SourceKind, HTMLInputElement>();
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

    // Events: one checkbox each; the terminal says when it cannot see commands.
    const events = group('ng-events', strings.events, 'group');
    for (const kind of SOURCE_KINDS) {
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
        check.element.append(help, this.terminalNone);
      }
    }

    // Conditions: how long a run must take, and whether the user must be away.
    const conditions = group('ng-conditions', strings.conditions, 'group');
    const minimumRow = element('div', 'ng-inline');
    const minimumLabel = element('label', undefined, strings.minimum);
    minimumLabel.htmlFor = this.minimum.id = 'ng-minimum';
    this.minimum.setAttribute('aria-describedby', 'ng-minimum-help');
    minimumRow.append(minimumLabel, this.minimum);
    const minimumHelp = element('p', 'ng-help', strings.minimumHelp);
    minimumHelp.id = 'ng-minimum-help';
    const away = checkbox('ng-away', strings.onlyWhenAway, strings.onlyWhenAwayHelp);
    this.away = away.input;
    conditions.body.append(minimumRow, minimumHelp, away.element);
    this.minimum.addEventListener('change', () =>
      change({ key: 'minimumSeconds', seconds: Number(this.minimum.value) }),
    );
    this.away.addEventListener('change', () =>
      change({ key: 'onlyWhenAway', on: this.away.checked }),
    );

    // Content: three levels, each adding to the one before, with a preview of the choice.
    const content = group('ng-content', strings.content, 'radiogroup');
    for (const level of CONTENT_LEVELS) {
      const radio = choice(`ng-content-${level}`, 'ng-content', strings.contentLevels[level]);
      this.levels.set(level, radio.input);
      content.body.append(radio.element);
      radio.input.addEventListener('change', () => {
        if (!radio.input.checked) return;
        this.showPreview(level);
        change({ key: 'content', content: level });
      });
    }
    content.body.append(element('p', 'ng-help', strings.contentHelp));

    const preview = group('ng-preview', strings.preview, 'group');
    const card = element('div', 'ng-preview');
    const title = element('p', 'ng-preview-title');
    this.previewEmoji.setAttribute('aria-hidden', 'true');
    title.append(this.previewEmoji, this.previewTitle);
    card.append(title, this.previewMessage);
    preview.body.append(card, element('p', 'ng-help', strings.previewHelp));

    this.element.append(
      events.element,
      conditions.element,
      content.element,
      preview.element,
      element('p', 'ng-note', strings.appliesNow),
    );
  }

  show(state: PanelState): void {
    this.state = state;
    const { prefs, terminals } = state;
    for (const [kind, input] of this.sources) input.checked = prefs.sources[kind];
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

/** A label on the left and its controls on the right, like the form's fields. */
function group(id: string, label: string, role: 'group' | 'radiogroup') {
  const field = element('div', 'ng-field');
  const labelNode = element('span', 'ng-label', label);
  labelNode.id = `${id}-label`;
  const body = element('div', 'ng-field-body ng-stack');
  body.setAttribute('role', role);
  body.setAttribute('aria-labelledby', labelNode.id);
  field.append(labelNode, body);
  return { element: field, body };
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
