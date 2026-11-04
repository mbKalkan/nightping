# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Codex notifications**: when a turn finishes (with how long it took) and when Codex waits for your approval. **Connect Codex** in the panel (or the command) adds three asynchronous command hooks to Codex's `hooks.json` after you confirm, keeps a copy of the file, and leaves your own hooks alone; **Disconnect** removes only Nightping's. Codex runs them once you trust them with `/hooks`. The hooks forward each event with curl to Nightping on `127.0.0.1`, Codex never waits for them, and on Windows they use Windows' own `curl.exe`. A **Codex** card in the panel shows the state, and **Codex finishes or needs you** can be turned off under **When to notify**.
- **Send your own message**: type it in the panel's **Send a message** card or with **Nightping: Send Message…**, and it goes to your phone at once, even while paused. Key bindings and other extensions pass it to `nightping.send`, as text or as `{ message, title, priority, tags }`, and get back whether it was sent, held back by a pause, not set up or failed (and why). Passed messages wait out a pause; arguments it cannot send fail with an error that names the problem.
- **Claude Code notifications**: when a turn finishes (with how long it took), when Claude asks you something, and when it waits for your approval, in a terminal or in VS Code's Claude Code panel. **Connect Claude Code** in the panel (or the command) adds Nightping's three HTTP hooks to Claude Code's user settings after you confirm, keeps a copy of the file, and leaves everything else in it alone; **Disconnect** removes only those hooks. **Copy Settings** gives the hooks to add by hand. A first setup with **Nightping: Set Up…** offers to connect Claude Code when it is on the computer.
- The hooks post to `127.0.0.1` only (port 47391, `nightping.port`); Nightping answers at once with an empty reply, so Claude Code never waits for it. One VS Code window receives the events and another takes over when it closes; the panel says which, and when another program holds the port.
- **Notifications when a task, a terminal command or a notebook cell finishes, or a debug session ends**, with the result and how long it ran: for example **❌ Task** / _Failed (exit 1) · 4m 12s_. Failures arrive at high priority. Terminal commands need shell integration.
- **When to notify**, a card in the panel (and settings): each kind of event on or off, a minimum duration (30 seconds by default; failures notify at any duration), **Only when I am away** (on by default: quiet while you are using that VS Code window) and how much a notification says (result and duration by default; also the workspace name; also the task name, command line or file name), with a preview. Changes apply right away.
- The panel says when none of the open terminals has shell integration, so their commands cannot notify, and links to how to turn it on.
- **Pause notifications** for 30 minutes, an hour, four hours or until you resume, from the panel, the status bar item's hover or **Nightping: Pause Notifications…**; **Resume** ends it. The pause holds in every window on this computer and the status bar says **Paused**. Test notifications still go out. Key bindings can pass the minutes to `nightping.pause`.
- The status bar item's hover shows the last notification, or why it was not sent, with links to pause, resume or open the panel.
- Settings for your own ntfy server and topic. Nightping has no default server and sends nothing until both are set; they live in your user settings only, so a workspace cannot redirect your notifications.
- **The Nightping panel**, opened from the status bar item or **Nightping: Open**: set the server, topic and access token in one form (with a random, hard-to-guess topic on request), save, send a test notification and see how it went, and a list of recent notifications with the reason for any that did not go out. The list stays on this computer and can be cleared. The token is never shown in the panel.
- A status bar item that says whether Nightping is set up, and opens the panel.
- **Nightping: Set Up…** asks for your server, a topic (with a random, hard-to-guess suggestion) and an optional access token, then sends a test notification.
- **Nightping: Send Test Notification**, and when it fails, a plain reason with the next step: the server needs or refused the token, redirects elsewhere, cannot be reached, or does not answer within 10 seconds.
- **Nightping: Set Access Token…** and **Clear Access Token**. The token is kept in VS Code's secret storage on this computer, never in the settings.
