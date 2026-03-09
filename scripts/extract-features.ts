import fs from 'fs';
import path from 'path';
import { glob } from 'glob';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const STORAGE_DIR = path.join(PUBLIC_DIR, 'storage');
const FEATURE_CACHE_FILE = path.join(ROOT_DIR, 'feature-cache.json');

async function extractFeatures() {
    if (!fs.existsSync(STORAGE_DIR)) {
        console.log('No storage directory found. Exiting.');
        return;
    }

    let featureCache: Record<string, string> = {};
    if (fs.existsSync(FEATURE_CACHE_FILE)) {
        try {
            featureCache = JSON.parse(fs.readFileSync(FEATURE_CACHE_FILE, 'utf-8'));
        } catch (e) {
            console.error('Error reading feature cache:', e);
        }
    }

    const imageFiles = await glob('**/*.{jpg,jpeg,png,gif,webp,svg}', {
        cwd: STORAGE_DIR,
        nodir: true
    });

    let updatedCount = 0;

    for (const file of imageFiles) {
        const fullPath = path.join(STORAGE_DIR, file);
        const urlPath = `/storage/${file.replace(/\\/g, '/')}`;

        if (!featureCache[urlPath]) {
            try {
                const { data } = await sharp(fullPath)
                    .resize(8, 8, { fit: 'fill' })
                    .removeAlpha()
                    .raw()
                    .toBuffer({ resolveWithObject: true });
                featureCache[urlPath] = data.toString('base64');
                updatedCount++;
                console.log(`Extracted feature for ${file}`);
            } catch (e) {
                console.error(`Error extracting feature for ${file}:`, e);
            }
        }
    }

    if (updatedCount > 0) {
        fs.writeFileSync(FEATURE_CACHE_FILE, JSON.stringify(featureCache, null, 2), 'utf-8');
        console.log(`Updated feature cache with ${updatedCount} new images.`);
    } else {
        console.log('No new images to process. Feature cache is up to date.');
    }
}

extractFeatures().catch(console.error);
