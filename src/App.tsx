import { ImageData } from '@/types';
import { Search, Download, ZoomIn, Folder, Image as ImageIcon, X, Home, ChevronRight, Tag, Plus, Menu, Camera, Copy, Check } from 'lucide-react';
import React, { useState, useEffect, useMemo, MouseEvent, KeyboardEvent, useRef, useCallback } from 'react';
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

const DirectoryTreeNode: React.FC<{ 
  node: DirNode, 
  level: number, 
  selectedDirectory: string | null, 
  onSelect: (path: string) => void 
}> = ({ 
  node, 
  level, 
  selectedDirectory, 
  onSelect 
}) => {
  const isSelected = selectedDirectory === node.path;
  const hasChildren = Object.keys(node.children).length > 0;
  const [expanded, setExpanded] = useState(false);

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
            nodes={(Object.values(node.children) as DirNode[]).sort((a, b) => a.name.localeCompare(b.name))} 
            level={level + 1} 
            selectedDirectory={selectedDirectory} 
            onSelect={onSelect} 
          />
        </div>
      )}
    </div>
  );
};

export type TagCategory = 'size' | 'surface' | 'material' | 'other';

const tagCategories: { key: TagCategory, label: string }[] = [
  { key: 'size', label: 'Kích thước' },
  { key: 'surface', label: 'Bề mặt' },
  { key: 'material', label: 'Chất liệu' },
  { key: 'other', label: 'Tags khác' },
];

export default function App() {
  const [images, setImages] = useState<ImageData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedImage, setSelectedImage] = useState<ImageData | null>(null);
  const [selectedDirectory, setSelectedDirectory] = useState<string | null>(null);
  
  // Tag filtering state
  const [selectedTags, setSelectedTags] = useState<{
    size: string[];
    surface: string[];
    material: string[];
    other: string[];
  }>({ size: [], surface: [], material: [], other: [] });
  const [tagFilterMode, setTagFilterMode] = useState<'AND' | 'OR'>('OR');

  // Edit metadata state
  const [editTags, setEditTags] = useState<{
    size: string[];
    surface: string[];
    material: string[];
    other: string[];
  }>({ size: [], surface: [], material: [], other: [] });
  const [editKeywords, setEditKeywords] = useState<string[]>([]);
  const [tagInputs, setTagInputs] = useState<{
    size: string;
    surface: string;
    material: string;
    other: string;
  }>({ size: '', surface: '', material: '', other: '' });
  const [keywordInput, setKeywordInput] = useState('');
  const [focusedInput, setFocusedInput] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [toast, setToast] = useState<{message: string, type: 'success' | 'error'} | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedImage) {
        setSelectedImage(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedImage]);

  // Image Search state
  const [isImageSearchOpen, setIsImageSearchOpen] = useState(false);
  const [searchImageSrc, setSearchImageSrc] = useState('');
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const imgRef = useRef<HTMLImageElement>(null);
  const [searchFeature, setSearchFeature] = useState<Uint8Array | null>(null);
  const [croppedSearchImage, setCroppedSearchImage] = useState<string | null>(null);

  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setIsCameraOpen(true);
      setSearchImageSrc('');
      setCrop(undefined);
    } catch (err) {
      console.error("Error accessing camera:", err);
      showToast("Không thể truy cập camera", "error");
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraOpen(false);
  };

  const captureCamera = () => {
    if (videoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0);
        setSearchImageSrc(canvas.toDataURL('image/jpeg'));
        stopCamera();
      }
    }
  };

  useEffect(() => {
    if (!isImageSearchOpen) {
      stopCamera();
    }
  }, [isImageSearchOpen]);

  const mainRef = useRef<HTMLElement>(null);
  const [isScrolled, setIsScrolled] = useState(false);

  const handleScroll = (e: React.UIEvent<HTMLElement>) => {
    setIsScrolled(e.currentTarget.scrollTop > 100);
  };

  useEffect(() => {
    if (searchQuery || searchFeature) {
      setSelectedDirectory(null);
    }
  }, [searchQuery, searchFeature]);

  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
    }
  }, [selectedDirectory, searchQuery, searchFeature, selectedTags]);

  // Pagination / Infinite Scroll state
  const [visibleCount, setVisibleCount] = useState(30);
  const observer = useRef<IntersectionObserver | null>(null);

  const lastElementRef = useCallback((node: HTMLDivElement) => {
    if (loading) return;
    if (observer.current) observer.current.disconnect();
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        setVisibleCount(prev => prev + 30);
      }
    });
    if (node) observer.current.observe(node);
  }, [loading]);

  // Reset visible count when filters change
  useEffect(() => {
    setVisibleCount(30);
  }, [searchQuery, selectedDirectory, selectedTags, tagFilterMode]);

  useEffect(() => {
    fetchImages();
  }, []);

  const getImageUrl = (path: string) => {
    return `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;
  };

  const fetchImages = async (retries = 3) => {
    try {
      const url = import.meta.env.DEV ? '/api/images' : `${import.meta.env.BASE_URL}images.json?t=${Date.now()}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch images');
      const data = await response.json();
      setImages(data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching images:', error);
      if (retries > 0) {
        setTimeout(() => fetchImages(retries - 1), 1000);
      } else {
        setLoading(false);
        showToast('Không thể tải danh sách ảnh, vui lòng tải lại trang', 'error');
      }
    }
  };

  const directoryTree = useMemo(() => {
    const rootNodes: Record<string, DirNode> = {};

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
    
    return Object.values(rootNodes).sort((a, b) => a.name.localeCompare(b.name));
  }, [images]);

  const allTags = useMemo(() => {
    const size = new Set<string>();
    const surface = new Set<string>();
    const material = new Set<string>();
    const other = new Set<string>();
    
    images.forEach(img => {
      img.sizeTags?.forEach(t => size.add(t));
      img.surfaceTags?.forEach(t => surface.add(t));
      img.materialTags?.forEach(t => material.add(t));
      img.otherTags?.forEach(t => other.add(t));
    });
    
    return {
      size: Array.from(size).sort(),
      surface: Array.from(surface).sort(),
      material: Array.from(material).sort(),
      other: Array.from(other).sort()
    };
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
    const allSelectedTags = [
      ...selectedTags.size,
      ...selectedTags.surface,
      ...selectedTags.material,
      ...selectedTags.other
    ];
    
    if (allSelectedTags.length > 0) {
      result = result.filter(img => {
        const imgTags = [
          ...(img.sizeTags || []),
          ...(img.surfaceTags || []),
          ...(img.materialTags || []),
          ...(img.otherTags || [])
        ];
        if (tagFilterMode === 'AND') {
          return allSelectedTags.every(t => imgTags.includes(t));
        } else {
          return allSelectedTags.some(t => imgTags.includes(t));
        }
      });
    }

    // Filter by search query
    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      result = result.filter(
        (img) => {
          const imgTags = [
            ...(img.sizeTags || []),
            ...(img.surfaceTags || []),
            ...(img.materialTags || []),
            ...(img.otherTags || [])
          ];
          return img.filename.toLowerCase().includes(lowerQuery) ||
          img.directory.toLowerCase().includes(lowerQuery) ||
          img.title.toLowerCase().includes(lowerQuery) ||
          imgTags.some(t => t.toLowerCase().includes(lowerQuery)) ||
          (img.keywords || []).some(k => k.toLowerCase().includes(lowerQuery));
        }
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

  const totalSelectedTagsCount = selectedTags.size.length + selectedTags.surface.length + selectedTags.material.length + selectedTags.other.length;

  // Group images by directory for the "Folder View" feel, or just list them.
  const groupedImages = useMemo<Record<string, ImageData[]>>(() => {
    const groups: Record<string, ImageData[]> = {};
    
    const imagesToGroup = filteredImages;

    imagesToGroup.forEach((img) => {
      const normalizedDir = img.directory.replace(/\\/g, '/');
      const dir = normalizedDir === '.' ? 'Root' : normalizedDir;
      if (!groups[dir]) groups[dir] = [];
      groups[dir].push(img);
    });
    return groups;
  }, [filteredImages, searchFeature]);

  const visibleGroupedImages = useMemo(() => {
    const result: Array<{dir: string, images: ImageData[], total: number}> = [];
    let currentCount = 0;

    for (const [dir, dirImages] of Object.entries(groupedImages) as [string, ImageData[]][]) {
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
    return (Object.values(groupedImages) as ImageData[][]).reduce((acc, arr) => acc + arr.length, 0);
  }, [groupedImages]);

  const handleDownload = async (e: MouseEvent, img: ImageData) => {
    e.stopPropagation();
    try {
      let url = '';
      if (import.meta.env.DEV) {
        url = `/api/download?path=${encodeURIComponent(img.path)}`;
      } else {
        url = getImageUrl(img.path);
      }

      const response = await fetch(url);
      if (!response.ok) throw new Error('Download failed');
      
      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      
      const image = new Image();
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
        image.src = objectUrl;
      });
      
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not get canvas context');
      
      // Fill with white background for transparent images
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0);
      
      const jpegBlob = await new Promise<Blob | null>(resolve => {
        canvas.toBlob(resolve, 'image/jpeg', 0.95);
      });
      
      if (!jpegBlob) throw new Error('Could not create JPEG blob');
      
      const downloadUrl = window.URL.createObjectURL(jpegBlob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      
      // Change extension to .jpg
      const nameWithoutExt = img.filename.substring(0, img.filename.lastIndexOf('.')) || img.filename;
      a.download = `${nameWithoutExt}.jpg`;
      
      document.body.appendChild(a);
      a.click();
      
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);
      window.URL.revokeObjectURL(objectUrl);
    } catch (error) {
      console.error('Download error:', error);
    }
  };

  const openLightbox = (img: ImageData) => {
    setSelectedImage(img);
    setEditTags({
      size: img.sizeTags || [],
      surface: img.surfaceTags || [],
      material: img.materialTags || [],
      other: img.otherTags || []
    });
    setEditKeywords(img.keywords || []);
    setTagInputs({ size: '', surface: '', material: '', other: '' });
    setKeywordInput('');
  };

  const saveMetadata = async () => {
    if (!selectedImage) return;
    
    if (!import.meta.env.DEV) {
      showToast("Bạn không có quyền thực hiện thao tác này!", "error");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch('/api/images/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: selectedImage.path,
          sizeTags: editTags.size,
          surfaceTags: editTags.surface,
          materialTags: editTags.material,
          otherTags: editTags.other,
          keywords: editKeywords
        })
      });
      
      if (!response.ok) throw new Error('Failed to save metadata');
      
      // Update local state
      const updatedImage = { 
        ...selectedImage, 
        sizeTags: editTags.size,
        surfaceTags: editTags.surface,
        materialTags: editTags.material,
        otherTags: editTags.other,
        keywords: editKeywords 
      };
      setImages(images.map(img => img.path === selectedImage.path ? updatedImage : img));
      setSelectedImage(updatedImage);
      showToast("Metadata saved successfully!");
    } catch (error) {
      console.error('Error saving metadata:', error);
      showToast("Failed to save metadata", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddTag = (category: TagCategory, e: KeyboardEvent<HTMLInputElement>) => {
    const input = tagInputs[category].trim();
    if (e.key === 'Enter' && input) {
      e.preventDefault();
      if (!editTags[category].includes(input)) {
        setEditTags(prev => ({ ...prev, [category]: [...prev[category], input] }));
      }
      setTagInputs(prev => ({ ...prev, [category]: '' }));
    }
  };

  const handleSuggestionClick = (category: TagCategory, tag: string) => {
    if (!editTags[category].includes(tag)) {
      setEditTags(prev => ({ ...prev, [category]: [...prev[category], tag] }));
    }
    setTagInputs(prev => ({ ...prev, [category]: '' }));
    setFocusedInput(null);
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

  const removeTag = (category: TagCategory, tagToRemove: string) => {
    setEditTags(prev => ({ ...prev, [category]: prev[category].filter(t => t !== tagToRemove) }));
  };

  const removeKeyword = (keywordToRemove: string) => {
    setEditKeywords(editKeywords.filter(k => k !== keywordToRemove));
  };

  const toggleTagFilter = (category: TagCategory, tag: string) => {
    setSelectedTags(prev => {
      const categoryTags = prev[category];
      if (categoryTags.includes(tag)) {
        return { ...prev, [category]: categoryTags.filter(t => t !== tag) };
      } else {
        return { ...prev, [category]: [...categoryTags, tag] };
      }
    });
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

  useEffect(() => {
    if (!isImageSearchOpen) return;

    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile();
          if (blob) {
            setCrop(undefined);
            const reader = new FileReader();
            reader.addEventListener('load', () =>
              setSearchImageSrc(reader.result?.toString() || '')
            );
            reader.readAsDataURL(blob);
          }
          break;
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isImageSearchOpen]);

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

    const displayCanvas = document.createElement('canvas');
    displayCanvas.width = completedCrop.width * scaleX;
    displayCanvas.height = completedCrop.height * scaleY;
    const displayCtx = displayCanvas.getContext('2d');
    if (displayCtx) {
      displayCtx.drawImage(
        imgRef.current,
        completedCrop.x * scaleX,
        completedCrop.y * scaleY,
        completedCrop.width * scaleX,
        completedCrop.height * scaleY,
        0,
        0,
        displayCanvas.width,
        displayCanvas.height
      );
      setCroppedSearchImage(displayCanvas.toDataURL('image/jpeg'));
    }

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
              <h1 className="text-xl font-bold tracking-tight text-neutral-900">Viglacera Products</h1>
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
          absolute md:static inset-y-0 left-0 z-50 w-72 md:w-64 flex-none bg-white border-r border-neutral-200 flex flex-col py-6 px-4
          transform transition-transform duration-300 ease-in-out
          ${isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}>
          <div className="flex items-center justify-between mb-6 md:hidden flex-none">
            <h2 className="text-lg font-bold text-neutral-900">Menu</h2>
            <button 
              onClick={() => setIsMobileSidebarOpen(false)}
              className="p-2 text-neutral-500 hover:bg-neutral-100 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <nav className="flex flex-col h-full overflow-hidden space-y-1">
            <button
              onClick={() => { setSelectedDirectory(null); setIsMobileSidebarOpen(false); }}
              className={`w-full flex-none flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                selectedDirectory === null
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-neutral-700 hover:bg-neutral-100'
              }`}
            >
              <Home className={`w-5 h-5 ${selectedDirectory === null ? 'text-indigo-500' : 'text-neutral-400'}`} />
              Home
            </button>
            
            <div className="pt-4 pb-2 flex-none">
              <p className="px-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                Directories
              </p>
            </div>
            
            {/* Directory Tree */}
            <div className="flex-1 overflow-y-auto min-h-[150px] pr-2 custom-scrollbar">
              <DirectoryTree 
                nodes={directoryTree} 
                selectedDirectory={selectedDirectory} 
                onSelect={(dir) => { setSelectedDirectory(dir); setIsMobileSidebarOpen(false); }} 
              />
            </div>

            <div className="pt-4 pb-2 flex items-center justify-between px-3 flex-none border-t border-neutral-100 mt-2">
              <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                Tags Filter
              </p>
              {totalSelectedTagsCount > 1 && (
                <button 
                  onClick={() => setTagFilterMode(prev => prev === 'AND' ? 'OR' : 'AND')}
                  className="text-xs font-medium px-2 py-1 bg-neutral-100 rounded text-neutral-600 hover:bg-neutral-200"
                >
                  {tagFilterMode}
                </button>
              )}
            </div>
            
            <div className="flex-1 overflow-y-auto min-h-[150px] pr-2 custom-scrollbar">
              {tagCategories.map(({ key, label }) => {
                const categoryTags = allTags[key];
                if (categoryTags.length === 0) return null;
                
                return (
                  <div key={key} className="mb-4">
                    <p className="px-3 text-xs font-medium text-neutral-400 mb-2">{label}</p>
                    <div className="px-3 flex flex-wrap gap-2">
                      {categoryTags.map(tag => (
                        <button
                          key={tag}
                          onClick={() => toggleTagFilter(key, tag)}
                          className={`px-2 py-1 text-xs font-medium rounded-md border transition-colors ${
                            selectedTags[key].includes(tag) 
                              ? 'bg-indigo-100 border-indigo-200 text-indigo-700' 
                              : 'bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                          }`}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
              
              {Object.values(allTags).every((tags: any) => tags.length === 0) && (
                <div className="px-3">
                  <p className="text-xs text-neutral-400 italic">No tags found</p>
                </div>
              )}
            </div>
          </nav>
        </aside>

        {/* Main Content */}
        <main ref={mainRef} className="flex-1 overflow-y-auto p-6 relative" onScroll={handleScroll}>
          <div className="max-w-8xl mx-auto">
            {!loading && (
              <div className="mb-8 flex flex-col md:flex-row items-start md:items-center gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-indigo-100 rounded-xl">
                  {searchQuery || searchFeature ? (
                    <Search className="w-8 h-8 text-indigo-600" />
                  ) : totalSelectedTagsCount > 0 ? (
                    <Tag className="w-8 h-8 text-indigo-600" />
                  ) : selectedDirectory ? (
                    <Folder className="w-8 h-8 text-indigo-600" />
                  ) : (
                    <ImageIcon className="w-8 h-8 text-indigo-600" />
                  )}
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-neutral-900 capitalize">
                    {searchQuery || searchFeature
                      ? (searchQuery ? `Kết quả tìm kiếm cho: "${searchQuery}"` : 'Kết quả tìm kiếm bằng hình ảnh') + (totalSelectedTagsCount > 0 ? ` (đang lọc theo tags)` : '')
                      : totalSelectedTagsCount > 0
                      ? `Đang lọc theo tags: ${[
                          ...selectedTags.size,
                          ...selectedTags.surface,
                          ...selectedTags.material,
                          ...selectedTags.other
                        ].join(', ')}`
                      : selectedDirectory
                      ? selectedDirectory
                      : 'Tất cả hình ảnh'}
                  </h2>
                  <p className="text-neutral-500 mt-1">
                    {!selectedDirectory && !searchQuery && !searchFeature && totalSelectedTagsCount === 0
                      ? 'Hiển thị tất cả ảnh trong các thư mục.'
                      : `${filteredImages.length} images found`}
                  </p>
                </div>
              </div>
              {searchFeature && croppedSearchImage && (
                  <div className="mt-4 md:mt-0 lg:ml-auto p-2 bg-white rounded-xl shadow-sm border border-neutral-200 flex items-center gap-3">
                    <img src={croppedSearchImage} alt="Sample" className="w-16 h-16 object-cover rounded-lg border border-neutral-100" />
                    <div className="text-sm pr-2">
                      <p className="font-semibold text-neutral-700">Ảnh mẫu</p>
                      <button onClick={() => { setSearchFeature(null); setCroppedSearchImage(null); }} className="text-red-500 hover:text-red-600 font-medium text-xs">Hủy bỏ</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {searchFeature && croppedSearchImage && isScrolled && (
              <div className="fixed bottom-6 right-6 z-40 bg-white p-2 rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-neutral-200 transition-all duration-300 animate-in slide-in-from-bottom-4">
                <div className="relative group flex items-center gap-3 pr-2">
                  <img src={croppedSearchImage} alt="Sample" className="w-14 h-14 md:w-20 md:h-20 object-cover rounded-lg border border-neutral-100" />
                  <div className="text-sm hidden sm:block">
                    <p className="font-semibold text-neutral-700">Ảnh mẫu</p>
                  </div>
                  <button 
                    onClick={() => { setSearchFeature(null); setCroppedSearchImage(null); }} 
                    className="absolute -top-3 -right-3 bg-red-50 text-red-600 hover:bg-red-100 rounded-full p-1.5 shadow-sm border border-red-100 transition-colors"
                  >
                    <X className="w-4 h-4"/>
                  </button>
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
                    {(!selectedDirectory || searchQuery || totalSelectedTagsCount > 0 || searchFeature) && (
                      <div className="flex items-center gap-2 border-b border-neutral-200 pb-2">
                        {searchFeature ? <Search className="w-5 h-5 text-indigo-500" /> : <Folder className="w-5 h-5 text-indigo-500" />}
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
                            {(() => {
                              const combinedTags = [
                                ...(img.sizeTags || []),
                                ...(img.surfaceTags || []),
                                ...(img.materialTags || []),
                                ...(img.otherTags || [])
                              ];
                              if (combinedTags.length === 0) return null;
                              return (
                                <div className="mt-3 flex flex-wrap gap-1">
                                  {combinedTags.slice(0, 3).map(tag => (
                                    <span key={tag} className="px-1.5 py-0.5 bg-neutral-100 text-neutral-600 text-[10px] rounded border border-neutral-200 truncate max-w-full">
                                      {tag}
                                    </span>
                                  ))}
                                  {combinedTags.length > 3 && (
                                    <span className="px-1.5 py-0.5 bg-neutral-50 text-neutral-500 text-[10px] rounded border border-neutral-200">
                                      +{combinedTags.length - 3}
                                    </span>
                                  )}
                                </div>
                              );
                            })()}
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
              <div className="flex flex-col gap-3">
                {!isCameraOpen && (
                  <>
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={onSelectFile} 
                      className="block w-full text-sm text-neutral-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                    />
                    <p className="text-sm text-neutral-500 italic">Or paste an image from your clipboard (Ctrl+V / Cmd+V)</p>
                    <div className="flex items-center gap-4 py-2">
                      <div className="flex-1 h-px bg-neutral-200"></div>
                      <span className="text-xs text-neutral-400 font-medium uppercase tracking-wider">Hoặc</span>
                      <div className="flex-1 h-px bg-neutral-200"></div>
                    </div>
                    <button 
                      onClick={startCamera} 
                      className="py-3 px-4 rounded-xl bg-indigo-50 text-indigo-700 font-semibold flex items-center justify-center gap-2 hover:bg-indigo-100 transition-colors"
                    >
                      <Camera className="w-5 h-5" />
                      Chụp ảnh trực tiếp
                    </button>
                  </>
                )}
                {isCameraOpen && (
                  <div className="flex flex-col gap-3">
                    <div className="relative aspect-video w-full bg-black rounded-xl overflow-hidden shadow-inner flex items-center justify-center text-white/50 text-sm">
                      {!streamRef.current && <span>Đang mở camera...</span>}
                      <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" />
                    </div>
                    <div className="flex gap-2 justify-end mt-2">
                      <button onClick={stopCamera} className="py-2.5 px-5 rounded-lg bg-neutral-100 text-neutral-700 font-medium hover:bg-neutral-200 transition-colors">
                        Hủy
                      </button>
                      <button onClick={captureCamera} className="py-2.5 px-5 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2">
                        <Camera className="w-4 h-4" />
                        Chụp ảnh mẫu
                      </button>
                    </div>
                  </div>
                )}
              </div>
              {searchImageSrc && !isCameraOpen && (
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
            className="relative max-w-7xl max-h-[90vh] w-full flex flex-col md:flex-row items-stretch cursor-default bg-neutral-900 rounded-2xl overflow-hidden shadow-2xl"
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
              <div className="w-full md:w-80 bg-neutral-900 flex flex-col border-t md:border-t-0 md:border-l border-neutral-800 max-h-[90vh]">
                <div className="p-6 flex-1 overflow-y-auto">
                  <h3 className="text-white text-xl font-medium mb-1">{selectedImage.filename}</h3>
                  <p className="text-neutral-400 text-sm mb-6 flex items-center gap-2">
                    <Folder className="w-4 h-4" /> {selectedImage.directory}
                  </p>

                  <div className="space-y-6">
                  {/* Tags Sections */}
                  {tagCategories.map(({ key, label }) => (
                    <div key={key}>
                      <label className="block text-sm font-medium text-neutral-300 mb-2">{label}</label>
                      <div className="flex flex-wrap gap-2 mb-3">
                        {editTags[key].map(tag => (
                          <span key={tag} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-sm bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                            {tag}
                            <button onClick={() => removeTag(key, tag)} className="hover:text-white"><X className="w-3 h-3" /></button>
                          </span>
                        ))}
                      </div>
                      <div className="relative">
                        <input
                          type="text"
                          value={tagInputs[key]}
                          onChange={(e) => setTagInputs(prev => ({ ...prev, [key]: e.target.value }))}
                          onKeyDown={(e) => handleAddTag(key, e)}
                          onFocus={() => setFocusedInput(key)}
                          onBlur={() => setTimeout(() => setFocusedInput(null), 150)}
                          placeholder={`Add ${label.toLowerCase()} and press Enter`}
                          className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-indigo-500"
                        />
                        {focusedInput === key && allTags[key].filter(t => t.toLowerCase().includes(tagInputs[key].toLowerCase()) && !editTags[key].includes(t)).length > 0 && (
                          <div className="absolute z-10 w-full mt-1 bg-neutral-800 border border-neutral-700 rounded-lg shadow-lg max-h-48 overflow-y-auto custom-scrollbar">
                            {allTags[key]
                              .filter(t => t.toLowerCase().includes(tagInputs[key].toLowerCase()) && !editTags[key].includes(t))
                              .map(tag => (
                                <button
                                  key={tag}
                                  onMouseDown={(e) => {
                                    e.preventDefault(); // Prevent input blur
                                    handleSuggestionClick(key, tag);
                                  }}
                                  className="w-full text-left px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-700 hover:text-white transition-colors"
                                >
                                  {tag}
                                </button>
                              ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

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
                </div>

                <div className="p-6 border-t border-neutral-800 space-y-3 bg-neutral-900 shrink-0">
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
                  <div className="flex gap-3">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        try {
                          const img = new Image();
                          img.crossOrigin = 'anonymous';
                          img.onload = () => {
                            const canvas = document.createElement('canvas');
                            canvas.width = img.width;
                            canvas.height = img.height;
                            const ctx = canvas.getContext('2d');
                            ctx?.drawImage(img, 0, 0);
                            canvas.toBlob((blob) => {
                              if (blob) {
                                navigator.clipboard.write([
                                  new ClipboardItem({ 'image/png': blob })
                                ]).then(() => {
                                  showToast('Image copied to clipboard!');
                                }).catch(err => {
                                  console.error('Failed to copy image: ', err);
                                  showToast('Failed to copy image.', 'error');
                                });
                              }
                            }, 'image/png');
                          };
                          img.src = getImageUrl(selectedImage.path);
                        } catch (err) {
                          console.error('Copy failed:', err);
                          showToast('Failed to copy image.', 'error');
                        }
                      }}
                      className="flex-1 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                    >
                      <Copy className="w-4 h-4" />
                      Copy
                    </button>
                    <button 
                      onClick={(e) => handleDownload(e, selectedImage)}
                      className="flex-1 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                    >
                      <Download className="w-4 h-4" />
                      Download
                    </button>
                  </div>
                </div>
              </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[100] px-4 py-3 rounded-lg shadow-lg font-medium text-sm flex items-center gap-2 transition-all duration-300 ${
          toast.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'
        }`}>
          {toast.type === 'success' ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
          {toast.message}
        </div>
      )}
    </div>
  );
}
