<img src="assets/icon.png" alt="" width="96" align="right">

# Nightping

[![Visual Studio Marketplace](https://vsmarketplacebadges.dev/version-short/MBKDevStudio.nightping.svg?label=Marketplace&color=007ec6)](https://marketplace.visualstudio.com/items?itemName=MBKDevStudio.nightping)
[![Open VSX](https://img.shields.io/open-vsx/v/MBKDevStudio/nightping?label=Open%20VSX)](https://open-vsx.org/extension/MBKDevStudio/nightping)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Phone push notifications from VS Code, through **your own [ntfy](https://ntfy.sh) server or topic**. Start a long build, a test run, a notebook cell or an AI agent, walk away, and get a ping when it finishes, fails or needs your approval.

## What it notifies you about

- **Tasks**: a task finished, with its result and how long it ran.
- **Terminal commands**: a command finished, with its exit code. This needs [shell integration](https://code.visualstudio.com/docs/terminal/shell-integration), which bash, zsh, fish, Git Bash and PowerShell 7 have; Windows PowerShell 5.1 has it only when scripts are allowed to run. The panel tells you when none of your open terminals has it.
- **Notebook cells**: a cell finished running.
- **Debug sessions**: a debug session ended.
- **Claude Code**: a turn finished, Claude asks you something, or it waits for your approval; in a terminal or in VS Code's Claude Code panel. See [Claude Code](#claude-code) below.
- **Codex**: a turn finished, or Codex waits for your approval. See [Codex](#codex) below.
- **GitHub Copilot**: a turn finished, in VS Code's agent mode or in Copilot CLI, or Copilot CLI waits for your approval. See [GitHub Copilot](#github-copilot) below.
- **Your own messages**: typed in the panel or with **Nightping: Send Message…**, or sent by a key binding or another extension. See [Send your own message](#send-your-own-message) below.

Coming next: more AI agents (Cursor and others) through their hooks.

A notification reads at a glance: the title says what finished, the message how it ended and how long it took, for example **❌ Task** / *Failed (exit 1) · 4m 12s*. Failures, questions and approval requests arrive at high priority.

## Set up

Nightping ships with **no server, no topic and no account**, and sends nothing until you add a destination of your own: a topic on an ntfy server. Click **Nightping** in the status bar to open the panel. **Where notifications go** asks how notifications should reach your phone and walks you through the way you pick:

- **ntfy.sh**: a free public server, ready in two minutes.
- **Your own ntfy server**: one you already run, at home or at work.
- **Your own server over Tailscale**: private, only your own devices reach it.

Each way ends with **Save and Send Test**: the test arrives on your phone within seconds, and the card then lists the destination with **Send Test**, **Edit** and **Remove**.

### With ntfy.sh (free, nothing to install)

1. Install the ntfy app on your phone: [Google Play](https://play.google.com/store/apps/details?id=io.heckel.ntfy), [F-Droid](https://f-droid.org/en/packages/io.heckel.ntfy/) or the [App Store](https://apps.apple.com/us/app/ntfy/id1625396347).
2. In the panel, choose **ntfy.sh** and keep the random topic Nightping suggests.
3. In the ntfy app, tap **+** and enter the same topic (**Copy** puts it on the clipboard).
4. Click **Save and Send Test**.

On ntfy.sh every topic is public: anyone who knows its name can read it and send to it, so the topic works like a password. Keep the random name, or choose one as hard to guess. Free use of ntfy.sh has [limits](https://docs.ntfy.sh/publish/#limitations), such as 250 messages a day.

### With your own ntfy server

1. [Install ntfy](https://docs.ntfy.sh/install/) where both your computer and your phone can reach it: at home or on a server you rent. Nightping sends from the computer you work on, so an address that only works in your own network is fine.
2. To keep the topic private, turn on [access control](https://docs.ntfy.sh/config/#access-control) (`auth-file` and `auth-default-access: "deny-all"` in `server.yml`). Then create a user that may only publish to your topic, and a token for it:

   ```sh
   ntfy user add nightping
   ntfy access nightping my-topic write-only
   ntfy token add nightping
   ```

   The token starts with `tk_`. It can do whatever its user can, which is why that user gets this one topic and nothing more.
3. In the panel, choose **Your own ntfy server**, enter its address (for example `https://ntfy.example.com`), click **My server needs an access token** and enter the token.
4. In the ntfy app, tap **+**, turn on **Use another server**, enter your server's address and the topic, or make it the **Default server** in the app's settings. For a protected topic, the app asks you to log in with a user that may read it.
5. Click **Save and Send Test**.

On an iPhone, notifications from your own server arrive at once only when the server forwards them through ntfy.sh: set `base-url` to your server's address and `upstream-base-url: "https://ntfy.sh"` in `server.yml` ([iOS instant notifications](https://docs.ntfy.sh/config/#ios-instant-notifications)). ntfy.sh then sees only a message ID and a hash of the topic, never the message itself.

### With your own server over Tailscale

[Tailscale](https://tailscale.com) joins your devices in a private network, so an ntfy server on one of your computers is reachable from your phone and nowhere else. Choose **Your own server over Tailscale** in the panel; it walks you through five steps:

1. **Put Tailscale on your devices**: this computer, the computer that will run the server (this one works too) and your phone, signed in to the same account. The panel checks the `tailscale` command on this computer and says whether it is installed, signed in and connected.
2. **Choose the server** from your Tailscale computers. Nightping reads them from `tailscale status` on this computer, only when you open this guide; the list stays in the panel. Picking one fills in its address, `https://<computer>.<tailnet>.ts.net`. This needs MagicDNS, which Tailscale turns on by default.
3. **Run ntfy on it**: the panel shows two commands with the address filled in, each with **Copy**. The first starts ntfy with Docker, listening only on the server itself; the second, `tailscale serve --bg 2586`, lets only your Tailscale devices reach it over HTTPS. Without Docker, [install ntfy another way](https://docs.ntfy.sh/install/), have it listen on port 2586, and run the second command. The first time, `tailscale serve` shows a link to turn on HTTPS certificates for your tailnet.
4. **Subscribe on your phone**: install the ntfy app, turn Tailscale on, tap **+**, turn on **Use another server**, enter the server's address and the topic.
5. **Name it and send a test.**

The command also sets `upstream-base-url`, so an iPhone gets notifications at once; the iPhone still fetches the message from your server, so Tailscale has to be on there.

### More than one destination

**Add Another Destination** adds one more the same way: a second phone, or ntfy.sh next to your own server. Every destination that is on gets every notification; with more than one, each has a checkbox to turn it off for a while without removing it. **Send Test** next to a destination tests that one, and **Nightping: Send Test Notification** tests every one that is on. When some destinations get a notification and others do not, **Recent notifications** says **Partly sent** and names the ones that failed.

### If it does not arrive

The card says why: the server needs an access token or refused it, redirects to another address, cannot be reached, or does not answer within 10 seconds. **Recent notifications** keeps what Nightping sent, and the reason for anything that did not go out. The list stays on this computer.

Behind a proxy, Nightping goes through the proxy VS Code uses: the `http.proxy` setting, or the system's proxy when that setting is empty. This needs VS Code 1.96 or later.

### Your server, your settings

- Requests go only to the servers you entered. There is no telemetry and no other network traffic.
- By default a notification contains only the kind of event, the result and the duration. The workspace name, task names, command lines and file names are added only if you choose them under **Content**.
- The destinations are a user setting, `nightping.destinations`, so Settings Sync takes them to your other computers. Access tokens stay in VS Code's secret storage on each computer, one per server, never in the settings; enter them again on another computer in the panel (**Edit**) or with **Nightping: Set Access Token…**.
- Prefer the keyboard? **Nightping: Add a Destination…** asks for the server, topic and token in the Command Palette (for Tailscale it opens the panel's guide), and **Send Test Notification**, **Remove a Destination…**, **Set Access Token…** and **Clear Access Token** are there too.
- Upgrading from 0.1.0: the server and topic you saved become the first destination, with their token, the first time the new version starts.

## Claude Code

**Connect it with one click.** In the Nightping panel, under **AI agents**, click **Connect** next to Claude Code (or run **Nightping: Connect Claude Code…**). After you confirm, Nightping adds three HTTP hooks to Claude Code's user settings, `~/.claude/settings.json` (or the folder an absolute `CLAUDE_CONFIG_DIR` names): when you send a prompt, when Claude finishes, and when it needs you. It saves a copy of the file as `settings.json.nightping.bak` first and leaves your other settings and hooks as they are. **Disconnect** removes only Nightping's hooks. Claude Code picks the change up without a restart. When you add your first destination with **Nightping: Add a Destination…** and Claude Code is on the computer, the test notification offers to connect it.

**Or add the hooks yourself.** **Copy Settings** under **How it works** (or **Nightping: Copy Claude Code Hook Settings**) puts them on the clipboard; add them under `"hooks"` in the settings file, or paste them to Claude Code and ask it to add them to your user settings:

```json
{
  "hooks": {
    "UserPromptSubmit": [{ "hooks": [{ "type": "http", "url": "http://127.0.0.1:47391/nightping/claude-code", "timeout": 5 }] }],
    "Stop": [{ "hooks": [{ "type": "http", "url": "http://127.0.0.1:47391/nightping/claude-code", "timeout": 5 }] }],
    "Notification": [{ "hooks": [{ "type": "http", "url": "http://127.0.0.1:47391/nightping/claude-code", "timeout": 5 }] }]
  }
}
```

How it works:

- The hooks post to Nightping on this computer only, at `127.0.0.1` on port 47391 (`nightping.port`; after a change, reconnect). Your ntfy server, topic and token never go into Claude Code's settings. Nightping answers at once with an empty reply, so Claude Code never waits for it and never changes what it does.
- One VS Code window receives the events; when it closes, another one takes over within seconds. While VS Code is closed, the hooks reach nobody and Claude Code goes on as usual.
- The same rules as for everything else apply: quiet while you are using the VS Code window, the minimum duration for finished turns (questions and approval requests notify at once), pause, and the content level. At the **details** level a finished turn adds the first sentence of Claude's reply, and an approval request what Claude asks permission for; this goes to your server.
- A turn in which a subagent is still running is not finished yet: Claude goes on when the subagent is done, and that end notifies.
- If you already get Claude Code notifications another way (your own hook, for example), turn that off, or they arrive twice.

## Codex

**Connect it with one click.** In the Nightping panel, under **AI agents**, click **Connect** next to Codex (or run **Nightping: Connect Codex…**). After you confirm, Nightping adds three hooks to Codex's `~/.codex/hooks.json` (or the `hooks.json` in an absolute `CODEX_HOME`): when you send a prompt, when Codex finishes, and when it asks for your approval. It saves a copy of the file as `hooks.json.nightping.bak` first and leaves your own hooks as they are. **Disconnect** removes only Nightping's hooks.

**Then trust the hooks once.** Codex runs a new hook only after you have reviewed and trusted it. Run `/hooks` in Codex and trust the three Nightping hooks; until then Codex skips them, and the panel reminds you under Codex. After a port change, reconnect and trust them again.

**Or add the hooks yourself.** **Copy Settings** under **How it works** (or **Nightping: Copy Codex Hook Settings**) puts them on the clipboard. Each of the three events (`UserPromptSubmit`, `Stop`, `PermissionRequest`) gets the same hook:

```json
{
  "type": "command",
  "command": "curl -s -m 5 -H \"Content-Type: application/json\" --data-binary \"@-\" http://127.0.0.1:47391/nightping/codex",
  "commandWindows": "C:\\Windows\\System32\\curl.exe -s -m 5 -H \"Content-Type: application/json\" --data-binary \"@-\" http://127.0.0.1:47391/nightping/codex",
  "timeout": 10,
  "async": true
}
```

How it works:

- Codex runs the hook in its shell with the event on standard input, and curl passes it on to Nightping at `127.0.0.1`. The hooks are asynchronous: Codex does not wait for them, and nothing they do changes what Codex does. While VS Code is closed, curl finds nobody and Codex goes on as usual.
- On Windows the hook names Windows' own `curl.exe` by its full path, because in PowerShell `curl` means something else.
- The same rules apply as for Claude Code: quiet while you are using the VS Code window, the minimum duration for finished turns, pause, and the content level. At the **details** level a finished turn adds the first sentence of Codex's reply, and an approval request what Codex wants to run.
- Codex has no event for questions, so Nightping tells you when a turn finishes and when Codex waits for approval. Tested with Codex 0.164.

## GitHub Copilot

**Connect it with one click.** In the Nightping panel, under **AI agents**, click **Connect** next to GitHub Copilot (or run **Nightping: Connect GitHub Copilot…**). After you confirm, Nightping adds a hooks file of its own, `~/.copilot/hooks/nightping.json`. Copilot's agent mode in VS Code and Copilot CLI both read every hooks file in that folder, so one file covers both, and your own hooks files are never touched. **Disconnect** deletes Nightping's file.

**Or add it yourself.** **Copy Settings** under **How it works** (or **Nightping: Copy GitHub Copilot Hook Settings**) puts the file on the clipboard; save it as `~/.copilot/hooks/nightping.json`. It starts with `"version": 1`, and each of the three events (`UserPromptSubmit`, `Stop`, `notification`) gets the same hook:

```json
{
  "type": "command",
  "bash": "curl -s --connect-timeout 0.5 -m 5 -H \"Content-Type: application/json\" --data-binary \"@-\" http://127.0.0.1:47391/nightping/copilot || true",
  "powershell": "C:\\Windows\\System32\\curl.exe -s --connect-timeout 0.5 -m 5 -H \"Content-Type: application/json\" --data-binary \"@-\" http://127.0.0.1:47391/nightping/copilot; exit 0",
  "timeoutSec": 10
}
```

How it works:

- Copilot runs the hook in a shell with the event on standard input, and curl passes it on to Nightping at `127.0.0.1`. Copilot waits for its hooks, usually for less than half a second (on Windows most of it is PowerShell starting). While VS Code is closed, curl gives up within half a second and the hook still succeeds, so Copilot goes on as usual.
- In VS Code, agent hooks are a preview feature, on by default (`chat.useHooks`), and VS Code runs them only in trusted workspaces. VS Code has no hook for its approval prompts, so there Nightping tells you when a turn finishes. Copilot CLI also tells it when it waits for your approval or asks you something.
- The same rules apply as for Claude Code: quiet while you are using the VS Code window, the minimum duration for finished turns, pause, and the content level. Copilot's hooks do not include its reply, so a finished turn says how long it took; at the **details** level an approval request adds what Copilot CLI asks.
- `COPILOT_HOME` moves Copilot CLI's folder but not the one VS Code reads, so Nightping always uses the one in your home folder.
- Made for the hook formats of VS Code 1.144 and Copilot CLI 1.0.

## When it notifies

By default Nightping stays quiet while you are using any VS Code window on this computer (it is focused and you used it in the last few seconds), even when the run finished or the agent works in another window, and about runs that succeed in under 30 seconds. Failures notify at any duration.

The **When you get a notification** card of the Nightping panel says these rules in one sentence, next to an example of what your phone shows. Below it, each kind of event and each connected agent has its own checkbox, and **Change the rules** opens the rest. Changes apply right away:

- each kind of event on or off (`nightping.notifyOn.*`),
- the minimum duration (`nightping.minimumDuration`, in seconds; `0` notifies about every run),
- **Only when I am not using VS Code** (`nightping.onlyWhenAway`),
- the content (`nightping.content`): the result and duration only (default), also the workspace name, or also the task name, command line or file name. The example follows your choice.

**Pause** notifications for 30 minutes, an hour, four hours or until you resume: with **Pause Notifications…** at the top of the panel, from the status bar item's hover, or with **Nightping: Pause Notifications…**. The pause holds in every VS Code window on this computer, the status bar says **Paused**, and **Resume** ends it. Test notifications still go out. For a key binding, pass the minutes: `{ "key": "…", "command": "nightping.pause", "args": 60 }`.

Hovering over the status bar item also shows the last notification, or why it was not sent.

## Send your own message

Type a message in the panel's **Send a message** card, or run **Nightping: Send Message…**, and it goes to your phone at once, even while notifications are paused.

Key bindings and other extensions pass the message to the `nightping.send` command, as text or as an object:

```jsonc
// keybindings.json
{
  "key": "ctrl+alt+n",
  "command": "nightping.send",
  "args": { "title": "Lunch", "message": "Back in five minutes", "priority": 3, "tags": ["sandwich"] }
}
```

```ts
// In another extension
const result = await vscode.commands.executeCommand('nightping.send', {
  title: 'Deploy',
  message: 'Staging is up',
});
```

- `message` (required): up to 1000 characters; longer text is cut.
- `title`: one line, up to 100 characters; `VS Code` when left out.
- `priority`: 1 (min) to 5 (max), as in ntfy; 3 when left out.
- `tags`: up to 5 [ntfy tags](https://docs.ntfy.sh/emojis/); emoji short codes such as `warning` or `tada` show as emojis.

The command returns `{ "sent": true }`, or `{ "sent": false, "reason": … }` with `"paused"`, `"not-set-up"` or `"failed"` (with an `error` that says why). While notifications are paused, passed messages are held back; the **When to notify** conditions do not apply to them. Anything else it cannot send, such as a priority of 9, fails with an error that names the problem.

## Remote windows

In a remote window (Remote - SSH, WSL, Dev Containers), Nightping still runs on your own computer and sends from there. It connects the AI agents on your own computer only: an agent that runs on the remote machine sends its hooks to that machine's `127.0.0.1`, where Nightping does not listen, so its turns do not notify.

## License

[MIT](LICENSE) © MBK Dev Studio
