import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

interface Package {
  name: string;
  version: string;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

const root = resolve(import.meta.dir, "..");
const output = join(root, "apps/web/public/third-party-notices.txt");
const seen = new Set<string>();
const notices = new Map<string, string>();
const overrides: Record<string, string> = {
  "@better-auth/utils@0.4.2": "better-auth-utils.txt",
  "@better-auth/utils@0.5.0": "better-auth-utils.txt",
  "@vue/devtools-api@6.6.4": "vue-devtools-api.txt",
  "fancy-canvas@2.1.0": "fancy-canvas.txt",
};

function packageDirectory(name: string, from: string): string | undefined {
  let directory = from;
  while (true) {
    const candidate = join(directory, "node_modules", name);
    if (existsSync(join(candidate, "package.json"))) return realpathSync(candidate);
    const parent = dirname(directory);
    if (parent === directory) return undefined;
    directory = parent;
  }
}

function visit(directory: string): void {
  directory = realpathSync(directory);
  if (seen.has(directory)) return;
  seen.add(directory);
  const pkg: Package = JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));
  if (!pkg.name.startsWith("@strategy-court/")) {
    const id = `${pkg.name}@${pkg.version}`;
    const files = readdirSync(directory).filter((name) => /^(licen[sc]e|copying|notice)([-_.]|$)/i.test(name)).sort();
    let text = files.map((name) => readFileSync(join(directory, name), "utf8").trim()).join("\n\n");
    if (!text) {
      const readme = readdirSync(directory).find((name) => /^readme\.md$/i.test(name));
      const content = readme ? readFileSync(join(directory, readme), "utf8") : "";
      const heading = content.search(/^#+\s*license\s*$/im);
      const section = heading >= 0 ? content.slice(heading).split(/\n#+\s/)[0]! : "";
      if (section.includes("Permission is hereby granted")) text = section.trim();
    }
    if (!text && overrides[id]) text = readFileSync(join(root, "licenses", overrides[id]), "utf8").trim();
    if (!text) throw new Error(`Missing copyright/permission text for ${id}. Review and vendor its upstream license.`);
    notices.set(id, text.replaceAll("\r\n", "\n"));
  }

  const required = Object.keys(pkg.dependencies ?? {});
  const optional = Object.keys({ ...pkg.optionalDependencies, ...pkg.peerDependencies });
  for (const name of new Set([...required, ...optional])) {
    if (name.startsWith("@types/")) continue;
    const dependency = packageDirectory(name, directory);
    if (dependency) visit(dependency);
    else if (required.includes(name) && !pkg.optionalDependencies?.[name]) throw new Error(`Install missing dependency ${name} of ${pkg.name}`);
  }
}

visit(join(root, "apps/api"));
visit(join(root, "apps/web"));
const header = "Strategy Court third-party notices\n\nCopyright and permission notices for installed runtime dependencies of the web app and API.\nSome packages include build helpers or optional code that is not present in the final bundles.\nThese notices do not license third-party market data or research screenshots.\nTradingView attribution is also provided at /chart-attribution.txt.\n";
const text = header + [...notices].sort(([a], [b]) => a.localeCompare(b)).map(([id, license]) => `\n${"=".repeat(72)}\n${id}\n${"=".repeat(72)}\n\n${license}\n`).join("");
if (process.argv.includes("--check")) {
  if (!existsSync(output) || readFileSync(output, "utf8") !== text) throw new Error("Third-party notices are stale. Regenerate and review them after dependency changes.");
  console.log(`Third-party notices match ${notices.size} runtime packages.`);
} else {
  process.stdout.write(text);
}
