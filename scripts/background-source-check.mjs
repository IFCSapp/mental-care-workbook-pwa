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
const expectedUrls = {
  1: [
    'https://www.actmindfully.com.au/wp-content/uploads/2018/06/Choice_Point_2.0_A_Brief_Overview_-_Russ_Harris_April_2017.pdf',
    'https://www.actmindfully.com.au/wp-content/uploads/2018/06/Using-The-Choice-Point-2-For-Functional-Analysis-Motivation-Acceptance.pdf',
  ],
  2: [
    'https://drive.google.com/file/d/1LSri4IEWWXWbvB4KHNaDxAomH4i5Zfq9/view',
    'https://www.actmindfully.com.au/wp-content/uploads/2018/06/Using-The-Choice-Point-2-For-Functional-Analysis-Motivation-Acceptance.pdf',
  ],
  3: [
    'https://www.actmindfully.com.au/wp-content/uploads/2025/11/ACT-Made-Simple-The-Extra-Bits-By-Russ-Harris-Textbook-Support-Materials-2024-update.pdf',
    'https://www.actmindfully.com.au/wp-content/uploads/2018/06/Complete_Set_of_Worksheets_Handouts_for_ACT_Questions_and_Answers.pdf',
  ],
  4: [
    'https://www.actmindfully.com.au/wp-content/uploads/2025/11/ACT-Made-Simple-The-Extra-Bits-By-Russ-Harris-Textbook-Support-Materials-2024-update.pdf',
    'https://www.actmindfully.com.au/wp-content/uploads/2018/06/Complete_Set_of_Worksheets_Handouts_for_ACT_Questions_and_Answers.pdf',
  ],
  5: [
    'https://www.actmindfully.com.au/wp-content/uploads/2019/07/Choice_Point_2.0_-__Values_and_Goals_-_Russ_Harris_2017.pdf',
    'https://www.actmindfully.com.au/wp-content/uploads/2019/07/Values_Checklist_-_Russ_Harris.pdf',
  ],
  6: [
    'https://www.actmindfully.com.au/wp-content/uploads/2022/07/The-Happiness-Trap-Extra-Bits-July-2022-Update.pdf',
    'https://www.actmindfully.com.au/upimages/TheCompleteSetofWorksheetsandHandoutsfromGettingUnstuckInACT.pdf',
  ],
  7: [
    'https://www.actmindfully.com.au/wp-content/uploads/2018/06/Complete_Set_of_Worksheets_Handouts_for_ACT_Questions_and_Answers.pdf',
    'https://www.actmindfully.com.au/wp-content/uploads/2025/11/ACT-Made-Simple-The-Extra-Bits-By-Russ-Harris-Textbook-Support-Materials-2024-update.pdf',
  ],
  8: [
    'https://www.actmindfully.com.au/wp-content/uploads/2019/07/10_Steps_For_Any_Dilemma.pdf',
    'https://www.actmindfully.com.au/wp-content/uploads/2018/06/Choice_Point_2.0_A_Brief_Overview_-_Russ_Harris_April_2017.pdf',
  ],
};
const forbiddenLearnerFacingTerms = [
  '未確認',
  '確認できていません',
  '確認できず',
  '同一ではない',
  '同一とは',
  '逐語翻案',
  '直接出典',
  '直接の参照',
  '正式な',
  '年・版未確認',
  'metadata',
  '補助研究',
  'このワークとの関係',
  '効果や診断を示すものではありません',
];
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
  const links = background.links;
  const linksComplete = links.every(link => /^https:\/\//.test(link.href) && link.text.trim().length > 12 && !/^https?:\/\//.test(link.text));
  const linkUrls = links.map(link => link.href);
  record(`work${workId} static source contract`, background.summary.trim().length > 20
    && background.summary.trim().endsWith('参考にしています。')
    && JSON.stringify(linkUrls) === JSON.stringify(expectedUrls[workId])
    && linksComplete, { summary: background.summary, links, expectedUrls: expectedUrls[workId] });
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
          links,
          summaryCount: element.querySelectorAll('.work-background-summary').length,
          sourceTitle: element.querySelector('.work-background-source-title')?.textContent.trim(),
          auditElementCount: element.querySelectorAll('.work-background-relation, .work-background-citation, .work-background-boundary').length,
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
      const conciseExplanationPass = state.text.includes(WORK_BACKGROUNDS[workId].summary)
        && state.summaryCount === 1 && state.sourceTitle === '参考にした資料';
      const forbiddenTermsPresent = forbiddenLearnerFacingTerms.filter(term => state.text.includes(term));
      const auditMetaAbsent = forbiddenTermsPresent.length === 0 && state.auditElementCount === 0;
      const linksPass = JSON.stringify(state.links.map(link => link.href)) === JSON.stringify(expectedUrls[workId])
        && JSON.stringify(state.links.map(link => link.text)) === JSON.stringify(WORK_BACKGROUNDS[workId].links.map(link => link.text))
        && state.links.every(link => link.target === '_blank' && link.rel === 'noopener noreferrer' && /^https:\/\//.test(link.href) && link.text.length > 12);
      const pass = collapsed && state.open && conciseExplanationPass && auditMetaAbsent && linksPass
        && state.documentWidth <= state.viewportWidth && state.dialogInsideHorizontalViewport && !state.detailsClipped
        && state.startButtonCount === 1 && JSON.stringify(storageBefore) === JSON.stringify(storageAfter);
      runtimeEvidence.push({ view: view.name, workId, file, bottomFile, collapsed, ...state, text: state.text.slice(0, 600), conciseExplanationPass, forbiddenTermsPresent, auditMetaAbsent, linksPass, storageUnchanged: JSON.stringify(storageBefore) === JSON.stringify(storageAfter), pass });
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
