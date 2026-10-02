// definitions.mjs - shared constants for the plugin-root scripts.
// Pure data: no side effects, no imports beyond node:path, and syntax kept
// conservative so every consumer stays parseable on older Node versions up
// to its own version check.

import path from 'node:path';

// Minimum Node.js major version every script checks at startup.
export const MIN_NODE_MAJOR = 20;

// Exit codes shared by every script. Script-specific failure classes extend
// this base in the script's own EXIT table; the numeric assignments of the
// base never change, and scripts document their full table in their header.
export const BASE_EXIT = {
  internal: 1,
  usage: 2,
  node_version: 7,
};

// The .harness/ config files: init.mjs writes them, worktree.mjs reads
// worktree-setup.json.
export const HARNESS_DIR = '.harness';
export const WORKTREE_SETUP_FILE = 'worktree-setup.json';
export const PROJECT_CONFIG_FILE = 'config.json';
export const WORKTREE_SETUP_REL = path.join(HARNESS_DIR, WORKTREE_SETUP_FILE);
