# Label When In Branch

This is a Github action that can add a label to issues and PRs that are comitted
to a branch.

## Use case

My repo has a `staging` and a `production` branch. They are automatically
deployed to Openshift via a webhook, respectively in the staging and the
production environments.

I want to label issues and pull requests with `deployed:staging` and
`deployed:prod` respectively when the commits fixing the issues and the commits
contained in the PRs land in the respective branches, to let the users and
contributors know that the fix is coming.

## Usage

Add an action file in your repo such as
`.github/workflows/label-when-deployed.yaml` with the following content:

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

The action will create the label if it does not exist yet. You can then go and
edit its description and color.

## Options

By default, issues and pull requests authored by bots will be ignored. This is
because I assume bots do not care whether their work has been deployed, but I
may be hurting their feelings by thinking that. If you want to label bots'
issues and PRs, add the `exclude_bots: false` option to the `with:` block.

## Development

This action is written in TypeScript. The TypeScript code is compiled into
Javascript on commit using the `npm run on-commit` command, because Github only
understands Javascript. You can use [pre-commit](https://pre-commit.com/) to do
this build for you on commit, just install it and run `pre-commit install` in
the repo.

## License

This code is copyright Aurélien Bompard <`aurelien@bompard.org`> and is licensed
under the [LGPL v3.0](https://www.gnu.org/licenses/lgpl-3.0.html) or any later
version. SPDX:
[LGPL-3.0-or-later](https://spdx.org/licenses/LGPL-3.0-or-later.html).
