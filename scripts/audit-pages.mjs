#!/usr/bin/env node
// Made By Eng Nayer Nader
// The C Lounge — page-by-page static audit.
// Runs with zero dependencies:  node scripts/audit-pages.mjs
// Checks structure, assets, accessibility basics, mobile layer wiring and
// the copyright signature on every page.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const SIGNATURE = 'Made By Eng Nayer Nader';

const pages = fs.readdirSync(PUBLIC_DIR).filter((f) => f.endsWith('.html')).sort();
let failures = 0;
let warnings = 0;

const fail = (page, msg) => { failures++; console.log(`  \u2718 FAIL  ${msg}`); };
const warn = (page, msg) => { warnings++; console.log(`  \u26a0 WARN  ${msg}`); };
const pass = (msg) => console.log(`  \u2713 ${msg}`);

function attrs(tag) {
  const out = {};
  for (const m of tag.matchAll(/([a-zA-Z-]+)\s*=\s*"([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}

console.log(`\nThe C Lounge \u2014 page audit  (${SIGNATURE})\n${'='.repeat(64)}`);

for (const page of pages) {
  const file = path.join(PUBLIC_DIR, page);
  const html = fs.readFileSync(file, 'utf8');
  console.log(`\n\u25b8 ${page}`);

  /* --- structure ------------------------------------------------------- */
  const required = [
    ['<!DOCTYPE html>', 'doctype'],
    ['<html lang=', 'html lang attribute'],
    ['<meta charset=', 'charset'],
    ['viewport-fit=cover', 'viewport-fit=cover (notch safe area)'],
    ['<title>', 'title'],
    ['name="description"', 'meta description'],
    ['</html>', 'closing html'],
  ];
  for (const [needle, label] of required) {
    if (html.includes(needle)) pass(label); else fail(page, `missing ${label}`);
  }

  /* --- balanced primary tags ------------------------------------------- */
  for (const tag of ['html', 'head', 'body', 'header', 'main', 'footer']) {
    const open = (html.match(new RegExp(`<${tag}[\\s>]`, 'gi')) || []).length;
    const close = (html.match(new RegExp(`</${tag}>`, 'gi')) || []).length;
    if (open !== close) fail(page, `<${tag}> unbalanced (${open} open / ${close} close)`);
  }

  /* --- duplicate ids --------------------------------------------------- */
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupes.length) fail(page, `duplicate id(s): ${[...new Set(dupes)].join(', ')}`);
  else pass('unique element ids');

  /* --- local assets exist ---------------------------------------------- */
  const refs = [...html.matchAll(/(?:src|href)="([^"#?:]+\.(?:css|js|png|jpg|jpeg|webp|svg|mp4|webmanifest|xml|txt))"/g)]
    .map((m) => m[1])
    .filter((r) => !r.startsWith('http') && !r.startsWith('//'));
  const missing = [...new Set(refs)].filter((r) => !fs.existsSync(path.join(PUBLIC_DIR, r)));
  if (missing.length) fail(page, `missing asset(s): ${missing.join(', ')}`);
  else pass(`${new Set(refs).size} local assets resolve`);

  /* --- internal links resolve ------------------------------------------ */
  const links = [...html.matchAll(/href="([a-zA-Z0-9_-]+\.html)(?:#[^"]*)?"/g)].map((m) => m[1]);
  const brokenLinks = [...new Set(links)].filter((l) => !fs.existsSync(path.join(PUBLIC_DIR, l)));
  if (brokenLinks.length) fail(page, `broken internal link(s): ${brokenLinks.join(', ')}`);
  else pass(`${new Set(links).size} internal links resolve`);

  /* --- mobile layer wiring --------------------------------------------- */
  if (html.includes('assets/css/mobile-elite.css')) pass('mobile-elite.css linked');
  else fail(page, 'mobile-elite.css not linked');
  if (html.includes('assets/js/mobile-elite.js')) pass('mobile-elite.js linked');
  else fail(page, 'mobile-elite.js not linked');
  const cssMain = html.indexOf('assets/css/main.css');
  const cssMobile = html.indexOf('assets/css/mobile-elite.css');
  if (cssMain > -1 && cssMobile > -1 && cssMobile < cssMain) {
    fail(page, 'mobile-elite.css must load AFTER main.css');
  }

  /* --- navigation ------------------------------------------------------- */
  if (page !== '404.html') {
    if (/id="navToggle"/.test(html) && /id="navMobile"/.test(html)) pass('mobile nav present');
    else fail(page, 'mobile nav (navToggle / navMobile) missing');
    if (/aria-expanded="false"/.test(html)) pass('nav toggle aria-expanded initialised');
    else warn(page, 'nav toggle missing aria-expanded');
    const drawerLinks = (html.match(/<div class="nav-mobile"[\s\S]*?<\/div>/) || [''])[0];
    const count = (drawerLinks.match(/<a /g) || []).length;
    if (count >= 6) pass(`drawer holds ${count} destinations`);
    else if (count) warn(page, `drawer holds only ${count} destinations`);
  }

  /* --- images ----------------------------------------------------------- */
  const imgs = [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
  const noAlt = imgs.filter((t) => !('alt' in attrs(t)));
  if (noAlt.length) fail(page, `${noAlt.length} <img> without alt`);
  else if (imgs.length) pass(`${imgs.length} images have alt text`);
  const noDims = imgs.filter((t) => {
    const a = attrs(t);
    if (!a.src) return false;                       // src assigned at runtime (lightbox)
    return !a.width && !a.height && !(a.class || '').includes('brand-mark');
  });
  if (noDims.length) warn(page, `${noDims.length} <img> without width/height (layout shift risk)`);

  /* --- forms ------------------------------------------------------------ */
  const inputMatches = [...html.matchAll(/<(?:input|select|textarea)\b[^>]*>/g)];
  const inputs = inputMatches.map((m) => m[0]);
  const wrappedByLabel = (index) => {
    const before = html.slice(Math.max(0, index - 400), index);
    const open = before.lastIndexOf('<label');
    return open > -1 && before.indexOf('</label>', open) === -1;
  };
  const unlabelled = inputMatches.filter((m, i) => {
    const t = m[0];
    if (wrappedByLabel(m.index)) return false;      // implicit wrapping label
    const a = attrs(t);
    if (a.type === 'hidden' || a.type === 'submit') return false;
    if (a['aria-hidden'] === 'true' || a.tabindex === '-1') return false;   // honeypot
    if (a['aria-label'] || a['aria-labelledby']) return false;
    return !(a.id && html.includes(`for="${a.id}"`));
  }).map((m) => m[0]);
  if (unlabelled.length) warn(page, `${unlabelled.length} form control(s) without a label`);
  else if (inputs.length) pass(`${inputs.length} form controls labelled`);

  /* --- security-sensitive patterns -------------------------------------- */
  if (/\bon(?:click|load|error)\s*=\s*"/.test(html)) {
    warn(page, 'inline event handler found (blocked by CSP)');
  }
  if (/sk-ant-|AIza[0-9A-Za-z_-]{30}|-----BEGIN/.test(html)) {
    fail(page, 'possible secret embedded in markup');
  } else pass('no embedded secrets');
  const externals = [...new Set([...html.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)].map((m) => new URL(m[1]).host))];
  const allowedHosts = new Set(['fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com', 'unpkg.com', 'www.thecloungeworld.com', 'wa.me', 'www.instagram.com', 'www.linkedin.com', 'schema.org']);
  const unexpected = externals.filter((h) => !allowedHosts.has(h));
  if (unexpected.length) warn(page, `external host(s) not in CSP allow-list: ${unexpected.join(', ')}`);

  /* --- signature -------------------------------------------------------- */
  // The owner's mark belongs in the source and in metadata, never rendered in
  // the interface. Assert both halves: present in the file, absent from what a
  // visitor actually sees.
  if (html.includes(SIGNATURE)) pass('signature present in source');
  else fail(page, 'signature missing from source');

  // Strip comments, <head>, and attribute values, then look for the signature
  // in what remains — that is roughly the visible text.
  const visible = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<head[\s\S]*?<\/head>/i, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\s(?:content|data-[\w-]+)="[^"]*"/gi, '');
  if (!visible.includes(SIGNATURE) && !/Nayer/i.test(visible)) pass('signature not rendered to visitors');
  else fail(page, 'signature appears in visible page content');
}

console.log(`\n${'='.repeat(64)}`);
console.log(`${pages.length} pages audited \u2014 ${failures} failure(s), ${warnings} warning(s).`);
console.log(SIGNATURE);
process.exit(failures ? 1 : 0);
