import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { panelStrings, type Translate } from '../../src/extension/texts';
import { fillPrompt, serverCommands } from '../../src/shared/guide';

const format = (text: string, args: Array<string | number>) =>
  text.replace(/\{(\d+)\}/g, (_, index: string) => String(args[Number(index)]));
const english: Translate = (text, ...args) => format(text, args);
const bundle = JSON.parse(readFileSync('l10n/bundle.l10n.tr.json', 'utf8')) as Record<
  string,
  string
>;
const turkish: Translate = (text, ...args) => format(bundle[text] ?? text, args);

const address = 'https://box.tail1234.ts.net';

for (const [language, t] of [
  ['English', english],
  ['Turkish', turkish],
] as const) {
  describe(`the prompts in ${language}`, () => {
    const { prompts } = panelStrings(t).destinations;

    it('gives the agent the address and both commands to run on the server', () => {
      const prompt = fillPrompt(prompts.ntfy, [address, ...serverCommands(address)]);
      const lines = prompt.split('\n');
      for (const command of serverCommands(address)) expect(lines).toContain(command);
      expect(prompt).toContain(`${address}/v1/health`);
      expect(prompt).toContain('127.0.0.1:2586');
      expect(prompt).not.toMatch(/\{\d+\}/);
    });

    it('names the server and the topic the token is for', () => {
      const prompt = fillPrompt(prompts.token, ['https://ntfy.example.com', 'my-topic']);
      expect(prompt.split('\n')).toContain('ntfy access nightping my-topic write-only');
      expect(prompt).toContain('https://ntfy.example.com');
      expect(prompt).not.toMatch(/\{\d+\}/);
    });

    it('asks before installing or changing anything, in every prompt', () => {
      const last = (lines: string[]) => lines[lines.length - 1];
      expect(last(prompts.tailscale)).toBe(last(prompts.ntfy));
      expect(last(prompts.token)).toBe(last(prompts.ntfy));
      expect(fillPrompt(prompts.tailscale, [])).not.toMatch(/\{\d+\}/);
    });
  });
}

describe('fillPrompt', () => {
  it('joins the lines and leaves a placeholder without a value as it is', () => {
    expect(fillPrompt(['a {0}', '', '{1} b {2}'], ['x', 'y'])).toBe('a x\n\ny b {2}');
  });
});
