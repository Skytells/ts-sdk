// Simple build script to generate both ESM and CommonJS outputs
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Run TypeScript compiler
console.log('Building TypeScript...');
execSync('npx tsc', { stdio: 'inherit' });

// Generate CJS version from ESM
console.log('Generating CommonJS version...');
const files = fs.readdirSync('./dist').filter(file => file.endsWith('.js'));

// For each JS file, create a CJS version
files.forEach(file => {
  const content = fs.readFileSync(path.join('./dist', file), 'utf8');
  
  // Convert ESM to CJS and write to .cjs file
  const cjsContent = content
    // Convert imports
    .replace(/import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g, 'const {$1} = require("$2")')
    .replace(/import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g, 'const $1 = require("$2")')
    // Convert exports
    .replace(/export\s+\{([^}]+)\}/g, 'module.exports = {$1}')
    .replace(/export\s+default\s+(\w+)/g, 'module.exports = $1')
    .replace(/export\s+const\s+(\w+)/g, 'const $1 = module.exports.$1')
    .replace(/export\s+function\s+(\w+)/g, 'function $1');

  fs.writeFileSync(path.join('./dist', file.replace('.js', '.cjs')), cjsContent);
});

console.log('Build completed!'); 