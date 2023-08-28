import * as core from "@actions/core"
import * as github from "@actions/github"

interface Commit {
  message: string
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
    const octokit = github.getOctokit(token)

    // Debug logs are only output if the `ACTIONS_STEP_DEBUG` secret is true
    core.debug(
      `Applying label "${label}" to issues and PRs committed in ${branch} ...`
    )

    const reqArgs = {
      owner: github.context.repo.owner,
      repo: github.context.repo.repo
    }

    const pullRequestsResponse =
      await octokit.rest.repos.listPullRequestsAssociatedWithCommit({
        ...reqArgs,
        commit_sha: github.context.sha
      })
    const pullRequests = pullRequestsResponse.data.map(pr => pr.id)
    core.debug(`PRs: ${JSON.stringify(pullRequests)}`)

    const closedIssues: number[] = github.context.payload.commits
      .map((commit: Commit) => getClosedIssues(commit.message))
      .flat()
    core.debug(`Closed Commits: ${JSON.stringify(closedIssues)}`)

    const applyLabelOn: number[] = [
      ...new Set([...pullRequests, ...closedIssues])
    ]

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
