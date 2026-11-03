// Payloads are synthetic, shaped like Claude Code's documented hook input and the fields seen in
// the spike (no real session content).
import { describe, expect, it } from 'vitest';
import { readHook } from '../../src/extension/claude/payload';

const base = {
  session_id: 'session-1',
  transcript_path: '/home/user/.claude/projects/x/session-1.jsonl',
  cwd: '/home/user/projects/my-app',
  permission_mode: 'default',
};

describe('readHook', () => {
  it('starts a turn on a prompt, without keeping the prompt', () => {
    expect(
      readHook({ ...base, hook_event_name: 'UserPromptSubmit', prompt: 'secret plans' }),
    ).toEqual({ kind: 'prompt', session: 'session-1' });
  });

  it('ends the turn on Stop, with the folder and the reply', () => {
    expect(
      readHook({
        ...base,
        hook_event_name: 'Stop',
        stop_hook_active: false,
        last_assistant_message: 'Done. The tests pass.',
        background_tasks: [
          { id: 'b1', type: 'shell', status: 'running', description: 'dev server' },
        ],
      }),
    ).toEqual({
      kind: 'stop',
      session: 'session-1',
      cwd: '/home/user/projects/my-app',
      reply: 'Done. The tests pass.',
    });
  });

  it('waits while a subagent still runs, since Claude goes on after it', () => {
    expect(
      readHook({
        ...base,
        hook_event_name: 'Stop',
        background_tasks: [{ id: 'a1', type: 'subagent', status: 'running' }],
      }),
    ).toBeUndefined();
    expect(
      readHook({
        ...base,
        hook_event_name: 'Stop',
        background_tasks: [{ id: 'a1', type: 'subagent', status: 'completed' }],
      })?.kind,
    ).toBe('stop');
  });

  it('tells a permission prompt from a question', () => {
    const notification = (notification_type: string, message: string) =>
      readHook({ ...base, hook_event_name: 'Notification', notification_type, message });
    expect(notification('permission_prompt', 'Claude needs your permission to use Bash')).toEqual({
      kind: 'needs',
      session: 'session-1',
      cwd: '/home/user/projects/my-app',
      need: 'approval',
      message: 'Claude needs your permission to use Bash',
    });
    expect(
      notification('permission_prompt', 'Claude needs your permission to use AskUserQuestion'),
    ).toMatchObject({ need: 'question' });
    expect(notification('elicitation_dialog', 'An MCP server asks for input')).toMatchObject({
      need: 'question',
    });
  });

  it('skips notifications that are not about the user turn', () => {
    for (const type of ['idle_prompt', 'auth_success', 'agent_completed', 'plugin_notification']) {
      expect(
        readHook({
          ...base,
          hook_event_name: 'Notification',
          notification_type: type,
          message: 'x',
        }),
        type,
      ).toBeUndefined();
    }
    expect(readHook({ ...base, hook_event_name: 'SubagentStop' })).toBeUndefined();
  });

  it('takes nothing on trust from the payload', () => {
    for (const payload of [null, 'Stop', [], 42, { hook_event_name: 7 }]) {
      expect(readHook(payload), JSON.stringify(payload)).toBeUndefined();
    }
    const odd = readHook({
      hook_event_name: 'Stop',
      session_id: 12,
      cwd: { path: '/' },
      last_assistant_message: 'x'.repeat(10_000),
    });
    expect(odd).toMatchObject({ kind: 'stop', session: 'default', cwd: undefined });
    expect(odd?.kind === 'stop' && odd.reply?.length).toBe(4000);
  });
});
