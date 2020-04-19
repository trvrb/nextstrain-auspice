import { setDefaultOptions } from 'expect-puppeteer';
import { toMatchImageSnapshot } from 'jest-image-snapshot';

expect.extend({ toMatchImageSnapshot });

// (tihuan): This is the max time a test can take to run.
// Since when debugging, we run slowMo and !headless, this means
// a test can take more time to finish, so we don't want
// jest to shut off the test too soon
jest.setTimeout(30 * 1000);
setDefaultOptions({ timeout: 3 * 1000 });

jest.retryTimes(4);

beforeEach(async () => {
  await jestPuppeteer.resetBrowser();
  const userAgent = await browser.userAgent();
  await page.setUserAgent(`${userAgent}bot`);
  await page._client.send('Animation.setPlaybackRate', { playbackRate: 12 });
  await page.setViewport({
    width: 1536,
    height: 864
  });
});
