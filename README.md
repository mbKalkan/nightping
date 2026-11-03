# Nightping

> **Status:** in development. Not yet on the Marketplace or Open VSX.

Phone push notifications from VS Code, through **your own [ntfy](https://ntfy.sh) server or topic**. Start a long build, a test run, a notebook cell or an AI agent, walk away, and get a ping when it finishes, fails or needs your approval.

## What it will notify you about

- **Tasks** from `tasks.json`: finished, with success or failure and duration.
- **Terminal commands** that run longer than a threshold you set (needs VS Code shell integration).
- **Notebook cells** that run longer than a threshold.
- **Debug sessions** that end.
- **AI agents**: Claude Code (built in), plus Codex, Copilot, Gemini CLI, Cursor and others through their hooks. A turn finished, or the agent is waiting for your approval.
- **Other extensions and key bindings** through the `nightping.send` command.

By default it only notifies when you are away from VS Code, and only for work that ran long or failed.

## Your server, your settings

Nightping ships with **no server, no topic and no account**. Nothing is sent until you enter your own:

- the ntfy server URL (for example `https://ntfy.sh` or your self-hosted `https://ntfy.example.com`),
- a topic,
- an optional access token, stored in VS Code's secret storage.

Requests go only to the server you entered. There is no telemetry and no other network traffic. By default a notification contains only the event, the result and the duration; folder names, command lines and agent summaries are added only if you turn them on.

Click the Nightping item in the status bar (or run **Nightping: Open**) to open the Nightping panel. Enter the server, a topic and an optional token, save, and send a test notification. If it does not arrive, the panel says why: a missing or refused token, a redirect, an unreachable server. Below the form, **Recent notifications** lists what Nightping sent, or tried to send and why it could not; the list stays on this computer.

Prefer the keyboard? **Nightping: Set Up…** asks for the same three things in the Command Palette, and **Send Test Notification**, **Set Access Token…** and **Clear Access Token** are there too.

The server and topic are user settings, so Settings Sync takes them to your other computers. The token stays in the secret storage of each computer; set it again there in the panel or with **Nightping: Set Access Token…**.

The README will include a step-by-step guide for both ntfy.sh and a self-hosted server before the first release.

## License

[MIT](LICENSE) © MBK Dev Studio
