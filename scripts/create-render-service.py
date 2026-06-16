#!/usr/bin/env python3
"""Create the last-stand-td-api service on Render via CLI."""
import os
import subprocess
import sys
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / "backend" / ".env")

render = Path(os.environ.get("TEMP", "/tmp")) / "render-cli-latest" / "cli_v2.20.0.exe"
if not render.exists():
    print(f"Render CLI not found at {render}", file=sys.stderr)
    sys.exit(1)

defaults = {
    "ENVIRONMENT": "production",
    "DB_PROVIDER": "supabase",
    "SUPABASE_DB_SCHEMA": "public",
    "CORS_ORIGINS": "*",
    "APPLE_BUNDLE_ID": "com.horseshoeroundme.laststandtowerdefense",
    "GOOGLE_PLAY_PACKAGE_NAME": "com.horseshoeroundme.laststandtowerdefense",
}
for key, value in defaults.items():
    os.environ.setdefault(key, value)

env_keys = [
    "ENVIRONMENT",
    "DB_PROVIDER",
    "SUPABASE_DB_SCHEMA",
    "CORS_ORIGINS",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "APPLE_KEY_ID",
    "APPLE_ISSUER_ID",
    "APPLE_PRIVATE_KEY",
    "APPLE_BUNDLE_ID",
    "GOOGLE_PLAY_PACKAGE_NAME",
]

cmd = [
    str(render),
    "services",
    "create",
    "--name",
    "last-stand-td-api",
    "--type",
    "web_service",
    "--runtime",
    "python",
    "--repo",
    "https://github.com/jshugart90-png/Last-stand-Tower-Defense",
    "--branch",
    "main",
    "--root-directory",
    "backend",
    "--build-command",
    "pip install -r requirements.txt",
    "--start-command",
    "uvicorn server:app --host 0.0.0.0 --port $PORT",
    "--plan",
    "free",
    "--auto-deploy",
    "--confirm",
    "-o",
    "json",
]

for key in env_keys:
    value = os.environ.get(key, "").strip()
    if value:
        cmd.extend(["--env-var", f"{key}={value}"])

print("Creating Render service last-stand-td-api...")
proc = subprocess.run(cmd, capture_output=True, text=True)
print(proc.stdout)
if proc.stderr:
    print(proc.stderr, file=sys.stderr)
sys.exit(proc.returncode)
