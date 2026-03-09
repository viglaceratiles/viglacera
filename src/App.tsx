import { ImageData } from '@/types';
import { Search, Download, ZoomIn, Folder, Image as ImageIcon, X, Home, ChevronRight, Tag, Plus, Menu, Camera } from 'lucide-react';
import { useState, useEffect, useMemo, MouseEvent, KeyboardEvent, useRef, useCallback } from 'react';
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';

function base64ToUint8Array(base64: string) {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

function calculateMSE(arr1: Uint8Array, arr2: Uint8Array) {
    let sum = 0;
    for (let i = 0; i < 192; i++) {
        const diff = arr1[i] - arr2[i];
        sum += diff * diff;
    }
    return sum / 192;
}

interface DirNode {
    name: string;
    path: string;
    children: Record<string, DirNode>;
}

const DirectoryTree = ({
                           nodes,
                           level = 0,
                           selectedDirectory,
                           onSelect
                       }: {
    nodes: DirNode[],
    level?: number,
    selectedDirectory: string | null,
    onSelect: (path: string) => void
}) => {
    return (
        <div className="space-y-0.5">
            {nodes.map(node => (
                <DirectoryTreeNode
                    key={node.path}
                    node={node}
                    level={level}
                    selectedDirectory={selectedDirectory}
                    onSelect={onSelect}
                />
            ))}
        </div>
    );
};

const DirectoryTreeNode = ({
                               node,
                               level,
                               selectedDirectory,
                               onSelect
                           }: {
    node: DirNode,
    level: number,
    selectedDirectory: string | null,
    onSelect: (path: string) => void
}) => {
    const isSelected = selectedDirectory === node.path;
    const hasChildren = Object.keys(node.children).length > 0;
    const [expanded, setExpanded] = useState(true);

    return (
        <div className="w-full">
            <div
                className={`w-full flex items-center justify-between py-1.5 pr-3 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
                    isSelected
                        ? 'bg-indigo-50 text-indigo-700'
                        : 'text-neutral-700 hover:bg-neutral-100'
                }`}
                style={{ paddingLeft: `${level * 16 + 12}px` }}
                onClick={() => onSelect(node.path)}
                title={node.name}
            >
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    {hasChildren ? (
                        <button
                            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
                            className="p-0.5 hover:bg-neutral-200 rounded text-neutral-500 flex-none"
                        >
                            <ChevronRight className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-90' : ''}`} />
                        </button>
                    ) : (
                        <span className="w-[18px] flex-none" />
                    )}
                    <Folder className={`w-4 h-4 flex-none ${isSelected ? 'text-indigo-500' : 'text-neutral-400'}`} />
                    <span className="truncate">{node.name}</span>
                </div>
            </div>
            {expanded && hasChildren && (
                <div className="mt-0.5">
                    <DirectoryTree
                        nodes={Object.values(node.children).sort((a, b) => a.name.localeCompare(b.name))}
                        level={level + 1}
                        selectedDirectory={selectedDirectory}
                        onSelect={onSelect}
                    />
                </div>
            )}
        </div>
    );
};

export default function App() {
    const [images, setImages] = useState<ImageData[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedImage, setSelectedImage] = useState<ImageData | null>(null);
    const [selectedDirectory, setSelectedDirectory] = useState<string | null>(null);

    // Tag filtering state
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [tagFilterMode, setTagFilterMode] = useState<'AND' | 'OR'>('OR');

    // Edit metadata state
    const [editTags, setEditTags] = useState<string[]>([]);
    const [editKeywords, setEditKeywords] = useState<string[]>([]);
    const [tagInput, setTagInput] = useState('');
    const [keywordInput, setKeywordInput] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

    // Image Search state
    const [isImageSearchOpen, setIsImageSearchOpen] = useState(false);
    const [searchImageSrc, setSearchImageSrc] = useState('');
    const [crop, setCrop] = useState<Crop>();
    const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
    const imgRef = useRef<HTMLImageElement>(null);
    const [searchFeature, setSearchFeature] = useState<Uint8Array | null>(null);

    // Pagination / Infinite Scroll state
    const [visibleCount, setVisibleCount] = useState(50);
    const observer = useRef<IntersectionObserver | null>(null);

    const lastElementRef = useCallback((node: HTMLDivElement) => {
        if (loading) return;
        if (observer.current) observer.current.disconnect();
        observer.current = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting) {
                setVisibleCount(prev => prev + 50);
            }
        });
        if (node) observer.current.observe(node);
    }, [loading]);

    // Reset visible count when filters change
    useEffect(() => {
        setVisibleCount(50);
    }, [searchQuery, selectedDirectory, selectedTags, tagFilterMode]);

    useEffect(() => {
        fetchImages();
    }, []);

    const getImageUrl = (path: string) => {
        return `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;
    };

    const fetchImages = async () => {
        try {
            const url = import.meta.env.DEV ? '/api/images' : `${import.meta.env.BASE_URL}images.json`;
            const response = await fetch(url);
            if (!response.ok) throw new Error('Failed to fetch images');
            const data = await response.json();
            setImages(data);
        } catch (error) {
            console.error('Error fetching images:', error);
        } finally {
            setLoading(false);
        }
    };

    const directoryTree = useMemo(() => {
        const rootNodes: Record<string, DirNode> = {};

        // Add Root directory explicitly if there are files in root
        const hasRootFiles = images.some(img => img.directory === '.');
        if (hasRootFiles) {
            rootNodes['Root'] = { name: 'Root', path: 'Root', children: {} };
        }

        images.forEach(img => {
            if (img.directory === '.') return;

            // Handle both Windows (\) and Unix (/) path separators
            const normalizedDir = img.directory.replace(/\\/g, '/');
            const parts = normalizedDir.split('/');
            let currentLevel = rootNodes;
            let currentPath = '';

            parts.forEach((part, index) => {
                currentPath = currentPath ? `${currentPath}/${part}` : part;
                if (!currentLevel[part]) {
                    currentLevel[part] = {
                        name: part,
                        path: currentPath,
                        children: {}
                    };
                }
                currentLevel = currentLevel[part].children;
            });
        });

        return Object.values(rootNodes).sort((a, b) => {
            if (a.name === 'Root') return -1;
            if (b.name === 'Root') return 1;
            return a.name.localeCompare(b.name);
        });
    }, [images]);

    const allTags = useMemo(() => {
        const tags = new Set<string>();
        images.forEach(img => {
            img.tags?.forEach(t => tags.add(t));
        });
        return Array.from(tags).sort();
    }, [images]);

    const filteredImages = useMemo(() => {
        let result = images;

        // Filter by directory if one is selected
        if (selectedDirectory) {
            result = result.filter(img => {
                const normalizedDir = img.directory.replace(/\\/g, '/');
                const dir = normalizedDir === '.' ? 'Root' : normalizedDir;
                return dir === selectedDirectory || dir.startsWith(`${selectedDirectory}/`);
            });
        }

        // Filter by tags
        if (selectedTags.length > 0) {
            result = result.filter(img => {
                const imgTags = img.tags || [];
                if (tagFilterMode === 'AND') {
                    return selectedTags.every(t => imgTags.includes(t));
                } else {
                    return selectedTags.some(t => imgTags.includes(t));
                }
            });
        }

        // Filter by search query
        if (searchQuery) {
            const lowerQuery = searchQuery.toLowerCase();
            result = result.filter(
                (img) =>
                    img.filename.toLowerCase().includes(lowerQuery) ||
                    img.directory.toLowerCase().includes(lowerQuery) ||
                    img.title.toLowerCase().includes(lowerQuery) ||
                    (img.tags || []).some(t => t.toLowerCase().includes(lowerQuery)) ||
                    (img.keywords || []).some(k => k.toLowerCase().includes(lowerQuery))
            );
        }

        // Filter by image feature similarity
        if (searchFeature) {
            result = result.map(img => {
                if (!img.feature) return { img, score: Infinity };
                const imgFeature = base64ToUint8Array(img.feature);
                const score = calculateMSE(searchFeature, imgFeature);
                return { img, score };
            })
                // 5000 is a reasonable MSE threshold for "similar colors/patterns" in 8x8 RGB
                .filter(item => item.score < 5000)
                .sort((a, b) => a.score - b.score)
                .map(item => item.img);
        }

        return result;
    }, [images, searchQuery, selectedDirectory, selectedTags, tagFilterMode, searchFeature]);

    // Group images by directory for the "Folder View" feel, or just list them.
    const groupedImages = useMemo(() => {
        const groups: Record<string, ImageData[]> = {};

        // If we are on the home page (no directory selected) and no search query/tags,
        // just show the first 10 images total, grouped by their directory
        let imagesToGroup = filteredImages;
        if (!selectedDirectory && !searchQuery && selectedTags.length === 0) {
            imagesToGroup = filteredImages.slice(0, 10);
        }

        imagesToGroup.forEach((img) => {
            const normalizedDir = img.directory.replace(/\\/g, '/');
            const dir = normalizedDir === '.' ? 'Root' : normalizedDir;
            if (!groups[dir]) groups[dir] = [];
            groups[dir].push(img);
        });
        return groups;
    }, [filteredImages, selectedDirectory, searchQuery, selectedTags]);

    const visibleGroupedImages = useMemo(() => {
        const result: Array<{dir: string, images: ImageData[], total: number}> = [];
        let currentCount = 0;

        for (const [dir, dirImages] of Object.entries(groupedImages)) {
            if (currentCount >= visibleCount) break;

            const remaining = visibleCount - currentCount;
            const imagesToShow = dirImages.slice(0, remaining);

            result.push({
                dir,
                images: imagesToShow,
                total: dirImages.length
            });

            currentCount += imagesToShow.length;
        }

        return result;
    }, [groupedImages, visibleCount]);

    const totalImagesInGroups = useMemo(() => {
        return Object.values(groupedImages).reduce((acc, arr) => acc + arr.length, 0);
    }, [groupedImages]);

    const handleDownload = async (e: MouseEvent, img: ImageData) => {
        e.stopPropagation();
        try {
            if (import.meta.env.DEV) {
                const response = await fetch(`/api/download?path=${encodeURIComponent(img.path)}`);
                if (!response.ok) throw new Error('Download failed');

                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = img.filename;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            } else {
                // In production (GitHub Pages), download directly from the static file
                const url = getImageUrl(img.path);
                const a = document.createElement('a');
                a.href = url;
                a.download = img.filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            }
        } catch (error) {
            console.error('Download error:', error);
        }
    };

    const openLightbox = (img: ImageData) => {
        setSelectedImage(img);
        setEditTags(img.tags || []);
        setEditKeywords(img.keywords || []);
        setTagInput('');
        setKeywordInput('');
    };

    const saveMetadata = async () => {
        if (!selectedImage) return;

        if (!import.meta.env.DEV) {
            alert("Chức năng lưu chỉ hoạt động ở môi trường Local. Trên GitHub Pages, dữ liệu chỉ có thể xem.");
            return;
        }

        setIsSaving(true);
        try {
            const response = await fetch('/api/images/metadata', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    path: selectedImage.path,
                    tags: editTags,
                    keywords: editKeywords
                })
            });

            if (!response.ok) throw new Error('Failed to save metadata');

            // Update local state
            const updatedImage = { ...selectedImage, tags: editTags, keywords: editKeywords };
            setImages(images.map(img => img.path === selectedImage.path ? updatedImage : img));
            setSelectedImage(updatedImage);
        } catch (error) {
            console.error('Error saving metadata:', error);
        } finally {
            setIsSaving(false);
        }
    };

    const handleAddTag = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && tagInput.trim()) {
            e.preventDefault();
            if (!editTags.includes(tagInput.trim())) {
                setEditTags([...editTags, tagInput.trim()]);
            }
            setTagInput('');
        }
    };

    const handleAddKeyword = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && keywordInput.trim()) {
            e.preventDefault();
            if (!editKeywords.includes(keywordInput.trim())) {
                setEditKeywords([...editKeywords, keywordInput.trim()]);
            }
            setKeywordInput('');
        }
    };

    const removeTag = (tagToRemove: string) => {
        setEditTags(editTags.filter(t => t !== tagToRemove));
    };

    const removeKeyword = (keywordToRemove: string) => {
        setEditKeywords(editKeywords.filter(k => k !== keywordToRemove));
    };

    const toggleTagFilter = (tag: string) => {
        if (selectedTags.includes(tag)) {
            setSelectedTags(selectedTags.filter(t => t !== tag));
        } else {
            setSelectedTags([...selectedTags, tag]);
        }
    };

    const onSelectFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            setCrop(undefined);
            const reader = new FileReader();
            reader.addEventListener('load', () =>
                setSearchImageSrc(reader.result?.toString() || '')
            );
            reader.readAsDataURL(e.target.files[0]);
        }
    };

    const handleImageSearch = async () => {
        if (!completedCrop || !imgRef.current) return;

        const canvas = document.createElement('canvas');
        canvas.width = 8;
        canvas.height = 8;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const scaleX = imgRef.current.naturalWidth / imgRef.current.width;
        const scaleY = imgRef.current.naturalHeight / imgRef.current.height;

        ctx.drawImage(
            imgRef.current,
            completedCrop.x * scaleX,
            completedCrop.y * scaleY,
            completedCrop.width * scaleX,
            completedCrop.height * scaleY,
            0,
            0,
            8,
            8
        );

        const imageData = ctx.getImageData(0, 0, 8, 8).data;
        const feature = new Uint8Array(192);
        let j = 0;
        for (let i = 0; i < imageData.length; i += 4) {
            feature[j++] = imageData[i];
            feature[j++] = imageData[i + 1];
            feature[j++] = imageData[i + 2];
        }

        setSearchFeature(feature);
        setIsImageSearchOpen(false);
    };

    return (
        <div className="h-screen flex flex-col bg-neutral-50 text-neutral-900 font-sans overflow-hidden">
            {/* Header */}
            <header className="flex-none z-10 bg-white/80 backdrop-blur-md border-b border-neutral-200 px-4 sm:px-6 py-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
                        <div className="flex items-center gap-2">
                            <button
                                className="md:hidden p-2 -ml-2 text-neutral-600 hover:bg-neutral-100 rounded-lg"
                                onClick={() => setIsMobileSidebarOpen(true)}
                            >
                                <Menu className="w-6 h-6" />
                            </button>
                            <div className="bg-indigo-600 p-2 rounded-lg hidden sm:block">
                                <ImageIcon className="w-5 h-5 text-white" />
                            </div>
                            <h1 className="text-xl font-bold tracking-tight text-neutral-900">Image Manager</h1>
                        </div>
                    </div>

                    <div className="relative w-full sm:w-96 flex items-center gap-2">
                        <div className="relative flex-1">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Search className="h-5 w-5 text-neutral-400" />
                            </div>
                            <input
                                type="text"
                                className="block w-full pl-10 pr-3 py-2 border border-neutral-300 rounded-xl leading-5 bg-neutral-50 placeholder-neutral-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-all duration-200"
                                placeholder="Search by name, folder, tags..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <button
                            onClick={() => setIsImageSearchOpen(true)}
                            className={`p-2 rounded-xl border transition-colors ${
                                searchFeature
                                    ? 'bg-indigo-100 border-indigo-300 text-indigo-700'
                                    : 'bg-white border-neutral-300 text-neutral-600 hover:bg-neutral-50'
                            }`}
                            title="Search by Image"
                        >
                            <Camera className="w-5 h-5" />
                        </button>
                        {searchFeature && (
                            <button
                                onClick={() => setSearchFeature(null)}
                                className="p-2 rounded-xl border bg-white border-neutral-300 text-red-500 hover:bg-red-50 transition-colors"
                                title="Clear Image Search"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        )}
                    </div>
                </div>
            </header>

            <div className="flex flex-1 overflow-hidden relative">
                {/* Mobile Sidebar Overlay */}
                {isMobileSidebarOpen && (
                    <div
                        className="fixed inset-0 bg-black/50 z-40 md:hidden"
                        onClick={() => setIsMobileSidebarOpen(false)}
                    />
                )}

                {/* Sidebar */}
                <aside className={`
          absolute md:static inset-y-0 left-0 z-50 w-72 md:w-64 flex-none bg-white border-r border-neutral-200 overflow-y-auto py-6 px-4
          transform transition-transform duration-300 ease-in-out
          ${isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}>
                    <div className="flex items-center justify-between mb-6 md:hidden">
                        <h2 className="text-lg font-bold text-neutral-900">Menu</h2>
                        <button
                            onClick={() => setIsMobileSidebarOpen(false)}
                            className="p-2 text-neutral-500 hover:bg-neutral-100 rounded-lg"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                    <nav className="space-y-1">
                        <button
                            onClick={() => { setSelectedDirectory(null); setIsMobileSidebarOpen(false); }}
                            className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                                selectedDirectory === null
                                    ? 'bg-indigo-50 text-indigo-700'
                                    : 'text-neutral-700 hover:bg-neutral-100'
                            }`}
                        >
                            <Home className={`w-5 h-5 ${selectedDirectory === null ? 'text-indigo-500' : 'text-neutral-400'}`} />
                            Home
                        </button>

                        <div className="pt-6 pb-2">
                            <p className="px-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                                Directories
                            </p>
                        </div>

                        {/* Directory Tree */}
                        <DirectoryTree
                            nodes={directoryTree}
                            selectedDirectory={selectedDirectory}
                            onSelect={(dir) => { setSelectedDirectory(dir); setIsMobileSidebarOpen(false); }}
                        />

                        <div className="pt-6 pb-2 flex items-center justify-between px-3">
                            <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                                Tags Filter
                            </p>
                            {selectedTags.length > 1 && (
                                <button
                                    onClick={() => setTagFilterMode(prev => prev === 'AND' ? 'OR' : 'AND')}
                                    className="text-xs font-medium px-2 py-1 bg-neutral-100 rounded text-neutral-600 hover:bg-neutral-200"
                                >
                                    {tagFilterMode}
                                </button>
                            )}
                        </div>
                        <div className="px-3 flex flex-wrap gap-2">
                            {allTags.map(tag => (
                                <button
                                    key={tag}
                                    onClick={() => toggleTagFilter(tag)}
                                    className={`px-2 py-1 text-xs font-medium rounded-md border transition-colors ${
                                        selectedTags.includes(tag)
                                            ? 'bg-indigo-100 border-indigo-200 text-indigo-700'
                                            : 'bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                                    }`}
                                >
                                    {tag}
                                </button>
                            ))}
                            {allTags.length === 0 && (
                                <p className="text-xs text-neutral-400 italic">No tags found</p>
                            )}
                        </div>
                    </nav>
                </aside>

                {/* Main Content */}
                <main className="flex-1 overflow-y-auto p-6">
                    <div className="max-w-6xl mx-auto">
                        {!selectedDirectory && !searchQuery && selectedTags.length === 0 && !loading && (
                            <div className="mb-8">
                                <h2 className="text-2xl font-bold text-neutral-900">Recent Images</h2>
                                <p className="text-neutral-500 mt-1">Showing 10 basic images from your storage.</p>
                            </div>
                        )}

                        {(selectedDirectory || selectedTags.length > 0) && !loading && (
                            <div className="mb-8 flex items-center gap-3">
                                <div className="p-3 bg-indigo-100 rounded-xl">
                                    {selectedDirectory ? <Folder className="w-8 h-8 text-indigo-600" /> : <Tag className="w-8 h-8 text-indigo-600" />}
                                </div>
                                <div>
                                    <h2 className="text-2xl font-bold text-neutral-900 capitalize">
                                        {selectedDirectory || 'Filtered Results'}
                                    </h2>
                                    <p className="text-neutral-500 mt-1">{filteredImages.length} images</p>
                                </div>
                            </div>
                        )}

                        {loading ? (
                            <div className="flex justify-center items-center h-64">
                                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
                            </div>
                        ) : (
                            <div className="space-y-12">
                                {visibleGroupedImages.map(({ dir, images: dirImages, total }) => (
                                    <section key={dir} className="space-y-4">
                                        {(!selectedDirectory || searchQuery || selectedTags.length > 0) && (
                                            <div className="flex items-center gap-2 border-b border-neutral-200 pb-2">
                                                <Folder className="w-5 h-5 text-indigo-500" />
                                                <h3 className="text-lg font-semibold text-neutral-800 capitalize">
                                                    {dir}
                                                </h3>
                                                <span className="text-sm text-neutral-400 font-mono">({total})</span>
                                            </div>
                                        )}

                                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                                            {dirImages.map((img) => (
                                                <div
                                                    key={img.path}
                                                    className="group relative bg-white rounded-2xl shadow-sm border border-neutral-100 overflow-hidden hover:shadow-md transition-shadow duration-300 cursor-pointer flex flex-col"
                                                    onClick={() => openLightbox(img)}
                                                >
                                                    <div className="aspect-[4/3] overflow-hidden bg-neutral-100 relative">
                                                        <img
                                                            src={getImageUrl(img.path)}
                                                            alt={img.filename}
                                                            loading="lazy"
                                                            className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500"
                                                        />
                                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300" />

                                                        {/* Overlay Actions */}
                                                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 gap-2">
                                                            <button
                                                                className="p-2 bg-white/90 rounded-full shadow-lg hover:bg-white text-neutral-700 hover:text-indigo-600 transition-colors"
                                                                title="Zoom"
                                                            >
                                                                <ZoomIn className="w-5 h-5" />
                                                            </button>
                                                            <button
                                                                onClick={(e) => handleDownload(e, img)}
                                                                className="p-2 bg-white/90 rounded-full shadow-lg hover:bg-white text-neutral-700 hover:text-indigo-600 transition-colors"
                                                                title="Download"
                                                            >
                                                                <Download className="w-5 h-5" />
                                                            </button>
                                                        </div>
                                                    </div>

                                                    <div className="p-4 flex-1 flex flex-col justify-between">
                                                        <div>
                                                            <h3 className="text-sm font-medium text-neutral-900 truncate" title={img.title}>
                                                                {img.title}
                                                            </h3>
                                                            <p className="text-xs text-neutral-500 mt-1 font-mono truncate">
                                                                {img.directory}
                                                            </p>
                                                        </div>
                                                        {img.tags && img.tags.length > 0 && (
                                                            <div className="mt-3 flex flex-wrap gap-1">
                                                                {img.tags.slice(0, 3).map(tag => (
                                                                    <span key={tag} className="px-1.5 py-0.5 bg-neutral-100 text-neutral-600 text-[10px] rounded border border-neutral-200 truncate max-w-full">
                                    {tag}
                                  </span>
                                                                ))}
                                                                {img.tags.length > 3 && (
                                                                    <span className="px-1.5 py-0.5 bg-neutral-50 text-neutral-500 text-[10px] rounded border border-neutral-200">
                                    +{img.tags.length - 3}
                                  </span>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </section>
                                ))}

                                {filteredImages.length === 0 && (
                                    <div className="text-center py-20">
                                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-neutral-100 mb-4">
                                            <Search className="w-8 h-8 text-neutral-400" />
                                        </div>
                                        <h3 className="text-lg font-medium text-neutral-900">No images found</h3>
                                        <p className="text-neutral-500 mt-2">Try adjusting your search terms or selecting a different folder.</p>
                                    </div>
                                )}

                                {totalImagesInGroups > visibleCount && (
                                    <div ref={lastElementRef} className="h-20 flex items-center justify-center mt-8">
                                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </main>
            </div>

            {/* Image Search Modal */}
            {isImageSearchOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="flex items-center justify-between p-4 border-b border-neutral-200">
                            <h2 className="text-lg font-bold text-neutral-900">Image Search</h2>
                            <button onClick={() => setIsImageSearchOpen(false)} className="p-2 text-neutral-500 hover:bg-neutral-100 rounded-lg">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-4">
                            <input
                                type="file"
                                accept="image/*"
                                onChange={onSelectFile}
                                className="block w-full text-sm text-neutral-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                            />
                            {searchImageSrc && (
                                <div className="border border-neutral-200 rounded-lg bg-neutral-50 flex items-center justify-center p-4 min-h-[300px] overflow-auto">
                                    <ReactCrop
                                        crop={crop}
                                        onChange={(_, percentCrop) => setCrop(percentCrop)}
                                        onComplete={(c) => setCompletedCrop(c)}
                                        className="max-w-full"
                                    >
                                        <img
                                            ref={imgRef}
                                            alt="Crop me"
                                            src={searchImageSrc}
                                            className="max-w-full max-h-[50vh] w-auto h-auto block"
                                            onLoad={(e) => {
                                                const { width, height } = e.currentTarget;
                                                setCrop({ unit: '%', x: 0, y: 0, width: 100, height: 100 });
                                                setCompletedCrop({ unit: 'px', x: 0, y: 0, width, height });
                                            }}
                                        />
                                    </ReactCrop>
                                </div>
                            )}
                        </div>
                        <div className="p-4 border-t border-neutral-200 flex justify-end gap-3">
                            <button
                                onClick={() => {
                                    setSearchFeature(null);
                                    setSearchImageSrc('');
                                    setIsImageSearchOpen(false);
                                }}
                                className="px-4 py-2 text-neutral-700 hover:bg-neutral-100 rounded-lg font-medium"
                            >
                                Clear Search
                            </button>
                            <button
                                onClick={handleImageSearch}
                                disabled={!completedCrop || !completedCrop.width || !completedCrop.height}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium disabled:opacity-50"
                            >
                                Search Similar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Lightbox Modal */}
            {selectedImage && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 cursor-pointer"
                    onClick={() => setSelectedImage(null)}
                >
                    <div
                        className="relative max-w-7xl max-h-[90vh] w-full flex flex-col md:flex-row gap-6 items-start cursor-default bg-neutral-900 rounded-2xl overflow-hidden shadow-2xl"
                        onClick={(e) => {
                            if (e.target !== e.currentTarget) {
                                e.stopPropagation();
                            } else {
                                setSelectedImage(null);
                            }
                        }}
                    >
                        <button
                            onClick={() => setSelectedImage(null)}
                            className="absolute top-4 right-4 p-2 text-white/70 hover:text-white transition-colors z-10 bg-black/20 rounded-full"
                        >
                            <X className="w-6 h-6" />
                        </button>

                        {/* Image Container */}
                        <div className="flex-1 w-full flex items-center justify-center p-6 bg-black/40 min-h-[50vh] md:min-h-[80vh]">
                            <img
                                src={getImageUrl(selectedImage.path)}
                                alt={selectedImage.filename}
                                className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-2xl"
                            />
                        </div>

                        {/* Metadata Sidebar */}
                        <div className="w-full md:w-80 bg-neutral-900 p-6 flex flex-col h-full overflow-y-auto border-t md:border-t-0 md:border-l border-neutral-800">
                            <h3 className="text-white text-xl font-medium mb-1">{selectedImage.filename}</h3>
                            <p className="text-neutral-400 text-sm mb-6 flex items-center gap-2">
                                <Folder className="w-4 h-4" /> {selectedImage.directory}
                            </p>

                            <div className="space-y-6 flex-1">
                                {/* Tags Section */}
                                <div>
                                    <label className="block text-sm font-medium text-neutral-300 mb-2">Tags</label>
                                    <div className="flex flex-wrap gap-2 mb-3">
                                        {editTags.map(tag => (
                                            <span key={tag} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-sm bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                          {tag}
                                                <button onClick={() => removeTag(tag)} className="hover:text-white"><X className="w-3 h-3" /></button>
                        </span>
                                        ))}
                                    </div>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            value={tagInput}
                                            onChange={(e) => setTagInput(e.target.value)}
                                            onKeyDown={handleAddTag}
                                            placeholder="Add tag and press Enter"
                                            className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-indigo-500"
                                        />
                                    </div>
                                </div>

                                {/* Keywords Section */}
                                <div>
                                    <label className="block text-sm font-medium text-neutral-300 mb-2">Keywords</label>
                                    <div className="flex flex-wrap gap-2 mb-3">
                                        {editKeywords.map(keyword => (
                                            <span key={keyword} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-sm bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          {keyword}
                                                <button onClick={() => removeKeyword(keyword)} className="hover:text-white"><X className="w-3 h-3" /></button>
                        </span>
                                        ))}
                                    </div>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            value={keywordInput}
                                            onChange={(e) => setKeywordInput(e.target.value)}
                                            onKeyDown={handleAddKeyword}
                                            placeholder="Add keyword and press Enter"
                                            className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="mt-8 pt-6 border-t border-neutral-800 space-y-3">
                                <button
                                    onClick={saveMetadata}
                                    disabled={isSaving}
                                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                                >
                                    {isSaving ? 'Saving...' : 'Save Metadata'}
                                </button>
                                {selectedImage.feature && (
                                    <button
                                        onClick={() => {
                                            setSearchFeature(base64ToUint8Array(selectedImage.feature!));
                                            setSelectedImage(null);
                                        }}
                                        className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                                    >
                                        <Camera className="w-4 h-4" />
                                        Find Similar
                                    </button>
                                )}
                                <button
                                    onClick={(e) => handleDownload(e, selectedImage)}
                                    className="w-full py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                                >
                                    <Download className="w-4 h-4" />
                                    Download Original
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
