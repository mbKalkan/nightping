# Nightping

> **Status:** in development. Not yet on the Marketplace or Open VSX.

Phone push notifications from VS Code, through **your own [ntfy](https://ntfy.sh) server or topic**. Start a long build, a test run, a notebook cell or an AI agent, walk away, and get a ping when it finishes, fails or needs your approval.

## What it notifies you about

- **Tasks**: a task finished, with its result and how long it ran.
- **Terminal commands**: a command finished, with its exit code. This needs [shell integration](https://code.visualstudio.com/docs/terminal/shell-integration), which bash, zsh, fish, Git Bash and PowerShell 7 have; Windows PowerShell 5.1 has it only when scripts are allowed to run. The panel tells you when none of your open terminals has it.
- **Notebook cells**: a cell finished running.
- **Debug sessions**: a debug session ended.

Coming next: **AI agents** (Claude Code built in, plus Codex, Copilot, Gemini CLI, Cursor and others through their hooks: a turn finished, or the agent is waiting for your approval) and a `nightping.send` command for other extensions and key bindings.

A notification reads at a glance: the title says what finished, the message how it ended and how long it took, for example **❌ Task** / *Failed (exit 1) · 4m 12s*. Failures arrive at high priority.

## When it notifies

By default Nightping stays quiet while you are using the VS Code window where the run finished (it is focused and you used it in the last few seconds), and about runs that succeed in under 30 seconds. Failures notify at any duration.

All of this is in the **When to notify** card of the Nightping panel, and changes apply right away:

- each kind of event on or off (`nightping.notifyOn.*`),
- the minimum duration (`nightping.minimumDuration`, in seconds; `0` notifies about every run),
- **Only when I am away** (`nightping.onlyWhenAway`),
- the content (`nightping.content`): the result and duration only (default), also the workspace name, or also the task name, command line or file name. A preview shows what your phone will get.

## Your server, your settings

Nightping ships with **no server, no topic and no account**. Nothing is sent until you enter your own:

- the ntfy server URL (for example `https://ntfy.sh` or your self-hosted `https://ntfy.example.com`),
- a topic,
- an optional access token, stored in VS Code's secret storage.

Requests go only to the server you entered. There is no telemetry and no other network traffic. By default a notification contains only the kind of event, the result and the duration; the workspace name, task names, command lines and file names are added only if you choose them under **Content**.

Click the Nightping item in the status bar (or run **Nightping: Open**) to open the Nightping panel. Enter the server, a topic and an optional token, save, and send a test notification. If it does not arrive, the panel says why: a missing or refused token, a redirect, an unreachable server. Below the form, **Recent notifications** lists what Nightping sent, or tried to send and why it could not; the list stays on this computer.

Prefer the keyboard? **Nightping: Set Up…** asks for the same three things in the Command Palette, and **Send Test Notification**, **Set Access Token…** and **Clear Access Token** are there too.

The server and topic are user settings, so Settings Sync takes them to your other computers. The token stays in the secret storage of each computer; set it again there in the panel or with **Nightping: Set Access Token…**.

The README will include a step-by-step guide for both ntfy.sh and a self-hosted server before the first release.

## License

[MIT](LICENSE) © MBK Dev Studio
