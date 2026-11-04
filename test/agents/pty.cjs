// Runs a command in a pseudo-terminal, as VS Code's terminal does, with the node-pty that VS Code
// ships. agents.test.ts starts it under VS Code's own runtime (ELECTRON_RUN_AS_NODE=1).
//   pty.cjs <node-pty folder> <working folder> <screen file> <command> [args...]
// Claude asks once whether to trust a new folder; this answers yes, as a user would, so the
// session can go on. Everything the terminal shows is written to the screen file.
const { writeFileSync } = require('node:fs');

const [ptyFolder, cwd, screenFile, command, ...args] = process.argv.slice(2);
const pty = require(ptyFolder);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const term = pty.spawn(command, args, { cwd, env, cols: 120, rows: 40 });
let screen = '';
let answered = false;
term.onData((data) => {
  screen += data;
  // The terminal moves the cursor right for spaces; the rest of its control codes are dropped.
  /* eslint-disable no-control-regex */
  const text = screen
    .replace(/\x1b\[(\d*)C/g, (_, n) => ' '.repeat(Number(n) || 1))
    .replace(/\x1b\[[0-9;?]*[a-zA-Z]|\x1b\][^\x07]*\x07/g, '');
  /* eslint-enable no-control-regex */
  writeFileSync(screenFile, text);
  if (!answered && /trust\s+(the\s+files\s+in\s+)?this\s+folder/i.test(text)) {
    answered = true;
    setTimeout(() => term.write('\r'), 1000);
  }
});
term.onExit(({ exitCode }) => process.exit(exitCode));
