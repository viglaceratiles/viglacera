import fs from 'fs';
import path from 'path';
import { glob } from 'glob';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const STORAGE_DIR = path.join(PUBLIC_DIR, 'storage');
const DATA_FILE = path.join(ROOT_DIR, 'image-data.json');
const OUTPUT_FILE = path.join(PUBLIC_DIR, 'images.json');

async function generate() {
  if (!fs.existsSync(PUBLIC_DIR)) {
    fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  }

  if (!fs.existsSync(STORAGE_DIR)) {
    console.log('No storage directory found. Creating empty images.json');
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify([]));
    return;
  }

  let metadata: Record<string, any> = {};
  if (fs.existsSync(DATA_FILE)) {
    try {
      metadata = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    } catch (e) {
      console.error('Error reading metadata:', e);
    }
  }

  const imageFiles = await glob('**/*.{jpg,jpeg,png,gif,webp,svg}', { 
    cwd: STORAGE_DIR,
    nodir: true 
  });

  const images = imageFiles.map(file => {
    const fullPath = path.join(STORAGE_DIR, file);
    const stats = fs.statSync(fullPath);
    const directory = path.dirname(file);
    const filename = path.basename(file);
    
    const normalizedDir = directory.replace(/\\/g, '/');
    const dirName = normalizedDir === '.' ? 'Root' : path.basename(normalizedDir);
    const title = `${dirName} | ${filename}`;
    const urlPath = `/storage/${file.replace(/\\/g, '/')}`;

    const fileMeta = metadata[urlPath] || { tags: [], keywords: [] };

    return {
      path: urlPath,
      filename: filename,
      directory: normalizedDir,
      title: title,
      size: stats.size,
      mtime: stats.mtime,
      tags: fileMeta.tags || [],
      keywords: fileMeta.keywords || []
    };
  });

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(images, null, 2));
  console.log(`Generated images.json with ${images.length} images.`);
}

generate().catch(console.error);
