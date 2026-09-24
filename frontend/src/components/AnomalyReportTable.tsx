import React, { useState } from 'react';
import { 
  FileText, 
  Search, 
  FileSpreadsheet, 
  Map, 
  FileJson, 
  ArrowUpDown,
  ExternalLink
} from 'lucide-react';
import { SonarHazard, PresetDataset, getMaterialType, getMaterialStyle } from '../types';
import { exportToJSON, exportToCSV, exportToGeoJSON, exportToPDF } from '../utils/reportGenerator';

interface AnomalyReportTableProps {
  dataset: PresetDataset;
  hazards: SonarHazard[];
  onSelectHazard: (hazard: SonarHazard) => void;
  selectedHazardId: string | null;
}

export const AnomalyReportTable: React.FC<AnomalyReportTableProps> = ({
  dataset,
  hazards,
  onSelectHazard,
  selectedHazardId
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<'confidence' | 'severity' | 'id'>('confidence');

  const filteredHazards = hazards
    .filter(h => 
      h.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      h.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      h.description.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      if (sortField === 'confidence') return b.confidence - a.confidence;
      if (sortField === 'id') return a.id.localeCompare(b.id);
      return 0;
    });

  return (
    <div className="glass-panel rounded-xl p-4 flex flex-col gap-3 border border-cyan-500/20 shadow-xl">
      {/* Header & Export Actions Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-cyan-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider font-mono text-slate-200">
            Anomalous Reporting & Geotagging Output
          </h3>
          <span className="text-[11px] font-mono text-cyan-400 bg-cyan-950 px-2 py-0.5 rounded border border-cyan-500/30">
            {hazards.length} Detections Logged
          </span>
        </div>

        {/* Export Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => exportToPDF(dataset, hazards)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-300 bg-red-950/80 hover:bg-red-900 border border-red-500/40 rounded-lg transition-all cursor-pointer shadow-sm"
          >
            <FileText className="w-3.5 h-3.5" />
            PDF Report
          </button>

          <button
            onClick={() => exportToCSV(dataset, hazards)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-300 bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-500/40 rounded-lg transition-all cursor-pointer shadow-sm"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            CSV Data
          </button>

          <button
            onClick={() => exportToGeoJSON(dataset, hazards)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-cyan-300 bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-500/40 rounded-lg transition-all cursor-pointer shadow-sm"
          >
            <Map className="w-3.5 h-3.5" />
            GeoJSON
          </button>

          <button
            onClick={() => exportToJSON(dataset, hazards)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-200 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-lg transition-all cursor-pointer shadow-sm"
          >
            <FileJson className="w-3.5 h-3.5" />
            JSON
          </button>
        </div>
      </div>

      {/* Filter / Search Row */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search hazard ID, class, or description..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950 text-slate-200 text-xs font-mono pl-9 pr-3 py-1.5 rounded-lg border border-slate-800 focus:border-cyan-500 outline-none"
          />
        </div>

        <div className="flex items-center gap-2 font-mono text-xs text-slate-400">
          <span>Sort by:</span>
          <button
            onClick={() => setSortField(sortField === 'confidence' ? 'id' : 'confidence')}
            className="px-2 py-1 bg-slate-900 border border-slate-800 rounded text-slate-200 flex items-center gap-1 cursor-pointer hover:border-cyan-500/40"
          >
            <ArrowUpDown className="w-3 h-3 text-cyan-400" />
            {sortField === 'confidence' ? 'Confidence' : 'ID'}
          </button>
        </div>
      </div>

      {/* Structured Results Table */}
      <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-950/80 max-h-[300px]">
        <table className="w-full text-left border-collapse font-mono text-xs">
          <thead>
            <tr className="bg-slate-900/90 text-slate-400 border-b border-slate-800 text-[11px] uppercase tracking-wider">
              <th className="py-2.5 px-3">Hazard ID</th>
              <th className="py-2.5 px-3">Classification</th>
              <th className="py-2.5 px-3">Severity</th>
              <th className="py-2.5 px-3">Confidence</th>
              <th className="py-2.5 px-3">Channel</th>
              <th className="py-2.5 px-3">Coordinates (Lat / Long)</th>
              <th className="py-2.5 px-3">Depth</th>
              <th className="py-2.5 px-3">Est. L × W × Shadow Height</th>
              <th className="py-2.5 px-3 text-right">Inspect</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-slate-300">
            {filteredHazards.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center py-8 text-slate-500 font-mono">
                  No hazards matched current filter settings.
                </td>
              </tr>
            ) : (
              filteredHazards.map((hazard) => {
                const isSelected = hazard.id === selectedHazardId;
                const isCritical = hazard.severity === 'CRITICAL';
                const isHigh = hazard.severity === 'HIGH';
                const mat = hazard.materialType || getMaterialType(hazard.category);
                const style = getMaterialStyle(mat);

                return (
                  <tr
                    key={hazard.id}
                    onClick={() => onSelectHazard(hazard)}
                    className={`transition-colors cursor-pointer hover:bg-cyan-950/40 ${
                      isSelected ? 'bg-cyan-950/70 text-slate-100 font-semibold' : ''
                    }`}
                  >
                    <td className="py-2.5 px-3 font-bold text-cyan-400 flex items-center gap-1.5">
                      <span>{hazard.id}</span>
                      {hazard.id.includes('YOLO') && (
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-400/40">
                          YOLOv8
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${style.badgeBg}`}>
                          {style.icon} {mat.toUpperCase()}
                        </span>
                        <span className="font-semibold text-slate-200">{hazard.category}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        isCritical 
                          ? 'bg-red-950 text-red-300 border border-red-500/40' 
                          : isHigh 
                          ? 'bg-amber-950 text-amber-300 border border-amber-500/40'
                          : 'bg-emerald-950 text-emerald-300 border border-emerald-500/40'
                      }`}>
                        {hazard.severity}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-bold text-cyan-300">
                      {hazard.confidence}%
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-slate-400">{hazard.channel}</td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-300">
                      {hazard.latitude.toFixed(5)}N, {hazard.longitude.toFixed(5)}E
                    </td>
                    <td className="py-2.5 px-3 text-cyan-300">{hazard.depthMeters}m</td>
                    <td className="py-2.5 px-3 text-emerald-400 font-semibold">
                      {hazard.estimatedLengthM}m × {hazard.estimatedWidthM}m ({hazard.estimatedHeightM}m h)
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectHazard(hazard);
                        }}
                        className="p-1 text-slate-400 hover:text-cyan-300 transition-colors"
                        title="View details"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
