# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Settings for your own ntfy server and topic. Nightping has no default server and sends nothing until both are set; they live in your user settings only, so a workspace cannot redirect your notifications.
- **The Nightping panel**, opened from the status bar item or **Nightping: Open**: set the server, topic and access token in one form (with a random, hard-to-guess topic on request), save, send a test notification and see how it went, and a list of recent notifications with the reason for any that did not go out. The list stays on this computer and can be cleared. The token is never shown in the panel.
- A status bar item that says whether Nightping is set up, and opens the panel.
- **Nightping: Set Up…** asks for your server, a topic (with a random, hard-to-guess suggestion) and an optional access token, then sends a test notification.
- **Nightping: Send Test Notification**, and when it fails, a plain reason with the next step: the server needs or refused the token, redirects elsewhere, cannot be reached, or does not answer within 10 seconds.
- **Nightping: Set Access Token…** and **Clear Access Token**. The token is kept in VS Code's secret storage on this computer, never in the settings.
