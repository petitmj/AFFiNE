# Run this fork on Docker

This builds the web app, admin, server and native module **from this repository**
(Shelf home, notification flowers, Notion API import) and runs them with
Postgres and Redis. The official `ghcr.io/toeverything/affine` image does not
contain these changes, so it has to be built.

> The Dockerfile follows the project's own CI build step by step, but the full
> image build has not been run end to end in the environment where it was
> written (no Docker daemon there). If a step fails, the error will name it;
> see Troubleshooting.

## You need

- Docker Engine or Docker Desktop with Compose v2 (`docker compose version`)
- about **12 GB of RAM** given to Docker (Docker Desktop: Settings, Resources)
- about **30 GB** of free disk
- 30 to 60 minutes for the first build; later builds reuse cached layers

## Steps

```sh
git clone https://github.com/petitmj/affine.git
cd affine
git checkout claude/notion-zero-loss-shelf-import

cd .docker/custom
docker compose up -d --build
```

When it finishes, open <http://localhost:3010>.

1. **Create your account.** The first account you create on a fresh server becomes its admin.
2. **Create a workspace while signed in.** On a self-hosted server it is a
   cloud workspace, which is what the Notion API import and the notification
   flowers need. (A local-only workspace has neither.)
3. **Open the Shelf** from the workspace sidebar (it is named "Shelf").
4. **Import from Notion:** Import, then "Notion (live import from the API)".
   Create an internal integration at <https://www.notion.so/profile/integrations>,
   share the pages you want with it, and paste its token. See
   [docs/shelf-and-notion-import.md](../../docs/shelf-and-notion-import.md).

## Everyday commands

Run these in `.docker/custom`.

| Task | Command |
| --- | --- |
| See logs | `docker compose logs -f affine` |
| Stop | `docker compose down` (your data stays in `./data`) |
| Start again | `docker compose up -d` |
| Update after pulling new commits | `git pull && docker compose up -d --build` |
| Use another port | `AFFINE_PORT=3011 docker compose up -d` |
| Back up | stop, then copy `./data` and `./config` |

Notion import settings live in `config/config.json` (created on first start),
for example to keep staged data longer:

```json
{ "notionImport": { "retentionDays": 14 } }
```

Restart with `docker compose restart affine` after editing it. If you put the
server behind a domain, also set `server.externalUrl` there.

## Troubleshooting

- **The build is killed or says "out of memory".** Give Docker more RAM
  (12 GB or more) and run the build again; cached layers are kept.
- **`yarn install` fails on a git hook or version.** The Dockerfile sets
  `HUSKY=0`; check that `docker build` is run from this repo's checkout and the
  `yarn.lock` is unchanged.
- **The `affine_migration` container exits with an error.** It applies the
  database migrations, including the Notion import tables. Read it with
  `docker compose logs affine_migration`. Postgres must be healthy first
  (`docker compose ps`).
- **The page does not load.** `docker compose ps` should show `affine_server`
  as running; `docker compose logs affine` shows why not.
- **A faster way to try the UI only.** Without Docker, `yarn install`,
  `yarn affine @affine/native build`, then `yarn dev -p @affine/web`
  (see [docs/BUILDING.md](../../docs/BUILDING.md)). Notion import and
  notifications need the server, so use Docker for those.
