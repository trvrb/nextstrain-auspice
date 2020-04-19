const crypto = require('crypto');
const fetch = require('node-fetch');
const fs = require('fs');

const DIFF_OUTPUT = './test/integration/__image_snapshots__/__diff_output__/';

// This reporter is configured for integration tests in GitHub actions, and
// comments on a pull request with snapshot failures if a visual E2E test fails:
class GitHubReporter {
  constructor(globalConfig, options) {
    this._globalConfig = globalConfig;
    this._options = options;
  }
  async onTestResult(test, testResult) {
    if (testResult.numFailingTests && testResult.failureMessage.match(/different from snapshot/)) {
      // Fetch the pull request number that kicked off this action, by loading
      // the JSON file that triggered the action, and checking its
      // repository field:
      if (!process.env.GITHUB_EVENT_PATH) return;
      const event = require(process.env.GITHUB_EVENT_PATH)
      if (!event.pull_request) {
        return;
      }
      const pullNumber = event.pull_request.number;

      console.info(`visual integration tests failed for PR ${pullNumber}`)
      console.info('------------')
      const files = fs.readdirSync(DIFF_OUTPUT);
      const body = {
        // The repository field, set in GitHub Actions:
        repository: process.env.GITHUB_REPOSITORY,
        // The run ID set by GitHub actions:
        run_id: process.env.GITHUB_RUN_ID,
        // What log file should we look in for the uploaded screenshot SHA?
        // currenly this should be set to "npm run integration-testci".
        action_log_file: process.env.ACTION_LOG_FILE,
        images: [],
        pull_number: pullNumber
      };
      // We upload each image in the __diff_output__ folder, these represent
      // failures in the integration test run.
      for (const file of files) {
        const content = fs.readFileSync(`${DIFF_OUTPUT}/${file}`).toString('base64');
        const sha = getSha256Hash(content);
        // This sha must be in the GitHub action logs, and is used to validate
        // that the screenshot upload originated from a GitHub action run:
        console.info(`uploading screenshot ${sha}`)
        body.images.push({
          sha,
          name: file,
          content
        });
      }
      await fetch(process.env.SCREENSHOT_UPLOAD_URL, {
        method: 'post',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' }
      });
    }
    console.info('------------')
  }
}

function getSha256Hash(body) {
  return crypto.createHash('sha256')
    .update(body)
    .digest('hex');
}

module.exports = GitHubReporter;
