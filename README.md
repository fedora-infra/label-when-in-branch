# Label When In Branch

This is an action for GitHub and Forgejo/Gitea that adds a label to issues and
pull requests committed to a specific branch.

## Use case

My repo has a `staging` and a `production` branch. They are automatically
deployed to OpenShift via a webhook, respectively in the staging and the
production environments.

I want to label issues and pull requests with `deployed:staging` and
`deployed:prod` respectively when the commits fixing the issues and the commits
contained in the PRs land in the respective branches, to let users and
contributors know that the fix is deployed.

## Usage

The action will create the label if it does not exist yet. You can then edit its
description and color in your repo settings.

### GitHub Actions

Add `.github/workflows/label-when-deployed.yaml`:

```yaml
name: Apply labels when deployed

on:
  push:
    branches:
      - staging
      - stable

jobs:
  label:
    name: Apply labels
    runs-on: ubuntu-latest

    steps:
      - name: Staging deployment
        uses: fedora-infra/label-when-in-branch@v1
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          branch: staging
          label: deployed:staging

      - name: Production deployment
        uses: fedora-infra/label-when-in-branch@v1
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          branch: stable
          label: deployed:prod
```

### Forgejo & Gitea Actions

Add `.forgejo/workflows/label-when-deployed.yaml`:

```yaml
name: Apply labels when deployed

on:
  push:
    branches:
      - stg
      - prod

jobs:
  label:
    name: Apply labels
    runs-on: podman # or docker, depending on your runner configuration

    steps:
      - name: Staging deployment
        uses: https://github.com/fedora-infra/label-when-in-branch@v1
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          branch: stg
          label: deployed:staging

      - name: Production deployment
        uses: https://github.com/fedora-infra/label-when-in-branch@v1
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          branch: prod
          label: deployed:prod
```

**Forgejo specifics:**

- **Action source:** Forgejo requires the full URL
  (`uses: https://github.com/...`) to fetch external actions from GitHub.
- **Runner:** Use your instance's runner label (such as `podman` on Fedora
  Forge, or `docker`).
- **Token:** `${{ secrets.GITHUB_TOKEN }}` is automatically provided by the
  Forgejo runner with write permissions.

## Options

- `branch`: The branch to match against (e.g. `staging`, `stg`, `prod`).
- `label`: The label to apply (e.g. `deployed:staging`).
- `token`: GitHub or Forgejo token (pass `${{ secrets.GITHUB_TOKEN }}`).
- `exclude_bots`: Ignore bot commits (defaults to `true`).
- `server_type`: Server platform (`auto`, `github`, or `forgejo`). Defaults to
  `auto`, which automatically detects Forgejo/Gitea environments.

## Development

This action is written in TypeScript. The TypeScript code is compiled into
JavaScript on commit using the `npm run on-commit` command, because actions run
compiled JavaScript directly. You can use [pre-commit](https://pre-commit.com/)
to run this build on commit: `pre-commit install`.

## License

This code is copyright Aurélien Bompard <`aurelien@bompard.org`> and is licensed
under the [LGPL v3.0](https://www.gnu.org/licenses/lgpl-3.0.html) or any later
version. SPDX:
[LGPL-3.0-or-later](https://spdx.org/licenses/LGPL-3.0-or-later.html).
