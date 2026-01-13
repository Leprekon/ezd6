const chokidar = require("chokidar");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

const SYSTEM_PATH = "C:\\Users\\lepre\\AppData\\Local\\FoundryVTT\\Data\\systems\\ezd6-reforged";
const BUILD_CMD = "node ./scripts/esbuild-bundle.js";
const RUN_ONCE = process.argv.includes("--once");
const inspector = require("inspector");

delete process.env.NODE_OPTIONS;
delete process.env.VSCODE_INSPECTOR_OPTIONS;

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
    return new Promise((resolve, reject) => {
        console.log("[watcher] Building and copying...");
        exec(
            BUILD_CMD,
            {
                env: {
                    ...process.env,
                    NODE_OPTIONS: "",
                    VSCODE_INSPECTOR_OPTIONS: ""
                }
            },
            (err, stdout, stderr) => {
            if (stdout) process.stdout.write(stdout);
            if (stderr) process.stderr.write(stderr);

            if (err) {
                console.error("[watcher] Build failed; skipping copy.", err);
                reject(err);
                return;
            }

            copyDir("dist", SYSTEM_PATH);
            console.log("[watcher] Files copied to Foundry system folder");
            resolve();
        });
    });
}

let buildInProgress = false;
let buildQueued = false;
let debounceTimer = null;

async function runBuildQueue() {
    if (buildInProgress) {
        buildQueued = true;
        return;
    }

    buildInProgress = true;
    try {
        await buildAndCopy();
    } catch (err) {
        process.exitCode = 1;
    } finally {
        buildInProgress = false;
        if (buildQueued) {
            buildQueued = false;
            runBuildQueue();
        }
    }
}

(async () => {
    try {
        await buildAndCopy();
    } catch (err) {
        process.exitCode = 1;
        if (RUN_ONCE) {
            closeInspector();
            return;
        }
    }

    if (RUN_ONCE) {
        closeInspector();
        return;
    }

    const watcher = chokidar.watch(["src", "public", "scripts/esbuild-bundle.js"], {
        ignoreInitial: true,
        persistent: true,
        usePolling: true,
        interval: 250,
        binaryInterval: 300,
        ignored: ["**/dist/**", "**/node_modules/**", "**/.git/**"],
        awaitWriteFinish: {
            stabilityThreshold: 200,
            pollInterval: 100
        }
    });

    watcher.on("ready", () => {
        console.log("[watcher] Ready");
    });

    watcher.on("error", (err) => {
        console.error("[watcher] Error:", err);
    });

    watcher.on("all", (event, pathChanged) => {
        console.log(`[watcher] ${event}: ${pathChanged}`);
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            debounceTimer = null;
            runBuildQueue();
        }, 150);
    });
})();

function closeInspector() {
    if (inspector.url()) {
        inspector.close();
    }
}
