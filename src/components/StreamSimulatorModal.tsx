import React, { useEffect, useRef, useState, useCallback } from 'react';
import { 
  X, 
  Radio, 
  Pause, 
  Play, 
  ShieldAlert, 
  Compass, 
  Sparkles, 
  Database, 
  Volume2, 
  VolumeX 
} from 'lucide-react';
import { PresetDataset, SonarHazard, getMaterialType, getMaterialStyle } from '../types';
import { ingestTelemetryToDb, saveAnomalyToDb } from '../utils/backendApi';

interface StreamSimulatorModalProps {
  dataset: PresetDataset;
  onClose: () => void;
  onAddAnomaly?: (anomaly: SonarHazard) => void;
}

interface StreamTarget {
  id: string;
  category: any;
  channel: 'Port' | 'Starboard';
  x: number; // 0 to 100%
  y: number; // 0 to 100% (progress along waterfall)
  width: number;
  height: number;
  confidence: number;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  description: string;
  estimatedLengthM: number;
  estimatedWidthM: number;
  estimatedHeightM: number;
  shadowLengthM: number;
  snrDb: number;
  detected: boolean;
  dbSaved: boolean;
}

const SEED_TARGET_TEMPLATES: Omit<StreamTarget, 'id' | 'y' | 'detected' | 'dbSaved'>[] = [
  {
    category: 'Wet Debris (Ghost Net)',
    channel: 'Port',
    x: 20,
    width: 14,
    height: 12,
    confidence: 96.4,
    severity: 'CRITICAL',
    description: '[WET WASTE] Suspended nylon monofilament gill net entangled on bottom outcrop.',
    estimatedLengthM: 16.4,
    estimatedWidthM: 7.8,
    estimatedHeightM: 2.3,
    shadowLengthM: 5.6,
    snrDb: 19.8
  },
  {
    category: 'Shipwreck (Iron Hull)',
    channel: 'Starboard',
    x: 72,
    width: 16,
    height: 14,
    confidence: 97.2,
    severity: 'HIGH',
    description: '[IRON / METALLIC] Submerged steel vessel keel frame and iron anchor chain.',
    estimatedLengthM: 24.0,
    estimatedWidthM: 9.5,
    estimatedHeightM: 3.4,
    shadowLengthM: 8.9,
    snrDb: 22.4
  },
  {
    category: 'Subsea Pipe (Iron/Steel)',
    channel: 'Port',
    x: 26,
    width: 18,
    height: 8,
    confidence: 93.8,
    severity: 'HIGH',
    description: '[IRON / METALLIC] Subsea high-pressure steel hydrocarbon pipeline with free-span scour.',
    estimatedLengthM: 32.0,
    estimatedWidthM: 1.4,
    estimatedHeightM: 0.8,
    shadowLengthM: 2.1,
    snrDb: 18.2
  },
  {
    category: 'Metallic Cylinder',
    channel: 'Starboard',
    x: 64,
    width: 9,
    height: 7,
    confidence: 92.5,
    severity: 'CRITICAL',
    description: '[IRON / METALLIC] Cylindrical steel naval pressure canister embedded in sand.',
    estimatedLengthM: 1.8,
    estimatedWidthM: 0.6,
    estimatedHeightM: 0.5,
    shadowLengthM: 1.4,
    snrDb: 17.5
  },
  {
    category: 'Plastic Marine Debris',
    channel: 'Port',
    x: 32,
    width: 11,
    height: 9,
    confidence: 91.0,
    severity: 'MEDIUM',
    description: '[PLASTIC DEBRIS] Dense bundle of woven poly-tarp and marine synthetic debris.',
    estimatedLengthM: 4.5,
    estimatedWidthM: 3.2,
    estimatedHeightM: 1.1,
    shadowLengthM: 2.8,
    snrDb: 14.6
  },
  {
    category: 'Seafloor Anomaly',
    channel: 'Starboard',
    x: 78,
    width: 15,
    height: 10,
    confidence: 95.7,
    severity: 'HIGH',
    description: '[SEAFLOOR ANOMALY] Heavy anomalous structure half-buried in seabed sediment.',
    estimatedLengthM: 6.1,
    estimatedWidthM: 2.4,
    estimatedHeightM: 2.6,
    shadowLengthM: 6.5,
    snrDb: 21.0
  }
];

export const StreamSimulatorModal: React.FC<StreamSimulatorModalProps> = ({
  dataset,
  onClose,
  onAddAnomaly
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const [isScanning, setIsScanning] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [pingCount, setPingCount] = useState(1480);
  const [distanceM, setDistanceM] = useState(512.4);
  const [alerts, setAlerts] = useState<string[]>([]);
  const [detectedCount, setDetectedCount] = useState<number>(0);
  const [mongoSavedCount, setMongoSavedCount] = useState<number>(0);
  const [lastDetectedTarget, setLastDetectedTarget] = useState<StreamTarget | null>(null);

  // Active moving targets in the waterfall stream
  const targetsRef = useRef<StreamTarget[]>([
    {
      ...SEED_TARGET_TEMPLATES[0],
      id: 'HAZ-LIVE-001',
      y: 18,
      detected: false,
      dbSaved: false
    },
    {
      ...SEED_TARGET_TEMPLATES[1],
      id: 'HAZ-LIVE-002',
      y: 55,
      detected: false,
      dbSaved: false
    },
    {
      ...SEED_TARGET_TEMPLATES[2],
      id: 'HAZ-LIVE-003',
      y: 88,
      detected: false,
      dbSaved: false
    }
  ]);

  // Play subtle synthetic sonar ping chirp
  const playSonarPing = useCallback((freq: number = 880) => {
    if (!audioEnabled) return;
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
      osc.frequency.exponentialRampToValueAtTime(freq / 2, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.13);
    } catch {
      // Audio context might be restricted before user interaction
    }
  }, [audioEnabled]);

  // Periodic Telemetry Streaming into MongoDB every 4 seconds
  useEffect(() => {
    if (!isScanning) return;
    const interval = setInterval(() => {
      const liveLat = dataset.metadata.startLat + ((pingCount % 1000) * 0.00002);
      const liveLng = dataset.metadata.startLng + ((pingCount % 1000) * 0.00003);

      ingestTelemetryToDb({
        auvId: dataset.metadata.auvId,
        vessel: dataset.metadata.vesselName,
        heading: dataset.metadata.headingDeg,
        speedKnots: dataset.metadata.speedKnots,
        altitudeM: dataset.metadata.altitudeMeters,
        slantRangeM: dataset.metadata.slantRangeMeters,
        latitude: parseFloat(liveLat.toFixed(6)),
        longitude: parseFloat(liveLng.toFixed(6)),
        pingFrequencyKhz: dataset.metadata.pingFrequencyKhz,
        timestamp: new Date().toISOString()
      });
    }, 4000);
    return () => clearInterval(interval);
  }, [isScanning, dataset, pingCount]);

  // Real-time canvas waterfall animation + dynamic anomaly detection
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let yOffset = 0;
    let lastAnomalyCheck = 0;

    const width = canvas.width;
    const height = canvas.height;

    const renderStream = (timestamp: number) => {
      if (!isScanning) return;

      yOffset = (yOffset + 1.2) % height;

      // Draw background ocean floor acoustic pings
      ctx.fillStyle = '#173876ff';
      ctx.fillRect(0, 0, width, height);

      // Render waterfall scan lines
      const imgData = ctx.createImageData(width, height);
      const data = imgData.data;

      for (let y = 0; y < height; y++) {
        const lineY = (y + yOffset) % height;
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          const distFromCenter = Math.abs(x - width / 2);

          let val = 0;
          if (distFromCenter < 24) {
            // Nadir water gap
            val = Math.random() * 12;
          } else {
            const ripple = Math.sin((x + lineY) * 0.04) * 18;
            const noise = (Math.random() - 0.5) * 26;
            val = Math.min(255, Math.max(8, 95 + ripple + noise));
          }

          // Sonar Copper Color Mapping
          data[idx] = Math.min(255, Math.floor(val * 1.22));
          data[idx + 1] = Math.floor(val * 0.72);
          data[idx + 2] = Math.floor(val * 0.16);
          data[idx + 3] = 255;
        }
      }

      ctx.putImageData(imgData, 0, 0);

      // Draw Active Scanline Sweep (Green phosphor acoustic beam)
      const sweepY = yOffset;
      const grad = ctx.createLinearGradient(0, sweepY - 15, 0, sweepY);
      grad.addColorStop(0, 'rgba(0, 255, 157, 0)');
      grad.addColorStop(1, 'rgba(0, 255, 157, 0.25)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, Math.max(0, sweepY - 15), width, 15);

      ctx.strokeStyle = '#00FF9D';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, sweepY);
      ctx.lineTo(width, sweepY);
      ctx.stroke();

      // Render Active Streaming Targets & Check Beam Intersections
      const currentTargets = targetsRef.current;
      currentTargets.forEach((target) => {
        const targetPxX = (target.x / 100) * width;
        const targetPxY = ((target.y / 100) * height + yOffset) % height;
        const targetPxW = (target.width / 100) * width;
        const targetPxH = (target.height / 100) * height;

        // Draw acoustic shadow
        const shadowOffset = target.channel === 'Port' ? -18 : 18;
        ctx.fillStyle = 'rgba(2, 4, 8, 0.85)';
        ctx.fillRect(targetPxX + shadowOffset, targetPxY + 2, targetPxW, targetPxH);

        const mat = getMaterialType(target.category);
        const style = getMaterialStyle(mat);

        // Draw anomaly acoustic highlight
        ctx.fillStyle = mat === 'Iron' ? 'rgba(245, 158, 11, 0.35)'
          : mat === 'Plastic' ? 'rgba(6, 182, 212, 0.35)'
            : mat === 'Wet' ? 'rgba(16, 185, 129, 0.35)'
              : 'rgba(168, 85, 247, 0.35)';
        ctx.fillRect(targetPxX, targetPxY, targetPxW, targetPxH);

        ctx.strokeStyle = style.accentColor;
        ctx.lineWidth = 2;
        ctx.strokeRect(targetPxX, targetPxY, targetPxW, targetPxH);

        // Corner reticles
        const rLen = 5;
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.5;
        // Top-left
        ctx.beginPath();
        ctx.moveTo(targetPxX, targetPxY + rLen);
        ctx.lineTo(targetPxX, targetPxY);
        ctx.lineTo(targetPxX + rLen, targetPxY);
        ctx.stroke();
        // Top-right
        ctx.beginPath();
        ctx.moveTo(targetPxX + targetPxW - rLen, targetPxY);
        ctx.lineTo(targetPxX + targetPxW, targetPxY);
        ctx.lineTo(targetPxX + targetPxW, targetPxY + rLen);
        ctx.stroke();

        // Label banner with material tag
        ctx.fillStyle = '#060B14';
        ctx.fillRect(targetPxX, targetPxY - 14, Math.max(140, targetPxW), 14);
        ctx.strokeStyle = style.accentColor;
        ctx.lineWidth = 1;
        ctx.strokeRect(targetPxX, targetPxY - 14, Math.max(140, targetPxW), 14);
        ctx.fillStyle = style.accentColor;
        ctx.font = 'bold 9px monospace';
        ctx.fillText(`${style.icon} [${mat.toUpperCase()}] ${target.confidence}%`, targetPxX + 3, targetPxY - 3);

        // Real-time Detection Collision Check: sweep line intersects target
        const isHit = Math.abs(sweepY - targetPxY) < 4;
        if (isHit && !target.detected) {
          target.detected = true;
          setLastDetectedTarget(target);
          setDetectedCount(prev => prev + 1);
          playSonarPing(target.severity === 'CRITICAL' ? 1100 : 880);

          // Convert to full SonarHazard schema
          const hazardLat = parseFloat((dataset.metadata.startLat + (target.y * 0.0001)).toFixed(5));
          const hazardLng = parseFloat((dataset.metadata.startLng + (target.x * 0.0001)).toFixed(5));

          const fullHazard: SonarHazard = {
            id: target.id,
            category: target.category,
            materialType: mat,
            confidence: target.confidence,
            bbox: {
              x: target.x,
              y: target.y,
              width: target.width,
              height: target.height
            },
            channel: target.channel,
            latitude: hazardLat,
            longitude: hazardLng,
            depthMeters: dataset.metadata.altitudeMeters + 35.5,
            estimatedLengthM: target.estimatedLengthM,
            estimatedWidthM: target.estimatedWidthM,
            estimatedHeightM: target.estimatedHeightM,
            shadowLengthM: target.shadowLengthM,
            snrDb: target.snrDb,
            severity: target.severity,
            description: target.description,
            acousticHighlightScore: 0.94,
            shadowMatchScore: 0.91
          };

          // Save directly to MongoDB anomalies collection
          saveAnomalyToDb({
            ...fullHazard,
            auvId: dataset.metadata.auvId,
            vesselName: dataset.metadata.vesselName,
            surveyId: dataset.id,
            source: 'Real-time AUV Stream',
            detectedAt: new Date().toISOString()
          }).then(() => {
            target.dbSaved = true;
            setMongoSavedCount(prev => prev + 1);
          }).catch(err => {
            console.warn('Real-time anomaly auto-save warning:', err);
          });

          // Propagate to main dashboard if callback supplied
          if (onAddAnomaly) {
            onAddAnomaly(fullHazard);
          }

          // Add real-time alert to UI terminal
          const timeStr = new Date().toLocaleTimeString();
          setAlerts(prev => [
            `[${timeStr}] 🎯 REAL-TIME DETECTION: ${target.category} (${target.confidence}%) | Channel: ${target.channel} | Lat ${hazardLat}°N | MongoDB Saved`,
            ...prev.slice(0, 15)
          ]);
        }
      });

      // Spawn next incoming target periodically
      if (timestamp - lastAnomalyCheck > 8000) {
        lastAnomalyCheck = timestamp;
        if (currentTargets.length < 5) {
          const tmpl = SEED_TARGET_TEMPLATES[Math.floor(Math.random() * SEED_TARGET_TEMPLATES.length)];
          const newTarget: StreamTarget = {
            ...tmpl,
            id: `HAZ-REALTIME-${Date.now().toString().slice(-6)}`,
            y: (Math.random() * 80 + 10),
            confidence: parseFloat((90.0 + Math.random() * 8.5).toFixed(1)),
            detected: false,
            dbSaved: false
          };
          targetsRef.current = [...currentTargets.slice(-3), newTarget];
        }
      }

      setPingCount(prev => prev + 1);
      setDistanceM(prev => parseFloat((prev + 0.08).toFixed(1)));

      animId = requestAnimationFrame(renderStream);
    };

    animId = requestAnimationFrame(renderStream);
    return () => cancelAnimationFrame(animId);
  }, [isScanning, dataset, audioEnabled, onAddAnomaly, playSonarPing]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fadeIn">
      <div className="glass-panel rounded-2xl border border-cyan-500/30 w-full max-w-5xl p-5 flex flex-col gap-4 shadow-2xl relative">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-950 border border-emerald-500/40 text-emerald-400">
              <Radio className="w-5 h-5 animate-pulse text-emerald-300" />
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold font-mono text-slate-100 uppercase tracking-wide">
                  Real-time AUV Side-Scan Sonar Stream & Anomaly Detector
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-emerald-500 text-slate-950 rounded-full animate-pulse">
                  LIVE STREAM ACTIVE
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono font-semibold bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 rounded-full">
                  <Database className="w-3 h-3 text-emerald-400" />
                  MongoDB: AQUORA_Project ({mongoSavedCount} Anomalies Synced)
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                {dataset.metadata.auvId} | Frequency: {dataset.metadata.pingFrequencyKhz} kHz | Swath: {dataset.metadata.slantRangeMeters * 2}m | Vessel: {dataset.metadata.vesselName}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Audio Ping Mute/Unmute */}
            <button
              onClick={() => setAudioEnabled(!audioEnabled)}
              title={audioEnabled ? 'Mute Sonar Audio Pings' : 'Enable Sonar Audio Pings'}
              className={`p-2 rounded-lg border text-xs font-mono font-semibold flex items-center gap-1 cursor-pointer transition-all ${audioEnabled
                  ? 'bg-cyan-950 border-cyan-500/40 text-cyan-300'
                  : 'bg-slate-900 border-slate-700 text-slate-400'
                }`}
            >
              {audioEnabled ? <Volume2 className="w-4 h-4 text-cyan-400" /> : <VolumeX className="w-4 h-4" />}
            </button>

            {/* Pause/Resume Scan */}
            <button
              onClick={() => setIsScanning(!isScanning)}
              className="px-3 py-1.5 rounded-lg border border-cyan-500/40 bg-cyan-950 text-cyan-300 font-mono text-xs font-bold flex items-center gap-1.5 hover:bg-cyan-900 cursor-pointer"
            >
              {isScanning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              {isScanning ? 'PAUSE SCAN' : 'RESUME SCAN'}
            </button>

            {/* Close */}
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Live Sonar Waterfall Display & Telemetry Sidebar */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          {/* Main Waterfall Canvas (7 cols) */}
          <div className="md:col-span-7 relative overflow-hidden rounded-xl border border-slate-800 bg-black scanline-effect min-h-[410px] flex items-center justify-center shadow-inner">
            <canvas
              ref={canvasRef}
              width={600}
              height={410}
              className="w-full h-full object-cover block"
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

            {/* Overlay Compass Reticle & Channel Markers */}
            <div className="absolute top-3 left-3 bg-slate-950/85 border border-cyan-500/30 px-2.5 py-1 rounded-lg text-xs font-mono text-cyan-300 flex items-center gap-2 z-20">
              <Compass className="w-3.5 h-3.5 text-cyan-400 animate-spin" style={{ animationDuration: '12s' }} />
              <span>HEADING: {dataset.metadata.headingDeg}°</span>
            </div>

            <div className="absolute top-3 right-3 bg-slate-950/85 border border-emerald-500/30 px-2.5 py-1 rounded-lg text-xs font-mono text-emerald-400 font-bold z-20">
              SPEED: {dataset.metadata.speedKnots} KTS
            </div>

            <div className="absolute bottom-2 left-3 font-mono text-[10px] text-cyan-400/90 bg-slate-950/80 px-2 py-0.5 rounded border border-cyan-500/30 z-20">
              PORT CHANNEL (0-{dataset.metadata.slantRangeMeters}m)
            </div>
            <div className="absolute bottom-2 right-3 font-mono text-[10px] text-emerald-400/90 bg-slate-950/80 px-2 py-0.5 rounded border border-emerald-500/30 z-20">
              STARBOARD (0-{dataset.metadata.slantRangeMeters}m)
            </div>
          </div>

          {/* Real-time Telemetry & Live Hazard Alerts Sidebar (5 cols) */}
          <div className="md:col-span-5 flex flex-col gap-3">
            {/* Live Metrics Box */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 font-mono text-xs flex flex-col gap-2">
              <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  AUV Acoustic Telemetry
                </span>
                <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                  STREAMING
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="flex flex-col bg-slate-950/50 p-1.5 rounded border border-slate-800">
                  <span className="text-slate-400 text-[10px]">Acoustic Pings</span>
                  <span className="text-cyan-300 font-bold text-sm">{pingCount}</span>
                </div>
                <div className="flex flex-col bg-slate-950/50 p-1.5 rounded border border-slate-800">
                  <span className="text-slate-400 text-[10px]">Swath Track</span>
                  <span className="text-emerald-400 font-bold text-sm">{distanceM} m</span>
                </div>
                <div className="flex flex-col bg-slate-950/50 p-1.5 rounded border border-slate-800">
                  <span className="text-slate-400 text-[10px]">Real-time Detections</span>
                  <span className="text-amber-300 font-bold text-sm">{detectedCount} Targets</span>
                </div>
                <div className="flex flex-col bg-slate-950/50 p-1.5 rounded border border-slate-800">
                  <span className="text-slate-400 text-[10px]">MongoDB Saved</span>
                  <span className="text-emerald-300 font-bold text-sm">{mongoSavedCount} Ingested</span>
                </div>
              </div>
            </div>

            {/* Last Target Acquisition Card */}
            {lastDetectedTarget && (
              <div className="bg-slate-900/90 border border-cyan-500/40 rounded-xl p-3 font-mono text-xs flex flex-col gap-1.5 animate-fadeIn">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold text-cyan-400 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-cyan-300" />
                    Latest Beam Contact
                  </span>
                  <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${lastDetectedTarget.severity === 'CRITICAL'
                      ? 'bg-red-950 text-red-300 border border-red-500/40'
                      : 'bg-cyan-950 text-cyan-300 border border-cyan-500/40'
                    }`}>
                    {lastDetectedTarget.severity}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-100 text-sm">{lastDetectedTarget.category}</span>
                  <span className="text-emerald-400 font-bold">{lastDetectedTarget.confidence}% Conf.</span>
                </div>

                <div className="text-[10px] text-slate-400 flex items-center justify-between pt-1 border-t border-slate-800">
                  <span>Channel: <strong className="text-slate-200">{lastDetectedTarget.channel}</strong></span>
                  <span>Est. Height: <strong className="text-cyan-300">{lastDetectedTarget.estimatedHeightM}m</strong></span>
                  <span>SNR: <strong className="text-emerald-300">{lastDetectedTarget.snrDb} dB</strong></span>
                </div>
              </div>
            )}

            {/* Live Detection Stream Alert Terminal */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex-1 flex flex-col gap-2 overflow-hidden min-h-[170px]">
              <div className="flex items-center justify-between text-xs font-mono font-bold text-red-400 border-b border-slate-800 pb-1.5">
                <div className="flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 animate-bounce text-red-500" />
                  <span>LIVE HAZARD STREAM</span>
                </div>
                <span className="text-[10px] text-slate-500">REAL-TIME INGESTION</span>
              </div>

              <div className="flex-1 overflow-y-auto space-y-1.5 font-mono text-[10.5px]">
                {alerts.length === 0 ? (
                  <div className="text-slate-500 italic text-center py-6">
                    Awaiting acoustic targets in beam...
                  </div>
                ) : (
                  alerts.map((alert, idx) => (
                    <div
                      key={idx}
                      className="p-2 rounded bg-slate-900/90 border border-slate-800 text-slate-200 flex items-start gap-1.5 animate-fadeIn"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 shrink-0"></span>
                      <span className="leading-tight">{alert}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
