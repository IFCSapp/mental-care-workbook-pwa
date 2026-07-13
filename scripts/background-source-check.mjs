#!/usr/bin/env node
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { WORK_BACKGROUNDS } from '../src/work-backgrounds.js';

const root = process.cwd();
const out = process.env.BACKGROUND_QA_OUT || path.join(root, 'reports', 'work-background-sources');
const port = process.env.BACKGROUND_QA_PORT || '4191';
const base = `http://127.0.0.1:${port}`;
const views = [
  { name: 'desktop-1280x800', width: 1280, height: 800 },
  { name: 'mobile-390x844', width: 390, height: 844 },
  { name: 'landscape-844x390', width: 844, height: 390 },
];
const expectedRelations = {
  1: ['一般理論のみ'],
  2: ['出典未確定', '一般理論のみ'],
  3: ['直接の実験課題を翻案', '構造を参考'],
  4: ['一般理論のみ'],
  5: ['構造を参考'],
  6: ['構造を参考'],
  7: ['構造を参考'],
  8: ['構造を参考'],
};
const requiredMarkers = {
  1: ['正式な評価手続ではありません'],
  2: ['D.O.T.S.という略語の最初の出典', '未確認'],
  3: ['白くまを考えない', '白くま以外'],
  4: ['「通知」や「モニター」の画面', '標準課題ではありません'],
  5: ['「心のコンパス」の原典ページは未確認'],
  6: ['最初の提案者', '採用した版', '章・ページ', '未確認'],
  7: ['「通知に名を付ける」台本の出典', '確認できていません'],
  8: ['3領域', '4象限とは異なる再構成', '公開年の記載なし'],
};
const checks = [];
const failures = [];
const record = (name, pass, evidence = {}) => {
  checks.push({ name, pass, evidence });
  if (!pass) failures.push(name);
};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitForServer() {
  for (let index = 0; index < 80; index += 1) {
    try {
      const response = await fetch(base);
      if (response.ok) return;
    } catch {}
    await sleep(250);
  }
  throw new Error('Vite server did not start');
}

const dataIds = Object.keys(WORK_BACKGROUNDS).map(Number).sort((a, b) => a - b);
record('background source map is structured for exactly work1-8', JSON.stringify(dataIds) === JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8]), { dataIds });
for (const workId of dataIds) {
  const background = WORK_BACKGROUNDS[workId];
  const links = background.sources.flatMap(source => source.links);
  const relations = background.sources.map(source => source.relation);
  const citationsComplete = background.sources.every(source => source.citation.trim().length > 20);
  const linksComplete = links.every(link => /^https:\/\//.test(link.href) && link.text.trim().length > 12 && !/^https?:\/\//.test(link.text));
  record(`work${workId} static source contract`, background.summary.trim().length > 20
    && JSON.stringify(relations) === JSON.stringify(expectedRelations[workId])
    && citationsComplete
    && links.length >= 1 && links.length <= 2
    && linksComplete, { relations, citationsComplete, links });
}

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
const server = spawn(path.join(root, 'node_modules', '.bin', 'vite'), ['--host', '127.0.0.1', '--port', port, '--strictPort'], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, BROWSER: 'none' },
});
let browser;
try {
  await waitForServer();
  browser = await chromium.launch();
  const runtimeEvidence = [];
  const consoleProblems = [];
  const pageErrors = [];
  const requestFailures = [];
  for (const view of views) {
    const context = await browser.newContext({ viewport: view });
    const page = await context.newPage();
    page.on('console', message => { if (['warning', 'error'].includes(message.type())) consoleProblems.push({ view: view.name, text: message.text() }); });
    page.on('pageerror', error => pageErrors.push({ view: view.name, text: error.message }));
    page.on('requestfailed', request => requestFailures.push({ view: view.name, text: `${request.url()} ${request.failure()?.errorText || ''}` }));
    await page.goto(`${base}/#home`, { waitUntil: 'networkidle' });
    for (let workId = 1; workId <= 8; workId += 1) {
      const storageBefore = await page.evaluate(() => ({ ...localStorage }));
      await page.locator(`.work-card[data-work-id="${workId}"]`).click();
      const dialog = page.locator('[role="dialog"]');
      const details = dialog.locator('.work-background-details');
      const collapsed = !(await details.getAttribute('open'));
      await details.locator('summary').click();
      await details.scrollIntoViewIfNeeded();
      const state = await details.evaluate(element => {
        const dialog = element.closest('[role="dialog"]');
        const relationLabels = Array.from(element.querySelectorAll('.work-background-relation strong')).map(node => node.textContent.trim());
        const citations = Array.from(element.querySelectorAll('.work-background-citation')).map(node => node.textContent.trim());
        const links = Array.from(element.querySelectorAll('a')).map(link => ({
          href: link.getAttribute('href'),
          text: link.textContent.trim(),
          target: link.getAttribute('target'),
          rel: link.getAttribute('rel'),
        }));
        const rect = dialog.getBoundingClientRect();
        return {
          open: element.open,
          text: element.innerText,
          relationLabels,
          citations,
          links,
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: window.innerWidth,
          dialogInsideHorizontalViewport: rect.left >= 0 && rect.right <= window.innerWidth,
          dialogScrollable: dialog.scrollHeight >= dialog.clientHeight,
          detailsClipped: element.scrollWidth > element.clientWidth,
          startButtonCount: dialog.querySelectorAll('#confirm-start').length,
        };
      });
      const storageAfter = await page.evaluate(() => ({ ...localStorage }));
      const file = path.join(out, `${view.name}-work-${workId}.png`);
      await page.screenshot({ path: file });
      await dialog.evaluate(element => { element.scrollTop = element.scrollHeight; });
      const bottomFile = path.join(out, `${view.name}-work-${workId}-bottom.png`);
      await page.screenshot({ path: bottomFile });
      const markersPresent = requiredMarkers[workId].every(marker => state.text.includes(marker));
      const relationPass = JSON.stringify(state.relationLabels) === JSON.stringify(expectedRelations[workId]);
      const citationsPass = state.citations.length === WORK_BACKGROUNDS[workId].sources.length && state.citations.every(text => text.length > 20);
      const linksPass = state.links.length >= 1 && state.links.length <= 2 && state.links.every(link => link.target === '_blank' && link.rel === 'noopener noreferrer' && /^https:\/\//.test(link.href) && link.text.length > 12);
      const pass = collapsed && state.open && markersPresent && relationPass && citationsPass && linksPass
        && state.documentWidth <= state.viewportWidth && state.dialogInsideHorizontalViewport && !state.detailsClipped
        && state.startButtonCount === 1 && JSON.stringify(storageBefore) === JSON.stringify(storageAfter);
      runtimeEvidence.push({ view: view.name, workId, file, bottomFile, collapsed, ...state, text: state.text.slice(0, 600), markersPresent, relationPass, citationsPass, linksPass, storageUnchanged: JSON.stringify(storageBefore) === JSON.stringify(storageAfter), pass });
      await dialog.locator('#confirm-cancel').click();
    }
    await context.close();
  }
  record('all eight expanded backgrounds pass in desktop, mobile and landscape', runtimeEvidence.length === 24 && runtimeEvidence.every(item => item.pass), { runtimeEvidence });
  record('background modal runtime has no console, page or request failures', !consoleProblems.length && !pageErrors.length && !requestFailures.length, { consoleProblems, pageErrors, requestFailures });

  const summary = { generatedAt: new Date().toISOString(), out, passed: failures.length === 0, failures, checks };
  await writeFile(path.join(out, 'acceptance-summary.json'), JSON.stringify(summary, null, 2));
  await writeFile(path.join(out, 'acceptance-summary.md'), [
    '# Work background source QA', '',
    `- Result: ${summary.passed ? 'PASS' : 'FAIL'}`,
    `- Checks: ${checks.length}`,
    `- Expanded rendered cases: ${runtimeEvidence.length}`,
    `- Top/bottom screenshots: ${runtimeEvidence.length * 2}`,
    `- Failures: ${failures.length}`,
    '', ...checks.map(check => `- ${check.pass ? 'pass' : 'FAIL'}: ${check.name}`),
  ].join('\n'));
  console.log(JSON.stringify({ passed: summary.passed, checks: checks.length, renderedCases: runtimeEvidence.length, failures, out }, null, 2));
  process.exitCode = summary.passed ? 0 : 1;
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
}
