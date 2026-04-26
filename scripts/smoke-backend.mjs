#!/usr/bin/env node
import process from "node:process";

const baseUrl = process.env.BACKEND_URL;

if (!baseUrl) {
  console.error("Missing BACKEND_URL env var. Example:");
  console.error("BACKEND_URL=https://your-api.example.com node scripts/smoke-backend.mjs");
  process.exit(1);
}

async function getJson(path) {
  const res = await fetch(`${baseUrl}${path}`);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${path} returned non-JSON body: ${text.slice(0, 200)}`);
  }
  return { status: res.status, json };
}

async function run() {
  const root = await getJson("/api/");
  const health = await getJson("/api/health");

  if (root.status !== 200) {
    throw new Error(`/api/ failed with status ${root.status}`);
  }
  if (health.status !== 200) {
    throw new Error(`/api/health failed with status ${health.status}`);
  }
  if (health.json.status !== "healthy") {
    throw new Error(`/api/health status is not healthy: ${JSON.stringify(health.json)}`);
  }

  console.log("Backend smoke test passed.");
  console.log(JSON.stringify({ root: root.json, health: health.json }, null, 2));
}

run().catch((error) => {
  console.error(`Backend smoke test failed: ${error.message}`);
  process.exit(1);
});
