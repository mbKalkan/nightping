// Listens for runs that finish in this window and reports each one with its duration.
// A run that started before Nightping did is not reported: its start time is unknown.
import * as vscode from 'vscode';
import type { FinishedEvent } from './events';

export function watchSources(report: (event: FinishedEvent) => void): vscode.Disposable {
  const started = Date.now();
  const tasks = new Map<vscode.TaskExecution, number>();
  const commands = new Map<vscode.TerminalShellExecution, number>();
  const sessions = new Map<vscode.DebugSession, number>();
  // A cell reports the end of a run once, however often its document changes afterwards.
  const cellEnds = new WeakMap<vscode.NotebookCell, number>();
  // A task runs in a terminal with shell integration too; its command is the task itself, which
  // the task event reports. These are the shells tasks run in, by process ID.
  const taskShells = new Set<number>();

  return vscode.Disposable.from(
    vscode.tasks.onDidStartTaskProcess((event) => {
      tasks.set(event.execution, Date.now());
      taskShells.add(event.processId);
    }),
    vscode.tasks.onDidEndTaskProcess((event) => {
      const start = tasks.get(event.execution);
      tasks.delete(event.execution);
      if (start === undefined) return;
      report({
        kind: 'task',
        name: event.execution.task.name,
        exitCode: event.exitCode,
        durationMs: Date.now() - start,
      });
    }),

    vscode.window.onDidStartTerminalShellExecution((event) =>
      commands.set(event.execution, Date.now()),
    ),
    vscode.window.onDidEndTerminalShellExecution(async (event) => {
      const start = commands.get(event.execution);
      commands.delete(event.execution);
      if (start === undefined) return;
      const durationMs = Date.now() - start;
      const shell = await event.terminal.processId;
      if (shell !== undefined && taskShells.has(shell)) return;
      report({
        kind: 'terminal',
        commandLine: event.execution.commandLine.value,
        exitCode: event.exitCode,
        durationMs,
      });
    }),
    vscode.window.onDidCloseTerminal(async (terminal) => {
      const shell = await terminal.processId;
      if (shell !== undefined) taskShells.delete(shell);
    }),

    vscode.workspace.onDidChangeNotebookDocument((event) => {
      for (const change of event.cellChanges) {
        const timing = change.executionSummary?.timing;
        if (!timing || timing.endTime < timing.startTime || timing.endTime < started) continue;
        if (cellEnds.get(change.cell) === timing.endTime) continue;
        cellEnds.set(change.cell, timing.endTime);
        report({
          kind: 'notebook',
          file: fileName(event.notebook.uri),
          cell: change.cell.index + 1,
          success: change.executionSummary?.success,
          durationMs: timing.endTime - timing.startTime,
        });
      }
    }),

    vscode.debug.onDidStartDebugSession((session) => {
      // A child session (a worker, a compound part) ends with its parent; count the parent.
      if (session.parentSession === undefined) sessions.set(session, Date.now());
    }),
    vscode.debug.onDidTerminateDebugSession((session) => {
      const start = sessions.get(session);
      sessions.delete(session);
      if (start === undefined) return;
      report({ kind: 'debug', name: session.name, durationMs: Date.now() - start });
    }),
  );
}

function fileName(uri: vscode.Uri): string {
  return uri.path.slice(uri.path.lastIndexOf('/') + 1);
}
