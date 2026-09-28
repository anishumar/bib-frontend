// A placeholder inside a <Field> is an EXAMPLE, so it starts with "e.g."
// (the Wave 4 brief, rule 4). A placeholder that reads like a value
// ("100000", "Managing Partner") is taken for one: on the pipeline the filter
// boxes looked filled in when they were empty.
//
// Run by `npm run check`. It parses every .tsx under src/ with the TypeScript
// compiler (already a dev dependency), finds each `placeholder` whose value is
// a string written in the source, and whose nearest enclosing element chain
// has a <Field>. A placeholder built at run time (the catalogue's standard
// wording shown in an override box) cannot be read here and is left alone.
//
// THE BASELINE. Most screens predate the rule and are fixed by the Wave 4
// sweeps, one group at a time. `placeholder-baseline.json` holds how many each
// file had when the rule landed; a file may go DOWN from its number, never up,
// and a file not in it may have none. After fixing a screen, lower its number
// (or run `node scripts/check-placeholders.mjs --update`) so it cannot creep
// back.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "src");
const baselineFile = path.join(root, "scripts", "placeholder-baseline.json");
const update = process.argv.includes("--update");

function* tsxFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* tsxFiles(full);
    else if (entry.name.endsWith(".tsx")) yield full;
  }
}

/** The literal strings an attribute value can take, or null when any branch is
 *  computed. `a ? "x" : "y"` is two literals, both checked. */
function literals(node) {
  if (node === undefined) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text];
  if (ts.isJsxExpression(node)) return literals(node.expression);
  if (ts.isParenthesizedExpression(node)) return literals(node.expression);
  if (ts.isConditionalExpression(node)) {
    const a = literals(node.whenTrue);
    const b = literals(node.whenFalse);
    return a === null || b === null ? null : [...a, ...b];
  }
  return null;
}

function insideField(node) {
  for (let p = node.parent; p !== undefined; p = p.parent) {
    if (ts.isJsxElement(p) && p.openingElement.tagName.getText() === "Field") return true;
  }
  return false;
}

const found = {};
const offences = [];
for (const file of tsxFiles(src)) {
  const text = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const rel = path.relative(root, file).split(path.sep).join("/");
  const visit = (node) => {
    if (ts.isJsxAttribute(node) && node.name.getText() === "placeholder" && insideField(node)) {
      for (const value of literals(node.initializer) ?? []) {
        if (!value.startsWith("e.g.")) {
          found[rel] = (found[rel] ?? 0) + 1;
          const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
          offences.push({ rel, line: line + 1, value });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

if (update) {
  const sorted = Object.fromEntries(Object.entries(found).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(baselineFile, `${JSON.stringify(sorted, null, 2)}\n`);
  console.log(`placeholder baseline written: ${Object.keys(sorted).length} files, ${offences.length} placeholders`);
  process.exit(0);
}

const baseline = fs.existsSync(baselineFile) ? JSON.parse(fs.readFileSync(baselineFile, "utf8")) : {};
const worse = Object.entries(found).filter(([file, n]) => n > (baseline[file] ?? 0));
if (worse.length > 0) {
  console.error('A placeholder inside a <Field> must start with "e.g." (W4-UX-BRIEF rule 4):');
  for (const [file] of worse) {
    for (const o of offences.filter((x) => x.rel === file)) {
      console.error(`  ${o.rel}:${String(o.line)}  placeholder="${o.value}"`);
    }
    console.error(`  (${file}: ${String(found[file])} found, baseline allows ${String(baseline[file] ?? 0)})`);
  }
  process.exit(1);
}
const better = Object.entries(baseline).filter(([file, n]) => (found[file] ?? 0) < n);
const total = Object.values(found).reduce((a, b) => a + b, 0);
console.log(
  `placeholders: ok (${String(total)} older ones left in ${String(Object.keys(found).length)} files)` +
    (better.length > 0 ? `; lower the baseline for ${better.map(([f]) => f).join(", ")}` : ""),
);
