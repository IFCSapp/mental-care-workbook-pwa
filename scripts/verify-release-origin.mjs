#!/usr/bin/env node

const expectedOrigin = process.env.VITE_PRODUCT_ORIGIN;
const sharedOrigins = new Set([
  'https://ifcsapp.github.io',
]);

if (!expectedOrigin) {
  console.error('VITE_PRODUCT_ORIGIN is required for a release build. Example: https://workbook.example.jp');
  process.exit(1);
}

let parsed;
try {
  parsed = new URL(expectedOrigin);
} catch {
  console.error('VITE_PRODUCT_ORIGIN must be an absolute HTTPS origin.');
  process.exit(1);
}

if (parsed.protocol !== 'https:' || parsed.origin !== expectedOrigin || parsed.pathname !== '/') {
  console.error('VITE_PRODUCT_ORIGIN must be an HTTPS origin without a path, query, or fragment.');
  process.exit(1);
}

if (sharedOrigins.has(parsed.origin)) {
  console.error(`${parsed.origin} is shared with other IFCSapp products and cannot be used for the release build.`);
  process.exit(1);
}

console.log(`Release origin accepted: ${parsed.origin}`);
