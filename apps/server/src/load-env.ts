import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let loaded = false;

function parseEnvFile(content: string) {
  const entries: Array<[string, string]> = [];

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else {
      const commentIndex = value.indexOf(" #");
      if (commentIndex >= 0) {
        value = value.slice(0, commentIndex).trim();
      }
    }

    entries.push([key, value]);
  }

  return entries;
}

export function loadLocalEnv() {
  if (loaded) {
    return;
  }

  loaded = true;

  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const projectRoot = path.resolve(currentDir, "../../..");
  const serverRoot = path.resolve(currentDir, "..");
  const candidatePaths = [
    path.join(projectRoot, ".env"),
    path.join(projectRoot, ".env.local"),
    path.join(serverRoot, ".env"),
    path.join(serverRoot, ".env.local")
  ];

  for (const candidatePath of candidatePaths) {
    if (!fs.existsSync(candidatePath)) {
      continue;
    }

    const entries = parseEnvFile(fs.readFileSync(candidatePath, "utf8"));

    for (const [key, value] of entries) {
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  }
}

loadLocalEnv();
