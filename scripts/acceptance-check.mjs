#!/usr/bin/env node
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const out = process.env.QA_OUT || path.join(process.env.TMPDIR || '/tmp', 'mental-care-workbook-acceptance');
const port = process.env.QA_PORT || '4187';
const base = `http://127.0.0.1:${port}`;
const views = [
  { name: 'desktop-1280x800', width: 1280, height: 800 },
  { name: 'mobile-390x844', width: 390, height: 844 },
  { name: 'landscape-844x390', width: 844, height: 390 },
];
const routes = ['home', ...Array.from({ length: 8 }, (_, index) => `work/${index + 1}`)];
const checks = [];
const failures = [];
const record = (name, pass, evidence = {}) => {
  checks.push({ name, pass, evidence });
  if (!pass) failures.push(name);
};
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function waitForServer() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const response = await fetch(base);
      if (response.ok) return;
    } catch {}
    await sleep(250);
  }
  throw new Error('Vite server did not start');
}

function frameFor(page) {
  return page.frames().find(frame => frame !== page.mainFrame() && frame.url().includes('/works/'));
}

async function overflowInfo(page) {
  return page.evaluate(() => ({
    documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    viewportWidth: window.innerWidth,
    overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
  }));
}

async function tapFindings(target) {
  return target.evaluate(() => Array.from(document.querySelectorAll('button, a[href], [role="button"], input, select, textarea'))
    .map(element => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      if (style.display === 'none' || style.visibility === 'hidden' || rect.width === 0 || rect.height === 0) return null;
      let effective = rect;
      if (element.matches('input[type="checkbox"], input[type="radio"]')) {
        const label = element.closest('label') || document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
        if (label) effective = label.getBoundingClientRect();
      }
      return {
        tag: element.tagName,
        type: element.getAttribute('type') || '',
        id: element.id,
        text: (element.innerText || element.getAttribute('aria-label') || '').trim().slice(0, 50),
        width: Math.round(effective.width),
        height: Math.round(effective.height),
      };
    })
    .filter(Boolean)
    .filter(item => item.width < 44 || item.height < 44));
}

async function contrastFindings(target) {
  return target.evaluate(() => {
    const parse = (value) => {
      const parts = value.match(/[\d.]+/g)?.map(Number) || [];
      return { r: parts[0] || 0, g: parts[1] || 0, b: parts[2] || 0, a: parts.length > 3 ? parts[3] : 1 };
    };
    const luminance = ({ r, g, b }) => {
      const channel = value => {
        const n = value / 255;
        return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };
    const ratio = (a, b) => {
      const l1 = luminance(a); const l2 = luminance(b);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    };
    const background = element => {
      let current = element;
      while (current) {
        const color = parse(getComputedStyle(current).backgroundColor);
        if (color.a >= 0.98) return color;
        current = current.parentElement;
      }
      return { r: 255, g: 255, b: 255, a: 1 };
    };
    return Array.from(document.querySelectorAll('p, span, label, button, h1, h2, h3, small, li, td, th, summary'))
      .map(element => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        const text = (element.childElementCount ? '' : element.textContent || '').trim();
        if (!text || rect.width === 0 || rect.height === 0 || style.display === 'none' || style.visibility === 'hidden') return null;
        const size = parseFloat(style.fontSize);
        const weight = Number(style.fontWeight) || 400;
        const required = size >= 24 || (size >= 18.66 && weight >= 700) ? 3 : 4.5;
        const measured = ratio(parse(style.color), background(element));
        return measured + 0.02 < required ? {
          text: text.slice(0, 60), ratio: Number(measured.toFixed(2)), required,
          color: style.color, background: getComputedStyle(element).backgroundColor,
          size,
        } : null;
      })
      .filter(Boolean);
  });
}

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
const server = spawn(path.join(root, 'node_modules', '.bin', 'vite'), ['--host', '127.0.0.1', '--port', port, '--strictPort'], {
  cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, BROWSER: 'none' },
});
let browser;
try {
  await waitForServer();
  browser = await chromium.launch();

  const allWorkPaths = [
    'public/works/1.問題を深く知る1.1.html',
    'public/works/2.DOTS1.0.html',
    'public/works/3.創造的絶望1.1.html',
    'public/works/4.視覚化ツール1.0.html',
    'public/works/5.心のコンパス1.2.html',
    'public/works/6.leaves_on_stream_single_full.html',
    'public/works/7.少し距離を取る.html',
    'public/works/8.いまどうするか1.0.html',
  ];
  const allWorkFiles = await Promise.all(allWorkPaths.map(file => readFile(path.join(root, file), 'utf8')));
  const reactWorkFiles = [allWorkFiles[0], allWorkFiles[4]];
  const localReact = reactWorkFiles.every(content => content.includes('../vendor/react/react.production.min.js') && content.includes('../vendor/react/react-dom.production.min.js'));
  const externalReact = reactWorkFiles.some(content => /https?:\/\/[^"']+(react|react-dom)/i.test(content));
  record('React and ReactDOM bundled locally', localReact && !externalReact, { localReact, externalReact });

  const finishContracts = allWorkFiles.map((content, index) => ({
    work: index + 1,
    listens: content.includes("event.data?.type !== 'mental-care-finish'"),
    completes: content.includes("type: 'mental-care-finish-complete'"),
  }));
  record('all eight works keep finish/save handshake', finishContracts.every(item => item.listens && item.completes), { finishContracts });
  record('work1 staged sections keep only section 0 initially open', allWorkFiles[0].includes('defaultOpen = false') && allWorkFiles[0].includes('title: "0. 今いちばん困っていること", defaultOpen: true'), {});

  // P0: both modal types use dialog semantics, trap focus, Escape, inert background and restoration.
  {
    const page = await browser.newPage({ viewport: views[0] });
    await page.goto(`${base}/#home`);
    const opener = page.locator('.work-card').first();
    await opener.focus();
    await page.keyboard.press('Enter');
    await page.waitForSelector('[role="dialog"]');
    await page.waitForFunction(() => document.activeElement?.id === 'confirm-cancel');
    await page.screenshot({ path: path.join(out, 'state-start-modal-desktop.png') });
    const initial = await page.evaluate(() => ({
      active: document.activeElement?.id,
      inert: document.getElementById('app')?.hasAttribute('inert'),
      ariaModal: document.querySelector('[role="dialog"]')?.getAttribute('aria-modal'),
    }));
    await page.keyboard.press('Shift+Tab');
    const wrappedBack = await page.evaluate(() => document.activeElement?.id);
    await page.keyboard.press('Tab');
    const wrappedForward = await page.evaluate(() => document.activeElement?.id);
    await page.keyboard.press('Escape');
    const restored = await page.evaluate(() => ({ activeClass: document.activeElement?.className, dialog: !!document.querySelector('[role="dialog"]'), inert: document.getElementById('app')?.hasAttribute('inert') }));
    record('start modal keyboard semantics', initial.active === 'confirm-cancel' && initial.inert && initial.ariaModal === 'true' && wrappedBack === 'confirm-start' && wrappedForward === 'confirm-cancel' && !restored.dialog && !restored.inert && String(restored.activeClass).includes('work-card'), { initial, wrappedBack, wrappedForward, restored });

    await page.goto(`${base}/#work/1`);
    await page.click('#finish-work');
    await page.waitForSelector('[role="dialog"]');
    await page.waitForFunction(() => document.activeElement?.id === 'finish-cancel');
    const finishInitial = await page.evaluate(() => ({ active: document.activeElement?.id, inert: document.getElementById('app')?.hasAttribute('inert') }));
    await page.keyboard.press('Escape');
    const finishRestored = await page.evaluate(() => ({ active: document.activeElement?.id, dialog: !!document.querySelector('[role="dialog"]') }));
    record('finish modal keyboard semantics', finishInitial.active === 'finish-cancel' && finishInitial.inert && finishRestored.active === 'finish-work' && !finishRestored.dialog, { finishInitial, finishRestored });
    await page.close();
  }

  // Work 3: five native buttons and Enter/Space activation.
  {
    const page = await browser.newPage({ viewport: views[0] });
    await page.goto(`${base}/#work/3`);
    const frame = await page.frameLocator('#work-frame');
    await frame.locator('#btn-emotion').waitFor();
    const buttonCount = await frame.locator('.menu-grid > button.menu-item').count();
    await frame.locator('#btn-emotion').focus();
    await page.keyboard.press('Enter');
    await frame.getByRole('heading', { name: '「感じないようにする」実験' }).waitFor();
    await page.waitForTimeout(600);
    const enterActivated = await frame.locator('#start-emotion-btn').count() === 1;
    await page.screenshot({ path: path.join(out, 'state-work3-keyboard-desktop.png') });
    await page.reload();
    await frame.locator('#btn-whitebear').waitFor();
    await frame.locator('#btn-whitebear').focus();
    await page.keyboard.press('Space');
    const spaceActivated = await frame.locator('#start-bear-btn').count() === 1;
    record('work3 five keyboard start buttons', buttonCount === 5 && enterActivated && spaceActivated, { buttonCount, enterActivated, spaceActivated });
    await page.close();
  }

  // Work 6: short instruction, enterkeyhint, Enter leaf, retained focus and safe right/top placement.
  for (const viewport of [views[1], views[2]]) {
    const page = await browser.newPage({ viewport });
    await page.goto(`${base}/#work/6`);
    const frame = page.frameLocator('#work-frame');
    await frame.locator('#btn-start').click();
    await frame.locator('#btn-prepare-next').click();
    await frame.locator('#leaf-input').waitFor();
    const before = await frame.locator('.leaf').count();
    for (const text of ['テストの言葉1', 'テストの言葉2', 'テストの言葉3']) {
      await frame.locator('#leaf-input').fill(text);
      await frame.locator('#leaf-input').press('Enter');
    }
    const after = await frame.locator('.leaf').count();
    await frame.locator('body').evaluate(() => new Promise(resolve => {
      const started = performance.now();
      const waitUntilVisible = () => {
        const visible = Array.from(document.querySelectorAll('.leaf')).some(element => {
          const rect = element.getBoundingClientRect();
          const visibleWidth = Math.min(rect.right, innerWidth) - Math.max(rect.left, 0);
          const visibleHeight = Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0);
          return visibleWidth >= 40 && visibleHeight >= 40;
        });
        if (visible || performance.now() - started > 8000) resolve();
        else requestAnimationFrame(waitUntilVisible);
      };
      waitUntilVisible();
    }));
    await page.screenshot({ path: path.join(out, `state-work6-${viewport.name}-enter.png`) });
    const info = await frame.locator('#leaf-input').evaluate(element => {
      const panel = document.querySelector('.ui-area').getBoundingClientRect();
      const leaves = Array.from(document.querySelectorAll('.leaf')).map(leaf => {
        const rect = leaf.getBoundingClientRect();
        const visibleWidth = Math.min(rect.right, innerWidth) - Math.max(rect.left, 0);
        const visibleHeight = Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0);
        return { top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom, visibleWidth, visibleHeight };
      });
      return {
        hint: document.querySelector('.enter-hint')?.textContent?.trim(),
        enterkeyhint: element.getAttribute('enterkeyhint'),
        focused: document.activeElement === element,
        value: element.value,
        position: getComputedStyle(document.querySelector('.ui-area')).position,
        panel: { top: panel.top, rightGap: innerWidth - panel.right, width: panel.width },
        leaves,
        visibleLeaves: leaves.filter(leaf => leaf.visibleWidth >= 40 && leaf.visibleHeight >= 40).length,
        overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
      };
    });
    const maxPanelWidth = viewport.name.startsWith('landscape') ? 321 : 271;
    record(`work6 ${viewport.name} enter/focus/safe-area`, after === before + 3 && info.visibleLeaves >= 1 && info.hint === '書いたら改行キーで葉に乗せます' && info.enterkeyhint === 'send' && info.focused && info.value === '' && info.position === 'absolute' && info.panel.top >= 7 && info.panel.rightGap >= 11 && info.panel.width <= maxPanelWidth && info.overflow <= 1, { before, after, info });
    await page.close();
  }

  // Save/restore compatibility using test-only localStorage values.
  {
    const page = await browser.newPage({ viewport: views[0], acceptDownloads: true });
    await page.goto(`${base}/#home`);
    const seeded = {
      mentalCareWorkbookProfile: JSON.stringify({ name: 'QAテスト' }),
      worksheet_auto_save_v1: JSON.stringify({ q1: '互換性テスト' }),
      dots_work_state_v3: JSON.stringify({ currentStep: 2 }),
      act_worksheet_standalone_data: JSON.stringify({ sample: true }),
      control_map_state_v1: JSON.stringify({ sample: 'ok' }),
    };
    await page.evaluate(values => Object.entries(values).forEach(([key, value]) => localStorage.setItem(key, value)), seeded);
    await page.reload();
    const downloadPromise = page.waitForEvent('download');
    await page.click('#export-full-backup');
    const download = await downloadPromise;
    const file = path.join(out, 'compatibility-backup.json');
    await download.saveAs(file);
    const downloaded = JSON.parse(await (await import('node:fs/promises')).readFile(file, 'utf8'));
    const same = Object.entries(seeded).every(([key, value]) => downloaded.storage[key] === value);
    record('backup schema and stored values compatible', downloaded._workbookBackup?.schemaVersion === 1 && same, { keys: Object.keys(downloaded.storage), schemaVersion: downloaded._workbookBackup?.schemaVersion });
    await page.close();
  }

  // 3 exact viewports x home + 8 works: screenshots, errors, overflow, 44px effective targets, contrast scan.
  for (const viewport of views) {
    for (const route of routes) {
      const page = await browser.newPage({ viewport });
      const consoleProblems = [];
      const pageErrors = [];
      const requestFailures = [];
      page.on('console', message => { if (['warning', 'error'].includes(message.type())) consoleProblems.push(message.text()); });
      page.on('pageerror', error => pageErrors.push(error.message));
      page.on('requestfailed', request => requestFailures.push(`${request.url()} ${request.failure()?.errorText || ''}`));
      await page.goto(`${base}/#${route}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(250);
      const outerOverflow = await overflowInfo(page);
      const inner = route === 'home' ? null : frameFor(page);
      const innerOverflow = inner ? await overflowInfo(inner) : null;
      const outerTaps = await tapFindings(page);
      const innerTaps = inner ? await tapFindings(inner) : [];
      const outerContrast = await contrastFindings(page);
      const innerContrast = inner ? await contrastFindings(inner) : [];
      const file = path.join(out, `${viewport.name}-${route.replace('/', '-')}.png`);
      await page.screenshot({ path: file, fullPage: false });
      const evidence = { viewport: viewport.name, route, file, consoleProblems, pageErrors, requestFailures, outerOverflow, innerOverflow, outerTaps, innerTaps, outerContrast, innerContrast };
      record(`${viewport.name} ${route} runtime/layout`, !consoleProblems.length && !pageErrors.length && !requestFailures.length && outerOverflow.overflow <= 1 && (!innerOverflow || innerOverflow.overflow <= 1), evidence);
      await page.close();
    }
  }

  const runtime = checks.filter(check => check.name.endsWith('runtime/layout'));
  const tapTotal = runtime.reduce((sum, check) => sum + check.evidence.outerTaps.length + check.evidence.innerTaps.length, 0);
  const contrastTotal = runtime.reduce((sum, check) => sum + check.evidence.outerContrast.length + check.evidence.innerContrast.length, 0);
  record('effective tap targets 44px', tapTotal === 0, { findings: tapTotal });
  record('visible normal text contrast 4.5:1', contrastTotal === 0, { findings: contrastTotal });

  const summary = { generatedAt: new Date().toISOString(), out, passed: failures.length === 0, failures, checks };
  await writeFile(path.join(out, 'acceptance-summary.json'), JSON.stringify(summary, null, 2));
  await writeFile(path.join(out, 'acceptance-summary.md'), [
    '# Acceptance summary', '',
    `- Result: ${summary.passed ? 'PASS' : 'FAIL'}`,
    `- Checks: ${checks.length}`,
    `- Failures: ${failures.length}`,
    '', ...checks.map(check => `- ${check.pass ? 'pass' : 'FAIL'}: ${check.name}`),
  ].join('\n'));
  console.log(JSON.stringify({ passed: summary.passed, checks: checks.length, failures, out }, null, 2));
  process.exitCode = summary.passed ? 0 : 1;
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
}
