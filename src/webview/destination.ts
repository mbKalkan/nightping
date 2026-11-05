// The "Where notifications go" card. With no destination yet it asks how notifications should
// reach the phone and walks through that way step by step. Then it lists the destinations, each
// with a test, a change and a removal, and a way to add another.
import { displayName, hostOf } from '../shared/destination';
import {
  SETUP_WAYS,
  type DestinationStrings,
  type DestinationView,
  type PanelState,
  type SetupWay,
  type TailscaleView,
} from '../shared/protocol';
import { DestinationForm, type FormMode } from './destinationForm';
import { button, element, fill } from './dom';
import { vscode } from './vscodeApi';

type View = 'list' | 'choose' | 'form';

export class DestinationCard {
  readonly element = element('div', 'ng-destination');
  private readonly list = element('ul', 'ng-dest-list');
  private readonly add: HTMLButtonElement;
  private readonly chooser = element('div', 'ng-chooser');
  private readonly chooserCancel: HTMLButtonElement;
  private readonly form: DestinationForm;
  private readonly result = element('p', 'ng-result');
  private destinations: DestinationView[] = [];
  private view: View = 'list';
  private busy = false;
  private readonly testButtons: HTMLButtonElement[] = [];

  constructor(
    private readonly s: DestinationStrings,
    private readonly sending: string,
    private readonly time: (ms: number) => string,
  ) {
    this.list.setAttribute('aria-label', s.title);
    this.add = button(s.add, 'secondary');
    const addRow = element('div', 'ng-row ng-add');
    addRow.append(this.add);

    const ways = element('div', 'ng-ways');
    for (const way of SETUP_WAYS) {
      const tile = element('button', 'ng-way');
      tile.type = 'button';
      const title = element('span', 'ng-way-title', s.ways[way].title);
      if (way === 'ntfy-sh') title.append(' ', element('span', 'ng-badge', s.easiest));
      tile.append(title, element('span', 'ng-way-help', s.ways[way].help));
      tile.addEventListener('click', () => this.openForm({ way }));
      ways.append(tile);
    }
    this.chooserCancel = button(s.cancel, 'secondary');
    const lead = element('h3', 'ng-step-title', s.chooseLead);
    this.chooser.append(lead, ways, this.chooserCancel);

    this.form = new DestinationForm(s, sending, (how) =>
      this.show(how === 'back' ? 'choose' : 'list'),
    );

    this.result.setAttribute('role', 'status');
    this.result.setAttribute('aria-live', 'polite');
    this.element.append(this.list, addRow, this.chooser, this.form.element, this.result);

    this.add.addEventListener('click', () => {
      this.show('choose');
      this.chooser.querySelector<HTMLElement>('.ng-way')?.focus();
    });
    this.chooserCancel.addEventListener('click', () => this.show('list'));
  }

  show(view: View): void;
  show(state: PanelState): void;
  show(arg: View | PanelState): void {
    if (typeof arg === 'string') {
      this.view = arg;
    } else {
      const hadAny = this.destinations.length > 0;
      this.destinations = arg.destinations;
      // A first destination saved elsewhere, such as from the Command Palette, ends the choice.
      if (!hadAny && this.destinations.length > 0 && this.view === 'choose') this.view = 'list';
      this.renderList();
      this.form.update(this.destinations);
    }
    // With nothing listed, the card always offers the ways; there is no list to go back to.
    if (this.view === 'list' && this.destinations.length === 0) this.view = 'choose';
    this.list.hidden = this.view !== 'list';
    this.add.parentElement!.hidden = this.view !== 'list';
    this.chooser.hidden = this.view !== 'choose';
    this.chooserCancel.hidden = this.destinations.length === 0;
    this.form.element.hidden = this.view !== 'form';
  }

  /** The Command Palette asked for a way's guide. */
  guide(way: SetupWay): void {
    this.openForm({ way });
  }

  setBusy(busy: boolean): void {
    this.busy = busy;
    this.form.setBusy(busy);
    for (const test of this.testButtons) {
      test.disabled = busy || test.dataset.problem !== undefined;
      test.textContent = busy ? this.sending : this.s.sendTest;
      test.setAttribute('aria-label', `${test.textContent}: ${test.dataset.name ?? ''}`);
    }
  }

  /** The form was saved: back to the list, where the test result comes. */
  saved(): void {
    this.show('list');
  }

  notSaved(error: string): void {
    this.say(error, true);
  }

  sent(time: number, error?: string, to?: string): void {
    if (error !== undefined) {
      this.say(error, true);
    } else if (to !== undefined) {
      this.say(this.s.sentTo.replace('{0}', this.time(time)).replace('{1}', to));
    } else {
      this.say(this.s.sentAt.replace('{0}', this.time(time)));
    }
  }

  showTailscale(status: TailscaleView): void {
    this.form.showTailscale(status);
  }

  private openForm(mode: FormMode): void {
    this.say('');
    this.form.open(mode, this.destinations);
    this.show('form');
    this.form.focus();
  }

  private say(text: string, failed = false): void {
    this.result.textContent = text;
    this.result.classList.toggle('ng-failed', failed);
    this.result.classList.toggle('ng-ok', !failed && text !== '');
  }

  private renderList(): void {
    const s = this.s;
    // One destination that is on has nothing to switch: Pause stops it for a while. One that is
    // off, though, needs its box to come back on.
    const several =
      this.destinations.length > 1 || this.destinations.some((destination) => !destination.enabled);
    this.testButtons.length = 0;
    this.list.replaceChildren(
      ...this.destinations.map((destination, index) => {
        const row = element('li', 'ng-dest');
        row.classList.toggle('ng-off', !destination.enabled);
        const id = `ng-dest-${index}`;
        if (several) {
          const box = element('input', 'ng-checkbox');
          box.type = 'checkbox';
          box.id = id;
          box.checked = destination.enabled;
          // The box says what it does, not only whose it is.
          box.title = s.sendHere;
          box.setAttribute('aria-label', `${s.sendHere}: ${displayName(destination)}`);
          box.addEventListener('change', () =>
            vscode.postMessage({ type: 'setEnabled', key: destination.key, enabled: box.checked }),
          );
          row.append(box);
        }
        const text = element('div', 'ng-dest-text');
        const name = element(several ? 'label' : 'span', 'ng-dest-name', displayName(destination));
        if (name instanceof HTMLLabelElement) name.htmlFor = id;
        const where = element('p', 'ng-help');
        const topic = element('strong', undefined, destination.topic);
        // Without a name the host is the title already.
        where.append(
          ...(destination.name.trim() === ''
            ? fill(s.topicOnly, topic)
            : fill(s.topicOn, topic, element('strong', undefined, hostOf(destination.server)))),
        );
        text.append(name, where);
        if (!destination.enabled) text.append(element('p', 'ng-help', s.offNote));
        if (destination.problem) {
          text.append(element('p', 'ng-warning', s.problem[destination.problem]));
        }

        const test = button(this.busy ? this.sending : s.sendTest, 'secondary');
        test.dataset.name = displayName(destination);
        if (destination.problem) test.dataset.problem = destination.problem;
        test.disabled = this.busy || destination.problem !== undefined;
        this.testButtons.push(test);
        const edit = button(s.edit, 'secondary');
        const remove = button(s.remove, 'secondary');
        // Screen readers hear which destination each button is for.
        for (const action of [test, edit, remove]) {
          action.setAttribute('aria-label', `${action.textContent}: ${displayName(destination)}`);
        }
        const actions = element('div', 'ng-dest-actions');
        actions.append(test, edit, remove);
        test.addEventListener('click', () =>
          vscode.postMessage({ type: 'sendTest', key: destination.key }),
        );
        edit.addEventListener('click', () => this.openForm({ way: 'edit', destination }));
        remove.addEventListener('click', () =>
          vscode.postMessage({ type: 'removeDestination', key: destination.key }),
        );
        row.append(text, actions);
        return row;
      }),
    );
  }
}
