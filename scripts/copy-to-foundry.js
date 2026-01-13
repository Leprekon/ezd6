// scripts/copy-to-foundry.js
const fs = require("fs");
const path = require("path");

const FOUNDARY_SYSTEMS_PATH = "C:\\Users\\lepre\\AppData\\Local\\FoundryVTT\\Data\\systems\\ezd6-reforged"; // system folder

function copyDir(src, dest) {
    if (!fs.existsSync(src)) {
        console.warn(`Source folder not found: ${src}`);
        return;
    }

    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });

    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (let entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            copyDir(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
            console.log(`Copied file: ${srcPath} -> ${destPath}`);
        }
    }
}

try {
    console.log("Copying EZD6 system to Foundry...");
    fs.mkdirSync(FOUNDARY_SYSTEMS_PATH, { recursive: true });

    if (!fs.existsSync("dist")) {
        console.error("Build output not found. Run npm run build before copying.");
        process.exit(1);
    }

    copyDir("dist", FOUNDARY_SYSTEMS_PATH);

    console.log("Copy finished successfully!");
} catch (err) {
    console.error("Copy error:", err);
    process.exit(1);
}
