import * as core from "@actions/core"
import * as github from "@actions/github"

interface User {
  email: string
  name: string
  username: string
}
interface Commit {
  message: string
  id: string
  tree_id: string
  timestamp: string
  url: string
  author: User
  committer: User
}

const CLOSE_KEYWORDS = [
  "close",
  "closes",
  "closed",
  "fix",
  "fixes",
  "fixed",
  "resolve",
  "resolves",
  "resolved"
].map(kw => new RegExp(`${kw}\\s*:?\\s*#(\\d+)`, "ig"))

function getClosedIssues(message: string): number[] {
  const matches = CLOSE_KEYWORDS.map(kw => message.matchAll(kw))
  return matches
    .map(matchList => Array.from(matchList, m => parseInt(m[1])))
    .flat()
}

/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    if (github.context.eventName !== "push") {
      core.warning(`Unsupported event: ${github.context.eventName}`)
      return
    }

    const branch = github.context.ref.substring("refs/heads/".length)
    if (core.getInput("branch") !== branch) {
      core.debug(`Skipping branch ${github.context.ref.substring(11)}`)
      return
    }
    const label = core.getInput("label")
    const token = core.getInput("token")
    const excludeBots = core.getInput("exclude_bots")
    const octokit = github.getOctokit(token)

    // Debug logs are only output if the `ACTIONS_STEP_DEBUG` secret is true
    core.debug(
      `Applying label "${label}" to issues and PRs committed in ${branch} ...`
    )

    const reqArgs = {
      owner: github.context.repo.owner,
      repo: github.context.repo.repo
    }

    let pullRequests: number[] = []
    let closedIssues: number[] = []

    // octokit.paginate(octokit.rest.repos.compareCommitsWithBasehead, {
    //   ...reqArgs,
    //   basehead: `${github.context.}`,
    // })
    // .then((issues) => {
    //   // issues is an array of all issue objects
    // });
    for (const commit of github.context.payload.commits) {
      core.debug(JSON.stringify(commit))

      if (excludeBots && commit.author.username.endsWith("[bot]")) {
        continue
      }

      const pullRequestsResponse =
        await octokit.rest.repos.listPullRequestsAssociatedWithCommit({
          ...reqArgs,
          commit_sha: (commit as Commit).id
        })
      pullRequests = [
        ...pullRequests,
        ...pullRequestsResponse.data.map(pr => pr.number)
      ]
      closedIssues = [
        ...closedIssues,
        ...getClosedIssues((commit as Commit).message)
      ]
    }

    core.debug(`PRs: ${JSON.stringify(pullRequests)}`)
    core.debug(`Closed issues: ${JSON.stringify(closedIssues)}`)

    const applyLabelOn: number[] = [
      ...new Set([...pullRequests, ...closedIssues])
    ]

    if (applyLabelOn.length === 0) {
      return
    }

    const existingLabels = (
      await octokit.rest.issues.listLabelsForRepo({ ...reqArgs })
    ).data.map(l => l.name)
    if (!existingLabels.includes(label)) {
      await octokit.rest.issues.createLabel({
        ...reqArgs,
        name: label
      })
    }

    for (const issueOrPR of applyLabelOn) {
      core.info(`Applying label "${label}" on #${issueOrPR}`)
      try {
        await octokit.rest.issues.addLabels({
          ...reqArgs,
          issue_number: issueOrPR,
          labels: [label]
        })
      } catch (error) {
        if (error instanceof Error)
          core.setFailed(
            `Could not set the label "${label}" on #${issueOrPR}: ${error.message}`
          )
      }
    }
  } catch (error) {
    // Fail the workflow run if an error occurs
    if (error instanceof Error) core.setFailed(error.message)
  }
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
run()
