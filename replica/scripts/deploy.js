#!/usr/bin/env node
"use strict";

/**
 * Deploy this replica from replica/ with a longer functions-discovery timeout.
 * Windows `firebase deploy` often hits the default 10s CLI timeout.
 *
 * Usage (from replica/):
 *   node scripts/deploy.js
 *   node scripts/deploy.js --only functions
 *   node scripts/deploy.js --only hosting
 */
const { spawnSync } = require("child_process");
const path = require("path");

process.env.FUNCTIONS_DISCOVERY_TIMEOUT = process.env.FUNCTIONS_DISCOVERY_TIMEOUT || "60";

const replicaRoot = path.join(__dirname, "..");
const args = process.argv.slice(2);
const firebaseArgs = args.length ? args : ["deploy"];

const result = spawnSync("firebase", firebaseArgs, {
  cwd: replicaRoot,
  env: process.env,
  stdio: "inherit",
  shell: true,
});

process.exit(result.status == null ? 1 : result.status);
