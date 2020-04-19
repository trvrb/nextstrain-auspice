const reporters = ['default']
// If we're in a GitHub action environment, include our visual diff
// GitHub reporter:
if (process.env.CI) {
  reporters.push('./test/reporters/github-reporter.js')
}

module.exports = {
  testRunner: "jest-circus/runner",
  preset: "jest-puppeteer",
  globals: {
    BASE_URL:
      process.env.ENV === "dev"
        ? "http://localhost:4000"
        : "https://nextstrain.org/"
  },
  setupFilesAfterEnv: ["expect-puppeteer", "./puppeteer.setup.js"],
  testRegex: "(/__tests__/.*|(\\.|/)(test|spec))\\.(tsx?|jsx?)$",
  testPathIgnorePatterns: ["<rootDir>/node_modules/"],
  reporters
};
