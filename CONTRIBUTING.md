# Contributing to Sotto

Thanks for helping. Bug reports, fixes, and small improvements are all welcome.

## Before you start

- For anything bigger than a small fix, please open an issue first so we can
  agree on the approach.
- Security problems go through private reporting, not issues. See
  [SECURITY.md](SECURITY.md).
- Sotto ships under a [Personal & Educational Use license](LICENSE). By
  submitting a contribution, you agree that it is licensed under the same
  terms. Features whose main purpose breaks LICENSE §1 (for example, hiding
  AI help in exams or interviews) will not be accepted.

## Development setup

You need Node.js 22+ (see `.nvmrc`), Google Chrome, and macOS 13+ or
Windows 10 2004+.

```bash
git clone https://github.com/shanto462/Sotto.git
cd Sotto
npm install
npm start                # dev mode
npm run dev:mac          # or build and open the packaged app (see README)
```

For local development you can put API keys in a `.env` file (copy
`.env.example`). Never commit it. It is already in `.gitignore`.

## Making a change

1. Fork the repo and create a branch from `main`, for example
   `fix/overlay-position` or `feat/edit-prompts`.
2. Keep the change focused. One topic per pull request.
3. Add or update tests in `test/` when you change logic in `src/`.
4. Run the same checks CI runs:

   ```bash
   npm run check         # ESLint + unit tests
   ```

5. If your change touches the UI, capture, or permissions, test the packaged
   app (`npm run dev:mac` or `npm run dev:win`), not just `npm start`.
6. Update the README and `CHANGELOG.md` (under **Unreleased**) if users will
   notice the change.

## Pull requests

- Fill in the pull request template: what changed and how you tested it.
- CI must pass: lint, tests, and packaging on macOS and Windows.
- A maintainer review is required before merge.
- Write commit messages in the imperative mood, with a short first line, for
  example `Fix overlay position on secondary displays`.

## Code style

- Plain JavaScript (ES modules), formatted like the surrounding code: 2-space
  indent, double quotes, trailing commas.
- Renderer windows stay sandboxed: `contextIsolation: true`,
  `nodeIntegration: false`, `sandbox: true`. Expose new main-process features
  through the preload `api`, never by loosening these settings.
- Treat anything derived from the screen or from model output as untrusted.
  Escape it before inserting it into HTML.
- No real personal data in code, tests, fixtures, or screenshots: no real
  names, emails, API keys, or captured pages. Use obvious placeholders such as
  `ada@example.com`.

## Reporting bugs

Use the [bug report form](https://github.com/shanto462/Sotto/issues/new/choose).
Include your OS, Sotto version, whether you run the packaged app or dev mode,
and logs with anything private removed.
