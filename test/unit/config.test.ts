import { describe, expect, it } from 'vitest';
import {
  isToken,
  isTopic,
  normalizeServer,
  readDestination,
  suggestTopic,
} from '../../src/extension/config';

const read = (server: unknown, topic: unknown) =>
  readDestination((key) => (key === 'server' ? server : topic));

describe('readDestination', () => {
  it('is incomplete until both the server and the topic are set', () => {
    expect(read('', '')).toEqual({ kind: 'incomplete' });
    expect(read('https://ntfy.sh', '')).toEqual({ kind: 'incomplete' });
    expect(read('', 'my-topic')).toEqual({ kind: 'incomplete' });
    expect(read('   ', ' ')).toEqual({ kind: 'incomplete' });
    expect(read(undefined, 42)).toEqual({ kind: 'incomplete' });
  });

  it('accepts a server with a path and drops trailing slashes and spaces', () => {
    expect(read(' https://example.com/ntfy/ ', ' my_topic-1 ')).toEqual({
      kind: 'ready',
      destination: { server: 'https://example.com/ntfy', topic: 'my_topic-1' },
    });
  });

  it('accepts plain http for servers on a private network', () => {
    expect(read('http://192.168.1.20:2586', 'alerts').kind).toBe('ready');
  });

  it('rejects servers that are not plain http or https URLs', () => {
    for (const server of [
      'ntfy.sh',
      'ftp://ntfy.sh',
      'https://user:secret@ntfy.sh',
      'https://ntfy.sh/?topic=x',
      'https://ntfy.sh/#x',
      'javascript:alert(1)',
    ]) {
      expect(read(server, 'alerts'), server).toEqual({ kind: 'invalid', setting: 'server' });
    }
  });

  it('follows ntfy topic rules', () => {
    expect(read('https://ntfy.sh', 'a'.repeat(64)).kind).toBe('ready');
    for (const topic of ['a'.repeat(65), 'my topic', 'tópico', 'a/b', 'a.b']) {
      expect(read('https://ntfy.sh', topic), topic).toEqual({ kind: 'invalid', setting: 'topic' });
    }
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
