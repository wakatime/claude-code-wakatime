#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const packagePath = path.join(__dirname, '..', 'package.json');
const versionFilePath = path.join(__dirname, '..', 'src', 'version.ts');

try {
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const version = packageJson.version;
  
  const versionFileContent = `// This file is auto-generated during build. Do not edit manually.
export const VERSION = '${version}';
`;
  
  fs.writeFileSync(versionFilePath, versionFileContent);
  console.log(`Generated version.ts with version ${version}`);
} catch (error) {
  console.error('Error generating version file:', error);
  process.exit(1);
}