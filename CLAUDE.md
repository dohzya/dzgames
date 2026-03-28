# dzgames

## Project overview

Webapp de petits jeux web, sans backend, pure frontend. Stack: React + TypeScript + Vite.

## Mandatory workflow

### TDD — no exceptions

Write the failing test first. Write only enough feature code to make it pass. No feature code without a prior failing test. A task is not done until all tests pass.

### Format & lint before finishing

Run in order before considering any task complete:

```
npm run format
npm run lint
```

Fix all warnings and errors. No exceptions.

## Dev commands

| Command                | Purpose                          |
| ---------------------- | -------------------------------- |
| `npm run dev`          | Start dev server                 |
| `npm run build`        | Production build                 |
| `npm run lint`         | Run ESLint                       |
| `npm run format`       | Run Prettier (writes files)      |
| `npm run format:check` | Check formatting without writing |

## Game structure

Each game is a self-contained module:

```
src/games/<game-name>/
```

No cross-game imports. Shared utilities live in `src/shared/`.

## Code style (see `docs/contrib/` for full rules)

- **Immutable first**: use `readonly` and `ReadonlyArray` by default.
- **Strong typing**: no `any`, minimize type assertions.
- **CQS**: commands do not return values; queries are pure functions with no side effects.

## Documentation

Read the relevant docs before writing code.

### `docs/contrib/`

General rules: coding style, architecture, conventions. **Read before coding anything.**

### `docs/functional/`

Functional requirements: game rules, user-facing behavior. **Read before implementing a feature.**

### `docs/technical/`

Low-level technical explanations: algorithms, data structures, implementation details. Read when working on related code.

### Doc file format

Every doc file must include a YAML frontmatter header:

```yaml
---
date: 2026-03-27 # ISO date of last update
git_ref: d0b2eef # short git hash at last update
---
```
