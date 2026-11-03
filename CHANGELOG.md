# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Settings for your own ntfy server and topic. Nightping has no default server and sends nothing until both are set; they live in your user settings only, so a workspace cannot redirect your notifications.
- A status bar item that says whether Nightping is set up. Until it is, a click starts the setup; after that it opens the settings.
- **Nightping: Set Up…** asks for your server, a topic (with a random, hard-to-guess suggestion) and an optional access token, then sends a test notification.
- **Nightping: Send Test Notification**, and when it fails, a plain reason with the next step: the server needs or refused the token, redirects elsewhere, cannot be reached, or does not answer within 10 seconds.
- **Nightping: Set Access Token…** and **Clear Access Token**. The token is kept in VS Code's secret storage on this computer, never in the settings.
