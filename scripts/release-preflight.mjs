#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const warnings = [];

function requireFile(relativePath) {
  const fullPath = path.join(root, relativePath);
  if (!existsSync(fullPath)) {
    failures.push(`Missing required file: ${relativePath}`);
  }
}

function readJson(relativePath) {
  const fullPath = path.join(root, relativePath);
  try {
    return JSON.parse(readFileSync(fullPath, "utf8"));
  } catch (error) {
    failures.push(`Unable to parse JSON: ${relativePath}`);
    return null;
  }
}

function checkFrontendConfig() {
  const appJson = readJson("frontend/app.json");
  if (!appJson?.expo) return;

  if (appJson.expo.slug !== "last-stand-tower-defense") {
    warnings.push("Consider setting expo.slug to 'last-stand-tower-defense'.");
  }

  const permissions = appJson.expo.android?.permissions || [];
  if (permissions.includes("com.google.android.gms.permission.AD_ID")) {
    warnings.push("AD_ID permission still enabled in frontend/app.json.");
  }
}

function checkBackendEnvExample() {
  const envExamplePath = path.join(root, "backend/.env.example");
  if (!existsSync(envExamplePath)) {
    failures.push("Missing backend/.env.example.");
    return;
  }

  const envExample = readFileSync(envExamplePath, "utf8");
  const requiredKeys = [
    "ENVIRONMENT=",
    "DB_PROVIDER=",
    "SUPABASE_URL=",
    "SUPABASE_SERVICE_ROLE_KEY=",
    "CORS_ORIGINS=",
  ];
  for (const key of requiredKeys) {
    if (!envExample.includes(key)) {
      failures.push(`backend/.env.example missing key: ${key}`);
    }
  }
}

function checkTrackedSecrets() {
  const trackedBackendEnv = path.join(root, "backend/.env");
  if (existsSync(trackedBackendEnv)) {
    warnings.push("Local backend/.env exists. Ensure it is not tracked by git.");
  }
}

function run() {
  requireFile("frontend/eas.json");
  requireFile("frontend/.env.example");
  requireFile("backend/.env.example");
  requireFile("backend/supabase_schema.sql");
  requireFile("LAUNCH_CHECKLIST.md");
  requireFile("DEPLOY_BACKEND.md");

  checkFrontendConfig();
  checkBackendEnvExample();
  checkTrackedSecrets();

  const checks = [
    ["Required files", failures.length === 0],
    ["Warnings", warnings.length === 0],
  ];

  console.log("Release preflight results:");
  for (const [name, passed] of checks) {
    console.log(`- ${name}: ${passed ? "PASS" : "CHECK"}`);
  }

  if (warnings.length) {
    console.log("\nWarnings:");
    for (const warning of warnings) {
      console.log(`- ${warning}`);
    }
  }

  if (failures.length) {
    console.log("\nFailures:");
    for (const failure of failures) {
      console.log(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log("\nAll required release checks passed.");
}

run();
