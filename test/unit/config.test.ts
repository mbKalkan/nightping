import { describe, expect, it } from 'vitest';
import { readDestination } from '../../src/extension/config';

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
