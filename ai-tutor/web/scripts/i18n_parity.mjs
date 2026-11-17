import fs from "node:fs";
import path from "node:path";

function listJsonFiles(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...listJsonFiles(full));
    else if (ent.isFile() && ent.name.endsWith(".json")) out.push(full);
  }
  return out;
}

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function flattenKeys(obj, prefix = "") {
  const keys = [];
  if (!obj || typeof obj !== "object") return keys;
  for (const [k, v] of Object.entries(obj)) {
    const next = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) keys.push(...flattenKeys(v, next));
    else keys.push(next);
  }
  return keys;
}

function toRel(p, root) {
  return path.relative(root, p).replaceAll("\\", "/");
}

const webRoot = path.resolve(process.cwd());
const localesRoot = path.join(webRoot, "locales");
const enRoot = path.join(localesRoot, "en");

if (!fs.existsSync(enRoot)) {
  console.error(`[i18n:parity] Missing locales root: ${enRoot}`);
  process.exit(2);
}

const localeCodes = fs
  .readdirSync(localesRoot, { withFileTypes: true })
  .filter((e) => e.isDirectory() && e.name !== "en")
  .map((e) => e.name)
  .sort();

if (!localeCodes.length) {
  console.error("[i18n:parity] No non-en locale directories under locales/");
  process.exit(2);
}

const enFiles = listJsonFiles(enRoot).map((p) => toRel(p, enRoot)).sort();

let ok = true;

for (const code of localeCodes) {
  const otherRoot = path.join(localesRoot, code);
  const otherFiles = listJsonFiles(otherRoot).map((p) => toRel(p, otherRoot)).sort();

  const missingFiles = enFiles.filter((f) => !otherFiles.includes(f));
  const extraFiles = otherFiles.filter((f) => !enFiles.includes(f));

  if (missingFiles.length) {
    ok = false;
    console.error(`[i18n:parity] Missing ${code} files:`);
    for (const f of missingFiles) console.error(`- ${f}`);
  }
  if (extraFiles.length) {
    ok = false;
    console.error(`[i18n:parity] Extra ${code} files:`);
    for (const f of extraFiles) console.error(`- ${f}`);
  }

  for (const rel of enFiles) {
    if (!otherFiles.includes(rel)) continue;
    const enPath = path.join(enRoot, rel);
    const otherPath = path.join(otherRoot, rel);
    const enJson = loadJson(enPath);
    const otherJson = loadJson(otherPath);
    const enKeys = new Set(flattenKeys(enJson));
    const otherKeys = new Set(flattenKeys(otherJson));

    const missingKeys = [...enKeys].filter((k) => !otherKeys.has(k)).sort();
    const extraKeys = [...otherKeys].filter((k) => !enKeys.has(k)).sort();

    if (missingKeys.length || extraKeys.length) {
      ok = false;
      console.error(`[i18n:parity] Key mismatch in ${code}/${rel}`);
      if (missingKeys.length) {
        console.error(`  Missing ${code} keys:`);
        for (const k of missingKeys) console.error(`  - ${k}`);
      }
      if (extraKeys.length) {
        console.error(`  Extra ${code} keys:`);
        for (const k of extraKeys) console.error(`  - ${k}`);
      }
    }
  }
}

if (!ok) process.exit(1);
console.log("[i18n:parity] OK");
