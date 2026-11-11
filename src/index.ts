import * as core from "@actions/core"
import * as github from "@actions/github"
import type { PushEvent } from "@octokit/webhooks-types"

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

interface CommitItem {
  sha?: string
  author?: { type?: string }
  commit?: { message?: string }
}

interface CommitPage {
  commits?: CommitItem[]
}

interface ForgejoPullRequest {
  number: number
  merge_commit_sha?: string
  head?: { sha?: string }
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
    const serverTypeInput = (
      core.getInput("server_type") || "auto"
    ).toLowerCase()

    const serverUrl = process.env.GITHUB_SERVER_URL || ""
    const isForgejo =
      serverTypeInput === "forgejo" ||
      serverTypeInput === "gitea" ||
      (serverTypeInput === "auto" &&
        (Boolean(process.env.GITEA_ACTIONS) ||
          (serverUrl !== "" && !serverUrl.includes("github.com"))))

    core.info(`Running in ${isForgejo ? "Forgejo/Gitea" : "GitHub"} mode.`)

    const baseUrl = process.env.GITHUB_API_URL
    const octokit = github.getOctokit(token, baseUrl ? { baseUrl } : undefined)

    // Debug logs are only output if the `ACTIONS_STEP_DEBUG` secret is true
    core.debug(
      `Applying label "${label}" to issues and PRs committed in ${branch} ...`
    )

    const reqArgs = {
      owner: github.context.repo.owner,
      repo: github.context.repo.repo
    }

    const pushPayload = github.context.payload as PushEvent

    let pullRequests: number[] = []
    let closedIssues: number[] = []
    const commitShas = new Set<string>()

    // Compare commits between before and after if valid basehead
    if (
      pushPayload.before &&
      pushPayload.before !== "0000000000000000000000000000000000000000"
    ) {
      try {
        for await (const response of octokit.paginate.iterator(
          octokit.rest.repos.compareCommitsWithBasehead,
          {
            ...reqArgs,
            basehead: `${pushPayload.before}...${pushPayload.after}`
          }
        )) {
          const page = response.data as unknown as CommitPage | CommitItem[]
          const commits: CommitItem[] = Array.isArray(page)
            ? page
            : (page.commits ?? [])
          for (const commit of commits) {
            if (
              excludeBots === "true" &&
              commit.author &&
              commit.author.type === "Bot"
            ) {
              continue
            }

            if (commit.sha) {
              commitShas.add(commit.sha)
            }

            if (commit.commit?.message) {
              closedIssues = [
                ...closedIssues,
                ...getClosedIssues(commit.commit.message)
              ]
            }

            if (!isForgejo && commit.sha) {
              try {
                const pullRequestsResponse =
                  await octokit.rest.repos.listPullRequestsAssociatedWithCommit(
                    {
                      ...reqArgs,
                      commit_sha: commit.sha
                    }
                  )
                pullRequests = [
                  ...pullRequests,
                  ...pullRequestsResponse.data.map(pr => pr.number)
                ]
              } catch (prErr) {
                core.debug(
                  `Could not fetch PRs for commit ${commit.sha}: ${prErr}`
                )
              }
            }
          }
        }
      } catch (err) {
        core.warning(`Error comparing commits: ${err}`)
      }
    }

    // Fallback: if no commit SHAs collected from compare, check push payload commits
    if (commitShas.size === 0 && pushPayload.commits) {
      for (const commit of pushPayload.commits) {
        if (
          excludeBots === "true" &&
          (commit.author?.username?.includes("[bot]") ||
            commit.author?.name?.includes("[bot]"))
        ) {
          continue
        }

        if (commit.id) commitShas.add(commit.id)
        if (commit.message) {
          closedIssues = [...closedIssues, ...getClosedIssues(commit.message)]
        }
      }
    }

    // On Forgejo/Gitea, look up closed PRs and match their merge or head SHA
    if (isForgejo && commitShas.size > 0) {
      try {
        const closedPRs = await octokit.rest.pulls.list({
          ...reqArgs,
          state: "closed",
          sort: "updated",
          direction: "desc",
          per_page: 100
        })
        for (const pr of closedPRs.data) {
          const forgejoPR = pr as unknown as ForgejoPullRequest
          const mergeSha = forgejoPR.merge_commit_sha
          const headSha = forgejoPR.head?.sha
          if (
            (mergeSha && commitShas.has(mergeSha)) ||
            (headSha && commitShas.has(headSha))
          ) {
            pullRequests.push(pr.number)
          }
        }
      } catch (err) {
        core.warning(`Failed to fetch closed PRs on Forgejo: ${err}`)
      }
    }

    core.debug(`PRs: ${JSON.stringify(pullRequests)}`)
    core.debug(`Closed issues: ${JSON.stringify(closedIssues)}`)

    const applyLabelOn: number[] = [
      ...new Set([...pullRequests, ...closedIssues])
    ]

    if (applyLabelOn.length === 0) {
      core.info("No issues or pull requests found to label.")
      return
    }

    const existingLabels = await octokit.paginate(
      octokit.rest.issues.listLabelsForRepo,
      { ...reqArgs }
    )
    let labelObj = existingLabels.find(
      l => l.name.toLowerCase() === label.toLowerCase()
    )

    if (!labelObj) {
      core.info(`Label "${label}" does not exist. Creating it...`)
      const created = await octokit.rest.issues.createLabel({
        ...reqArgs,
        name: label,
        color: label.includes("staging") ? "007bff" : "28a745"
      })
      labelObj = created.data
    }

    for (const issueOrPR of applyLabelOn) {
      core.info(`Applying label "${label}" on #${issueOrPR}`)
      try {
        if (isForgejo) {
          // Forgejo API expects array of label IDs
          await octokit.request(
            "POST /repos/{owner}/{repo}/issues/{issue_number}/labels",
            {
              ...reqArgs,
              issue_number: issueOrPR,
              labels: [labelObj.id] as unknown as string[]
            }
          )
        } else {
          // GitHub API expects array of label names
          await octokit.rest.issues.addLabels({
            ...reqArgs,
            issue_number: issueOrPR,
            labels: [label]
          })
        }
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

run()
