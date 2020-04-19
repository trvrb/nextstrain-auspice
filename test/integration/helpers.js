const WAIT_BETWEEN_SCREENSHOTS_MS = 100;

/**
 * @param {function} assert Function that calls `page.screenshot()` and `expect(image).toMatchImageSnapshot()`
 * @param {object} options
 * @param options.retries The number of retries
 * @param options.timeoutMS The max timeout before failing the test in milliseconds
 * @param options.pollingMS The polling frequency in milliseconds
 */
export async function toMatchImageSnapshot(assert, options = {}) {
  const DEFAULT_RETRY_TIMES = 5;
  const DEFAULT_TIMEOUT_MS = 10 * 1000;
  const DEFAULT_POLLING_MS = 100;

  const {
    retries = DEFAULT_RETRY_TIMES,
    timeoutMS = DEFAULT_TIMEOUT_MS,
    pollingMS = DEFAULT_POLLING_MS
  } = options;

  const startTime = Date.now();

  let attempt = 0;

  /**
   * (tihuan): We want `await` to complete before the next iteration
   */
  /* eslint-disable no-await-in-loop */
  while (!isTimeoutExceeded()) {
    attempt++;

    try {
      await assert();
      break;
    } catch (error) {
      if (attempt === retries) {
        throw error;
      }

      page.waitFor(pollingMS);

      continue;
    }
  }
  /* eslint-enable no-await-in-loop */

  if (isTimeoutExceeded()) {
    throw new Error(`Timeout exceeded!`);
  }

  function isTimeoutExceeded() {
    return Date.now() - startTime > timeoutMS;
  }
}
