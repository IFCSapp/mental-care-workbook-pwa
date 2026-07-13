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

  // PWA repository contract: keep deploy/base-path files and scope-safe registration intact.
  const [indexHtml, mainJs, viteConfig, manifestText, swText, pagesWorkflow, policyJs, finishBridge, headersText, releaseOriginScript, packageText] = await Promise.all([
    readFile(path.join(root, 'index.html'), 'utf8'),
    readFile(path.join(root, 'src/main.js'), 'utf8'),
    readFile(path.join(root, 'vite.config.js'), 'utf8'),
    readFile(path.join(root, 'public/manifest.webmanifest'), 'utf8'),
    readFile(path.join(root, 'public/sw.js'), 'utf8'),
    readFile(path.join(root, '.github/workflows/pages.yml'), 'utf8'),
    readFile(path.join(root, 'src/work-data-policy.js'), 'utf8'),
    readFile(path.join(root, 'public/works/finish-handshake.js'), 'utf8'),
    readFile(path.join(root, 'public/_headers'), 'utf8'),
    readFile(path.join(root, 'scripts/verify-release-origin.mjs'), 'utf8'),
    readFile(path.join(root, 'package.json'), 'utf8'),
  ]);
  const manifest = JSON.parse(manifestText);
  const iconFiles = await Promise.all(['icon.svg', 'icon-192.png', 'icon-512.png'].map(async file => {
    try { await readFile(path.join(root, 'public', file)); return file; } catch { return null; }
  }));
  record('PWA manifest and icons preserved', manifest.start_url === './' && manifest.scope === './' && manifest.display === 'standalone' && iconFiles.every(Boolean), { start_url: manifest.start_url, scope: manifest.scope, display: manifest.display, icons: iconFiles });
  record('PWA relative base path and service worker registration preserved', viteConfig.includes("base: './'") && indexHtml.includes('href="./manifest.webmanifest"') && mainJs.includes("navigator.serviceWorker.register('./sw.js')"), {});
  record('service worker remains scope-safe', swText.includes('self.registration.scope') && swText.includes("new URL('index.html', APP_SCOPE)") && swText.includes("event.request.mode === 'navigate'"), {});
  record('GitHub Pages workflow preserved', pagesWorkflow.includes('branches: [main]') && pagesWorkflow.includes('npm run build') && pagesWorkflow.includes('path: dist') && pagesWorkflow.includes('actions/deploy-pages@v4'), {});

  const work6PwaMarkers = ['btn-watch-landscape', 'enterViewingMode()', 'requestFullscreen', "screen.orientation.lock('landscape')", 'viewing-mode', 'btn-close-viewing-mode'];
  record('work6 PWA viewing mode and fail-soft landscape entry preserved', work6PwaMarkers.every(marker => allWorkFiles[5].includes(marker)), { markers: work6PwaMarkers });

  const expectedModes = ['persisted', 'persisted', 'ephemeral', 'ephemeral', 'persisted', 'ephemeral', 'ephemeral', 'persisted'];
  const finishContracts = allWorkFiles.map((content, index) => ({
    work: index + 1,
    sharedBridge: content.includes('finish-handshake.js'),
    mode: content.includes(`workId: ${index + 1}, mode: '${expectedModes[index]}'`),
  }));
  const bridgeContract = ["event.data?.type !== 'mental-care-finish'", "type: 'mental-care-finish-result'", 'savedAt', 'errorCode', 'requires an explicit save callback', 'getRecoveryText'].every(marker => finishBridge.includes(marker));
  record('P0-03 all eight works use result handshake', finishContracts.every(item => item.sharedBridge && item.mode) && bridgeContract && mainJs.includes("event.data?.type !== 'mental-care-finish-result'"), { finishContracts, bridgeContract });

  const policyModes = [1, 2, 5, 8].every(id => policyJs.includes(`${id}: Object.freeze({ mode: 'persisted'`))
    && [3, 4, 6, 7].every(id => policyJs.includes(`${id}: Object.freeze({ mode: 'ephemeral'`));
  record('P0-02 single work data policy matches persisted and ephemeral works', policyModes && policyJs.includes("storageKey: 'worksheet_auto_save_v1'") && policyJs.includes("storageKey: 'control_map_state_v1'"), {});

  const boundaryMarkers = ['診断や治療でもありません', '危険や暴力、不当な状況にとどまることではありません', '保存される', 'この画面だけ', '本人の明示的な同意なく内容をコピー・印刷・提出しないでください'];
  record('P0-01/P0-07/P0-09 purpose, safety, data and supporter boundaries are visible', boundaryMarkers.every(marker => mainJs.includes(marker)), { boundaryMarkers });

  const forbiddenClaims = [/治ります/g, /改善します/g, /効果があります/g, /正しい考え/g, /今回わかった事実/g, /下がらない[」』\s]*という事実/g, /人生(?:の可能性)?を狭め(?:る|て)/g];
  const learnerSource = [mainJs, ...allWorkFiles].join('\n');
  const claimHits = forbiddenClaims.flatMap(pattern => Array.from(learnerSource.matchAll(pattern), match => match[0]));
  record('P0-04 claim inventory has zero prohibited deterministic claims', claimHits.length === 0, { claimHits });

  const work4Neutral = !allWorkFiles[3].includes('reboundBaseWords') && !allWorkFiles[3].includes('spawnReboundNotification') && !allWorkFiles[3].includes("className = 'status safe'") && !allWorkFiles[3].includes("className = 'status alert'");
  record('P0-05 work4 has no automatic negative notifications or evaluative toggle state', work4Neutral, {});
  record('P0-06 work7 keeps the authored action and states non-save behavior', allWorkFiles[6].includes('state.actionText = actionInput.value') && allWorkFiles[6].includes('あなたが入力したこと') && allWorkFiles[6].includes('このワークの入力は保存されません'), {});

  const thirdPartyScripts = allWorkFiles.flatMap((content, index) => Array.from(content.matchAll(/<script[^>]+src=["'](https?:\/\/[^"']+)/gi), match => ({ work: index + 1, src: match[1] })));
  const releasePackage = JSON.parse(packageText);
  const releaseBoundary = releasePackage.scripts['build:release']?.includes('verify-release-origin.mjs') && releaseOriginScript.includes('VITE_PRODUCT_ORIGIN') && releaseOriginScript.includes('sharedOrigins') && headersText.includes("script-src 'self'") && thirdPartyScripts.length === 0;
  record('P0-10 dedicated release origin gate and self-only third-party script boundary', releaseBoundary, { thirdPartyScripts });
  record('P1A work1 starts with five visible fields and optional detail disclosure', ['basicScene', 'basicNotice', 'basicAction', 'basicImmediate', 'basicLater', 'もう少し詳しく整理する（任意）'].every(marker => allWorkFiles[0].includes(marker)) && !allWorkFiles[0].includes('入力の進捗'), {});
  record('P1A work2 records function by selected behavior without category verdict', ['behaviorContexts', '助けになった場面・条件', '負担が増えた場面・条件', '大切なことへの影響', 'カテゴリを選んだだけで、良い・悪いの結論は出しません'].every(marker => allWorkFiles[1].includes(marker)), {});
  record('P1A work5 uses learner-selected support focus instead of importance/execution UI', ['supportFocus', '難しくする条件', '助けになる条件', '使えるとよい支えや資源', '休む、頼む、延期する、やらない'].every(marker => allWorkFiles[4].includes(marker)) && !allWorkFiles[4].includes('全くできていない (0)') && !allWorkFiles[4].includes('十分にできている (10)'), {});
  record('P1A work8 uses condition-based labels and non-numeric continuation checks', ['今の条件で、自分だけでは動かしにくいこと', '今の条件で、人や環境に働きかけられるかもしれないこと', '今の条件で、自分が選べる可能性があること', 'continuation-status', 'continuation-support', 'continuation-alternative'].every(marker => allWorkFiles[7].includes(marker)) && !allWorkFiles[7].includes('id="distress-before"'), {});

  const feedbackLayerContracts = allWorkFiles.map((content, index) => ({
    workId: index + 1,
    input: (content.match(/data-feedback-layer["']?\s*[:=]\s*["']input["']/g) || []).length,
    view: (content.match(/data-feedback-layer["']?\s*[:=]\s*["']view["']/g) || []).length,
    next: (content.match(/data-feedback-layer["']?\s*[:=]\s*["']next["']/g) || []).length,
  }));
  record('P1B all eight works define one input/view/next feedback layer', feedbackLayerContracts.every(item => item.input === 1 && item.view === 1 && item.next === 1), { feedbackLayerContracts });

  const { migrateWorkData, migrateStoredEntries, migrateWorkbookStorage } = await import(path.join(root, 'src/work-data-policy.js'));
  const legacyFixtures = {
    1: { q1: '旧work1', untouched: { nested: true } },
    2: { dots: { D: { checks: ['テレビを見る'], other: '' } }, impact: { shortTermHelp: '旧work2' } },
    5: { domainData: { 健康: { importance: 8, execution: 3, memo: '旧work5' } } },
    8: { distress: { before: '9', afterStep4: '7', end: '8' }, nextStep: { action: '旧work8' } },
  };
  const migratedFixtures = Object.fromEntries(Object.entries(legacyFixtures).map(([id, fixture]) => [id, migrateWorkData(Number(id), fixture)]));
  const migrationPreservesLegacy = migratedFixtures[1].q1 === '旧work1'
    && migratedFixtures[1].untouched.nested
    && migratedFixtures[2].dots.D.checks[0] === 'テレビを見る'
    && migratedFixtures[2].impact.shortTermHelp === '旧work2'
    && migratedFixtures[5].domainData.健康.importance === 8
    && migratedFixtures[5].domainData.健康.execution === 3
    && migratedFixtures[8].distress.before === '9'
    && migratedFixtures[8].nextStep.action === '旧work8';
  record('schema v1 to v2 migration preserves every legacy value and adds P1A fields', migrationPreservesLegacy
    && Object.values(migratedFixtures).every(value => value.schemaVersion === 2)
    && 'behaviorContexts' in migratedFixtures[2]
    && migratedFixtures[5].domainData.健康.supportFocus === false
    && migratedFixtures[8].continuation.status === '', { migratedFixtures });
  const v2RoundTrip = migrateWorkData(8, migratedFixtures[8]);
  record('schema v2 migration is idempotent and rejects unknown future schema', JSON.stringify(v2RoundTrip) === JSON.stringify(migratedFixtures[8]) && (() => {
    try { migrateWorkData(1, { schemaVersion: 99 }); return false; } catch { return true; }
  })(), {});
  const migratedEntries = migrateStoredEntries([
    ['worksheet_auto_save_v1', JSON.stringify(legacyFixtures[1])],
    ['control_map_state_v1', JSON.stringify(legacyFixtures[8])],
  ]);
  record('backup import entry migration upgrades known storage keys before commit', migratedEntries.every(([, value]) => JSON.parse(value).schemaVersion === 2), { keys: migratedEntries.map(([key]) => key) });
  const rollbackSeed = new Map([
    ['worksheet_auto_save_v1', JSON.stringify(legacyFixtures[1])],
    ['dots_work_state_v3', JSON.stringify(legacyFixtures[2])],
  ]);
  let setCount = 0;
  const failingStorage = {
    getItem: key => rollbackSeed.get(key) ?? null,
    setItem: (key, value) => {
      setCount += 1;
      if (setCount === 2) throw new Error('QUOTA');
      rollbackSeed.set(key, value);
    },
  };
  let rollbackError = false;
  try { migrateWorkbookStorage(failingStorage); } catch { rollbackError = true; }
  record('schema migration rolls back all writes when storage commit fails', rollbackError
    && rollbackSeed.get('worksheet_auto_save_v1') === JSON.stringify(legacyFixtures[1])
    && rollbackSeed.get('dots_work_state_v3') === JSON.stringify(legacyFixtures[2]), { rollbackError, setCount });

  // P1A work 1: five-field quick path, optional detail disclosure and autosave.
  {
    const page = await browser.newPage({ viewport: views[0] });
    await page.goto(`${base}/#work/1`, { waitUntil: 'networkidle' });
    const frame = page.frameLocator('#work-frame');
    const values = {
      basicScene: '通所前の朝',
      basicNotice: '胸が重く、休みたいと考えた',
      basicAction: '支援者へ連絡した',
      basicImmediate: '予定を相談できた',
      basicLater: '午後から参加できた',
    };
    for (const [id, value] of Object.entries(values)) await frame.locator(`#${id}`).fill(value);
    const focusState = await frame.locator('#basicLater').evaluate(element => ({ value: element.value, focused: document.activeElement === element }));
    const detailToggle = frame.getByRole('button', { name: 'もう少し詳しく整理する（任意）' });
    await detailToggle.click();
    const detailOpen = await frame.getByRole('button', { name: '詳しい項目を閉じる' }).getAttribute('aria-expanded');
    record('work1 quick path keeps five fields visible and optional details explicit', focusState.value === values.basicLater && focusState.focused && detailOpen === 'true', { focusState, detailOpen });

    await page.reload({ waitUntil: 'networkidle' });
    const reloadedFrame = page.frameLocator('#work-frame');
    const reloaded = Object.fromEntries(await Promise.all(Object.keys(values).map(async id => [id, await reloadedFrame.locator(`#${id}`).inputValue()])));
    record('work1 schema v2 autosave reload restores all five quick fields', Object.entries(values).every(([key, value]) => reloaded[key] === value), { reloaded });

    await reloadedFrame.locator('.header-actions .btn-blue').click();
    const summaryText = await reloadedFrame.locator('.result-container').innerText();
    record('work1 summary mirrors five quick fields without scoring', Object.values(values).every(value => summaryText.includes(value)) && !summaryText.includes('入力の進捗'), { summaryText: summaryText.slice(0, 500) });
    await page.close();
  }

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
    const wrappedBack = await page.evaluate(() => ({
      id: document.activeElement?.id,
      insideDialog: !!document.activeElement?.closest('[role="dialog"]'),
    }));
    await page.keyboard.press('Tab');
    const wrappedForward = await page.evaluate(() => document.activeElement?.id);
    await page.keyboard.press('Escape');
    const restored = await page.evaluate(() => ({ activeClass: document.activeElement?.className, dialog: !!document.querySelector('[role="dialog"]'), inert: document.getElementById('app')?.hasAttribute('inert') }));
    record('start modal keyboard semantics', initial.active === 'confirm-cancel' && initial.inert && initial.ariaModal === 'true' && wrappedBack.insideDialog && wrappedBack.id !== 'confirm-cancel' && wrappedForward === 'confirm-cancel' && !restored.dialog && !restored.inert && String(restored.activeClass).includes('work-card'), { initial, wrappedBack, wrappedForward, restored });

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

  // Work 6 mobile/landscape: input-only float, placeholder guidance, Enter leaf, retained focus and safe placement.
  // P0-01/02/07/09: policy, safety route and exact save-state labels are visible without writing learner data.
  {
    const page = await browser.newPage({ viewport: views[0] });
    await page.goto(`${base}/#home`);
    const homePolicy = await page.evaluate(() => ({
      cards: document.querySelectorAll('.work-card').length,
      cardStates: Array.from(document.querySelectorAll('.work-card')).map((card) => ({
        workId: Number(card.dataset.workId),
        label: card.querySelector('.work-save-tag')?.textContent.trim(),
        mode: card.querySelector('.work-save-tag')?.dataset.saveMode,
        duration: card.querySelector('.work-card-meta')?.textContent.trim(),
      })),
      text: document.body.innerText,
    }));
    const collapsedSafety = await page.evaluate(() => ({
      standaloneLinks: document.querySelectorAll('.inline-safety-link').length,
      detailsOpen: document.querySelector('.boundary-details')?.open,
    }));
    await page.locator('.boundary-details summary').click();
    const safetyDetails = await page.locator('.boundary-details').evaluate((details) => ({
      open: details.open,
      text: details.innerText,
      href: details.querySelector('a')?.getAttribute('href'),
      externalLinks: details.querySelectorAll('a[target="_blank"][rel="noopener noreferrer"]').length,
    }));
    await page.screenshot({ path: path.join(out, 'p0-home-safety-details.png') });

    const calmSafetyRoute = collapsedSafety.standaloneLinks === 0
      && collapsedSafety.detailsOpen === false
      && safetyDetails.open
      && safetyDetails.href === 'https://www.mhlw.go.jp/mamorouyokokoro/'
      && safetyDetails.externalLinks === 1
      && safetyDetails.text.includes('厚生労働省「まもろうよ こころ」で相談先を見る')
      && !safetyDetails.text.includes('救急車')
      && !safetyDetails.text.includes('119');
    const expectedCardStates = [
      { workId: 1, label: '保存される', mode: 'persisted', duration: '15〜30分' },
      { workId: 2, label: '保存される', mode: 'persisted', duration: '10〜20分' },
      { workId: 3, label: 'この画面だけ', mode: 'ephemeral', duration: '1〜4分' },
      { workId: 4, label: 'この画面だけ', mode: 'ephemeral', duration: '5〜10分' },
      { workId: 5, label: '保存される', mode: 'persisted', duration: '15〜30分' },
      { workId: 6, label: 'この画面だけ', mode: 'ephemeral', duration: '3〜10分' },
      { workId: 7, label: 'この画面だけ', mode: 'ephemeral', duration: '3〜7分' },
      { workId: 8, label: '保存される', mode: 'persisted', duration: '10〜20分' },
    ];
    record('P0-01/P0-02/P0-07/P0-09 home policy and safety route runtime', homePolicy.cards === 8 && JSON.stringify(homePolicy.cardStates) === JSON.stringify(expectedCardStates) && homePolicy.text.includes('診断や治療でもありません') && calmSafetyRoute, { homePolicy: { ...homePolicy, text: undefined }, expectedCardStates, collapsedSafety, safetyDetails });
    await page.close();

    const saveTagLayoutEvidence = [];
    for (const view of views) {
      const layoutPage = await browser.newPage({ viewport: view });
      await layoutPage.goto(`${base}/#home`);
      const layout = await layoutPage.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('.work-card')).map((card) => {
          const title = card.querySelector('.work-card-label');
          const tag = card.querySelector('.work-save-tag');
          const duration = card.querySelector('.work-card-meta');
          const cardRect = card.getBoundingClientRect();
          const titleRect = title.getBoundingClientRect();
          const tagRect = tag.getBoundingClientRect();
          const tagStyle = getComputedStyle(tag);
          const overlaps = !(titleRect.right <= tagRect.left || titleRect.left >= tagRect.right || titleRect.bottom <= tagRect.top || titleRect.top >= tagRect.bottom);
          return {
            workId: Number(card.dataset.workId),
            label: tag.textContent.trim(),
            mode: tag.dataset.saveMode,
            duration: duration.textContent.trim(),
            overlaps,
            insideCard: tagRect.left >= cardRect.left && tagRect.right <= cardRect.right && tagRect.top >= cardRect.top && tagRect.bottom <= cardRect.bottom,
            clipped: tag.scrollWidth > tag.clientWidth || tag.scrollHeight > tag.clientHeight,
            borderRadius: tagStyle.borderRadius,
            borderStyle: tagStyle.borderStyle,
            color: tagStyle.color,
            backgroundColor: tagStyle.backgroundColor,
          };
        });
        return {
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: window.innerWidth,
          cards,
        };
      });
      await layoutPage.screenshot({ path: path.join(out, `save-tags-${view.name}.png`), fullPage: true });
      saveTagLayoutEvidence.push({ view, ...layout });
      await layoutPage.close();
    }
    const tagLayoutPass = saveTagLayoutEvidence.every(({ documentWidth, viewportWidth, cards }) => {
      const exactStates = cards.map(({ workId, label, mode, duration }) => ({ workId, label, mode, duration }));
      const persisted = cards.find(card => card.mode === 'persisted');
      const ephemeral = cards.find(card => card.mode === 'ephemeral');
      return documentWidth <= viewportWidth
        && JSON.stringify(exactStates) === JSON.stringify(expectedCardStates)
        && cards.every(card => !card.overlaps && card.insideCard && !card.clipped)
        && persisted.borderRadius !== ephemeral.borderRadius
        && persisted.borderStyle !== ephemeral.borderStyle
        && persisted.backgroundColor !== ephemeral.backgroundColor
        && persisted.color !== ephemeral.color;
    });
    record('save-state tags keep exact labels, distinct shapes/colors and collision-free layout in three viewports', tagLayoutPass, { saveTagLayoutEvidence });

    const startModalEvidence = [];
    for (const view of views) {
      const modalPage = await browser.newPage({ viewport: view });
      await modalPage.goto(`${base}/#home`);
      for (const expected of expectedCardStates) {
        const card = modalPage.locator(`.work-card[data-work-id="${expected.workId}"]`);
        const cardTagStyle = await card.locator('.work-save-tag').evaluate((tag) => {
          const style = getComputedStyle(tag);
          return {
            className: tag.className,
            color: style.color,
            backgroundColor: style.backgroundColor,
            borderColor: style.borderColor,
            borderStyle: style.borderStyle,
            borderRadius: style.borderRadius,
          };
        });
        const storageBeforeModal = await modalPage.evaluate(() => ({ ...localStorage }));
        await card.click();
        const modal = modalPage.locator('[role="dialog"]');
        await modal.locator('.start-save-state').scrollIntoViewIfNeeded();
        const modalState = await modal.evaluate((dialog) => {
          const tag = dialog.querySelector('.work-save-tag');
          const tagStyle = getComputedStyle(tag);
          const tagRect = tag.getBoundingClientRect();
          return {
            label: tag.textContent.trim(),
            mode: tag.dataset.saveMode,
            className: tag.className,
            color: tagStyle.color,
            backgroundColor: tagStyle.backgroundColor,
            borderColor: tagStyle.borderColor,
            borderStyle: tagStyle.borderStyle,
            borderRadius: tagStyle.borderRadius,
            clipped: tag.scrollWidth > tag.clientWidth || tag.scrollHeight > tag.clientHeight,
            insideViewport: tagRect.left >= 0 && tagRect.right <= window.innerWidth && tagRect.top >= 0 && tagRect.bottom <= window.innerHeight,
            subtitle: dialog.querySelector('.modal-subtitle')?.textContent.trim(),
            useWithFieldsets: dialog.querySelectorAll('.use-with-fieldset').length,
            useWithRadios: dialog.querySelectorAll('input[name="use-with"]').length,
            duplicateTypeLabels: Array.from(dialog.querySelectorAll('.modal-subtitle')).filter(node => /記録型|体験型/.test(node.textContent)).length,
            safetyDetails: dialog.querySelectorAll('.start-safety-details').length,
            backgroundDetails: dialog.querySelectorAll('.work-background-details').length,
            startButtons: dialog.querySelectorAll('#confirm-start').length,
            documentWidth: document.documentElement.scrollWidth,
            viewportWidth: window.innerWidth,
          };
        });
        const storageAfterModal = await modalPage.evaluate(() => ({ ...localStorage }));
        await modalPage.screenshot({ path: path.join(out, `start-modal-work${expected.workId}-${view.name}.png`) });
        await modalPage.locator('#confirm-start').click();
        await modalPage.waitForURL(url => url.hash === `#work/${expected.workId}`);
        await modalPage.locator('#work-frame').waitFor();
        startModalEvidence.push({ view: view.name, ...expected, cardTagStyle, modalState, modalStorageUnchanged: JSON.stringify(storageBeforeModal) === JSON.stringify(storageAfterModal), startedRoute: new URL(modalPage.url()).hash });
        await modalPage.goto(`${base}/#home`);
      }
      await modalPage.close();
    }
    const startModalPass = startModalEvidence.every((item) => {
      const { modalState, cardTagStyle } = item;
      return modalState.label === item.label
        && modalState.mode === item.mode
        && modalState.subtitle === `${item.duration}（時間切れはありません）`
        && modalState.useWithFieldsets === 0
        && modalState.useWithRadios === 0
        && modalState.duplicateTypeLabels === 0
        && modalState.safetyDetails === 1
        && modalState.backgroundDetails === 1
        && modalState.startButtons === 1
        && item.modalStorageUnchanged
        && !modalState.clipped
        && modalState.insideViewport
        && modalState.documentWidth <= modalState.viewportWidth
        && modalState.className === cardTagStyle.className
        && modalState.color === cardTagStyle.color
        && modalState.backgroundColor === cardTagStyle.backgroundColor
        && modalState.borderColor === cardTagStyle.borderColor
        && modalState.borderStyle === cardTagStyle.borderStyle
        && modalState.borderRadius === cardTagStyle.borderRadius
        && item.startedRoute === `#work/${item.workId}`;
    });
    record('all eight start modals show exact save-state tags and start correctly in three viewports', startModalPass && startModalEvidence.length === (views.length * 8), { startModalEvidence });
  }

  // P0-03: persisted/ephemeral success, explicit storage failure and timeout branches.
  {
    const page = await browser.newPage({ viewport: views[0] });
    await page.goto(`${base}/#work/1`, { waitUntil: 'networkidle' });
    await page.click('#finish-work');
    await page.click('#finish-confirm');
    await page.locator('.save-status-success').waitFor();
    const persistedText = await page.locator('.save-status-success').innerText();
    await page.screenshot({ path: path.join(out, 'p0-finish-persisted-success.png') });
    record('P0-03 persisted work reports success only after save result', /このブラウザに保存しました（\d{2}:\d{2}）/.test(persistedText), { persistedText });

    await page.goto(`${base}/#work/3`, { waitUntil: 'networkidle' });
    const beforeKeys = await page.evaluate(() => Object.keys(localStorage).sort());
    await page.click('#finish-work');
    await page.click('#finish-confirm');
    await page.locator('.save-status-success').waitFor();
    const ephemeralText = await page.locator('.save-status-success').innerText();
    const afterKeys = await page.evaluate(() => Object.keys(localStorage).sort());
    record('P0-03 ephemeral work reports non-save and creates no work key', ephemeralText === 'このワークの入力は保存されません。閉じると消えます。' && JSON.stringify(beforeKeys) === JSON.stringify(afterKeys), { ephemeralText, beforeKeys, afterKeys });
    await page.close();
  }

  // P0-02/P0-03: every work can be ended from its empty initial state, and each result follows the shared policy.
  {
    const storageKeys = {
      1: 'worksheet_auto_save_v1',
      2: 'dots_work_state_v3',
      5: 'act_worksheet_standalone_data',
      8: 'control_map_state_v1',
    };
    const emptyFinishEvidence = [];
    for (let workId = 1; workId <= 8; workId += 1) {
      const context = await browser.newContext({ viewport: views[0] });
      const page = await context.newPage();
      await page.goto(`${base}/#work/${workId}`, { waitUntil: 'networkidle' });
      const frame = frameFor(page);
      const initialText = (await frame.locator('body').innerText()).trim();
      const beforeKeys = await page.evaluate(() => Object.keys(localStorage).sort());
      await page.click('#finish-work');
      await page.click('#finish-confirm');
      await page.locator('.save-status-success').waitFor();
      const resultText = await page.locator('.save-status-success').innerText();
      const afterKeys = await page.evaluate(() => Object.keys(localStorage).sort());
      const mode = expectedModes[workId - 1];
      const modeMatches = mode === 'persisted'
        ? /このブラウザに保存しました（\d{2}:\d{2}）/.test(resultText) && afterKeys.includes(storageKeys[workId])
        : resultText === 'このワークの入力は保存されません。閉じると消えます。' && JSON.stringify(beforeKeys) === JSON.stringify(afterKeys);
      emptyFinishEvidence.push({ workId, mode, initialTextLength: initialText.length, resultText, beforeKeys, afterKeys, pass: initialText.length > 0 && modeMatches });
      await context.close();
    }
    record('P0-02/P0-03 all eight empty/interrupted finish paths follow data policy', emptyFinishEvidence.every(item => item.pass), { emptyFinishEvidence });
  }

  {
    const page = await browser.newPage({ viewport: views[0] });
    await page.goto(`${base}/#work/2`, { waitUntil: 'networkidle' });
    const frame = frameFor(page);
    await frame.evaluate(() => {
      const original = Storage.prototype.setItem;
      window.__restoreSetItem = () => { Storage.prototype.setItem = original; };
      Storage.prototype.setItem = () => { throw new DOMException('quota test', 'QuotaExceededError'); };
    });
    await page.click('#finish-work');
    await page.click('#finish-confirm');
    await page.locator('.save-status-error').waitFor();
    const failureUi = await page.evaluate(() => ({
      alert: document.querySelector('[role="alert"]')?.innerText,
      actions: ['finish-result-retry', 'finish-result-copy', 'finish-result-file', 'finish-result-close'].every(id => !!document.getElementById(id)),
    }));
    await page.screenshot({ path: path.join(out, 'p0-finish-storage-failure.png') });
    record('P0-03 storage failure blocks close and offers recovery actions', failureUi.alert?.includes('保存できませんでした') && failureUi.alert?.includes('保存容量') && failureUi.actions, failureUi);
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: views[0] });
    await page.goto(`${base}/#work/3`, { waitUntil: 'networkidle' });
    await page.locator('#work-frame').evaluate(frame => { frame.src = 'about:blank'; });
    await page.waitForTimeout(100);
    await page.click('#finish-work');
    await page.click('#finish-confirm');
    await page.locator('.save-status-error').waitFor({ timeout: 4000 });
    const timeoutText = await page.locator('.save-status-error').innerText();
    record('P0-03 handshake timeout does not show false success', timeoutText.includes('保存結果が返りませんでした') && !timeoutText.includes('保存しました'), { timeoutText });
    await page.close();
  }

  // P0-04: all five exercises share all five neutral result branches.
  {
    const page = await browser.newPage({ viewport: views[0] });
    await page.goto(`${base}/#work/3`, { waitUntil: 'networkidle' });
    const frame = frameFor(page);
    const exercises = ['emotion', 'whitebear', 'slider', 'strategy', 'weather'];
    const branches = [
      ['lower', '下がった'], ['same', 'ほぼ同じ'], ['higher', '上がった'], ['fluctuated', '行き来した'], ['unknown', '分からない'],
    ];
    const branchEvidence = [];
    for (const exercise of exercises) {
      for (const [value, label] of branches) {
        await frame.evaluate(({ exercise }) => {
          state.exerciseId = exercise;
          state.step = 'result_summary';
          state.observedChange = '';
          render();
        }, { exercise });
        await frame.locator(`input[name="neutral-change"][value="${value}"]`).click();
        const summary = await frame.locator('[data-neutral-summary]').innerText();
        const selected = await frame.locator('[data-selected-change]').getAttribute('data-selected-change');
        const file = path.join(out, `p0-work3-${exercise}-${value}.png`);
        await page.waitForTimeout(600);
        await page.screenshot({ path: file });
        branchEvidence.push({ exercise, value, selected, file, complete: summary.includes(label) && summary.includes('あなたが入力・選択したこと') && summary.includes('一つの見方') && summary.includes('次に選べること') });
      }
    }
    record('P0-04 five exercises expose five equal neutral branches', branchEvidence.length === 25 && branchEvidence.every(item => item.selected === item.value && item.complete), { branchEvidence });

    await frame.evaluate(() => {
      state.exerciseId = 'slider';
      state.step = 'reflection';
      render();
    });
    await frame.locator('#chk-immediate-safety').click();
    const crisisText = await frame.locator('[role="alert"]').innerText();
    const crisisHref = await frame.locator('[role="alert"] a').getAttribute('href');
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(out, 'p0-work3-crisis-route.png') });
    record('P0-08 work3 self-harm choice opens calm crisis route without detailed input', crisisText.includes('安全の確保を優先') && crisisText.includes('相談先') && !crisisText.includes('救急車') && !crisisText.includes('119') && crisisHref === 'https://www.mhlw.go.jp/mamorouyokokoro/' && await frame.locator('#crisis-close').count() === 1, { crisisText, crisisHref });
    await page.close();
  }

  // P0-05: repeated dragging never manufactures additional negative notifications.
  {
    const page = await browser.newPage({ viewport: views[0] });
    await page.goto(`${base}/#work/4`, { waitUntil: 'networkidle' });
    const frame = frameFor(page);
    await frame.locator('#btn-add').click();
    const emptyCount = await frame.locator('.notification').count();
    await frame.locator('#notification-input').fill('本人が入力した通知');
    await frame.locator('#btn-add').click();
    const before = await frame.locator('.notification').count();
    await frame.locator('.notification').first().evaluate((element) => {
      for (let index = 0; index < 100; index += 1) {
        const start = new MouseEvent('mousedown', { bubbles: true, clientX: 240, clientY: 200 });
        element.dispatchEvent(start);
        document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 260 + (index % 5), clientY: 210 }));
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 260, clientY: 210 }));
      }
    });
    const after = await frame.locator('.notification').count();
    const statusTexts = [];
    statusTexts.push(await frame.locator('#status-text').innerText());
    await frame.locator('#btn-anchor').click();
    statusTexts.push(await frame.locator('#status-text').innerText());
    const authoredTexts = await frame.locator('.notification').allInnerTexts();
    const anchorState = await frame.locator('#btn-anchor').getAttribute('aria-pressed');
    record('P0-05 empty input and 100 drags add no automatic notification; toggle stays descriptive', emptyCount === 0 && before === 1 && before === after && authoredTexts.every(text => text === '本人が入力した通知') && statusTexts.every(text => text.startsWith('表示:')) && anchorState === 'true', { emptyCount, before, after, authoredTexts, statusTexts, anchorState });
    await page.close();
  }

  // P0-06: the learner-authored action survives backward/forward navigation and is summarized verbatim.
  {
    const page = await browser.newPage({ viewport: views[0] });
    await page.goto(`${base}/#work/7`, { waitUntil: 'networkidle' });
    const frame = frameFor(page);
    await frame.evaluate(() => { state.currentStep = 4; state.actionText = ''; render(); });
    const action = '支援者に相談する時間を決める';
    await frame.locator('#input-action').fill(action);
    await frame.evaluate(() => goToStep(3));
    await frame.evaluate(() => goToStep(4));
    const restoredAction = await frame.locator('#input-action').inputValue();
    await frame.locator('.btn-main').click();
    const endText = await frame.locator('#step-content').innerText();
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(out, 'p0-work7-authored-action.png') });
    record('P0-06 work7 preserves and summarizes the authored action', restoredAction === action && endText.includes(`あなたが入力したこと：${action}`) && endText.includes('このワークの入力は保存されません'), { restoredAction, endText });
    await page.close();
  }

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
    await frame.locator('body').evaluate(() => {
      App.state.isUserPaused = true;
      App.updateRiverPausedState();
      App.state.activeLeaves.forEach((item, index) => {
        item.isFalling = false;
        item.x = 40 + index * 55;
        item.y = 100 + index * 35;
        item.el.style.transform = `translate(${item.x}px, ${item.y}px)`;
      });
    });
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
      const isVisible = candidate => {
        const style = getComputedStyle(candidate);
        const rect = candidate.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      };
      return {
        placeholder: element.getAttribute('placeholder'),
        enterkeyhint: element.getAttribute('enterkeyhint'),
        focused: document.activeElement === element,
        value: element.value,
        visibleInputs: Array.from(document.querySelectorAll('#main-ui-area input')).filter(isVisible).length,
        visibleGuides: Array.from(document.querySelectorAll('#main-guide, .input-label, .enter-hint')).filter(isVisible).length,
        visibleSubmitButtons: Array.from(document.querySelectorAll('#btn-add-leaf')).filter(isVisible).length,
        position: getComputedStyle(document.querySelector('.ui-area')).position,
        panel: { top: panel.top, rightGap: innerWidth - panel.right, width: panel.width, height: panel.height },
        leaves,
        visibleLeaves: leaves.filter(leaf => leaf.visibleWidth >= 40 && leaf.visibleHeight >= 40).length,
        overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
      };
    });
    const expectedPanelWidth = viewport.name.startsWith('landscape') ? 287 : 265;
    record(`work6 ${viewport.name} input-only/enter/focus/safe-area`, after === before + 3 && info.visibleLeaves >= 1 && info.placeholder === '書いて改行で葉に乗せます' && info.enterkeyhint === 'send' && info.focused && info.value === '' && info.visibleInputs === 1 && info.visibleGuides === 0 && info.visibleSubmitButtons === 0 && info.position === 'absolute' && info.panel.top >= 7 && info.panel.rightGap >= 11 && Math.abs(info.panel.width - expectedPanelWidth) <= 1 && info.panel.height <= 70 && info.overflow <= 1, { before, after, info });
    await page.close();
  }

  // Work 6 desktop keeps the prior full guide/label/button UI rather than the compact mobile-only presentation.
  {
    const page = await browser.newPage({ viewport: views[0] });
    await page.goto(`${base}/#work/6`);
    const frame = page.frameLocator('#work-frame');
    await frame.locator('#btn-start').click();
    await frame.locator('#btn-prepare-next').click();
    const desktopUi = await frame.locator('#main-ui-area').evaluate(panel => {
      const visible = selector => Array.from(document.querySelectorAll(selector)).filter(element => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      }).length;
      return {
        position: getComputedStyle(panel).position,
        labels: visible('.input-label'),
        hints: visible('.enter-hint'),
        submitButtons: visible('#btn-add-leaf'),
        modeButtons: visible('.mode-selector .mode-btn'),
      };
    });
    record('work6 desktop keeps conventional full controls', desktopUi.position === 'static' && desktopUi.labels === 1 && desktopUi.hints === 1 && desktopUi.submitButtons === 1 && desktopUi.modeButtons === 3, desktopUi);
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
    const decoded = Object.fromEntries(Object.entries(downloaded.storage).map(([key, value]) => [key, JSON.parse(value)]));
    const preserved = decoded.mentalCareWorkbookProfile.name === 'QAテスト'
      && decoded.worksheet_auto_save_v1.q1 === '互換性テスト'
      && decoded.dots_work_state_v3.currentStep === 2
      && decoded.act_worksheet_standalone_data.sample === true
      && decoded.control_map_state_v1.sample === 'ok';
    const upgraded = ['worksheet_auto_save_v1', 'dots_work_state_v3', 'act_worksheet_standalone_data', 'control_map_state_v1']
      .every(key => decoded[key].schemaVersion === 2);
    record('backup schema v2 preserves stored v1 values', downloaded._workbookBackup?.schemaVersion === 2 && preserved && upgraded, { keys: Object.keys(downloaded.storage), schemaVersion: downloaded._workbookBackup?.schemaVersion, preserved, upgraded });
    await page.close();
  }

  // P1B three-layer feedback: every work keeps authored/selected content in the input layer.
  {
    const sentinel = '本人入力_SENTINEL_73Q';
    const feedbackEvidence = [];
    for (let workId = 1; workId <= 8; workId += 1) {
      const context = await browser.newContext({ viewport: views[0] });
      if (workId === 5) {
        await context.addInitScript(({ sentinel }) => {
          localStorage.setItem('act_worksheet_standalone_data', JSON.stringify({
            schemaVersion: 2,
            availableDomains: ['健康'],
            selectedDomains: ['健康'],
            domainData: { 健康: { keywords: [sentinel], supportFocus: false, next_small_step: '' } },
            step: 'summary',
            currentDomainIndex: 0,
          }));
        }, { sentinel });
      }
      const page = await context.newPage();
      await page.goto(`${base}/#work/${workId}`, { waitUntil: 'networkidle' });
      const frame = frameFor(page);
      let expected = sentinel;
      if (workId === 1) {
        await frame.locator('#basicScene').fill(sentinel);
        await frame.locator('.header-actions .btn-blue').click();
      } else if (workId === 2) {
        await frame.evaluate(({ sentinel }) => { state.basic.staff = sentinel; currentStep = 6; render(); }, { sentinel });
      } else if (workId === 3) {
        expected = 'ほぼ同じ';
        await frame.evaluate(() => { state.exerciseId = 'emotion'; state.step = 'result_summary'; state.observedChange = 'same'; render(); });
      } else if (workId === 4) {
        await frame.locator('#value-input').fill(sentinel);
        await frame.locator('#btn-review').click();
      } else if (workId === 6) {
        await frame.evaluate(({ sentinel }) => { App.state.authoredLeafTexts = [sentinel]; App.showScreen('screen-reflect'); }, { sentinel });
        await frame.locator('#btn-finish-reflect').click();
      } else if (workId === 7) {
        await frame.evaluate(({ sentinel }) => { state.currentStep = 5; state.actionText = sentinel; render(); }, { sentinel });
      } else if (workId === 8) {
        await frame.evaluate(({ sentinel }) => { state.nextStep.action = sentinel; goToStep(6); }, { sentinel });
      }
      const layers = await frame.locator('[data-feedback-layer]').evaluateAll(elements => elements.map(element => ({ layer: element.dataset.feedbackLayer, text: element.innerText })));
      const inputText = layers.find(item => item.layer === 'input')?.text || '';
      const leaked = layers.filter(item => item.layer !== 'input').some(item => item.text.includes(expected));
      feedbackEvidence.push({ workId, expected, layers: layers.map(item => item.layer), inputHasExpected: inputText.includes(expected), leaked });
      await context.close();
    }
    record('P1B all eight runtime summaries preserve authored or selected content only in input layer', feedbackEvidence.every(item => item.layers.join(',') === 'input,view,next' && item.inputHasExpected && !item.leaked), { feedbackEvidence });
  }

  // Empty paths must never present generated interpretation as learner-authored content.
  {
    const emptyEvidence = [];
    for (let workId = 1; workId <= 8; workId += 1) {
      const context = await browser.newContext({ viewport: views[0] });
      if (workId === 5) {
        await context.addInitScript(() => {
          localStorage.setItem('act_worksheet_standalone_data', JSON.stringify({ schemaVersion: 2, availableDomains: [], selectedDomains: [], domainData: {}, step: 'summary', currentDomainIndex: 0 }));
        });
      }
      const page = await context.newPage();
      await page.goto(`${base}/#work/${workId}`, { waitUntil: 'networkidle' });
      const frame = frameFor(page);
      if (workId === 1) await frame.locator('.header-actions .btn-blue').click();
      else if (workId === 2) await frame.evaluate(() => { currentStep = 6; render(); });
      else if (workId === 3) await frame.evaluate(() => { state.exerciseId = 'emotion'; state.step = 'result_summary'; state.observedChange = ''; render(); });
      else if (workId === 4) await frame.locator('#btn-review').click();
      else if (workId === 6) {
        await frame.evaluate(() => { App.state.authoredLeafTexts = []; App.showScreen('screen-reflect'); });
        await frame.locator('#btn-finish-reflect').click();
      } else if (workId === 7) await frame.evaluate(() => { state.currentStep = 5; state.actionText = ''; render(); });
      else if (workId === 8) await frame.evaluate(() => goToStep(6));
      const layers = await frame.locator('[data-feedback-layer]').evaluateAll(elements => elements.map(element => ({ layer: element.dataset.feedbackLayer, text: element.innerText })));
      const inputText = layers.find(item => item.layer === 'input')?.text || '';
      const generatedMarkers = ['一つの見方', '次に選べること', '同じ行動でも', 'この一回から一般的な結論'];
      const noGeneratedAttribution = !generatedMarkers.some(marker => inputText.includes(marker));
      const validEmptyState = workId === 3 ? layers.length === 0 : layers.map(item => item.layer).join(',') === 'input,view,next';
      emptyEvidence.push({ workId, layers: layers.map(item => item.layer), inputText: inputText.slice(0, 180), noGeneratedAttribution, validEmptyState });
      await context.close();
    }
    record('P1B empty summaries do not attribute generated material to the learner', emptyEvidence.every(item => item.noGeneratedAttribution && item.validEmptyState), { emptyEvidence });
  }

  // P1B work 6: learner-controlled cleanup, shore roundtrip, repeat and pause.
  {
    const page = await browser.newPage({ viewport: views[0] });
    await page.goto(`${base}/#work/6`, { waitUntil: 'networkidle' });
    const frame = frameFor(page);
    await frame.locator('#btn-start').click();
    await frame.locator('#btn-prepare-next').click();
    await frame.locator('#leaf-input').fill('同じ言葉の確認');
    await frame.locator('#leaf-input').press('Enter');
    await frame.locator('#btn-repeat-last').click();
    await frame.locator('#btn-pause-resume').click();
    const paused = await frame.locator('#river').evaluate(element => element.classList.contains('paused'));
    await frame.locator('#btn-move-shore').click();
    const shoreCount = await frame.evaluate(() => App.state.shoreLeaves.length);
    await frame.locator('#btn-restore-shore').click();
    const restoredCount = await frame.evaluate(() => App.state.activeLeaves.filter(item => item.text === '同じ言葉の確認').length);
    await page.screenshot({ path: path.join(out, 'p1b-work6-controls-desktop.png') });
    page.once('dialog', dialog => dialog.accept());
    await frame.locator('#btn-clear-leaves').click();
    const cleared = await frame.evaluate(() => ({ active: App.state.activeLeaves.length, shore: App.state.shoreLeaves.length, authored: App.state.authoredLeafTexts }));
    const labels = await frame.locator('.control-actions').innerText();
    const intro = await frame.locator('#intro-desc').innerText();
    record('P1B work6 learner controls repeat, pause, shore restore and screen cleanup', paused && shoreCount === 2 && restoredCount === 2 && cleared.active === 0 && cleared.shore === 0 && cleared.authored.length === 2 && labels.includes('岸から戻す') && labels.includes('画面の葉を片づける') && intro.includes('同じ言葉を何度乗せても') && intro.includes('途中で止めても大丈夫'), { paused, shoreCount, restoredCount, cleared, labels, intro });
    await page.close();
  }

  // P2 backup preview, cancel/confirm, malformed files, rejected-file recovery and atomic rollback.
  {
    const page = await browser.newPage({ viewport: views[0], acceptDownloads: true });
    await page.goto(`${base}/#home`, { waitUntil: 'networkidle' });
    const existing = {
      mentalCareWorkbookProfile: JSON.stringify({ name: '既存の名前' }),
      worksheet_auto_save_v1: JSON.stringify({ schemaVersion: 2, basicScene: '既存work1' }),
      dots_work_state_v3: JSON.stringify({ schemaVersion: 2, basic: { staff: '既存work2' } }),
    };
    await page.evaluate(values => { localStorage.clear(); Object.entries(values).forEach(([key, value]) => localStorage.setItem(key, value)); }, existing);
    await page.reload({ waitUntil: 'networkidle' });
    const backup = {
      _workbookBackup: { app: 'mental-care-workbook', scope: 'full-workbook', schemaVersion: 2 },
      storage: {
        mentalCareWorkbookProfile: JSON.stringify({ name: '読込後の名前' }),
        worksheet_auto_save_v1: JSON.stringify({ schemaVersion: 2, basicScene: '読込work1' }),
        dots_work_state_v3: JSON.stringify({ schemaVersion: 2, basic: { staff: '読込work2' } }),
      },
    };
    const upload = async (name, text) => page.locator('#import-full-backup').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(text) });
    const beforeCancel = await page.evaluate(() => ({ ...localStorage }));
    await upload('valid.json', JSON.stringify(backup));
    const previewText = await page.locator('[role="dialog"]').innerText();
    await page.screenshot({ path: path.join(out, 'p2-import-preview-desktop.png') });
    await page.locator('#import-cancel').click();
    const afterCancel = await page.evaluate(() => ({ ...localStorage }));
    record('P2 backup preview names target works, overwrite count and excluded experiential works; cancel is immutable', previewText.includes('work1・2') && previewText.includes('表紙') && previewText.includes('現在の記録3件を上書き') && previewText.includes('work3・4・6・7') && JSON.stringify(beforeCancel) === JSON.stringify(afterCancel), { previewText, storageUnchanged: JSON.stringify(beforeCancel) === JSON.stringify(afterCancel) });

    await upload('valid.json', JSON.stringify(backup));
    await page.locator('#import-confirm').click();
    await page.locator('[role="status"]').waitFor();
    const applied = await page.evaluate(() => ({ ...localStorage }));
    record('P2 backup confirm applies all prepared entries together', JSON.parse(applied.mentalCareWorkbookProfile).name === '読込後の名前' && JSON.parse(applied.worksheet_auto_save_v1).basicScene === '読込work1' && JSON.parse(applied.dots_work_state_v3).basic.staff === '読込work2', { keys: Object.keys(applied), status: await page.locator('[role="status"]').innerText() });

    const invalidFiles = [
      ['malformed.json', '{broken'],
      ['wrong-type.json', JSON.stringify({ _workbookBackup: backup._workbookBackup, storage: { worksheet_auto_save_v1: { schemaVersion: 2 } } })],
      ['partial-corrupt.json', JSON.stringify({ _workbookBackup: backup._workbookBackup, storage: { mentalCareWorkbookProfile: JSON.stringify({ name: '部分' }), worksheet_auto_save_v1: '{broken' } })],
    ];
    const invalidEvidence = [];
    for (const [name, text] of invalidFiles) {
      const before = await page.evaluate(() => ({ ...localStorage }));
      await upload(name, text);
      await page.locator('[role="alert"]').waitFor();
      const after = await page.evaluate(() => ({ ...localStorage }));
      invalidEvidence.push({ name, unchanged: JSON.stringify(before) === JSON.stringify(after), alert: await page.locator('[role="alert"]').innerText(), download: await page.locator('#download-rejected-backup').count() === 1 });
    }
    const rejectedDownload = page.waitForEvent('download');
    await page.locator('[role="alert"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(out, 'p2-import-error-desktop.png') });
    await page.locator('#download-rejected-backup').click();
    const rejected = await rejectedDownload;
    await rejected.saveAs(path.join(out, 'rejected-partial-corrupt.json'));
    record('P2 malformed, type-invalid and partially corrupt backup preserve storage and remain downloadable', invalidEvidence.every(item => item.unchanged && item.alert.includes('現在の記録は変更していません') && item.download), { invalidEvidence, suggestedFilename: rejected.suggestedFilename() });

    await page.evaluate(values => { localStorage.clear(); Object.entries(values).forEach(([key, value]) => localStorage.setItem(key, value)); }, existing);
    await page.reload({ waitUntil: 'networkidle' });
    const beforeQuota = await page.evaluate(() => ({ ...localStorage }));
    await upload('quota.json', JSON.stringify(backup));
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      let writes = 0;
      Storage.prototype.setItem = function setItemWithOneQuotaFailure(key, value) {
        writes += 1;
        if (writes === 2) throw new DOMException('quota test', 'QuotaExceededError');
        return original.call(this, key, value);
      };
    });
    await page.locator('#import-confirm').click();
    await page.locator('[role="alert"]').waitFor();
    const afterQuota = await page.evaluate(() => ({ ...localStorage }));
    record('P2 QuotaExceeded import restores exact existing storage with zero partial writes', JSON.stringify(beforeQuota) === JSON.stringify(afterQuota) && !Object.values(afterQuota).some(value => value.includes('読込')), { unchanged: JSON.stringify(beforeQuota) === JSON.stringify(afterQuota), beforeQuota, afterQuota, alert: await page.locator('[role="alert"]').innerText() });
    await page.close();
  }

  // P2 supporter guide and learner-first language boundary.
  {
    const page = await browser.newPage({ viewport: views[0] });
    await page.goto(`${base}/#home`, { waitUntil: 'networkidle' });
    const privateSentinel = '保存データ_PRIVATE_SENTINEL_9K';
    await page.evaluate(value => localStorage.setItem('worksheet_auto_save_v1', JSON.stringify({ private: value })), privateSentinel);
    await page.locator('#show-support-guide').click();
    const guideText = await page.locator('.supporter-guide-copy').innerText();
    const bodyText = await page.locator('body').innerText();
    const guideMarkers = ['本人と先に決めます', '本人が希望した範囲', '点数化せず', '共用端末', 'ワークを続けず', 'コピー・提出・共有しません'];
    await page.screenshot({ path: path.join(out, 'p2-support-guide-desktop.png') });
    record('P2 supporter guide covers consent, assistance scope, non-scoring, privacy, crisis switch and sharing without exposing saved data', guideMarkers.every(marker => guideText.includes(marker)) && !bodyText.includes(privateSentinel), { guideMarkers, guideText, privateSentinelVisible: bodyText.includes(privateSentinel) });
    await page.locator('#support-guide-close').click();

    const forbiddenJargon = ['認知的フュージョン', '脱フュージョン', '心理的柔軟性', '随伴性', '機能分析', 'コミットメント・アクション'];
    const homeAndCards = await page.locator('#app').innerText();
    await page.locator('.work-card').first().click();
    const modalText = await page.locator('[role="dialog"]').innerText();
    const sourceHref = await page.locator('.work-background-details a').getAttribute('href');
    await page.locator('.work-background-details summary').click();
    const backgroundText = await page.locator('.work-background-details').innerText();
    const jargonHits = forbiddenJargon.filter(term => `${homeAndCards}\n${modalText}`.includes(term));
    record('P2 learner-led route has zero prohibited jargon and background disclosure has plain definition plus source URL', jargonHits.length === 0 && backgroundText.includes('考えや気持ちを消すことを目標にせず') && sourceHref === 'https://contextualscience.org/about_act', { jargonHits, backgroundText, sourceHref });
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
