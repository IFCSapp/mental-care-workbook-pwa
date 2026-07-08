#!/usr/bin/env node
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const reportDir = path.join(rootDir, 'reports', 'visual-check');
const viewports = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1366, height: 900 },
];

const args = new Map();
for (const arg of process.argv.slice(2)) {
  const [key, ...rest] = arg.replace(/^--/, '').split('=');
  args.set(key, rest.length ? rest.join('=') : 'true');
}

const explicitUrl = args.get('url') || process.env.VISUAL_CHECK_URL;
const baseUrl = explicitUrl || `http://127.0.0.1:${args.get('port') || process.env.VISUAL_CHECK_PORT || 4174}`;
const routeArg = args.get('routes') || process.env.VISUAL_CHECK_ROUTES;
const includeWorks = args.get('include-works') === 'true' || process.env.VISUAL_CHECK_INCLUDE_WORKS === 'true';
const tolerance = Number(args.get('tolerance') || 2);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url, timeoutMs = 30_000) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok || res.status < 500) return;
      lastError = new Error(`HTTP ${res.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(500);
  }
  throw new Error(`dev server did not become ready: ${lastError?.message || 'timeout'}`);
}

async function discoverRoutes() {
  if (routeArg) {
    return routeArg.split(',').map((route) => route.trim()).filter(Boolean);
  }

  const routes = ['/'];
  if (includeWorks) {
    const worksDir = path.join(rootDir, 'public', 'works');
    if (existsSync(worksDir)) {
      const files = await readdir(worksDir);
      for (const file of files.filter((name) => name.endsWith('.html')).sort()) {
        routes.push(`/works/${encodeURIComponent(file)}`);
      }
    }
  }
  return routes;
}

function routeToUrl(route) {
  if (/^https?:\/\//.test(route)) return route;
  const normalized = route.startsWith('/') ? route : `/${route}`;
  return new URL(normalized, baseUrl).toString();
}

function safeName(route) {
  return route.replace(/^https?:\/\//, '').replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'root';
}

async function inspectPage(page, viewport) {
  return await page.evaluate(({ viewport, tolerance }) => {
    const width = document.documentElement.scrollWidth;
    const bodyWidth = document.body?.scrollWidth || 0;
    const viewportWidth = window.innerWidth;
    const horizontalOverflow = Math.max(width, bodyWidth) - viewportWidth;

    const selectors = [
      'button', 'a', 'input', 'textarea', 'select', '[role="button"]',
      '.work-card', '.modal', '.modal-content', '.card', 'form', 'iframe', '[class*="card"]'
    ];

    const candidates = Array.from(document.querySelectorAll(selectors.join(',')));
    const protrusions = [];

    for (const element of candidates) {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      const visible = rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      if (!visible) continue;

      // Full-page screenshots intentionally include content below the first viewport.
      // For this lightweight visual check, report horizontal protrusion and elements
      // clipped above the viewport; normal below-the-fold content is not a finding.
      const out = {
        left: rect.left < -tolerance,
        right: rect.right > viewport.width + tolerance,
        top: rect.top < -tolerance,
        bottom: false,
      };

      if (out.left || out.right || out.top) {
        protrusions.push({
          tag: element.tagName.toLowerCase(),
          className: String(element.className || ''),
          id: element.id || '',
          text: (element.innerText || element.getAttribute('aria-label') || element.getAttribute('title') || '').trim().slice(0, 80),
          rect: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            right: Math.round(rect.right),
            bottom: Math.round(rect.bottom),
          },
          out,
        });
      }
    }

    return {
      title: document.title,
      url: location.href,
      viewport,
      documentWidth: Math.max(width, bodyWidth),
      viewportWidth,
      horizontalOverflow,
      hasHorizontalOverflow: horizontalOverflow > tolerance,
      protrusions,
    };
  }, { viewport, tolerance });
}

let server;
let browser;
const summary = {
  startedAt: new Date().toISOString(),
  baseUrl,
  usedExternalServer: Boolean(explicitUrl),
  reportDir,
  routes: [],
  totals: {
    screenshots: 0,
    consoleErrors: 0,
    pageErrors: 0,
    requestFailures: 0,
    horizontalOverflow: 0,
    protrusions: 0,
  },
};

try {
  await mkdir(reportDir, { recursive: true });

  if (!explicitUrl) {
    const port = new URL(baseUrl).port || '4174';
    server = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', port, '--strictPort'], {
      cwd: rootDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, BROWSER: 'none' },
    });
    server.stdout.on('data', (chunk) => process.stdout.write(`[dev-server] ${chunk}`));
    server.stderr.on('data', (chunk) => process.stderr.write(`[dev-server] ${chunk}`));
    await waitForServer(baseUrl);
  } else {
    await waitForServer(baseUrl);
  }

  const routes = await discoverRoutes();
  browser = await chromium.launch();

  for (const route of routes) {
    const routeResult = { route, url: routeToUrl(route), checks: [] };
    summary.routes.push(routeResult);

    for (const viewport of viewports) {
      const page = await browser.newPage({ viewport });
      const consoleErrors = [];
      const pageErrors = [];
      const requestFailures = [];

      page.on('console', (message) => {
        if (['error', 'warning'].includes(message.type())) {
          consoleErrors.push({ type: message.type(), text: message.text() });
        }
      });
      page.on('pageerror', (error) => pageErrors.push({ message: error.message }));
      page.on('requestfailed', (request) => {
        requestFailures.push({ url: request.url(), failure: request.failure()?.errorText || 'request failed' });
      });

      const response = await page.goto(routeResult.url, { waitUntil: 'networkidle', timeout: 30_000 });
      await page.waitForTimeout(250);
      const screenshot = path.join(reportDir, `${safeName(route)}-${viewport.name}.png`);
      await page.screenshot({ path: screenshot, fullPage: true });
      const inspection = await inspectPage(page, viewport);

      const check = {
        viewport: viewport.name,
        status: response?.status() || null,
        screenshot,
        consoleErrors,
        pageErrors,
        requestFailures,
        inspection,
      };
      routeResult.checks.push(check);

      summary.totals.screenshots += 1;
      summary.totals.consoleErrors += consoleErrors.length;
      summary.totals.pageErrors += pageErrors.length;
      summary.totals.requestFailures += requestFailures.length;
      summary.totals.horizontalOverflow += inspection.hasHorizontalOverflow ? 1 : 0;
      summary.totals.protrusions += inspection.protrusions.length;

      await page.close();
    }
  }

  summary.finishedAt = new Date().toISOString();
  summary.ok = summary.totals.consoleErrors === 0 &&
    summary.totals.pageErrors === 0 &&
    summary.totals.requestFailures === 0 &&
    summary.totals.horizontalOverflow === 0 &&
    summary.totals.protrusions === 0;

  const jsonPath = path.join(reportDir, 'summary.json');
  const mdPath = path.join(reportDir, 'summary.md');
  await writeFile(jsonPath, JSON.stringify(summary, null, 2));
  await writeFile(mdPath, [
    '# Visual check summary',
    '',
    `- Base URL: ${summary.baseUrl}`,
    `- External server: ${summary.usedExternalServer ? 'yes' : 'no'}`,
    `- Screenshots: ${summary.totals.screenshots}`,
    `- Console errors/warnings: ${summary.totals.consoleErrors}`,
    `- Page errors: ${summary.totals.pageErrors}`,
    `- Request failures: ${summary.totals.requestFailures}`,
    `- Horizontal overflow findings: ${summary.totals.horizontalOverflow}`,
    `- Viewport protrusions: ${summary.totals.protrusions}`,
    `- Result: ${summary.ok ? 'OK' : 'CHECK FINDINGS'}`,
    '',
    '## Files',
    '',
    `- ${jsonPath}`,
    ...summary.routes.flatMap((route) => route.checks.map((check) => `- ${check.screenshot}`)),
    '',
    '## Routes',
    '',
    ...summary.routes.flatMap((route) => [
      `### ${route.route}`,
      '',
      ...route.checks.map((check) => `- ${check.viewport}: status ${check.status}, overflow ${check.inspection.horizontalOverflow}px, protrusions ${check.inspection.protrusions.length}, console ${check.consoleErrors.length}, page ${check.pageErrors.length}, requests ${check.requestFailures.length}`),
      '',
    ]),
  ].join('\n'));

  console.log(`visual-check ${summary.ok ? 'OK' : 'completed with findings'}`);
  console.log(`summary: ${jsonPath}`);
  console.log(`markdown: ${mdPath}`);
  process.exitCode = summary.ok ? 0 : 1;
} catch (error) {
  summary.finishedAt = new Date().toISOString();
  summary.ok = false;
  summary.error = error.stack || error.message;
  await mkdir(reportDir, { recursive: true });
  await writeFile(path.join(reportDir, 'summary.json'), JSON.stringify(summary, null, 2));
  console.error(error.stack || error.message);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (server && !server.killed) {
    server.kill('SIGTERM');
    await Promise.race([
      new Promise((resolve) => server.once('exit', resolve)),
      sleep(2000),
    ]);
  }
}

process.exit(process.exitCode || 0);
