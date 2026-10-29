import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');
const publicDir = path.join(root, 'public');
const imageRoots = ['tiles', 'operators'];
const imageExtensions = new Set(['.png', '.webp', '.jpg', '.jpeg', '.gif', '.svg']);

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full)));
    } else if (entry.isFile() && imageExtensions.has(path.extname(entry.name).toLowerCase())) {
      files.push(full);
    }
  }
  return files;
}

const files = [];
for (const folder of imageRoots) {
  const dir = path.join(publicDir, folder);
  try {
    files.push(...(await walk(dir)));
  } catch {
    // The folder is optional while the project is being set up.
  }
}

const urls = files
  .map((file) => `/${path.relative(publicDir, file).split(path.sep).join('/')}`)
  .sort((a, b) => a.localeCompare(b));

const manifestPath = path.join(publicDir, 'asset-manifest.json');
await fs.writeFile(manifestPath, `${JSON.stringify(urls, null, 2)}\n`, 'utf8');
console.log(`asset manifest: ${urls.length} files -> public/asset-manifest.json`);
