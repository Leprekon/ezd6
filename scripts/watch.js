const chokidar = require("chokidar");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

const SYSTEM_PATH = "C:\\Users\\lepre\\AppData\\Local\\FoundryVTT\\Data\\systems\\ezd6-new";
const BUILD_CMD = "node ./scripts/esbuild-bundle.js";

function copyDir(src, dest) {
    if (!fs.existsSync(src)) return;
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (let entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) copyDir(srcPath, destPath);
        else fs.copyFileSync(srcPath, destPath);
    }
}

function buildAndCopy() {
    console.log("[watcher] Building and copying...");
    exec(BUILD_CMD, (err, stdout, stderr) => {
        if (stdout) process.stdout.write(stdout);
        if (stderr) process.stderr.write(stderr);

        if (err) {
            console.error("[watcher] Build failed; skipping copy.", err);
            return;
        }

        copyDir("dist", SYSTEM_PATH);
        console.log("[watcher] Files copied to Foundry system folder");
    });
}

// Initial build + copy
buildAndCopy();

// Watch source and public assets for changes
const watcher = chokidar.watch(["src/**/*", "public/**/*", "scripts/esbuild-bundle.js"], {
    ignoreInitial: true,
    persistent: true
});

watcher.on("all", (event, pathChanged) => {
    console.log(`[watcher] ${event}: ${pathChanged}`);
    buildAndCopy();
});
