import { 
  Waves, 
  HelpCircle, 
  Radio, 
  Upload, 
  ShieldAlert,
  Database,
  History,
  Server
} from 'lucide-react';
import { PresetDataset } from '../types';
import { PRESET_DATASETS } from '../data/presetDatasets';
import { MongoDbStatus } from '../utils/backendApi';

interface HeaderProps {
  activeDataset: PresetDataset;
  onSelectDataset: (dataset: PresetDataset) => void;
  onOpenUploadModal: () => void;
  onOpenHistory: () => void;
  historyCount: number;
  onOpenStream: () => void;
  onOpenInfo: () => void;
  totalHazards: number;
  criticalHazards: number;
  dbStatus?: MongoDbStatus | null;
}

export const Header: React.FC<HeaderProps> = ({
  activeDataset,
  onSelectDataset,
  onOpenUploadModal,
  onOpenHistory,
  historyCount,
  onOpenStream,
  onOpenInfo,
  totalHazards,
  criticalHazards,
  dbStatus
}) => {

  return (
    <header className="glass-panel border-b border-cyan-500/20 px-6 py-3.5 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-50">
      {/* Brand & Logo */}
      <div className="flex items-center gap-3">
        <div className="relative flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br from-cyan-500/20 to-emerald-500/20 border border-cyan-400/40 text-cyan-400 shadow-[0_0_15px_rgba(0,229,255,0.25)]">
          <Waves className="w-6 h-6 animate-pulse text-cyan-300" />
          <span className="absolute -top-1 -right-1 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
          </span>
        </div>

        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-wider bg-gradient-to-r from-cyan-300 via-teal-200 to-emerald-400 bg-clip-text text-transparent">
              AQUORA
            </h1>
            <span className="px-2 py-0.5 text-[10px] font-mono font-semibold tracking-wider uppercase bg-cyan-950/80 text-cyan-300 border border-cyan-500/40 rounded-full">
              SIH 2026 #26057
            </span>
          </div>
          <p className="text-xs text-slate-400 font-medium">
            AI Automated Underwater Marine Debris & Side-Scan Sonar Anomaly System
          </p>
        </div>
      </div>

      {/* Dataset Selector Dropdown, Custom Upload & Status */}
      <div className="flex items-center gap-3">
        {/* MongoDB Database Live Status Badge */}
        {dbStatus && (
          <div 
            onClick={onOpenHistory}
            title={
              dbStatus.connected 
                ? `MongoDB ONLINE (db: ${dbStatus.database})\nPort: ${dbStatus.port || 27017} | Surveys: ${dbStatus.counts?.surveys ?? 0} | Anomalies: ${dbStatus.counts?.anomalies ?? 0} | Latency: ${dbStatus.latency_ms ?? 0}ms\nClick to inspect in Survey History`
                : `MongoDB OFFLINE\nError: ${dbStatus.error || 'Server not reachable'}`
            }
            className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-all ${
              dbStatus.connected 
                ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/50 shadow-[0_0_12px_rgba(16,185,129,0.15)]' 
                : 'bg-rose-950/40 border-rose-500/40 text-rose-300 hover:bg-rose-900/50'
            }`}
          >
            <div className="relative flex h-2 w-2">
              {dbStatus.connected && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              )}
              <span className={`relative inline-flex rounded-full h-2 w-2 ${dbStatus.connected ? 'bg-emerald-400' : 'bg-rose-500'}`}></span>
            </div>
            <Server className="w-3.5 h-3.5 text-emerald-400" />
            <span className="font-mono text-[11px] font-semibold tracking-wide">
              {dbStatus.connected ? 'MongoDB: Connected' : 'MongoDB: Offline'}
            </span>
            {dbStatus.connected && (
              <span className="text-[10px] font-mono px-1.5 py-0.2 bg-emerald-900/60 border border-emerald-500/30 rounded text-emerald-200">
                {dbStatus.database || 'AQUORA_Project'}
              </span>
            )}
          </div>
        )}

        {/* Dataset selector */}
        <div className="flex items-center gap-2 bg-slate-900/90 border border-cyan-500/30 rounded-lg px-3 py-1.5">
          <Database className="w-4 h-4 text-cyan-400" />
          <select 
            value={activeDataset.id}
            onChange={(e) => {
              const selected = PRESET_DATASETS.find(d => d.id === e.target.value);
              if (selected) onSelectDataset(selected);
            }}
            className="bg-transparent text-xs text-slate-200 font-medium outline-none cursor-pointer pr-2"
          >
            {PRESET_DATASETS.map(d => (
              <option key={d.id} value={d.id} className="bg-slate-900 text-slate-200">
                {d.name} ({d.metadata.pingFrequencyKhz}kHz)
              </option>
            ))}
          </select>
        </div>

        {/* Upload Raw Sonar Log */}
        <button
          onClick={onOpenUploadModal}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-cyan-300 bg-cyan-950/60 hover:bg-cyan-900/80 border border-cyan-500/40 rounded-lg transition-all shadow-sm cursor-pointer"
        >
          <Upload className="w-3.5 h-3.5 text-cyan-400" />
          Upload Sonar Log
        </button>

        {/* Survey History Button */}
        <button
          onClick={onOpenHistory}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-200 bg-slate-900/90 hover:bg-slate-800 border border-slate-700 hover:border-cyan-500/40 rounded-lg transition-all shadow-sm cursor-pointer"
        >
          <History className="w-3.5 h-3.5 text-cyan-400" />
          <span>Survey History</span>
          {historyCount > 0 && (
            <span className="ml-0.5 px-1.5 py-0.2 text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 rounded-full">
              {historyCount}
            </span>
          )}
        </button>

        {/* Live AUV Scan Simulator Button */}
        <button
          onClick={onOpenStream}
          className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-emerald-950 bg-gradient-to-r from-emerald-400 to-cyan-400 hover:from-emerald-300 hover:to-cyan-300 rounded-lg shadow-[0_0_15px_rgba(0,255,157,0.3)] transition-all cursor-pointer"
        >
          <Radio className="w-3.5 h-3.5 animate-pulse" />
          Live AUV Sweep Mode
        </button>

        {/* Status Metrics */}
        <div className="hidden lg:flex items-center gap-2 pl-2 border-l border-slate-800">
          <div className="flex items-center gap-1.5 bg-slate-900/80 px-2.5 py-1 rounded-md border border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Targets:</span>
            <span className="text-xs font-mono font-bold text-cyan-300">{totalHazards}</span>
          </div>

          {criticalHazards > 0 && (
            <div className="flex items-center gap-1.5 bg-red-950/60 px-2.5 py-1 rounded-md border border-red-500/40 text-red-400 animate-pulse">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span className="text-[10px] uppercase font-semibold">Critical:</span>
              <span className="text-xs font-mono font-bold">{criticalHazards}</span>
            </div>
          )}
        </div>

        {/* Problem Info Modal Button */}
        <button
          onClick={onOpenInfo}
          title="Problem Statement Details"
          className="p-2 text-slate-400 hover:text-cyan-300 hover:bg-slate-800/80 rounded-lg transition-colors cursor-pointer"
        >
          <HelpCircle className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
