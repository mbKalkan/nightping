# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **More than one destination.** Notifications can go to several topics, on ntfy.sh, your own server or both, and every destination that is on gets every notification. The panel's **Where notifications go** card lists them with **Send Test**, **Edit** and **Remove**, a checkbox turns one off without removing it, and **Add Another Destination** adds the next. **Recent notifications** says **Partly sent** and names the destinations that failed.
- **Guided setup in three ways.** The panel asks how notifications should reach your phone and walks you through the way you pick: ntfy.sh, your own ntfy server, or your own server over Tailscale. The Tailscale guide checks the `tailscale` command on this computer, lists your Tailscale computers so you can pick the server and get its `https://….ts.net` address, shows the two commands to run there (ntfy with Docker, then `tailscale serve`) with the address filled in, and says how to subscribe on the phone.
- **Delegate to Agent** under the setup steps an AI agent can do on a computer: putting Tailscale on it, running ntfy on the server, and keeping a topic on your own server private with an access token of its own. It copies a ready prompt, with the server's address and the topic filled in, to paste into Claude Code, Codex or Copilot on that computer; **See the prompt** shows what the agent will be asked. The prompts follow the language of VS Code.
- **Nightping: Add a Destination…** (formerly **Set Up…**) asks which way first; for Tailscale it opens the panel's guide. **Nightping: Remove a Destination…** removes one after asking. **Set Access Token…** and **Clear Access Token** ask which server when there is more than one.

### Changed

- The settings `nightping.server` and `nightping.topic` are replaced by the list `nightping.destinations`. The first time the new version starts, a saved server and topic become the first destination, and their access token moves with them. Access tokens are now kept per server.

### Fixed

- **Only when I am not using VS Code** now looks at every VS Code window on this computer. An agent's finished turn arrived as a notification while you worked in another VS Code window, because only one window receives the agents' events and it looked at itself. A task or command that finishes in one window now also stays quiet while you work in another.

## [0.1.0] - 2026-11-05

First release: phone notifications through your own ntfy server when VS Code tasks, terminal commands, notebook cells and debug sessions finish, and when Claude Code, Codex or GitHub Copilot finishes a turn or waits for you.

### Added

- **GitHub Copilot notifications**: when a turn finishes (with how long it took), in VS Code's agent mode or in Copilot CLI, and when Copilot CLI waits for your approval or asks you something. **Connect** in the panel (or **Nightping: Connect GitHub Copilot…**) adds Nightping's own hooks file, `~/.copilot/hooks/nightping.json`, after you confirm; both read it, and your own hooks files are never touched. **Disconnect** deletes it. The hooks forward each event with curl to Nightping on `127.0.0.1`, take well under a second, and still succeed while VS Code is closed. Its row under **AI agents** in the panel shows the state and turns it on and off.
- **Codex notifications**: when a turn finishes (with how long it took) and when Codex waits for your approval. **Connect** in the panel (or **Nightping: Connect Codex…**) adds three asynchronous command hooks to Codex's `hooks.json` after you confirm, keeps a copy of the file, and leaves your own hooks alone; **Disconnect** removes only Nightping's. Codex runs them once you trust them with `/hooks`. The hooks forward each event with curl to Nightping on `127.0.0.1`, Codex never waits for them, and on Windows they use Windows' own `curl.exe`. Its row under **AI agents** in the panel shows the state, reminds you of `/hooks`, and turns it on and off.
- **Send your own message**: type it in the panel's **Send a message** card or with **Nightping: Send Message…**, and it goes to your phone at once, even while paused. Key bindings and other extensions pass it to `nightping.send`, as text or as `{ message, title, priority, tags }`, and get back whether it was sent, held back by a pause, not set up or failed (and why). Passed messages wait out a pause; arguments it cannot send fail with an error that names the problem.
- **Claude Code notifications**: when a turn finishes (with how long it took), when Claude asks you something, and when it waits for your approval, in a terminal or in VS Code's Claude Code panel. **Connect** in the panel (or **Nightping: Connect Claude Code…**) adds Nightping's three HTTP hooks to Claude Code's user settings after you confirm, keeps a copy of the file, and leaves everything else in it alone; **Disconnect** removes only those hooks. **Copy Settings** gives the hooks to add by hand. A first setup with **Nightping: Set Up…** offers to connect Claude Code when it is on the computer.
- The hooks post to `127.0.0.1` only (port 47391, `nightping.port`); Nightping answers at once with an empty reply, so Claude Code never waits for it. One VS Code window receives the events and another takes over when it closes; the panel says which, and when another program holds the port.
- **Notifications when a task, a terminal command or a notebook cell finishes, or a debug session ends**, with the result and how long it ran: for example **❌ Task** / _Failed (exit 1) · 4m 12s_. Failures arrive at high priority. Terminal commands need shell integration.
- **When you get a notification**, a card in the panel (and settings): the rules in one sentence next to an example of what your phone shows; each kind of event and each AI agent on or off; and under **Change the rules**, a minimum duration (30 seconds by default; failures and agents waiting for you notify at any duration), **Only when I am not using VS Code** (on by default) and how much a notification says (result and duration by default; also the workspace name; also the task name, command line or file name). Changes apply right away.
- The panel says when none of the open terminals has shell integration, so their commands cannot notify, and links to how to turn it on.
- **Pause notifications** for 30 minutes, an hour, four hours or until you resume, from the panel, the status bar item's hover or **Nightping: Pause Notifications…**; **Resume** ends it. The pause holds in every window on this computer and the status bar says **Paused**. Test notifications still go out. Key bindings can pass the minutes to `nightping.pause`.
- The status bar item's hover shows the last notification, or why it was not sent, with links to pause, resume or open the panel.
- Settings for your own ntfy server and topic. Nightping has no default server and sends nothing until both are set; they live in your user settings only, so a workspace cannot redirect your notifications.
- **The Nightping panel**, opened from the status bar item or **Nightping: Open**. Until Nightping is set up, **Your phone** walks through four numbered steps: install the ntfy app, choose a server (**Use ntfy.sh** or your own, with an access token only if it needs one), subscribe to the random, hard-to-guess topic in the app (**Copy** puts it on the clipboard), and **Save and Send Test**. Once it works, the card says in one line where notifications go, with **Send Test Notification** and **Change**. **Recent notifications** lists what was sent, with the reason for anything that did not go out. The list stays on this computer and can be cleared. The token is never shown in the panel.
- A status bar item that says whether Nightping is set up, and opens the panel.
- **Nightping: Set Up…** asks for your server, a topic (with a random, hard-to-guess suggestion) and an optional access token, then sends a test notification.
- **Nightping: Send Test Notification**, and when it fails, a plain reason with the next step: the server needs or refused the token, redirects elsewhere, cannot be reached, or does not answer within 10 seconds.
- **Nightping: Set Access Token…** and **Clear Access Token**. The token is kept in VS Code's secret storage on this computer, never in the settings.

[0.1.0]: https://github.com/mbKalkan/nightping/releases/tag/v0.1.0
