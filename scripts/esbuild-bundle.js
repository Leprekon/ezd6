// scripts/esbuild-bundle.js
const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");
const inspector = require("inspector");

delete process.env.NODE_OPTIONS;
delete process.env.VSCODE_INSPECTOR_OPTIONS;

function copyDir(src, dest) {
    if (!fs.existsSync(src)) return;
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });

    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDir(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

(async () => {
    try {
        await esbuild.build({
            entryPoints: ["./src/index.ts"],
            outfile: "dist/bundle.js",
            bundle: true,
            sourcemap: true,
            platform: "browser",
            format: "esm",
            target: ["es2019"],
        });
        copyDir("public", "dist");
        console.log("esbuild: bundle written to dist/bundle.js (assets copied from public/)");
        closeInspector();
        process.exit(0);
    } catch (err) {
        console.error(err);
        closeInspector();
        process.exit(1);
    }
})();

function closeInspector() {
    if (inspector.url()) {
        inspector.close();
    }
}
