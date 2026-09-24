import React from 'react';
import { X, ShieldCheck, Waves, Cpu, MapPin, FileCheck } from 'lucide-react';

interface MoESInfoModalProps {
  onClose: () => void;
}

export const MoESInfoModal: React.FC<MoESInfoModalProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fadeIn">
      <div className="glass-panel rounded-2xl border border-cyan-500/30 w-full max-w-3xl p-6 flex flex-col gap-4 shadow-2xl relative max-h-[90vh] overflow-y-auto">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-950 border border-cyan-500/40 flex items-center justify-center text-cyan-300">
              <Waves className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold font-mono text-slate-100">
                  SIH 2026 Problem Statement Details
                </h2>
                <span className="px-2 py-0.5 text-xs font-mono font-bold bg-cyan-500 text-slate-950 rounded-full">
                  ID: 26057
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium">
                Ministry of Earth Sciences (MoES) | National Institute of Ocean Technology (NIOT)
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="space-y-4 text-xs font-mono text-slate-300 leading-relaxed">
          {/* Executive Overview */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
            <div className="text-cyan-400 font-bold text-sm uppercase">Background & Challenges</div>
            <p className="text-slate-300">
              The accumulation of man-made debris (ghost nets, abandoned fishing gear, pipes, cylinders, shipwrecks) in marine ecosystems poses a critical threat to global biodiversity and commercial navigation. Side Scan Sonar (SSS) mounted on Autonomous Underwater Vehicles (AUVs) produces detailed acoustic maps, but manual log inspection across thousands of kilometers is slow and error-prone.
            </p>
          </div>

          {/* Core Objectives Delivered by AQUORA */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1.5">
              <div className="flex items-center gap-2 text-cyan-300 font-bold text-xs">
                <Cpu className="w-4 h-4 text-cyan-400" />
                1. Acoustic CV Detection & Segmentation
              </div>
              <p className="text-slate-400 text-[11px]">
                High-precision acoustic computer vision, multi-threshold backscatter analysis, and shadow trigonometry to detect and draw pixel-level masks around ghost nets, subsea pipes, cylinders, and shipwrecks.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1.5">
              <div className="flex items-center gap-2 text-emerald-300 font-bold text-xs">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                2. Confidence & Noise Filtering
              </div>
              <p className="text-slate-400 text-[11px]">
                Speckle noise reduction (Lee Filter / Frost Filter) + Dual Acoustic Shadow verification to minimize false positives caused by natural rock clusters.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1.5">
              <div className="flex items-center gap-2 text-amber-300 font-bold text-xs">
                <MapPin className="w-4 h-4 text-amber-400" />
                3. Geotagging & Reporting Engine
              </div>
              <p className="text-slate-400 text-[11px]">
                Parses AUV telemetry headers to output precise Latitude/Longitude, water depth, and estimated target dimensions (length, width, height from shadow math).
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1.5">
              <div className="flex items-center gap-2 text-red-300 font-bold text-xs">
                <FileCheck className="w-4 h-4 text-red-400" />
                4. Interactive UI & Multi-format Export
              </div>
              <p className="text-slate-400 text-[11px]">
                Real-time dashboard visualizer with GIS spatial mapping, live stream mode, and export in JSON, CSV, GeoJSON, and PDF formats.
              </p>
            </div>
          </div>

          {/* Mathematical Acoustic Formula Box */}
          <div className="p-3.5 rounded-xl bg-cyan-950/40 border border-cyan-500/30 font-mono text-[11px] text-cyan-200">
            <span className="font-bold text-cyan-400 block mb-1">Acoustic Shadow Height Estimation Math:</span>
            <div className="bg-slate-950 p-2.5 rounded border border-slate-800 text-center font-bold text-slate-100 text-xs">
              Target Height (h) = [ Altitude (H_a) × Shadow Length (L_s) ] / Slant Range (R_s)
            </div>
            <span className="text-[10px] text-slate-400 mt-1 block">
              Directly implemented in AQUORA to automatically infer physical object dimensions from sonar shadows!
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
