const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const EXPORT_DIR = path.join(ROOT, "localization", "exports");
const INTERMEDIATE_DIR = path.join(ROOT, "localization", "intermediate");
const COMPENDIUM_DIR = path.join(INTERMEDIATE_DIR, "compendiums");
const NATIVE_FILE = path.join(INTERMEDIATE_DIR, "native.json");

const LANG_FILES = {
  en: [path.join(ROOT, "public", "lang", "en.json")],
  ru: [path.join(ROOT, "public", "lang", "ru.json")],
};

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));

const writeJson = (filePath, data) => {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
};

const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
};

const isFlatMap = (value) =>
  value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.values(value).every((entry) => typeof entry === "string");

const extractExportPacks = (payload, fallbackPackId) => {
  if (isFlatMap(payload)) {
    return { [fallbackPackId]: payload };
  }
  const packs = {};
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    Object.entries(payload).forEach(([packId, map]) => {
      if (isFlatMap(map)) {
        packs[packId] = map;
      }
    });
  }
  return packs;
};

const flattenJson = (obj, prefix = "", out = {}) => {
  if (!obj || typeof obj !== "object") return out;
  Object.entries(obj).forEach(([key, value]) => {
    const next = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      flattenJson(value, next, out);
      return;
    }
    out[next] = typeof value === "string" ? value : "";
  });
  return out;
};

const unflattenJson = (flat) => {
  const root = {};
  Object.entries(flat).forEach(([key, value]) => {
    const parts = key.split(".");
    let current = root;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const part = parts[i];
      if (!current[part] || typeof current[part] !== "object") {
        current[part] = {};
      }
      current = current[part];
    }
    current[parts[parts.length - 1]] = value;
  });
  return root;
};

const sortedObject = (obj) =>
  Object.keys(obj)
    .sort()
    .reduce((acc, key) => {
      acc[key] = obj[key];
      return acc;
    }, {});

const loadExports = () => {
  if (!fs.existsSync(EXPORT_DIR)) return {};
  const files = fs
    .readdirSync(EXPORT_DIR)
    .filter((name) => name.toLowerCase().endsWith(".json"));
  const packs = {};
  files.forEach((file) => {
    const filePath = path.join(EXPORT_DIR, file);
    const payload = readJson(filePath);
    const fallback = path.basename(file, ".json");
    const extracted = extractExportPacks(payload, fallback);
    Object.entries(extracted).forEach(([packId, map]) => {
      packs[packId] = map;
    });
  });
  return packs;
};

const writeCompendiumIntermediates = (packs) => {
  ensureDir(COMPENDIUM_DIR);
  Object.entries(packs).forEach(([packId, map]) => {
    const filePath = path.join(COMPENDIUM_DIR, `${packId}.json`);
    writeJson(filePath, sortedObject(map));
  });
};

const loadCompendiumIntermediates = () => {
  if (!fs.existsSync(COMPENDIUM_DIR)) return {};
  const files = fs
    .readdirSync(COMPENDIUM_DIR)
    .filter((name) => name.toLowerCase().endsWith(".json"));
  const merged = {};
  files.forEach((file) => {
    const filePath = path.join(COMPENDIUM_DIR, file);
    const map = readJson(filePath);
    Object.entries(map).forEach(([key, value]) => {
      merged[key] = typeof value === "string" ? value : "";
    });
  });
  return merged;
};

const requireFile = (filePath) => {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing required file: ${filePath}`);
  }
};

const main = () => {
  ensureDir(INTERMEDIATE_DIR);

  requireFile(LANG_FILES.en[0]);
  requireFile(LANG_FILES.ru[0]);
  requireFile(NATIVE_FILE);

  const exportPacks = loadExports();
  if (!Object.keys(exportPacks).length) {
    throw new Error(`No export files found in ${EXPORT_DIR}`);
  }

  writeCompendiumIntermediates(exportPacks);

  const oldEn = readJson(LANG_FILES.en[0]);
  const oldRu = readJson(LANG_FILES.ru[0]);
  const oldEnFlat = flattenJson(oldEn);
  const oldRuFlat = flattenJson(oldRu);

  const nativeFlat = readJson(NATIVE_FILE);
  const compendiumFlat = loadCompendiumIntermediates();

  const newEnFlat = { ...nativeFlat, ...compendiumFlat };
  Object.entries(newEnFlat).forEach(([key, value]) => {
    if (value === "" && oldEnFlat[key]) {
      newEnFlat[key] = oldEnFlat[key];
    }
  });

  const newEnJson = unflattenJson(sortedObject(newEnFlat));
  LANG_FILES.en.forEach((filePath) => writeJson(filePath, newEnJson));

  const newRuFlat = {};
  Object.entries(newEnFlat).forEach(([key, value]) => {
    if (!(key in oldRuFlat)) {
      newRuFlat[key] = "";
      return;
    }
    if (oldEnFlat[key] !== value) {
      newRuFlat[key] = "";
      return;
    }
    newRuFlat[key] = oldRuFlat[key];
  });

  const newRuJson = unflattenJson(sortedObject(newRuFlat));
  LANG_FILES.ru.forEach((filePath) => writeJson(filePath, newRuJson));

  console.log("Localization updated.");
};

try {
  main();
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
