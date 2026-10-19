// Made By Eng Nayer Nader
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";

const root = resolve("public");
const htmlFiles = readdirSync(root)
  .filter((name) => extname(name) === ".html")
  .sort();
const errors = [];
const warnings = [];
const idsByFile = new Map();

function stripQuery(value) {
  return value.split("?")[0].split("#")[0];
}

function localTarget(fromFile, value) {
  if (!value || /^(?:https?:|mailto:|tel:|data:|javascript:|#)/i.test(value)) return null;
  return resolve(dirname(fromFile), stripQuery(value));
}

for (const name of htmlFiles) {
  const file = join(root, name);
  const html = readFileSync(file, "utf8");
  const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map((match) => match[1]);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicateIds.length) errors.push(`${name}: duplicate ids ${[...new Set(duplicateIds)].join(", ")}`);
  idsByFile.set(name, new Set(ids));

  if (!/<html\b[^>]*\blang=["'][^"']+["']/i.test(html)) errors.push(`${name}: missing html lang`);
  if (!/<title>[^<]+<\/title>/i.test(html)) errors.push(`${name}: missing title`);
  if (name !== "404.html" && !/<meta\s+name=["']description["']\s+content=["'][^"']+/i.test(html)) errors.push(`${name}: missing meta description`);
  if (name !== "404.html" && !/<link\s+rel=["']canonical["']/i.test(html)) errors.push(`${name}: missing canonical`);
  if (!/<a\s+class=["']skip-link["'][^>]+href=["']#mainContent["']/i.test(html) && name !== "404.html") errors.push(`${name}: missing skip link`);

  const banned = [
    "Desk Live",
    "10 Disciplines",
    "Ten Disciplines",
    "Security &amp; Discreet Mobility",
    "Alexandria, Egypt — Worldwide",
  ];
  for (const phrase of banned) {
    if (html.includes(phrase)) errors.push(`${name}: retired phrase remains: ${phrase}`);
  }
  if (name !== "404.html") {
    for (const label of ["The Lounge", "Privileges", "Our Story", "In Frame", "Private Circle", "The Desk"]) {
      if (!html.includes(`>${label}</a>`)) errors.push(`${name}: premium navigation label missing: ${label}`);
    }
    if (!html.includes('<script src="assets/js/config.js"></script>')) errors.push(`${name}: missing endpoint configuration script`);
  }

  const imageTags = [...html.matchAll(/<img\b[^>]*>/gi)].map((match) => match[0]);
  imageTags.forEach((tag, index) => {
    if (!/\balt=["'][^"']*["']/i.test(tag)) errors.push(`${name}: image ${index + 1} missing alt`);
  });

  const refs = [...html.matchAll(/\b(?:href|src)=["']([^"']+)["']/gi)].map((match) => match[1]);
  for (const ref of refs) {
    const target = localTarget(file, ref);
    if (target && !existsSync(target)) errors.push(`${name}: missing local reference ${ref}`);
  }

  for (const script of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { JSON.parse(script[1]); }
    catch (error) { errors.push(`${name}: invalid JSON-LD (${error.message})`); }
  }
}

const servicesHtml = readFileSync(join(root, "services.html"), "utf8");
const serviceIds = [...servicesHtml.matchAll(/class=["']service-block reveal["'] id=["']svc-(\d+)["']/g)].map((match) => match[1]);
if (serviceIds.join(",") !== "01,02,03,04,05,06,07,08,09") {
  errors.push(`services.html: expected nine sequential service blocks, found ${serviceIds.join(",")}`);
}

const homeHtml = readFileSync(join(root, "index.html"), "utf8");
if ([...homeHtml.matchAll(/class=["']command-node/g)].length !== 9) errors.push("index.html: command ring must have nine nodes");
if ([...homeHtml.matchAll(/class=["']discipline-row/g)].length !== 9) errors.push("index.html: discipline list must have nine rows");

const contactHtml = readFileSync(join(root, "contact.html"), "utf8");
const serviceSelect = contactHtml.match(/<select id=["']f-service["'][\s\S]*?<\/select>/i)?.[0] || "";
if ([...serviceSelect.matchAll(/<option(?:\s|>)/g)].length - 1 !== 9) errors.push("contact.html: service selector must offer nine disciplines");

for (const name of htmlFiles) {
  const file = join(root, name);
  const html = readFileSync(file, "utf8");
  for (const match of html.matchAll(/href=["']([^"']*#[^"']+)["']/gi)) {
    const href = match[1];
    if (/^(?:https?:|mailto:|tel:|javascript:)/i.test(href)) continue;
    const [rawPath, fragment] = href.split("#");
    const targetName = rawPath ? stripQuery(rawPath).split("/").pop() : name;
    if (!targetName || !fragment) continue;
    const targetIds = idsByFile.get(targetName);
    if (targetIds && !targetIds.has(fragment)) errors.push(`${name}: unresolved fragment ${href}`);
  }
}

const manifestPath = join(root, "site.webmanifest");
try {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  for (const icon of manifest.icons || []) {
    if (!existsSync(join(root, icon.src))) errors.push(`site.webmanifest: missing icon ${icon.src}`);
  }
} catch (error) {
  errors.push(`site.webmanifest: ${error.message}`);
}

const sitemap = readFileSync(join(root, "sitemap.xml"), "utf8");
for (const required of ["services.html", "standard.html", "about.html", "gallery.html", "membership.html", "contact.html", "legal.html"]) {
  if (!sitemap.includes(required)) errors.push(`sitemap.xml: missing ${required}`);
}

const css = readFileSync(join(root, "assets/css/main.css"), "utf8");
let depth = 0;
let quote = "";
let comment = false;
for (let i = 0; i < css.length; i += 1) {
  const char = css[i];
  const next = css[i + 1];
  if (comment) {
    if (char === "*" && next === "/") { comment = false; i += 1; }
    continue;
  }
  if (!quote && char === "/" && next === "*") { comment = true; i += 1; continue; }
  if (quote) {
    if (char === "\\") { i += 1; continue; }
    if (char === quote) quote = "";
    continue;
  }
  if (char === '"' || char === "'") { quote = char; continue; }
  if (char === "{") depth += 1;
  if (char === "}") depth -= 1;
  if (depth < 0) errors.push("main.css: closing brace precedes opening brace");
}
if (depth !== 0) errors.push(`main.css: unbalanced braces (${depth})`);

if (!existsSync(join(root, "images/hero.mp4"))) errors.push("missing images/hero.mp4");
if (!htmlFiles.includes("404.html")) warnings.push("custom 404 page missing");

if (errors.length) {
  console.error(`Static validation failed with ${errors.length} issue(s):`);
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log(`Static validation passed: ${htmlFiles.length} pages, local assets, fragments, metadata, JSON-LD, manifest, sitemap and CSS structure.`);
warnings.forEach((warning) => console.warn(`Warning: ${warning}`));
