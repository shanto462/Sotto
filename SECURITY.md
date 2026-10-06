# Security Policy

## Supported versions

Sotto is a small project with one release line. Security fixes go into the
latest version on `main`. Please update to it before reporting.

| Version | Supported |
|---|---|
| Latest (`main`) | ✓ |
| Older versions | ✗ |

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report privately through GitHub:
[**Report a vulnerability**](https://github.com/shanto462/Sotto/security/advisories/new)
(Security tab → Advisories → Report a vulnerability).

Please include:

- what an attacker can do (for example: "any website can trigger a screen capture"),
- steps to reproduce, or a small proof of concept,
- the Sotto version and your OS.

What to expect:

- an acknowledgement within **7 days**,
- a fix or a mitigation plan within **30 days** for confirmed issues,
- credit in the advisory and the changelog, if you want it.

## What is in scope

Sotto can see your screen, hear your microphone, and hold your API keys, so
these areas matter most:

- **The local HTTP server** (`127.0.0.1:8765`). Only the Chrome extension and
  local tools should be able to use it. A web page that can trigger `/ask`, or
  read anything from the server, is a vulnerability.
- **Rendering of answers in the overlay.** Answers come from Claude reading
  whatever page is on screen, so they are untrusted. Script execution, HTML
  injection, or navigation of an app window is a vulnerability.
- **IPC between windows and the main process**, and the preload APIs.
- **API key storage** (`safeStorage`, `secrets.enc`).
- **Packaged-app hardening** (Electron fuses, entitlements) that stops other
  software from borrowing Sotto's screen-recording or microphone permissions.

Out of scope:

- The limits of screen-share invisibility listed in the README (capture cards,
  cameras, OS changes). These are known and documented.
- Attacks that need an attacker who already runs code as your user account.
- Issues in Anthropic's or OpenAI's services. Report those to them.
