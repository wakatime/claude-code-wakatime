#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const packagePath = path.join(__dirname, '..', 'package.json');
const versionFilePath = path.join(__dirname, '..', 'src', 'version.ts');
const marketplaceFilePath = path.join(__dirname, '..', '.claude-plugin', 'marketplace.json');
const pluginFilePath = path.join(__dirname, '..', '.claude-plugin', 'plugin.json');

try {
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const version = packageJson.version;

  const versionFileContent = `// This file is auto-generated during build. Do not edit manually.
export const VERSION = '${version}';
`;

  fs.writeFileSync(versionFilePath, versionFileContent);
  console.log(`Generated version.ts with version ${version}`);

  const marketplace = JSON.parse(fs.readFileSync(marketplaceFilePath, 'utf8'));
  fs.writeFileSync(marketplaceFilePath, JSON.stringify(marketplace, null, 2));
  console.log(`Generated marketplace.json with version ${version}`);

  const plugin = JSON.parse(fs.readFileSync(pluginFilePath, 'utf8'));
  fs.writeFileSync(pluginFilePath, JSON.stringify(plugin, null, 2));
  console.log(`Generated plugin.json with version ${version}`);
} catch (error) {
  console.error('Error generating version file:', error);
  process.exit(1);
}
