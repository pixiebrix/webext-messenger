/* globals page */

import {describe, beforeAll, it} from '@jest/globals';
import expect from 'expect-puppeteer';

describe('tab', () => {
  beforeAll(async () => {
    await page.goto('https://iframe-test-page.vercel.app/');
  });

  it('should load page', async () => {
    await expect(page).toMatch('Parent page');
  });
});

// // Uncomment to hold the browser open a little longer
// import {jest} from '@jest/globals';
// jest.setTimeout(10000000);
// describe('hold', () => {
// 	it('should wait forever', async () => {
// 		await new Promise(resolve => setTimeout(resolve, 1000000))
// 	})
// });
