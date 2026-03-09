import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { glob } from 'glob';
import mime from 'mime-types';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_FILE = path.join(__dirname, 'image-data.json');
const FEATURE_CACHE_FILE = path.join(__dirname, 'feature-cache.json');

function readMetadata() {
    if (fs.existsSync(DATA_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
        } catch (e) {
            console.error('Error reading metadata:', e);
            return {};
        }
    }
    return {};
}

function writeMetadata(data: any) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function readFeatureCache() {
    if (fs.existsSync(FEATURE_CACHE_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(FEATURE_CACHE_FILE, 'utf-8'));
        } catch (e) {
            return {};
        }
    }
    return {};
}

function writeFeatureCache(data: any) {
    fs.writeFileSync(FEATURE_CACHE_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

async function startServer() {
    const app = express();
    const PORT = 3000;

    app.use(express.json());

    // Serve static files from the 'public/storage' directory
    // This is where we will put our images to be scanned
    const PUBLIC_DIR = path.join(__dirname, 'public');
    const STORAGE_DIR = path.join(PUBLIC_DIR, 'storage');
    const OLD_STORAGE_DIR = path.join(__dirname, 'storage');

    // Ensure public directory exists
    if (!fs.existsSync(PUBLIC_DIR)) {
        fs.mkdirSync(PUBLIC_DIR, { recursive: true });
    }

    // Migrate old storage to public/storage if needed
    if (fs.existsSync(OLD_STORAGE_DIR) && !fs.existsSync(STORAGE_DIR)) {
        fs.renameSync(OLD_STORAGE_DIR, STORAGE_DIR);
    } else if (!fs.existsSync(STORAGE_DIR)) {
        fs.mkdirSync(STORAGE_DIR, { recursive: true });
        // Create some sample directories and files if empty
        const natureDir = path.join(STORAGE_DIR, 'nature');
        const techDir = path.join(STORAGE_DIR, 'tech');
        fs.mkdirSync(natureDir, { recursive: true });
        fs.mkdirSync(techDir, { recursive: true });
    }

    app.use('/storage', express.static(STORAGE_DIR));

    // API to scan images
    app.get('/api/images', async (req, res) => {
        try {
            const metadata = readMetadata();
            const featureCache = readFeatureCache();
            let cacheUpdated = false;

            // Find all image files in the storage directory
            const imageFiles = await glob('**/*.{jpg,jpeg,png,gif,webp,svg}', {
                cwd: STORAGE_DIR,
                nodir: true
            });

            const images = await Promise.all(imageFiles.map(async file => {
                const fullPath = path.join(STORAGE_DIR, file);
                const stats = fs.statSync(fullPath);
                const relativePath = file;
                const directory = path.dirname(file);
                const filename = path.basename(file);

                // Handle both Windows (\) and Unix (/) path separators
                const normalizedDir = directory.replace(/\\/g, '/');
                const dirName = normalizedDir === '.' ? 'Root' : path.basename(normalizedDir);
                const title = `${dirName} | ${filename}`;
                const urlPath = `/storage/${file.replace(/\\/g, '/')}`;

                const fileMeta = metadata[urlPath] || { tags: [], keywords: [] };

                let feature = featureCache[urlPath];
                if (!feature) {
                    try {
                        const { data } = await sharp(fullPath)
                            .resize(8, 8, { fit: 'fill' })
                            .removeAlpha()
                            .raw()
                            .toBuffer({ resolveWithObject: true });
                        feature = data.toString('base64');
                        featureCache[urlPath] = feature;
                        cacheUpdated = true;
                    } catch (e) {
                        console.error(`Error extracting feature for ${file}:`, e);
                        feature = '';
                    }
                }

                return {
                    path: urlPath,
                    filename: filename,
                    directory: normalizedDir,
                    title: title,
                    size: stats.size,
                    mtime: stats.mtime,
                    tags: fileMeta.tags || [],
                    keywords: fileMeta.keywords || [],
                    feature: feature
                };
            }));

            if (cacheUpdated) {
                writeFeatureCache(featureCache);
            }

            res.json(images);
        } catch (error) {
            console.error('Error scanning images:', error);
            res.status(500).json({ error: 'Failed to scan images' });
        }
    });

    app.post('/api/images/metadata', (req, res) => {
        try {
            const { path: imagePath, tags, keywords } = req.body;
            if (!imagePath) return res.status(400).json({ error: 'Path is required' });

            const metadata = readMetadata();
            metadata[imagePath] = {
                tags: tags || [],
                keywords: keywords || []
            };
            writeMetadata(metadata);

            res.json({ success: true });
        } catch (error) {
            console.error('Error saving metadata:', error);
            res.status(500).json({ error: 'Failed to save metadata' });
        }
    });

    // API to download image
    app.get('/api/download', (req, res) => {
        const filePath = req.query.path as string;
        if (!filePath) {
            return res.status(400).send('Missing path');
        }

        // Security check: ensure path is within STORAGE_DIR
        // The client sends the URL path like /storage/nature/img.png
        // We need to convert it back to file system path

        // Remove /storage prefix
        const relativePath = filePath.replace(/^\/storage\//, '');
        const absolutePath = path.join(STORAGE_DIR, relativePath);

        // Prevent directory traversal
        if (!absolutePath.startsWith(STORAGE_DIR)) {
            return res.status(403).send('Access denied');
        }

        if (fs.existsSync(absolutePath)) {
            res.download(absolutePath);
        } else {
            res.status(404).send('File not found');
        }
    });

    // Vite middleware for development
    if (process.env.NODE_ENV !== 'production') {
        const vite = await createViteServer({
            server: { middlewareMode: true },
            appType: 'spa',
        });
        app.use(vite.middlewares);
    } else {
        // Production static file serving (if we were building for prod)
        app.use(express.static(path.join(__dirname, 'dist')));
    }

    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}

startServer();
