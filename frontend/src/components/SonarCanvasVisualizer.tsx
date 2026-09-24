import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { 
  ZoomIn, 
  ZoomOut, 
  RefreshCw, 
  Radio, 
  Target, 
  Scan, 
  Layers, 
  Volume2, 
  VolumeX,
  Lock,
  X,
  Crosshair,
  Maximize2,
  Minimize2,
  Sliders,
  Filter,
  Sparkles,
  Palette,
  ShieldCheck,
  Check
} from 'lucide-react';
import { 
  PresetDataset, 
  SonarHazard, 
  FilterSettings, 
  MaterialType, 
  HazardCategory, 
  getMaterialType, 
  getMaterialStyle 
} from '../types';
import { drawProceduralSonar } from '../utils/sonarImageGenerator';

const CATEGORIES: HazardCategory[] = [
  'Iron / Metal Scrap',
  'Plastic Marine Debris',
  'Wet Debris (Ghost Net)',
  'Subsea Pipe (Iron/Steel)',
  'Shipwreck (Iron Hull)',
  'Metallic Cylinder',
  'Munitions / UXO',
  'Seafloor Anomaly'
];

interface SonarCanvasVisualizerProps {
  dataset: PresetDataset;
  hazards: SonarHazard[];
  filterSettings: FilterSettings;
  onChangeFilterSettings?: (newSettings: FilterSettings) => void;
  customImageFile: File | null;
  onSelectHazard: (hazard: SonarHazard) => void;
  selectedHazardId: string | null;
}

export const SonarCanvasVisualizer: React.FC<SonarCanvasVisualizerProps> = ({
  dataset,
  hazards,
  filterSettings,
  onChangeFilterSettings,
  customImageFile,
  onSelectHazard,
  selectedHazardId
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [zoomLevel, setZoomLevel] = useState(1);
  const [hoveredHazard, setHoveredHazard] = useState<SonarHazard | null>(null);

  // Fullscreen Tactical HUD state
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isTacticalFilterOpen, setIsTacticalFilterOpen] = useState<boolean>(true);

  const toggleFullscreen = () => {
    setIsFullscreen(prev => !prev);
  };

  // Keyboard shortcut: Escape exits Fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  // Update filter settings and propagate to parent App state
  const updateFilter = useCallback((partial: Partial<FilterSettings>) => {
    if (onChangeFilterSettings) {
      onChangeFilterSettings({ ...filterSettings, ...partial });
    }
  }, [filterSettings, onChangeFilterSettings]);

  const toggleCategoryFilter = (cat: HazardCategory) => {
    const exists = filterSettings.selectedCategories.includes(cat);
    const updated = exists 
      ? filterSettings.selectedCategories.filter(c => c !== cat)
      : [...filterSettings.selectedCategories, cat];
    updateFilter({ selectedCategories: updated });
  };

  // Material category filter state for canvas tabs
  const [activeMaterialTab, setActiveMaterialTab] = useState<'ALL' | MaterialType>('ALL');

  // Real-time acoustic beam sweep state
  const [isRealtimeSweepActive, setIsRealtimeSweepActive] = useState<boolean>(true);
  const [sweepProgressPct, setSweepProgressPct] = useState<number>(0);
  const [activeBeamHazard, setActiveBeamHazard] = useState<SonarHazard | null>(null);

  // Triggered AI Scan sweep animation state
  const [isAiScanRunning, setIsAiScanRunning] = useState<boolean>(false);
  const [aiScanProgress, setAiScanProgress] = useState<number>(0);
  const [scannedHazardsCount, setScannedHazardsCount] = useState<number>(0);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  // Audio synthesizer for sonar ping feedback
  const audioCtxRef = useRef<AudioContext | null>(null);
  const activeBeamHazardRef = useRef<SonarHazard | null>(null);

  const playSonarChime = useCallback((freq: number = 880) => {
    if (!soundEnabled) return;
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.5, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.22);
    } catch {
      // Audio context might be restricted before user gesture
    }
  }, [soundEnabled]);

  // Filter hazards by active tab
  const displayedHazards = useMemo(() => {
    return hazards.filter(h => {
      const mat = h.materialType || getMaterialType(h.category);
      if (activeMaterialTab === 'ALL') return true;
      return mat === activeMaterialTab;
    });
  }, [hazards, activeMaterialTab]);

  // Counts by material
  const materialCounts = useMemo(() => {
    const counts = { ALL: hazards.length, Iron: 0, Plastic: 0, Wet: 0, Anomaly: 0 };
    hazards.forEach(h => {
      const mat = h.materialType || getMaterialType(h.category);
      if (counts[mat] !== undefined) counts[mat]++;
      else counts.Anomaly++;
    });
    return counts;
  }, [hazards]);

  // Lookup currently selected hazard for locked inspection telemetry
  const selectedHazard = useMemo(() => {
    if (!selectedHazardId) return null;
    return hazards.find(h => h.id === selectedHazardId) || null;
  }, [hazards, selectedHazardId]);

  // Render procedure whenever dataset, filters, custom image or hazards change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Apply real-time acoustic filters: ColorMap, CLAHE contrast, Heave compensation, Speckle smoothing
    const applyAcousticProcessing = () => {
      try {
        const imgData = ctx.getImageData(0, 0, width, height);
        const data = imgData.data;
        const clahe = filterSettings.claheEnabled;
        const heave = filterSettings.heaveCompensation;
        const speckle = filterSettings.speckleFilter !== 'none';
        const colorMap = filterSettings.colorMap;

        for (let y = 0; y < height; y++) {
          const heaveWave = heave ? Math.sin(y * 0.08) * 3.0 : 0;

          for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;

            // Extract base acoustic backscatter intensity (luminance)
            let lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];

            // 1. Vehicle Heave motion compensation
            if (heave) {
              lum += heaveWave;
            }

            // 2. CLAHE Adaptive Contrast Equalization
            if (clahe) {
              const norm = Math.min(1, Math.max(0, lum / 255));
              // Dynamic contrast stretching to emphasize acoustic highlights and dark shadows
              lum = Math.pow(norm, 1.35) * 190 + (norm > 0.52 ? Math.pow(norm, 0.75) * 65 : 0);
            }

            // 3. Speckle Noise Reduction Filter
            if (speckle) {
              lum = lum * 0.95 + 4.0;
            }

            lum = Math.min(255, Math.max(0, lum));
            const norm = lum / 255;

            // 4. Acoustic Color Mapping
            if (colorMap === 'copper') {
              // Classic Amber / Bronze Sonar
              data[idx] = Math.min(255, Math.floor(lum * 1.32));
              data[idx + 1] = Math.floor(lum * 0.74);
              data[idx + 2] = Math.floor(lum * 0.16);
            } else if (colorMap === 'cyan') {
              // Digital High-Tech Cyan / Emerald SSS
              data[idx] = Math.floor(lum * 0.10);
              data[idx + 1] = Math.min(255, Math.floor(lum * 1.15));
              data[idx + 2] = Math.min(255, Math.floor(lum * 1.32));
            } else if (colorMap === 'magma') {
              // Thermal Magma / High-Contrast Heatmap
              data[idx] = Math.floor(Math.pow(norm, 0.65) * 255);
              data[idx + 1] = Math.floor(Math.pow(norm, 1.6) * 225);
              data[idx + 2] = Math.floor(Math.sin(norm * Math.PI) * 190);
            } else {
              // Grayscale (Monochrome Backscatter)
              data[idx] = Math.floor(lum);
              data[idx + 1] = Math.floor(lum);
              data[idx + 2] = Math.floor(lum);
            }
          }
        }

        ctx.putImageData(imgData, 0, 0);
      } catch (err) {
        console.warn('Acoustic pixel filter processing notice:', err);
      }
    };

    const renderOverlayOnCanvas = () => {
      // 1. Render Acoustic Segmentation Masks independently if enabled
      if (filterSettings.showSegmentationMasks) {
        displayedHazards.forEach(hazard => {
          const mat = hazard.materialType || getMaterialType(hazard.category);
          const style = getMaterialStyle(mat);

          const bx = (hazard.bbox.x / 100) * width;
          const by = (hazard.bbox.y / 100) * height;
          const bw = (hazard.bbox.width / 100) * width;
          const bh = (hazard.bbox.height / 100) * height;

          // Vivid semi-transparent material acoustic highlight mask
          const maskColor = mat === 'Iron' ? 'rgba(245, 158, 11, 0.35)' 
            : mat === 'Plastic' ? 'rgba(6, 182, 212, 0.35)' 
            : mat === 'Wet' ? 'rgba(16, 185, 129, 0.35)' 
            : 'rgba(168, 85, 247, 0.35)';
          
          ctx.fillStyle = maskColor;
          ctx.fillRect(bx, by, bw, bh);

          // Glowing dashed segmentation contour boundary
          ctx.save();
          ctx.setLineDash([4, 3]);
          ctx.strokeStyle = style.accentColor;
          ctx.lineWidth = 1.8;
          ctx.strokeRect(bx, by, bw, bh);
          ctx.restore();

          // Acoustic shadow mask region behind target
          const shadowLenPx = Math.max(14, bw * 0.85);
          const shadowX = (bx + bw / 2) < (width / 2) ? Math.max(0, bx - shadowLenPx) : (bx + bw);
          ctx.fillStyle = 'rgba(2, 6, 18, 0.55)';
          ctx.fillRect(shadowX, by, shadowLenPx, bh);
        });
      }

      // 2. Render Calibrated Bounding Boxes & Reticles independently if enabled
      if (filterSettings.showBoundingBoxes) {
        displayedHazards.forEach(hazard => {
          const mat = hazard.materialType || getMaterialType(hazard.category);
          const style = getMaterialStyle(mat);

          const bx = (hazard.bbox.x / 100) * width;
          const by = (hazard.bbox.y / 100) * height;
          const bw = (hazard.bbox.width / 100) * width;
          const bh = (hazard.bbox.height / 100) * height;

          // Bounding rect
          ctx.strokeStyle = style.accentColor;
          ctx.lineWidth = hazard.id === selectedHazardId ? 2.5 : 1.5;
          ctx.strokeRect(bx, by, bw, bh);

          // Corner reticle marks for high-precision targeting
          const rLen = Math.min(8, bw / 3, bh / 3);
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 2;
          // Top-left
          ctx.beginPath();
          ctx.moveTo(bx, by + rLen);
          ctx.lineTo(bx, by);
          ctx.lineTo(bx + rLen, by);
          ctx.stroke();
          // Top-right
          ctx.beginPath();
          ctx.moveTo(bx + bw - rLen, by);
          ctx.lineTo(bx + bw, by);
          ctx.lineTo(bx + bw, by + rLen);
          ctx.stroke();
          // Bottom-left
          ctx.beginPath();
          ctx.moveTo(bx, by + bh - rLen);
          ctx.lineTo(bx, by + bh);
          ctx.lineTo(bx + rLen, by + bh);
          ctx.stroke();
          // Bottom-right
          ctx.beginPath();
          ctx.moveTo(bx + bw - rLen, by + bh);
          ctx.lineTo(bx + bw, by + bh);
          ctx.lineTo(bx + bw, by + bh - rLen);
          ctx.stroke();

          // Material badge label banner above the box
          const labelText = `${style.icon} [${mat.toUpperCase()}] ${hazard.category} (${hazard.confidence}%)`;
          ctx.font = 'bold 9px monospace';
          const textWidth = ctx.measureText(labelText).width;
          
          ctx.fillStyle = '#060B14';
          ctx.fillRect(bx, Math.max(0, by - 14), textWidth + 8, 14);
          ctx.strokeStyle = style.accentColor;
          ctx.lineWidth = 1;
          ctx.strokeRect(bx, Math.max(0, by - 14), textWidth + 8, 14);

          ctx.fillStyle = style.accentColor;
          ctx.fillText(labelText, bx + 4, Math.max(10, by - 4));
        });
      }
    };

    if (customImageFile) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, width, height);
        applyAcousticProcessing();
        renderOverlayOnCanvas();
      };
      img.src = URL.createObjectURL(customImageFile);
    } else if (dataset.imageUrl && (dataset.imageUrl.startsWith('data:') || dataset.imageUrl.startsWith('http') || dataset.imageUrl.startsWith('/'))) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, width, height);
        applyAcousticProcessing();
        renderOverlayOnCanvas();
      };
      img.src = dataset.imageUrl;
    } else {
      // Convert hazard bounding box percentages to objects for procedural generator
      const objectsForCanvas = displayedHazards.map(h => ({
        xPct: h.bbox.x,
        yPct: h.bbox.y,
        wPct: h.bbox.width,
        hPct: h.bbox.height,
        type: h.category
      }));

      drawProceduralSonar(
        ctx,
        width,
        height,
        filterSettings.colorMap,
        dataset.speckleNoiseLevel,
        objectsForCanvas
      );
      applyAcousticProcessing();
      renderOverlayOnCanvas();
    }
  }, [
    dataset,
    filterSettings.colorMap,
    filterSettings.showBoundingBoxes,
    filterSettings.showSegmentationMasks,
    filterSettings.claheEnabled,
    filterSettings.heaveCompensation,
    filterSettings.speckleFilter,
    customImageFile,
    displayedHazards,
    selectedHazardId
  ]);

  // Real-time continuous acoustic sweep line animation
  useEffect(() => {
    if (!isRealtimeSweepActive || isAiScanRunning) return;

    let animId: number;
    let currentY = 0;

    const animateSweep = () => {
      currentY = (currentY + 0.35) % 100;
      setSweepProgressPct(currentY);

      // Check collision with any hazards
      const hit = displayedHazards.find(h => {
        const top = h.bbox.y;
        const bottom = h.bbox.y + h.bbox.height;
        return currentY >= top && currentY <= bottom;
      });

      if (hit) {
        if (!activeBeamHazardRef.current || activeBeamHazardRef.current.id !== hit.id) {
          playSonarChime(hit.severity === 'CRITICAL' ? 980 : 780);
        }
        activeBeamHazardRef.current = hit;
        setActiveBeamHazard(hit);
      } else {
        // Clear previous beam contact only when starting a brand new sweep cycle from the top
        if (currentY < 0.8 && activeBeamHazardRef.current) {
          activeBeamHazardRef.current = null;
          setActiveBeamHazard(null);
        }
      }

      animId = requestAnimationFrame(animateSweep);
    };

    animId = requestAnimationFrame(animateSweep);
    return () => cancelAnimationFrame(animId);
  }, [isRealtimeSweepActive, isAiScanRunning, displayedHazards, playSonarChime]);

  // Interactive "RUN AI SCAN" execution
  const handleTriggerAiScan = () => {
    if (isAiScanRunning) return;
    setIsAiScanRunning(true);
    setAiScanProgress(0);
    setScannedHazardsCount(0);
    playSonarChime(520);

    let progress = 0;
    const interval = setInterval(() => {
      progress += 2.5;
      setAiScanProgress(progress);

      // Calculate hazards uncovered so far
      const detectedSoFar = displayedHazards.filter(h => h.bbox.y <= progress);
      setScannedHazardsCount(detectedSoFar.length);

      // Ping sound on newly discovered hazards
      const hit = displayedHazards.find(h => Math.abs(h.bbox.y - progress) < 3);
      if (hit) {
        playSonarChime(1050);
        setActiveBeamHazard(hit);
      }

      if (progress >= 100) {
        clearInterval(interval);
        setTimeout(() => {
          setIsAiScanRunning(false);
          playSonarChime(1200);
        }, 500);
      }
    }, 45);
  };

  return (
    <div className={isFullscreen ? "fixed inset-0 z-50 bg-[#060B14] p-3 sm:p-4 flex flex-col gap-2.5 w-screen h-screen overflow-hidden" : "glass-panel rounded-xl p-4 relative flex flex-col gap-3 h-full border border-cyan-500/20 shadow-xl"}>
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping"></span>
            <h2 className="text-sm font-bold tracking-wide text-slate-200 uppercase font-mono flex items-center gap-1.5">
              <Scan className="w-4 h-4 text-cyan-400" />
              {isFullscreen ? 'Tactical Acoustic Console [FULL SCREEN]' : 'Side-Scan Acoustic Canvas'}
            </h2>
          </div>

          <div className="flex items-center gap-2 font-mono text-[11px] text-slate-400 bg-slate-900/90 px-2.5 py-1 rounded-md border border-slate-800">
            <span className="text-cyan-400 font-semibold">PORT [L]</span>
            <span className="text-slate-600">|</span>
            <span className="text-emerald-400 font-semibold">STARBOARD [R]</span>
            <span className="text-slate-600">|</span>
            <span>Freq: <strong className="text-slate-200">{dataset.metadata.pingFrequencyKhz} kHz</strong></span>
          </div>

          {/* Trigger AI Scan Button */}
          <button
            onClick={handleTriggerAiScan}
            disabled={isAiScanRunning}
            className="flex items-center gap-1.5 px-3 py-1 rounded-md font-mono text-[11px] font-bold transition-all border cursor-pointer bg-gradient-to-r from-cyan-500/20 to-emerald-500/20 hover:from-cyan-500/30 hover:to-emerald-500/30 border-cyan-500/50 text-cyan-200 shadow-[0_0_15px_rgba(0,229,255,0.2)] disabled:opacity-50"
            title="Perform automated acoustic sweep scan over the sonar image"
          >
            <Target className={`w-3.5 h-3.5 ${isAiScanRunning ? 'animate-spin text-emerald-400' : 'text-cyan-400'}`} />
            <span>{isAiScanRunning ? `SCANNING (${Math.round(aiScanProgress)}%)` : 'SCAN ANOMALIES'}</span>
          </button>

          {/* Real-time Sweep Toggle */}
          <button
            onClick={() => setIsRealtimeSweepActive(!isRealtimeSweepActive)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-mono text-[11px] font-semibold transition-all border cursor-pointer ${
              isRealtimeSweepActive
                ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                : 'bg-slate-900 border-slate-700 text-slate-400'
            }`}
          >
            <Radio className={`w-3.5 h-3.5 ${isRealtimeSweepActive ? 'text-emerald-400 animate-pulse' : 'text-slate-500'}`} />
            <span>{isRealtimeSweepActive ? 'LIVE SWEEP' : 'PAUSED'}</span>
          </button>

          {/* Audio Chime Toggle */}
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-1 text-slate-400 hover:text-cyan-300 transition-colors bg-slate-900 border border-slate-800 rounded cursor-pointer"
            title={soundEnabled ? 'Mute Sonar Audio Ping' : 'Enable Sonar Audio Ping'}
          >
            {soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-cyan-400" /> : <VolumeX className="w-3.5 h-3.5 text-slate-500" />}
          </button>

          {/* Fullscreen Tactical Filters Drawer Toggle */}
          {isFullscreen && (
            <button
              onClick={() => setIsTacticalFilterOpen(!isTacticalFilterOpen)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded font-mono text-[11px] font-bold border transition-all cursor-pointer ${
                isTacticalFilterOpen
                  ? 'bg-cyan-950 text-cyan-300 border-cyan-400 shadow-[0_0_10px_rgba(0,229,255,0.3)]'
                  : 'bg-slate-900 text-slate-400 border-slate-700 hover:text-slate-200'
              }`}
              title="Toggle Tactical Acoustic Filter Panel"
            >
              <Sliders className="w-3.5 h-3.5 text-cyan-400" />
              <span>{isTacticalFilterOpen ? 'HIDE FILTERS' : 'ALL FILTERS'}</span>
            </button>
          )}
        </div>

        {/* Right Section: Zoom Controls & Fullscreen Trigger */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5">
            <button 
              onClick={() => setZoomLevel(prev => Math.max(0.8, prev - 0.2))}
              className="p-1 text-slate-400 hover:text-cyan-300 transition-colors cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="px-2 text-xs font-mono text-cyan-400 font-semibold">
              {Math.round(zoomLevel * 100)}%
            </span>
            <button 
              onClick={() => setZoomLevel(prev => Math.min(2.5, prev + 0.2))}
              className="p-1 text-slate-400 hover:text-cyan-300 transition-colors cursor-pointer"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setZoomLevel(1)}
              className="p-1 text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
              title="Reset Zoom"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Fullscreen Mode Button */}
          <button
            onClick={toggleFullscreen}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md font-mono text-[11px] font-bold transition-all border cursor-pointer ${
              isFullscreen
                ? 'bg-red-950/80 border-red-500/60 text-red-200 hover:bg-red-900 shadow-[0_0_15px_rgba(239,68,68,0.3)]'
                : 'bg-cyan-950/80 border-cyan-400/60 text-cyan-300 hover:bg-cyan-900 shadow-[0_0_12px_rgba(0,229,255,0.25)]'
            }`}
            title={isFullscreen ? 'Exit Full Screen Tactical Mode (Esc)' : 'Open Acoustic Canvas in Full Screen Tactical Mode with Full Controls'}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5 text-red-400" /> : <Maximize2 className="w-3.5 h-3.5 text-cyan-400" />}
            <span>{isFullscreen ? 'EXIT FULLSCREEN' : 'FULL SCREEN'}</span>
          </button>
        </div>
      </div>

      {/* Material Quick-Filter Tabs & Colormap Bar */}
      <div className="flex items-center justify-between gap-2 px-1 flex-wrap shrink-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mr-1 flex items-center gap-1">
            <Layers className="w-3 h-3 text-cyan-400" />
            Material:
          </span>

          {/* ALL Tab */}
          <button
            onClick={() => setActiveMaterialTab('ALL')}
            className={`px-2.5 py-0.5 rounded text-[11px] font-mono font-bold transition-all cursor-pointer border ${
              activeMaterialTab === 'ALL'
                ? 'bg-cyan-500 text-slate-950 border-cyan-400 shadow-[0_0_10px_rgba(0,229,255,0.4)]'
                : 'bg-slate-900/80 text-slate-300 border-slate-800 hover:border-slate-700'
            }`}
          >
            ALL ({materialCounts.ALL})
          </button>

          {/* IRON Tab */}
          <button
            onClick={() => setActiveMaterialTab('Iron')}
            className={`px-2.5 py-0.5 rounded text-[11px] font-mono font-bold transition-all cursor-pointer border flex items-center gap-1 ${
              activeMaterialTab === 'Iron'
                ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.5)]'
                : 'bg-amber-950/40 text-amber-300 border-amber-500/30 hover:bg-amber-900/50'
            }`}
          >
            <span>🧲 IRON ({materialCounts.Iron})</span>
          </button>

          {/* PLASTIC Tab */}
          <button
            onClick={() => setActiveMaterialTab('Plastic')}
            className={`px-2.5 py-0.5 rounded text-[11px] font-mono font-bold transition-all cursor-pointer border flex items-center gap-1 ${
              activeMaterialTab === 'Plastic'
                ? 'bg-cyan-500 text-slate-950 border-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.5)]'
                : 'bg-cyan-950/40 text-cyan-300 border-cyan-500/30 hover:bg-cyan-900/50'
            }`}
          >
            <span>🧴 PLASTIC ({materialCounts.Plastic})</span>
          </button>

          {/* WET Tab */}
          <button
            onClick={() => setActiveMaterialTab('Wet')}
            className={`px-2.5 py-0.5 rounded text-[11px] font-mono font-bold transition-all cursor-pointer border flex items-center gap-1 ${
              activeMaterialTab === 'Wet'
                ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.5)]'
                : 'bg-emerald-950/40 text-emerald-300 border-emerald-500/30 hover:bg-emerald-900/50'
            }`}
          >
            <span>🕸️ NETS ({materialCounts.Wet})</span>
          </button>

          {/* ANOMALY Tab */}
          <button
            onClick={() => setActiveMaterialTab('Anomaly')}
            className={`px-2.5 py-0.5 rounded text-[11px] font-mono font-bold transition-all cursor-pointer border flex items-center gap-1 ${
              activeMaterialTab === 'Anomaly'
                ? 'bg-purple-500 text-slate-950 border-purple-400 shadow-[0_0_10px_rgba(168,85,247,0.5)]'
                : 'bg-purple-950/40 text-purple-300 border-purple-500/30 hover:bg-purple-900/50'
            }`}
          >
            <span>⚠️ ANOMALIES ({materialCounts.Anomaly})</span>
          </button>
        </div>

        {/* Colormap Quick Selector & Target Count */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center gap-1 bg-slate-900/90 px-2 py-0.5 rounded border border-slate-800">
            <Palette className="w-3 h-3 text-cyan-400 mr-0.5" />
            <span className="text-[10px] font-mono text-slate-400 mr-1">COLOR:</span>
            {(['copper', 'cyan', 'grayscale', 'magma'] as const).map(c => (
              <button
                key={c}
                onClick={() => updateFilter({ colorMap: c })}
                className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold transition-all cursor-pointer ${
                  filterSettings.colorMap === c
                    ? 'bg-cyan-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {c === 'grayscale' ? 'GRAY' : c.toUpperCase()}
              </button>
            ))}
          </div>

          <div className="text-[10px] font-mono text-slate-400">
            Showing: <strong className="text-cyan-300">{displayedHazards.length}</strong> of {hazards.length}
          </div>
        </div>
      </div>

      {/* Visualizer Body: Tactical Filter Sidebar (in Fullscreen) + Main Canvas */}
      <div className={`flex-1 flex gap-3 min-h-0 overflow-hidden relative ${isFullscreen ? 'h-full' : ''}`}>
        {/* Tactical Filter Sidebar (Available in Fullscreen Mode) */}
        {isFullscreen && isTacticalFilterOpen && (
          <aside className="w-80 shrink-0 bg-slate-950/95 border border-cyan-500/30 rounded-lg p-3.5 flex flex-col gap-3 overflow-y-auto max-h-full font-mono text-xs shadow-2xl z-30 animate-fadeIn">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-1.5 text-cyan-300 font-bold uppercase tracking-wider">
                <Filter className="w-3.5 h-3.5 text-cyan-400" />
                <span>Tactical Sonar Filters</span>
              </div>
              <button
                onClick={() => setIsTacticalFilterOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-900 transition-colors cursor-pointer"
                title="Collapse Filter Panel"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* 1. Acoustic Color Mapping */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5 uppercase">
                <Palette className="w-3 h-3 text-cyan-400" />
                Acoustic Colormap
              </label>
              <div className="grid grid-cols-4 gap-1">
                {[
                  { id: 'copper', label: 'Copper' },
                  { id: 'cyan', label: 'Cyan' },
                  { id: 'grayscale', label: 'Gray' },
                  { id: 'magma', label: 'Magma' }
                ].map(c => (
                  <button
                    key={c.id}
                    onClick={() => updateFilter({ colorMap: c.id as any })}
                    className={`py-1 px-1 rounded text-[10px] font-bold text-center transition-all cursor-pointer border ${
                      filterSettings.colorMap === c.id
                        ? 'bg-cyan-500 text-slate-950 border-cyan-400 shadow-[0_0_10px_rgba(0,229,255,0.4)]'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Speckle Noise Reduction Filter */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5 uppercase">
                <Sparkles className="w-3 h-3 text-emerald-400" />
                Speckle Noise Filter
              </label>
              <select
                value={filterSettings.speckleFilter}
                onChange={(e) => updateFilter({ speckleFilter: e.target.value as any })}
                className="bg-slate-900 text-slate-200 border border-slate-700 rounded px-2 py-1 text-xs cursor-pointer outline-none"
              >
                <option value="none">None (Raw Sonar)</option>
                <option value="lee">Lee Filter (Recommended)</option>
                <option value="frost">Frost Adaptive Filter</option>
                <option value="median">Median Speckle Reducer</option>
                <option value="anisotropic">Anisotropic Diffusion</option>
              </select>
            </div>

            {/* 3. Signal Equalization & Heave Compensation */}
            <div className="grid grid-cols-2 gap-2">
              <label className="flex items-center justify-between p-2 rounded bg-slate-900/80 border border-slate-800 cursor-pointer hover:border-cyan-500/30">
                <span className="text-[10px] text-slate-300">CLAHE Contrast</span>
                <input
                  type="checkbox"
                  checked={filterSettings.claheEnabled}
                  onChange={(e) => updateFilter({ claheEnabled: e.target.checked })}
                  className="w-3.5 h-3.5 accent-cyan-400 cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between p-2 rounded bg-slate-900/80 border border-slate-800 cursor-pointer hover:border-cyan-500/30">
                <span className="text-[10px] text-slate-300">Heave Compens.</span>
                <input
                  type="checkbox"
                  checked={filterSettings.heaveCompensation}
                  onChange={(e) => updateFilter({ heaveCompensation: e.target.checked })}
                  className="w-3.5 h-3.5 accent-cyan-400 cursor-pointer"
                />
              </label>
            </div>

            {/* 4. Acoustic Shadow Verification */}
            <label className="flex items-center justify-between p-2 rounded bg-slate-900/80 border border-slate-800 cursor-pointer hover:border-cyan-500/30">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
                <div>
                  <div className="text-[11px] font-bold text-slate-200">Shadow Verification</div>
                  <div className="text-[9px] text-slate-400">Trigonometric filter</div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={filterSettings.shadowVerification}
                onChange={(e) => updateFilter({ shadowVerification: e.target.checked })}
                className="w-3.5 h-3.5 accent-cyan-400 cursor-pointer"
              />
            </label>

            {/* 5. Min Confidence Cutoff Slider */}
            <div className="bg-slate-900/80 border border-slate-800 rounded p-2.5 flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
                  <Sliders className="w-3 h-3 text-cyan-400" />
                  Min Confidence:
                </label>
                <span className="text-[11px] font-bold text-cyan-400 bg-cyan-950 px-1.5 py-0.5 rounded border border-cyan-500/30">
                  {filterSettings.minConfidence}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="95"
                step="5"
                value={filterSettings.minConfidence}
                onChange={(e) => updateFilter({ minConfidence: parseInt(e.target.value) })}
                className="w-full h-1 bg-slate-800 rounded appearance-none cursor-pointer accent-cyan-400"
              />
            </div>

            {/* 6. Overlays */}
            <div className="grid grid-cols-2 gap-2">
              <label className="flex items-center gap-2 text-[11px] text-slate-300 cursor-pointer p-1.5 rounded bg-slate-900/60 border border-slate-800">
                <input
                  type="checkbox"
                  checked={filterSettings.showBoundingBoxes}
                  onChange={(e) => updateFilter({ showBoundingBoxes: e.target.checked })}
                  className="w-3.5 h-3.5 accent-cyan-400"
                />
                Bounding Boxes
              </label>

              <label className="flex items-center gap-2 text-[11px] text-slate-300 cursor-pointer p-1.5 rounded bg-slate-900/60 border border-slate-800">
                <input
                  type="checkbox"
                  checked={filterSettings.showSegmentationMasks}
                  onChange={(e) => updateFilter({ showSegmentationMasks: e.target.checked })}
                  className="w-3.5 h-3.5 accent-cyan-400"
                />
                Seg. Masks
              </label>
            </div>

            {/* 7. Hazard Class Multi-Select Filters */}
            <div className="flex flex-col gap-1 pt-1 border-t border-slate-800">
              <label className="text-[10px] font-bold text-slate-400 uppercase">
                Hazard Class Filter ({filterSettings.selectedCategories.length} active)
              </label>
              <div className="flex flex-wrap gap-1 max-h-40 overflow-y-auto">
                {CATEGORIES.map(cat => {
                  const isSelected = filterSettings.selectedCategories.includes(cat);
                  const mat = getMaterialType(cat);
                  const style = getMaterialStyle(mat);
                  return (
                    <button
                      key={cat}
                      onClick={() => toggleCategoryFilter(cat)}
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all cursor-pointer flex items-center gap-1 border ${
                        isSelected
                          ? `${style.badgeBg} font-bold shadow-sm`
                          : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-slate-200'
                      }`}
                    >
                      <span>{style.icon}</span>
                      {isSelected && <Check className="w-2.5 h-2.5" />}
                      <span>{cat}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>
        )}

        {/* Main Canvas Viewport with Scanline & Nadir Overlay */}
        <div 
          ref={containerRef}
          className={`relative overflow-hidden rounded-lg bg-black/95 border border-slate-800 scanline-effect flex-1 flex items-center justify-center ${isFullscreen ? 'h-full' : 'min-h-[440px]'}`}
        >
          <div 
            style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'center center' }}
            className={`relative transition-transform duration-150 ease-out flex items-center justify-center p-1 ${isFullscreen ? 'w-full h-full' : ''}`}
          >
            {/* Inner wrapper strictly matching canvas aspect ratio to guarantee 1:1 overlay alignment */}
            <div className={`relative inline-block overflow-hidden rounded shadow-2xl border border-slate-800 ${isFullscreen ? 'max-h-[calc(100vh-230px)]' : ''}`}>
              {/* Main Procedural/Uploaded Sonar Canvas */}
              <canvas
                ref={canvasRef}
                width={800}
                height={500}
                className={`w-full h-auto ${isFullscreen ? 'max-h-[calc(100vh-250px)]' : 'max-h-[500px]'} object-contain rounded cursor-crosshair block`}
              />

            {/* Central Nadir Gap Water Column Marker */}
            <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-[8%] border-x border-cyan-500/20 bg-cyan-950/20 pointer-events-none flex flex-col items-center justify-between py-2 z-10">
              <span className="text-[9px] font-mono text-cyan-400/80 bg-slate-950/90 px-1 py-0.5 rounded uppercase tracking-tighter">
                NADIR GAP
              </span>
              <div className="w-0.5 h-full bg-gradient-to-b from-transparent via-cyan-400/40 to-transparent"></div>
              <span className="text-[9px] font-mono text-cyan-400/80 bg-slate-950/90 px-1 py-0.5 rounded">
                ALT: {dataset.metadata.altitudeMeters}m
              </span>
            </div>

            {/* Real-time Continuous Acoustic Sweep Beam Line */}
            {isRealtimeSweepActive && !isAiScanRunning && (
              <div 
                style={{ top: `${sweepProgressPct}%` }}
                className="absolute left-0 right-0 pointer-events-none transition-none z-20"
              >
                <div className="h-6 -mt-6 w-full bg-gradient-to-t from-emerald-400/25 to-transparent" />
                <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_14px_#00ff9d]" />
              </div>
            )}

            {/* AI Scan Progress Active Beam */}
            {isAiScanRunning && (
              <div 
                style={{ top: `${aiScanProgress}%` }}
                className="absolute left-0 right-0 pointer-events-none transition-none z-30"
              >
                <div className="h-10 -mt-10 w-full bg-gradient-to-t from-cyan-400/35 to-transparent animate-pulse" />
                <div className="h-[3px] w-full bg-gradient-to-r from-cyan-300 via-emerald-300 to-cyan-300 shadow-[0_0_20px_#00e5ff]" />
                <div className="absolute right-2 -top-5 bg-cyan-950/95 border border-cyan-400 text-cyan-300 text-[9px] font-mono px-2 py-0.5 rounded shadow">
                  ACOUSTIC BEAM: {Math.round(aiScanProgress)}% ({scannedHazardsCount} DETECTED)
                </div>
              </div>
            )}

            {/* Scale Bars / Swath Range Indicators */}
            <div className="absolute top-2 left-3 font-mono text-[10px] text-cyan-400/90 bg-slate-950/85 px-2 py-0.5 rounded border border-cyan-500/30 z-10 pointer-events-none">
              PORT CHANNEL (0m ── {dataset.metadata.slantRangeMeters}m)
            </div>
            <div className="absolute top-2 right-3 font-mono text-[10px] text-emerald-400/90 bg-slate-950/85 px-2 py-0.5 rounded border border-emerald-500/30 z-10 pointer-events-none">
              STARBOARD CHANNEL (0m ── {dataset.metadata.slantRangeMeters}m)
            </div>

            {/* Interactive Bounding Box & Segmentation Overlays */}
            {displayedHazards.map((hazard) => {
              const isSelected = hazard.id === selectedHazardId;
              const isCurrentlyInBeam = activeBeamHazard?.id === hazard.id;
              const isHovered = hoveredHazard?.id === hazard.id;
              const mat = hazard.materialType || getMaterialType(hazard.category);
              const style = getMaterialStyle(mat);

              const showBox = filterSettings.showBoundingBoxes || isSelected || isHovered || isCurrentlyInBeam;

              const borderClass = isSelected 
                ? 'border-cyan-400 ring-2 ring-cyan-400 shadow-[0_0_20px_rgba(0,229,255,0.9)] bg-cyan-500/10' 
                : isCurrentlyInBeam
                ? 'border-emerald-300 ring-2 ring-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.9)] animate-pulse bg-emerald-500/10'
                : isHovered
                ? `${style.borderColor} ring-1 ring-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.6)]`
                : showBox
                ? style.borderColor
                : 'border-transparent hover:border-cyan-400/50';

              return (
                <div
                  key={hazard.id}
                  onClick={() => onSelectHazard(hazard)}
                  onMouseEnter={() => setHoveredHazard(hazard)}
                  onMouseLeave={() => setHoveredHazard(null)}
                  style={{
                    left: `${hazard.bbox.x}%`,
                    top: `${hazard.bbox.y}%`,
                    width: `${hazard.bbox.width}%`,
                    height: `${hazard.bbox.height}%`
                  }}
                  className={`absolute border-2 ${borderClass} cursor-pointer transition-all duration-150 group rounded-sm hover:scale-[1.03] z-20`}
                >
                  {/* Segmentation Mask Fill */}
                  {(filterSettings.showSegmentationMasks || isSelected) && (
                    <div className={`w-full h-full ${style.bg} backdrop-blur-[1px]`} />
                  )}

                  {/* Interactive Top Badge with Material Type */}
                  {showBox && (
                    <div className={`absolute -top-6 left-0 flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono whitespace-nowrap shadow-md z-30 border ${style.badgeBg}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${style.dotColor} ${isSelected ? 'animate-ping' : ''}`}></span>
                      <span className="font-bold">{style.icon} {hazard.category}</span>
                      <span className="font-bold opacity-90">{hazard.confidence}%</span>
                    </div>
                  )}

                  {/* Corner reticle marks */}
                  {showBox && (
                    <>
                      <span className="absolute -top-1 -left-1 w-2 h-2 border-t-2 border-l-2 border-white"></span>
                      <span className="absolute -top-1 -right-1 w-2 h-2 border-t-2 border-r-2 border-white"></span>
                      <span className="absolute -bottom-1 -left-1 w-2 h-2 border-b-2 border-l-2 border-white"></span>
                      <span className="absolute -bottom-1 -right-1 w-2 h-2 border-b-2 border-r-2 border-white"></span>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>

      {/* Acoustic Inspection & Contact Banner */}
      {selectedHazard ? (
        <div className="bg-cyan-950/90 border border-cyan-400/80 rounded-lg p-2.5 flex flex-wrap items-center justify-between gap-2.5 text-xs font-mono text-cyan-100 animate-fadeIn shadow-[0_0_20px_rgba(0,229,255,0.2)]">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <span className="px-2 py-0.5 rounded bg-cyan-900/90 border border-cyan-400 text-cyan-200 font-bold uppercase tracking-wider text-[10px] flex items-center gap-1 shrink-0">
              <Lock className="w-3 h-3 text-cyan-400" />
              LOCKED TARGET
            </span>
            <span className="text-white font-bold whitespace-nowrap">
              [{selectedHazard.materialType || getMaterialType(selectedHazard.category)}] {selectedHazard.category}
            </span>
            <span className="text-cyan-400 font-bold whitespace-nowrap">
              ({selectedHazard.confidence}%)
            </span>
            <span className="text-slate-600 hidden sm:inline">|</span>
            <span className="text-slate-300 text-[11px] whitespace-nowrap">
              Channel: <strong className="text-white">{selectedHazard.channel}</strong>
            </span>
            <span className="text-slate-600 hidden sm:inline">|</span>
            <span className="text-slate-400 text-[11px] whitespace-nowrap">
              GPS: <strong className="text-slate-200">{selectedHazard.latitude.toFixed(4)}°N, {selectedHazard.longitude.toFixed(4)}°E</strong>
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-900/90 border border-cyan-500/40 whitespace-nowrap text-xs">
              <span className="text-slate-400 text-[10px]">Shadow Height:</span>
              <strong className="text-cyan-300 font-bold">{selectedHazard.estimatedHeightM}m</strong>
            </div>

            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-900/90 border border-cyan-500/40 whitespace-nowrap text-xs">
              <span className="text-slate-400 text-[10px]">Dimensions:</span>
              <strong className="text-emerald-400 font-bold">{selectedHazard.estimatedLengthM}m × {selectedHazard.estimatedWidthM}m</strong>
            </div>

            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-900/90 border border-cyan-500/40 whitespace-nowrap text-xs">
              <span className="text-slate-400 text-[10px]">SNR:</span>
              <strong className="text-cyan-300 font-bold">{selectedHazard.snrDb} dB</strong>
            </div>

            <button
              onClick={() => onSelectHazard(selectedHazard)}
              className="p-1 rounded bg-cyan-900/60 hover:bg-cyan-800 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Unlock Target"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : activeBeamHazard ? (
        <div className="bg-emerald-950/85 border border-emerald-500/70 rounded-lg p-2.5 flex flex-wrap items-center justify-between gap-2.5 text-xs font-mono text-emerald-200 animate-fadeIn shadow-[0_0_20px_rgba(16,185,129,0.25)]">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping shrink-0"></span>
            <span className="text-emerald-300 font-bold uppercase tracking-wider flex items-center gap-1 shrink-0 text-xs">
              <Target className="w-3.5 h-3.5 text-emerald-400" />
              Beam Contact:
            </span>
            <span className="text-slate-100 font-bold whitespace-nowrap">
              [{activeBeamHazard.materialType?.toUpperCase() || 'ANOMALY'}] {activeBeamHazard.category}
            </span>
            <span className="text-emerald-400 font-bold whitespace-nowrap">
              ({activeBeamHazard.confidence}%)
            </span>
            <span className="text-slate-500 hidden sm:inline">|</span>
            <span className="text-slate-300 text-[11px] whitespace-nowrap">
              Channel: <strong className="text-white">{activeBeamHazard.channel}</strong>
            </span>
            <span className="text-slate-500 hidden sm:inline">|</span>
            <span className="text-slate-400 text-[11px] whitespace-nowrap">
              GPS: <strong className="text-slate-200">{activeBeamHazard.latitude.toFixed(4)}°N, {activeBeamHazard.longitude.toFixed(4)}°E</strong>
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-900/90 border border-emerald-500/40 whitespace-nowrap text-xs">
              <span className="text-slate-400 text-[10px]">Shadow Height:</span>
              <strong className="text-cyan-300 font-bold">{activeBeamHazard.estimatedHeightM}m</strong>
            </div>

            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-900/90 border border-emerald-500/40 whitespace-nowrap text-xs">
              <span className="text-slate-400 text-[10px]">SNR:</span>
              <strong className="text-emerald-300 font-bold">{activeBeamHazard.snrDb} dB</strong>
            </div>

            <span className="px-2.5 py-1 rounded bg-emerald-900/90 border border-emerald-500/60 text-emerald-200 text-[10px] font-bold tracking-wider whitespace-nowrap shadow-[0_0_10px_rgba(16,185,129,0.3)]">
              VERIFIED TARGET
            </span>
          </div>
        </div>
      ) : hoveredHazard ? (
        <div className="bg-slate-900/95 border border-cyan-500/50 rounded-lg p-2.5 flex flex-wrap items-center justify-between gap-2.5 text-xs font-mono text-slate-200 animate-fadeIn shadow-lg">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <span className="text-cyan-400 font-bold shrink-0">{hoveredHazard.id}</span>
            <span className="text-slate-400 whitespace-nowrap">
              Class: <strong className="text-slate-100">[{hoveredHazard.materialType || getMaterialType(hoveredHazard.category)}] {hoveredHazard.category}</strong>
            </span>
            <span className="text-slate-600 hidden sm:inline">|</span>
            <span className="text-slate-400 whitespace-nowrap">Channel: <strong className="text-slate-100">{hoveredHazard.channel}</strong></span>
            <span className="text-slate-600 hidden sm:inline">|</span>
            <span className="text-slate-400 whitespace-nowrap">GPS: <strong className="text-slate-100">{hoveredHazard.latitude.toFixed(4)}°N, {hoveredHazard.longitude.toFixed(4)}°E</strong></span>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-950 border border-slate-700 whitespace-nowrap text-xs">
              <span className="text-slate-400 text-[10px]">Dimensions:</span>
              <strong className="text-emerald-400 font-bold">{hoveredHazard.estimatedLengthM}m × {hoveredHazard.estimatedWidthM}m</strong>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-950 border border-slate-700 whitespace-nowrap text-xs">
              <span className="text-slate-400 text-[10px]">Shadow Height:</span>
              <strong className="text-cyan-300 font-bold">{hoveredHazard.estimatedHeightM}m</strong>
            </div>
            <span className="px-2 py-1 rounded bg-cyan-950 text-cyan-300 font-bold border border-cyan-500/40 text-[10px] whitespace-nowrap">
              {hoveredHazard.confidence}% CONF.
            </span>
          </div>
        </div>
      ) : (
        <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-400">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
            <span>Acoustic Sweep Rate: <strong className="text-slate-200">24 Hz</strong></span>
            <span className="text-slate-600">|</span>
            <span>Beam Swath: <strong className="text-slate-200">{dataset.metadata.slantRangeMeters * 2}m</strong></span>
            <span className="text-slate-600">|</span>
            <span>Catalogued: <strong className="text-cyan-300">{hazards.length} anomalies</strong></span>
          </div>
          <div className="flex items-center gap-2 text-slate-400 text-[11px] whitespace-nowrap">
            <span className="text-cyan-400 font-bold">💡 Tip:</span> Click any anomaly to lock telemetry inspection.
          </div>
        </div>
      )}

      {/* Acoustic Material Classification Legend */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-slate-800/80 text-[11px] font-mono">
        <div className="flex items-center gap-2 p-1.5 rounded bg-amber-950/30 border border-amber-500/20">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-[0_0_8px_#f59e0b]"></span>
          <div>
            <div className="text-amber-300 font-bold">🧲 Iron / Metal</div>
            <div className="text-[9px] text-slate-400">Pipes, scrap, cylinders, hull</div>
          </div>
        </div>

        <div className="flex items-center gap-2 p-1.5 rounded bg-cyan-950/30 border border-cyan-500/20">
          <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_8px_#06b6d4]"></span>
          <div>
            <div className="text-cyan-300 font-bold">🧴 Plastic Debris</div>
            <div className="text-[9px] text-slate-400">Poly clusters, tarps, containers</div>
          </div>
        </div>

        <div className="flex items-center gap-2 p-1.5 rounded bg-emerald-950/30 border border-emerald-500/20">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#10b981]"></span>
          <div>
            <div className="text-emerald-300 font-bold">🕸️ Wet / Ghost Net</div>
            <div className="text-[9px] text-slate-400">Monofilament net, wet ropes</div>
          </div>
        </div>

        <div className="flex items-center gap-2 p-1.5 rounded bg-purple-950/30 border border-purple-500/20">
          <span className="w-2.5 h-2.5 rounded-full bg-purple-400 shadow-[0_0_8px_#a855f7]"></span>
          <div>
            <div className="text-purple-300 font-bold">⚠️ Seafloor Anomaly</div>
            <div className="text-[9px] text-slate-400">UXO, structural anomalies</div>
          </div>
        </div>
      </div>
    </div>
  );
};
