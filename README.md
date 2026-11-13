# personal-work

Playwright end-to-end test project focused on validating core user journeys for `https://rettlife.eu/`.

## Current scope

This repository currently includes:

- Baseline Playwright setup with TypeScript
- HTML + line reporting configuration
- Stable smoke/regression checks for key RettLife flows
- Interactive flow tests for click/search behavior

## Tech stack

- Node.js (recommended: current LTS)
- Yarn `4.18.1`
- Playwright Test `^1.65.0`
- TypeScript-based Playwright config

## Project structure

```text
.
├── playwright.config.ts
├── package.json
├── tests/
│   ├── example.spec.ts
│   ├── rettlife.spec.ts
│   └── rettlife.interactive.spec.ts
└── README.md
```

## Prerequisites

Make sure these are available on your machine:

1. `node` and `npm`
2. Corepack enabled (for Yarn 4)

If needed:

```zsh
corepack enable
corepack prepare yarn@4.18.1 --activate
```

This repo uses `.yarnrc.yml` with `nodeLinker: node-modules` so both `yarn` and `npx` workflows work reliably.

## Install

```zsh
yarn install
```

Install Playwright browsers (first time only):

```zsh
yarn playwright install
```

## Run tests

Run entire suite:

```zsh
yarn test
```

Run with browser UI visible:

```zsh
yarn test:headed
```

Run Playwright UI mode:

```zsh
yarn test:ui
```

Run specific suites:

```zsh
yarn playwright test tests/rettlife.spec.ts
yarn playwright test tests/rettlife.interactive.spec.ts
yarn playwright test tests/rettlife.seo-routes.spec.ts
```

### Browser projects

- Default run includes `chromium` and `webkit`.
- Firefox is available behind an opt-in flag:

```zsh
PW_ENABLE_FIREFOX=1 yarn test
```

Run route-level SEO audit helpers:

```zsh
yarn test:seo-routes
yarn test:seo-routes:sample
```

## Reports

After a test run, open the latest HTML report:

```zsh
yarn test:report
```

Note: `show-report` starts a local server. If you stop it with `Ctrl+C`, the terminal may show exit code `130`; this is expected.

## What each test file covers

- `tests/example.spec.ts`
	- Basic title check
	- Navigation check to `what-is-rett-syndrome`

- `tests/rettlife.spec.ts`
	- Homepage smoke assertions
	- Primary navigation link integrity
	- Target page availability check (`/what-is-rett-syndrome`)
	- Search panel visibility check

- `tests/rettlife.interactive.spec.ts`
	- Interactive nav click-through flow
	- Search open + submit flow
	- Modal-aware behavior handling for locale dialog

- `tests/rettlife.seo-routes.spec.ts`
	- Discovers routes from `https://rettlife.eu/sitemap.xml`
	- Audits each route for:
		- non-empty `<title>` (basic quality threshold)
		- non-empty meta description (basic quality threshold)
	- Fails with a grouped report listing each route and exactly what is missing (title or meta description)
	- Writes machine-readable artifacts to:
		- `artifacts/seo/seo-audit.json`
		- `artifacts/seo/seo-audit.csv`

### Optional: limit SEO audit size

For faster local feedback, cap route count with `SEO_MAX_ROUTES`:

```zsh
SEO_MAX_ROUTES=25 yarn test:seo-routes
```

### CI artifact tip

Upload `artifacts/seo/seo-audit.json` and `artifacts/seo/seo-audit.csv` as CI artifacts so SEO results can be trended over time.

## Useful notes

- Current Playwright config runs `chromium` project only.
- Reporters are configured as `line` + `html` in `playwright.config.ts`.
- Generated artifacts are gitignored (`test-results`, `playwright-report`, `blob-report`, etc.).

## Next recommended improvements

- Add CI badge + workflow status section in README
- Add accessibility checks (e.g. `axe`) for core pages
- Add visual regression snapshots for high-value components
- Parameterize base URL with environment variables for staging/production
