# Changelog

All notable changes to this project are documented here. The format is based
on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- Sotto now calls Claude through OpenRouter instead of the Anthropic API, and
  transcribes voice through OpenRouter too instead of OpenAI Whisper. One
  OpenRouter key replaces the Anthropic and OpenAI keys; the old keys are
  removed from the keychain on first launch.
- No model is hard-coded. The chat model, effort, output limit, and
  transcription model are chosen in setup or Preferences from OpenRouter's
  live model list, and `.env` (`OPENROUTER_MODEL`, `SOTTO_EFFORT`,
  `MAX_TOKENS`, `TRANSCRIPTION_MODEL`) overrides them.
- Refusals and errors that OpenRouter returns with HTTP 200 now show in the
  overlay instead of an empty answer.
- Voice recordings are converted to 16 kHz mono WAV before upload.
- The microphone is opened without echo cancellation, noise suppression, or
  auto gain, so recording no longer ducks or alters other apps' audio (calls,
  music), and it is released as soon as recording stops.
- Local macOS builds are signed with a stable self-signed identity
  (`npm run cert:mac`, once), so Screen Recording, Microphone, and
  Accessibility grants survive rebuilds.

### Fixed

- The "Max recording length" setting is now enforced.
- After a failed voice request, the voice shortcut works again without
  needing a successful answer first.

### Removed

- The `@anthropic-ai/sdk` and `openai` dependencies. Both API calls use
  `fetch` against OpenRouter.
- The unused `silenceThresholdRms` setting and the outdated
  `plans/next-features.md` design doc.

### Security

- The local HTTP server now only accepts the Sotto extension (ID pinned by a
  manifest `key`) and local tools. Web pages, other extensions, page
  `<script>`/`<img>` probes, and DNS-rebinding attempts are rejected. Before,
  any website could trigger a capture and a Claude request
  (`Access-Control-Allow-Origin: *`, no origin check).
- Raw HTML in Claude's answers is escaped instead of rendered, and images are
  shown as alt text, so a hostile page cannot inject markup into the overlay
  through prompt injection. History replay renders again from the saved text
  instead of reusing stored HTML.
- App windows can no longer navigate away from the bundled UI. Links open in
  the default browser, and only for `http`, `https`, and `mailto`.
- Only the microphone permission is granted to app windows. All other
  permission requests are denied.
- `open-external` IPC calls are limited to the same safe protocols.
- Settings merging ignores `__proto__`, `constructor`, and `prototype` keys.
- Stricter Content Security Policy (`object-src`, `base-uri`, `form-action`).
- Packaged builds disable `ELECTRON_RUN_AS_NODE`, `NODE_OPTIONS`, and
  `--inspect`, only load the app from `app.asar`, and check its integrity.
- Removed the unneeded `allow-dyld-environment-variables` macOS entitlement.
- Updated Electron to 42.11 and electron-builder to 26.17, which fixes all
  critical and high `npm audit` findings. Production dependencies have no
  known vulnerabilities.

### Fixed

- In packaged builds, **Open Chrome extension folder** and **View LICENSE**
  now work. The extension and LICENSE were packed inside `app.asar`, where
  Chrome and the OS cannot open them.
- Packaged builds copy the Chrome extension into the app's data folder, so its
  path stays the same across updates. The Windows portable build runs from a
  temp folder that is deleted on quit, which would have broken the extension.

### Upgrade notes

- Load the Chrome extension once more from the folder shown in onboarding (or
  tray → Open Chrome extension folder). Its ID is now fixed, and the app
  rejects other IDs.

### Added

- Unit tests (`npm test`), ESLint (`npm run lint`), and `npm run check`.
- GitHub Actions CI: lint, tests, production `npm audit`, packaging on macOS
  and Windows, and dependency review on pull requests.
- Dependabot, issue and pull request templates, CODEOWNERS, SECURITY.md,
  CONTRIBUTING.md, CODE_OF_CONDUCT.md, `.env.example`.
- README sections on privacy (what leaves your machine) and security.

### Changed

- Node.js 22 or newer is required (Node 20 is end of life).
- The Chrome extension no longer logs a line in the console of every page.
- Chrome extension version 0.6.0.

## [0.3.0] - 2026-05-18

### Added

- Production desktop shell: tray menu, onboarding wizard, and settings window.
- Voice trigger: Whisper transcription, then a Claude text answer.
- History rail, power shortcuts, prompt presets (`Ctrl+1` to `Ctrl+5`), and
  light / dark / auto themes.
- Windows support, with capture through Electron `desktopCapturer`.
- Drag and resize for the overlay, with saved position and size.
- `npm run reset` to wipe all local Sotto state on macOS.
- Hardened-runtime entitlements for microphone access.

[Unreleased]: https://github.com/shanto462/Sotto/compare/da5b7a0...HEAD
[0.3.0]: https://github.com/shanto462/Sotto/commits/da5b7a0
