// apps/mobile/metro.config.js

const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

// apps/mobile
const projectRoot = __dirname;
// repo root (PocketQuest)
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Allow Metro to watch and bundle code that lives outside the app folder (monorepo).
config.watchFolders = [
  // workspace node_modules (pnpm/yarn/npm workspaces)
  path.join(workspaceRoot, "node_modules"),
  // shared package source
  path.join(workspaceRoot, "packages", "shared"),
];

// Make sure Metro resolves dependencies from the app first, then the workspace.
config.resolver.nodeModulesPaths = [
  path.join(projectRoot, "node_modules"),
  path.join(workspaceRoot, "node_modules"),
];

// Prevent Metro from walking up the filesystem (can cause duplicate-react issues).
config.resolver.disableHierarchicalLookup = true;

// Ensure all modules resolve consistently from the workspace root.
config.resolver.extraNodeModules = new Proxy(
  {},
  {
    get: (_, name) => path.join(workspaceRoot, "node_modules", name),
  }
);

module.exports = config;
