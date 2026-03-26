# Free To Use – Integrations Monorepo

Plugins, extensions, and tools built on the [Free To Use](https://freetouse.com) public API.

## Project structure

```
apps/                    # Standalone apps, extensions, and plugins
  chrome-extension/      # Chrome extension (first project)
packages/                # Shared libraries consumed by apps
  ftu-api/               # TypeScript client for api.freetouse.com/v3
```

- **apps/** – Each subdirectory is a deployable artifact (browser extension, CLI tool, web app, etc.).
- **packages/** – Shared code. Apps import these via npm workspace references (e.g. `"@freetouse/api": "*"`).

## Free To Use API

- **Base URL:** `https://api.freetouse.com/v3`
- **Auth:** None required – the API is fully public.
- **OpenAPI spec:** `https://api.freetouse.com/v3/openapi.json`
- **Shared client:** `@freetouse/api` (packages/ftu-api) – always use this instead of calling fetch directly.

### Key endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/music/tracks/all` | List tracks (paginated) |
| GET | `/music/tracks/search?query=` | Search tracks |
| GET | `/music/tracks/{id}` | Get track by UUID |
| GET | `/music/tracks/{id}/related` | Related tracks |
| GET | `/music/tracks/{artist}/{title}` | Get track by artist + title slug |
| GET | `/music/artists/all` | List artists |
| GET | `/music/artists/{id}` | Get artist by UUID |
| GET | `/music/artists/{id}/tracks` | Artist's tracks |
| GET | `/music/categories/all` | List categories |
| GET | `/music/categories/{id}` | Get category by UUID |
| GET | `/music/categories/{id}/tracks` | Category's tracks |

All list endpoints accept `limit`, `offset`, `order`, and `sort` query params.

## Conventions

- **Language:** TypeScript everywhere.
- **Module format:** ESM (`"type": "module"` in package.json).
- **Package manager:** npm workspaces (root package.json defines workspaces).
- **Naming:** `@freetouse/` scope for shared packages. Apps use plain names.
- **API client:** Always import from `@freetouse/api` – never call `fetch("https://api.freetouse.com/...")` directly in app code.
- **No API keys:** The FTU API requires no authentication. Do not add auth headers.
