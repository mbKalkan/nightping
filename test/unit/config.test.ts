import { describe, expect, it } from 'vitest';
import {
  destinationKey,
  displayName,
  isName,
  isToken,
  isTopic,
  legacyDestinations,
  normalizeServer,
  readDestinations,
  storedForm,
  suggestTopic,
} from '../../src/extension/config';

const one = (server: unknown, topic: unknown) => readDestinations([{ server, topic }]);

describe('readDestinations', () => {
  it('is incomplete until there is a destination', () => {
    for (const value of [undefined, null, [], {}, 'https://ntfy.sh', [42, null, 'x']]) {
      expect(readDestinations(value), JSON.stringify(value)).toEqual({
        kind: 'incomplete',
        entries: [],
      });
    }
  });

  it('accepts a server with a path and drops trailing slashes and spaces', () => {
    expect(one(' https://example.com/ntfy/ ', ' my_topic-1 ')).toEqual({
      kind: 'ready',
      entries: [
        {
          key: 'https://example.com/ntfy/my_topic-1',
          name: '',
          server: 'https://example.com/ntfy',
          topic: 'my_topic-1',
          enabled: true,
        },
      ],
    });
  });

  it('accepts plain http for servers on a private network', () => {
    expect(one('http://192.168.1.20:2586', 'alerts').kind).toBe('ready');
  });

  it('marks a server that is not a plain http or https URL', () => {
    for (const server of [
      '',
      'ntfy.sh',
      'ftp://ntfy.sh',
      'https://user:secret@ntfy.sh',
      'https://ntfy.sh/?topic=x',
      'https://ntfy.sh/#x',
      'javascript:alert(1)',
      42,
    ]) {
      const state = one(server, 'alerts');
      expect(state.kind, String(server)).toBe('invalid');
      expect(state.entries[0].problem, String(server)).toBe('server');
    }
  });

  it('follows ntfy topic rules', () => {
    expect(one('https://ntfy.sh', 'a'.repeat(64)).kind).toBe('ready');
    for (const topic of ['', 'a'.repeat(65), 'my topic', 'tópico', 'a/b', 'a.b']) {
      const state = one('https://ntfy.sh', topic);
      expect(state.kind, topic).toBe('invalid');
      expect(state.entries[0].problem, topic).toBe('topic');
    }
  });

  it('keeps the name and lists a turned-off destination', () => {
    const state = readDestinations([
      { name: ' Home ', server: 'https://ntfy.example.com', topic: 'a', enabled: false },
    ]);
    expect(state.kind).toBe('off');
    expect(state.entries[0]).toMatchObject({ name: 'Home', enabled: false });
  });

  it('is ready while one destination that is on is valid, and lists the rest', () => {
    const state = readDestinations([
      { server: 'ntfy.sh', topic: 'a' },
      { server: 'https://ntfy.sh', topic: 'b', enabled: false },
      { server: 'https://ntfy.example.com', topic: 'c' },
    ]);
    expect(state.kind).toBe('ready');
    expect(state.entries.map((entry) => entry.problem)).toEqual(['server', undefined, undefined]);
  });

  it('lists the same server and topic once', () => {
    const state = readDestinations([
      { name: 'First', server: 'https://ntfy.sh/', topic: 'a' },
      { name: 'Again', server: 'https://ntfy.sh', topic: ' a ' },
    ]);
    expect(state.entries.map((entry) => entry.name)).toEqual(['First']);
  });
});

describe('storedForm', () => {
  it('writes only what differs from the defaults', () => {
    expect(
      storedForm({ name: ' ', server: 'https://ntfy.sh/', topic: ' a ', enabled: true }),
    ).toEqual({ server: 'https://ntfy.sh', topic: 'a' });
    expect(
      storedForm({ name: 'Home', server: 'https://ntfy.sh', topic: 'a', enabled: false }),
    ).toEqual({ name: 'Home', server: 'https://ntfy.sh', topic: 'a', enabled: false });
  });
});

describe('legacyDestinations', () => {
  it('turns the server and topic of 0.1.0 into the first destination', () => {
    expect(legacyDestinations(' https://ntfy.example.com/ ', ' alerts ', undefined)).toEqual([
      { server: 'https://ntfy.example.com', topic: 'alerts' },
    ]);
  });

  it('leaves saved destinations alone, and needs both values', () => {
    expect(legacyDestinations('https://ntfy.sh', 'a', [])).toBeUndefined();
    expect(legacyDestinations('https://ntfy.sh', '', undefined)).toBeUndefined();
    expect(legacyDestinations(undefined, 'a', undefined)).toBeUndefined();
  });
});

describe('destinationKey and displayName', () => {
  it('tells destinations apart by server and topic', () => {
    expect(destinationKey({ server: 'https://ntfy.sh/', topic: ' a ' })).toBe('https://ntfy.sh/a');
  });

  it('shows the name, or the host without one', () => {
    expect(displayName({ name: 'Phone', server: 'https://ntfy.sh' })).toBe('Phone');
    expect(displayName({ name: ' ', server: 'https://box.tail1234.ts.net:8443' })).toBe(
      'box.tail1234.ts.net:8443',
    );
  });

  it('keeps names short', () => {
    expect(isName('a'.repeat(40))).toBe(true);
    expect(isName('a'.repeat(41))).toBe(false);
  });
});

describe('normalizeServer', () => {
  it('stores the server the way it is used', () => {
    expect(normalizeServer('  https://ntfy.example.com/ntfy//  ')).toBe(
      'https://ntfy.example.com/ntfy',
    );
  });
});

describe('isToken', () => {
  it('takes what an HTTP header can carry', () => {
    expect(isToken('tk_AgQdq7mVBoFD37zQVN29RhuMzNIz2')).toBe(true);
    for (const token of ['', 'tk abc', 'tk\tabc', 'tökén', 'tk\nabc']) {
      expect(isToken(token), JSON.stringify(token)).toBe(false);
    }
  });
});

describe('suggestTopic', () => {
  it('suggests a valid, long and different topic each time', () => {
    const topics = new Set(Array.from({ length: 50 }, suggestTopic));
    expect(topics.size).toBe(50);
    for (const topic of topics) {
      expect(isTopic(topic), topic).toBe(true);
      expect(topic).toMatch(/^nightping-[a-z0-9]{20}$/);
    }
  });
});
