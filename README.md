# Label When In Branch


This is a Github action that can add a label to issues and PRs that are comitted to a branch.

Use case: I have a `staging` and a `production` branch. They are automatically
deployed to Openshift via a webhook, respectively in the staging and the
production environments. I want to label issues and pull requests with
`deployed-to-staging` and `deployed-to-production` respectively when the
commits fixing the issues and the commits contained in the PRs land in the
respective branches, to let the users and contributors know that the fix is
coming.
