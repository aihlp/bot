#!/bin/bash
set -euo pipefail

echo "Installing dependencies"
npm ci

echo "Running tests"
npm test

echo "Typechecking"
npm run typecheck

echo "Building"
npm run build

echo "Deploying to Cloudflare"
npx wrangler deploy

echo "Deployment complete"
