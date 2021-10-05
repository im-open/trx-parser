const core = require('@actions/core');
const github = require('@actions/github');

async function createStatusCheck(repoToken, reportData, markupData, conclusion) {
  try {
    core.info(`Creating Status check for ${reportData.ReportMetaData.ReportTitle}...`);
    const octokit = github.getOctokit(repoToken);

    let git_sha =
      github.context.eventName === 'pull_request' ? github.context.payload.pull_request.head.sha : github.context.sha;
    core.info(`Creating status check for GitSha: ${git_sha} on a ${github.context.eventName} event.`);

    const checkTime = new Date().toUTCString();
    core.info(`Check time is: ${checkTime}`);
    const response = await octokit.rest.checks.create({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      name: `status check - ${reportData.ReportMetaData.ReportName.toLowerCase()}`,
      head_sha: git_sha,
      status: 'completed',
      conclusion: conclusion,
      output: {
        title: reportData.ReportMetaData.ReportTitle,
        summary: `This test run completed at \`${checkTime}\``,
        text: markupData
      }
    });

    if (response.status !== 201) {
      throw new Error(`Failed to create status check. Error code: ${response.status}`);
    } else {
      core.info(`Created check: ${response.data.name} with response status ${response.status}`);
    }
  } catch (error) {
    core.setFailed(error.message);
  }
}

async function createComment(octokit, markupData) {
  core.info(`Creating PR Comment...`);
  const response = await octokit.rest.issues.createComment({
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    issue_number: github.context.payload.pull_request.number,
    body: markupData
  });

  if (response.status !== 201) {
    core.setFailed(`Failed to create PR comment. Error code: ${response.status}`);
  } else {
    core.info(`Created PR comment: ${response.data.id} with response status ${response.status}`);
  }
}

async function createOrUpdateComment(octokit, markupData) {
  const commentsResponse = await octokit.rest.issues.listComments({
    issue_number: github.context.issue.number,
    owner: github.context.repo.owner,
    repo: github.context.repo.repo
  });

  if (commentsResponse.status !== 200) {
    core.setFailed(`Failed to list PR comments. Error code: ${commentsResponse.status}`);
    return;
  }

  const prefixedMarkupData = '<!-- im-open/process-dotnet-test-results -->\n' + markupData;

  const existingComment = commentsResponse.data.find(comment => comment.body.startsWith(prefixedMarkupData));

  if (existingComment === undefined) {
    await createComment(octokit, prefixedMarkupData);
  } else {
    core.info(`Updating PR Comment...`);
    const response = await octokit.rest.issues.updateComment({
      comment_id: existingComment.id,
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      body: prefixedMarkupData
    });

    if (response.status !== 200) {
      core.setFailed(`Failed to update PR comment. Error code: ${response.status}`);
    } else {
      core.info(`Updated PR comment: ${response.data.id} with response status ${response.status}`);
    }
  }
}

async function createPrComment(repoToken, markupData, updateCommentIfOneExists) {
  try {
    if (github.context.eventName != 'pull_request') {
      core.info('This event was not triggered by a pull_request.  No comment will be created.');
      return;
    }

    const octokit = github.getOctokit(repoToken);
    if (updateCommentIfOneExists) {
      await createOrUpdateComment(octokit, markupData);
    } else {
      await createComment(octokit, markupData);
    }
  } catch (error) {
    core.setFailed(`An error occurred trying to create the PR comment: ${error}`);
  }
}

module.exports = {
  createStatusCheck,
  createPrComment
};
