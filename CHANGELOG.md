# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Notifications when a task, a terminal command or a notebook cell finishes, or a debug session ends**, with the result and how long it ran: for example **❌ Task** / _Failed (exit 1) · 4m 12s_. Failures arrive at high priority. Terminal commands need shell integration.
- **When to notify**, a card in the panel (and settings): each kind of event on or off, a minimum duration (30 seconds by default; failures notify at any duration), **Only when I am away** (on by default: quiet while you are using that VS Code window) and how much a notification says (result and duration by default; also the workspace name; also the task name, command line or file name), with a preview. Changes apply right away.
- The panel says when none of the open terminals has shell integration, so their commands cannot notify, and links to how to turn it on.
- Settings for your own ntfy server and topic. Nightping has no default server and sends nothing until both are set; they live in your user settings only, so a workspace cannot redirect your notifications.
- **The Nightping panel**, opened from the status bar item or **Nightping: Open**: set the server, topic and access token in one form (with a random, hard-to-guess topic on request), save, send a test notification and see how it went, and a list of recent notifications with the reason for any that did not go out. The list stays on this computer and can be cleared. The token is never shown in the panel.
- A status bar item that says whether Nightping is set up, and opens the panel.
- **Nightping: Set Up…** asks for your server, a topic (with a random, hard-to-guess suggestion) and an optional access token, then sends a test notification.
- **Nightping: Send Test Notification**, and when it fails, a plain reason with the next step: the server needs or refused the token, redirects elsewhere, cannot be reached, or does not answer within 10 seconds.
- **Nightping: Set Access Token…** and **Clear Access Token**. The token is kept in VS Code's secret storage on this computer, never in the settings.
