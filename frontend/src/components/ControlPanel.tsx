import React from 'react';
import { 
  Cpu, 
  Filter, 
  Sliders, 
  ShieldCheck, 
  Sparkles, 
  Palette, 
  Check
} from 'lucide-react';
import { FilterSettings, HazardCategory, getMaterialType, getMaterialStyle } from '../types';

interface ControlPanelProps {
  settings: FilterSettings;
  onChangeSettings: (newSettings: FilterSettings) => void;
  selectedModel: string;
  onSelectModel: (model: string) => void;
  processingTimeMs: number;
  snrAverage: number;
  filteredCount: number;
}

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

export const ControlPanel: React.FC<ControlPanelProps> = ({
  settings,
  onChangeSettings,
  selectedModel,
  onSelectModel,
  processingTimeMs,
  snrAverage,
  filteredCount
}) => {
  const toggleCategory = (cat: HazardCategory) => {
    const exists = settings.selectedCategories.includes(cat);
    const updated = exists 
      ? settings.selectedCategories.filter(c => c !== cat)
      : [...settings.selectedCategories, cat];
    onChangeSettings({ ...settings, selectedCategories: updated });
  };

  return (
    <aside className="glass-panel rounded-xl p-4 flex flex-col gap-4 border border-cyan-500/20 shadow-xl overflow-y-auto max-h-[85vh]">
      {/* AI Model Selection */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider font-mono text-slate-200">
              Acoustic CV Architecture
            </h3>
          </div>
          <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/30 font-semibold flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            Acoustic CV Active ({processingTimeMs}ms)
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {[
            { id: 'aquora-acoustic-cv', name: 'Acoustic-CV', desc: 'Real-time Backscatter' },
            { id: 'shadow-trig', name: 'Shadow-Trig', desc: 'Height & Depth Math' },
            { id: 'material-spectral', name: 'Material-Physics', desc: 'Reflectance ID' }
          ].map(model => (
            <button
              key={model.id}
              onClick={() => onSelectModel(model.id)}
              className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                selectedModel === model.id
                  ? 'bg-cyan-950/80 border-cyan-400 text-cyan-300 shadow-[0_0_12px_rgba(0,229,255,0.25)]'
                  : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              <div className="text-xs font-bold font-mono">{model.name}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">{model.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Confidence Threshold Slider */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-3">
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-mono font-bold text-slate-300 flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-cyan-400" />
            Min Confidence Cutoff:
          </label>
          <span className="text-xs font-mono font-bold text-cyan-400 bg-cyan-950 px-2 py-0.5 rounded border border-cyan-500/30">
            {settings.minConfidence}%
          </span>
        </div>
        <input 
          type="range"
          min="0"
          max="95"
          step="5"
          value={settings.minConfidence}
          onChange={(e) => onChangeSettings({ ...settings, minConfidence: parseInt(e.target.value) })}
          className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
        />
        <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1">
          <span>0% (All anomalies)</span>
          <span>50%</span>
          <span>95% (High Precision)</span>
        </div>
      </div>

      {/* Noise Filtering & Pre-processing Controls */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-3 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <h4 className="text-xs font-bold font-mono uppercase text-slate-200">
              Noise Filtering & Verification
            </h4>
          </div>
          <span className="text-[10px] font-mono text-slate-400">
            Avg SNR: <strong className="text-emerald-400">{snrAverage} dB</strong>
          </span>
        </div>

        {/* Speckle Noise Filter dropdown */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-300 font-mono">Speckle Noise Filter:</span>
          <select
            value={settings.speckleFilter}
            onChange={(e) => onChangeSettings({ ...settings, speckleFilter: e.target.value as any })}
            className="bg-slate-950 text-slate-200 border border-slate-700 rounded px-2 py-1 font-mono text-xs cursor-pointer outline-none"
          >
            <option value="none">None (Raw Sonar)</option>
            <option value="lee">Lee Filter (Recommended)</option>
            <option value="frost">Frost Adaptive Filter</option>
            <option value="median">Median Speckle Reducer</option>
            <option value="anisotropic">Anisotropic Diffusion</option>
          </select>
        </div>

        {/* Shadow Verification Toggle */}
        <label className="flex items-center justify-between p-2 rounded bg-slate-950/70 border border-slate-800 cursor-pointer hover:border-cyan-500/30 transition-all">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-cyan-400" />
            <div>
              <div className="text-xs font-mono font-bold text-slate-200">Acoustic Shadow Verification</div>
              <div className="text-[10px] text-slate-400">Filters natural rock false positives</div>
            </div>
          </div>
          <input 
            type="checkbox"
            checked={settings.shadowVerification}
            onChange={(e) => onChangeSettings({ ...settings, shadowVerification: e.target.checked })}
            className="w-4 h-4 accent-cyan-400 cursor-pointer"
          />
        </label>

        {/* CLAHE Contrast Enhancement & Heave */}
        <div className="grid grid-cols-2 gap-2">
          <label className="flex items-center justify-between p-2 rounded bg-slate-950/70 border border-slate-800 cursor-pointer">
            <span className="text-[11px] font-mono text-slate-300">CLAHE Contrast</span>
            <input 
              type="checkbox"
              checked={settings.claheEnabled}
              onChange={(e) => onChangeSettings({ ...settings, claheEnabled: e.target.checked })}
              className="w-3.5 h-3.5 accent-cyan-400 cursor-pointer"
            />
          </label>

          <label className="flex items-center justify-between p-2 rounded bg-slate-950/70 border border-slate-800 cursor-pointer">
            <span className="text-[11px] font-mono text-slate-300">Heave Compens.</span>
            <input 
              type="checkbox"
              checked={settings.heaveCompensation}
              onChange={(e) => onChangeSettings({ ...settings, heaveCompensation: e.target.checked })}
              className="w-3.5 h-3.5 accent-cyan-400 cursor-pointer"
            />
          </label>
        </div>
      </div>

      {/* Color Maps & Overlays */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-3 flex flex-col gap-2.5">
        <div className="flex items-center gap-1.5">
          <Palette className="w-4 h-4 text-cyan-400" />
          <h4 className="text-xs font-bold font-mono uppercase text-slate-200">
            Acoustic Color Mapping
          </h4>
        </div>

        <div className="grid grid-cols-4 gap-1.5">
          {[
            { id: 'copper', label: 'Copper' },
            { id: 'cyan', label: 'Cyan' },
            { id: 'grayscale', label: 'Gray' },
            { id: 'magma', label: 'Magma' }
          ].map(c => (
            <button
              key={c.id}
              onClick={() => onChangeSettings({ ...settings, colorMap: c.id as any })}
              className={`px-2 py-1.5 rounded text-xs font-mono text-center font-bold transition-all cursor-pointer ${
                settings.colorMap === c.id 
                  ? 'bg-cyan-500 text-slate-950 shadow-[0_0_10px_rgba(0,229,255,0.4)]'
                  : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Overlay Switches */}
        <div className="grid grid-cols-2 gap-2 mt-1">
          <label className="flex items-center gap-2 text-xs font-mono text-slate-300 cursor-pointer">
            <input 
              type="checkbox"
              checked={settings.showBoundingBoxes}
              onChange={(e) => onChangeSettings({ ...settings, showBoundingBoxes: e.target.checked })}
              className="w-3.5 h-3.5 accent-cyan-400"
            />
            Bounding Boxes
          </label>

          <label className="flex items-center gap-2 text-xs font-mono text-slate-300 cursor-pointer">
            <input 
              type="checkbox"
              checked={settings.showSegmentationMasks}
              onChange={(e) => onChangeSettings({ ...settings, showSegmentationMasks: e.target.checked })}
              className="w-3.5 h-3.5 accent-cyan-400"
            />
            Segmentation Mask
          </label>
        </div>
      </div>

      {/* Category Multi-select Filter */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Filter className="w-4 h-4 text-cyan-400" />
            <h4 className="text-xs font-bold font-mono uppercase text-slate-200">
              Hazard Class Filter
            </h4>
          </div>
          {filteredCount > 0 && (
            <span className="text-[10px] font-mono text-amber-400 bg-amber-950/80 px-2 py-0.5 rounded border border-amber-500/30">
              {filteredCount} filtered
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map(cat => {
            const isSelected = settings.selectedCategories.includes(cat);
            const mat = getMaterialType(cat);
            const style = getMaterialStyle(mat);
            return (
              <button
                key={cat}
                onClick={() => toggleCategory(cat)}
                className={`px-2 py-1 rounded-md text-[11px] font-mono font-semibold transition-all cursor-pointer flex items-center gap-1.5 border ${
                  isSelected
                    ? `${style.badgeBg} shadow-sm font-bold`
                    : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-slate-200'
                }`}
              >
                <span>{style.icon}</span>
                {isSelected && <Check className="w-3 h-3" />}
                <span>{cat}</span>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
};
