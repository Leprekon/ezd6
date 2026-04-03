const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const version = args.find((arg) => !arg.startsWith("--"));

if (!version) {
  console.error("Usage: node scripts/prepare-release.js <version> [--dry-run]");
  process.exit(1);
}

if (!/^\d+\.\d+(?:\.\d+)?$/.test(version)) {
  console.error(`Invalid version "${version}". Expected digits like 0.3 or 0.3.1.`);
  process.exit(1);
}

const rootDir = path.resolve(__dirname, "..");
const packageFile = path.join(rootDir, "package.json");
const systemFile = path.join(rootDir, "public", "system.json");

const updateJsonVersion = (file) => {
  const raw = fs.readFileSync(file, "utf8");
  const data = JSON.parse(raw);
  data.version = version;
  if (!dryRun) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
  }
  return file;
};

const updatedFiles = [updateJsonVersion(packageFile), updateJsonVersion(systemFile)];
const tag = `v${version}`;

console.log(`${dryRun ? "[dry-run] Would update" : "Updated"}:`);
updatedFiles.forEach((file) => {
  console.log(`- ${path.relative(rootDir, file)}`);
});

console.log("");
console.log("Release steps:");
console.log(`1. Review changes`);
console.log(`2. Commit: git add package.json public/system.json && git commit -m "Release ${tag}"`);
console.log(`3. Tag: git tag ${tag}`);
console.log(`4. Push: git push origin main && git push origin ${tag}`);
console.log("5. GitHub Actions will build and publish the release from the tag");
