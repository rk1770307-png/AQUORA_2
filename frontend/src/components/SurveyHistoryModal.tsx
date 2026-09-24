import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  X, 
  Search, 
  Calendar, 
  MapPin, 
  ShieldAlert, 
  ChevronRight, 
  ArrowLeft, 
  Trash2, 
  ExternalLink, 
  Layers, 
  Waves, 
  Clock, 
  Sparkles, 
  Database, 
  RefreshCw 
} from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { SurveyRecord, HazardCategory } from '../types';
import { getHazardPriority, deleteSurvey, clearAllSurveys, filterSurveys } from '../utils/surveyStorage';
import { MongoDbStatus, deleteSurveyFromDb, clearAllSurveysFromDb, resetDatabase } from '../utils/backendApi';

interface SurveyHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  surveys: SurveyRecord[];
  onRefreshSurveys: () => void;
  onLoadSurveyToDashboard: (survey: SurveyRecord) => void;
  onOpenUploadModal: () => void;
  dbStatus?: MongoDbStatus | null;
}

const HAZARD_CATEGORIES: HazardCategory[] = [
  'Ghost Net',
  'Subsea Pipe',
  'Cylinder',
  'Shipwreck',
  'Aircraft Debris',
  'Natural Rock Cluster',
  'Unknown Anomaly'
];

export const SurveyHistoryModal: React.FC<SurveyHistoryModalProps> = ({
  isOpen,
  onClose,
  surveys,
  onRefreshSurveys,
  onLoadSurveyToDashboard,
  onOpenUploadModal,
  dbStatus
}) => {
  // Navigation: null = list view, SurveyRecord = detailed inspection view
  const [selectedSurvey, setSelectedSurvey] = useState<SurveyRecord | null>(null);

  // Master Filter States
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterDate, setFilterDate] = useState<string>('');
  const [priorityFilter, setPriorityFilter] = useState<string>('All');
  const [objectTypeFilter, setObjectTypeFilter] = useState<string>('All');

  // Detail View In-Table Filter States
  const [detailTypeFilter, setDetailTypeFilter] = useState<string>('All');
  const [detailPriorityFilter, setDetailPriorityFilter] = useState<string>('All');
  const [selectedHazardId, setSelectedHazardId] = useState<string | null>(null);

  // Leaflet Map Refs for Detail View
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersGroupRef = useRef<L.LayerGroup | null>(null);



  // Filtered surveys list
  const filteredSurveys = useMemo(() => {
    return filterSurveys(surveys, {
      searchQuery,
      date: filterDate,
      priority: priorityFilter,
      objectType: objectTypeFilter
    });
  }, [surveys, searchQuery, filterDate, priorityFilter, objectTypeFilter]);

  // Leaflet Map lifecycle for selected survey
  useEffect(() => {
    if (!selectedSurvey || !mapContainerRef.current) return;

    // Cleanup previous map instance if any
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const mapCenter: [number, number] = [
      (selectedSurvey.startLat + selectedSurvey.endLat) / 2,
      (selectedSurvey.startLng + selectedSurvey.endLng) / 2
    ];

    const map = L.map(mapContainerRef.current, {
      center: mapCenter,
      zoom: 13,
      zoomControl: true
    });

    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: '&copy; Esri, Earthstar &amp; NIOT Survey',
      maxZoom: 18
    }).addTo(map);

    const markersGroup = L.layerGroup().addTo(map);
    markersGroupRef.current = markersGroup;
    mapInstanceRef.current = map;

    // Draw AUV trackline
    L.polyline([
      [selectedSurvey.startLat, selectedSurvey.startLng],
      [selectedSurvey.endLat, selectedSurvey.endLng]
    ], {
      color: '#00E5FF',
      weight: 3,
      dashArray: '6, 6',
      opacity: 0.85
    }).addTo(markersGroup);

    // Start / End Markers
    L.circleMarker([selectedSurvey.startLat, selectedSurvey.startLng], {
      radius: 6,
      color: '#00FF9D',
      fillColor: '#00FF9D',
      fillOpacity: 1
    }).bindPopup('<b>AUV Survey Start Point</b>').addTo(markersGroup);

    L.circleMarker([selectedSurvey.endLat, selectedSurvey.endLng], {
      radius: 6,
      color: '#FFB300',
      fillColor: '#FFB300',
      fillOpacity: 1
    }).bindPopup('<b>AUV Survey End Point</b>').addTo(markersGroup);

    // Plot Priority-Coded Hazard Markers
    selectedSurvey.hazards.forEach((hazard) => {
      const priority = getHazardPriority(hazard.severity);
      let pinColor = '#00FF9D'; // Low
      if (priority === 'Critical') pinColor = '#FF4757';
      else if (priority === 'High') pinColor = '#FFB300';
      else if (priority === 'Medium') pinColor = '#00E5FF';

      const isFocused = hazard.id === selectedHazardId;

      const markerHtml = `
        <div style="
          width: ${isFocused ? '24px' : '18px'};
          height: ${isFocused ? '24px' : '18px'};
          background-color: ${pinColor};
          border: 2px solid #060B14;
          border-radius: 50%;
          box-shadow: 0 0 ${isFocused ? '12px' : '6px'} ${pinColor};
          transition: all 0.2s ease;
        "></div>
      `;

      const customIcon = L.divIcon({
        className: 'custom-sonar-pin',
        html: markerHtml,
        iconSize: [isFocused ? 24 : 18, isFocused ? 24 : 18],
        iconAnchor: [isFocused ? 12 : 9, isFocused ? 12 : 9]
      });

      const popupContent = `
        <div style="font-family: sans-serif; min-width: 170px; color: #0f172a;">
          <div style="font-weight: bold; color: ${pinColor}; font-size: 12px; margin-bottom: 3px;">
            [${priority.toUpperCase()}] ${hazard.category}
          </div>
          <div style="font-size: 11px; color: #475569;">
            <b>ID:</b> ${hazard.id}<br/>
            <b>Conf:</b> ${hazard.confidence}%<br/>
            <b>Coords:</b> ${hazard.latitude.toFixed(5)}°, ${hazard.longitude.toFixed(5)}°<br/>
            <b>Est Height:</b> ${hazard.estimatedHeightM}m (Shadow: ${hazard.shadowLengthM}m)
          </div>
        </div>
      `;

      const marker = L.marker([hazard.latitude, hazard.longitude], { icon: customIcon })
        .bindPopup(popupContent)
        .addTo(markersGroup);

      marker.on('click', () => {
        setSelectedHazardId(hazard.id);
      });
    });

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      markersGroupRef.current = null;
    };
  }, [selectedSurvey, selectedHazardId]);

  if (!isOpen) return null;

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (window.confirm(`Delete survey ${id} from MongoDB database?`)) {
      deleteSurvey(id);
      await deleteSurveyFromDb(id).catch(err => console.warn('MongoDB delete warning:', err));
      onRefreshSurveys();
      if (selectedSurvey?.id === id) {
        setSelectedSurvey(null);
      }
    }
  };

  const handleClearAll = async () => {
    if (window.confirm('Clear ALL survey records and anomalies from MongoDB?')) {
      clearAllSurveys();
      await clearAllSurveysFromDb().catch(err => console.warn('MongoDB clear warning:', err));
      onRefreshSurveys();
      setSelectedSurvey(null);
    }
  };

  const handleResetDefaults = async () => {
    if (window.confirm('Reset database to MoES/NIOT deep-sea sonar benchmark missions?')) {
      await resetDatabase().catch(err => console.warn('MongoDB reset warning:', err));
      onRefreshSurveys();
      setSelectedSurvey(null);
    }
  };

  const handleSelectSurveyRow = (survey: SurveyRecord) => {
    setSelectedSurvey(survey);
    setSelectedHazardId(null);
  };

  const handleClose = () => {
    setSelectedSurvey(null);
    setSelectedHazardId(null);
    onClose();
  };

  const handleLoadAndClose = (survey: SurveyRecord) => {
    onLoadSurveyToDashboard(survey);
    handleClose();
  };

  const resetFilters = () => {
    setSearchQuery('');
    setFilterDate('');
    setPriorityFilter('All');
    setObjectTypeFilter('All');
  };

  const hasActiveFilters = searchQuery || filterDate || priorityFilter !== 'All' || objectTypeFilter !== 'All';

  // Detailed view filtered hazards
  const detailedHazards = selectedSurvey ? selectedSurvey.hazards.filter((h) => {
    if (detailTypeFilter !== 'All' && h.category !== detailTypeFilter) return false;
    if (detailPriorityFilter !== 'All' && getHazardPriority(h.severity) !== detailPriorityFilter) return false;
    return true;
  }) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div className="glass-panel border border-cyan-500/30 w-full max-w-6xl max-h-[92vh] flex flex-col rounded-2xl shadow-[0_0_60px_rgba(0,229,255,0.15)] overflow-hidden">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-cyan-500/20 bg-slate-900/80">
          <div className="flex items-center gap-3">
            {selectedSurvey ? (
              <button
                onClick={() => setSelectedSurvey(null)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back to History
              </button>
            ) : (
              <div className="w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                <Clock className="w-5 h-5" />
              </div>
            )}
            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                {selectedSurvey ? `Survey Report: ${selectedSurvey.id}` : 'AQUORA Sonar Survey History'}
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-mono border border-cyan-500/30">
                  {selectedSurvey ? `${selectedSurvey.totalDetections} DETECTIONS` : `${surveys.length} RECORDED`}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                {selectedSurvey
                  ? `${selectedSurvey.surveyArea} • Surveyed on ${selectedSurvey.formattedDate}`
                  : 'Audited log of all real processed side-scan sonar missions and acoustic telemetry.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {dbStatus && (
              <div 
                title={`MongoDB Status: ${dbStatus.status} | DB: ${dbStatus.database || 'aquora_db'} | Surveys in DB: ${dbStatus.counts?.surveys ?? surveys.length}`}
                className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-mono ${
                  dbStatus.connected
                    ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                    : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
                }`}
              >
                <Database className="w-3.5 h-3.5 text-emerald-400" />
                <span>{dbStatus.connected ? `DB: ${dbStatus.database}` : 'MongoDB Offline'}</span>
                {dbStatus.connected && (
                  <span className="text-[10px] bg-emerald-900/60 px-1 py-0.2 rounded text-emerald-200">
                    {dbStatus.counts?.surveys ?? surveys.length} in DB
                  </span>
                )}
              </div>
            )}

            <button
              onClick={onRefreshSurveys}
              title="Sync with MongoDB"
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-cyan-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-cyan-500/40 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Sync</span>
            </button>

            <button 
              onClick={handleClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">

          {/* VIEW 1: SURVEY LIST / MASTER VIEW */}
          {!selectedSurvey && (
            <div className="space-y-5">
              
              {/* Filter Controls Bar */}
              <div className="glass-panel p-4 rounded-xl border border-slate-800 bg-slate-950/60 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3">
                  
                  {/* Search Query Input (4 cols) */}
                  <div className="lg:col-span-4 relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Search ID, Area, Vessel, AUV..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 outline-none focus:border-cyan-500 transition-colors"
                    />
                  </div>

                  {/* Priority Filter (2 cols) */}
                  <div className="lg:col-span-2">
                    <select
                      value={priorityFilter}
                      onChange={(e) => setPriorityFilter(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-cyan-500 cursor-pointer"
                    >
                      <option value="All">All Priorities</option>
                      <option value="Critical">Critical Only</option>
                      <option value="High">High Only</option>
                      <option value="Medium">Medium Only</option>
                      <option value="Low">Low Only</option>
                    </select>
                  </div>

                  {/* Object Type Filter (3 cols) */}
                  <div className="lg:col-span-3">
                    <select
                      value={objectTypeFilter}
                      onChange={(e) => setObjectTypeFilter(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-cyan-500 cursor-pointer"
                    >
                      <option value="All">All Object Types</option>
                      {HAZARD_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>

                  {/* Single Date Filter (3 cols) */}
                  <div className="lg:col-span-3 relative flex items-center">
                    <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
                    <input
                      type="date"
                      value={filterDate}
                      onChange={(e) => setFilterDate(e.target.value)}
                      title="Filter by Survey Date"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-2.5 py-1.5 text-xs text-slate-300 outline-none focus:border-cyan-500 cursor-pointer"
                    />
                  </div>
                </div>

                {/* Filter Status Summary & Reset */}
                <div className="flex items-center justify-between text-xs pt-1">
                  <span className="text-slate-400">
                    Showing <strong className="text-cyan-300">{filteredSurveys.length}</strong> of <strong className="text-slate-300">{surveys.length}</strong> saved surveys
                  </span>
                  <div className="flex items-center gap-3">
                    {hasActiveFilters && (
                      <button
                        onClick={resetFilters}
                        className="text-cyan-400 hover:text-cyan-300 text-xs font-semibold underline underline-offset-2 cursor-pointer"
                      >
                        Clear Filters
                      </button>
                    )}
                    {surveys.length > 0 && (
                      <button
                        onClick={handleClearAll}
                        className="text-red-400/90 hover:text-red-300 text-xs font-semibold flex items-center gap-1 hover:underline cursor-pointer"
                        title="Delete all survey history from MongoDB"
                      >
                        <Trash2 className="w-3 h-3" /> Clear History
                      </button>
                    )}
                    <button
                      onClick={handleResetDefaults}
                      className="text-emerald-400/90 hover:text-emerald-300 text-xs font-semibold flex items-center gap-1 hover:underline cursor-pointer"
                      title="Reset MongoDB to default NIOT acoustic missions"
                    >
                      <Sparkles className="w-3 h-3" /> Reset Defaults
                    </button>
                  </div>
                </div>
              </div>

              {/* Empty State */}
              {surveys.length === 0 ? (
                <div className="glass-panel p-12 text-center rounded-2xl border border-slate-800 flex flex-col items-center justify-center space-y-4">
                  <div className="w-16 h-16 rounded-2xl bg-cyan-950/40 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-[0_0_20px_rgba(0,229,255,0.15)]">
                    <Waves className="w-8 h-8 opacity-60" />
                  </div>
                  <div className="max-w-md">
                    <h3 className="text-base font-bold text-slate-200">No Surveys Recorded in MongoDB</h3>
                    <p className="text-xs text-slate-400 mt-1">
                      AQUORA maintains a persistent MongoDB mission log. You can upload a new side-scan sonar image or load NIOT deep-sea benchmark survey datasets.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <button
                      onClick={() => {
                        onClose();
                        onOpenUploadModal();
                      }}
                      className="flex items-center gap-2 px-5 py-2 text-xs font-bold text-slate-950 bg-gradient-to-r from-cyan-400 to-emerald-400 hover:from-cyan-300 hover:to-emerald-300 rounded-xl shadow-[0_0_20px_rgba(0,229,255,0.3)] transition-all cursor-pointer"
                    >
                      <Sparkles className="w-4 h-4" /> Upload & Process Sonar Survey
                    </button>
                    <button
                      onClick={handleResetDefaults}
                      className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-emerald-300 bg-emerald-950/60 hover:bg-emerald-900/80 border border-emerald-500/40 rounded-xl transition-all cursor-pointer"
                    >
                      <Database className="w-4 h-4" /> Seed NIOT Benchmark Surveys
                    </button>
                  </div>
                </div>
              ) : filteredSurveys.length === 0 ? (
                <div className="p-8 text-center rounded-xl border border-slate-800 bg-slate-950/40 text-slate-400 text-xs">
                  No recorded surveys match your selected filters. Try clearing or relaxing the criteria.
                </div>
              ) : (
                /* Survey Cards Grid */
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredSurveys.map((survey) => (
                    <div
                      key={survey.id}
                      onClick={() => handleSelectSurveyRow(survey)}
                      className="glass-panel p-4 rounded-xl border border-slate-800 hover:border-cyan-500/40 bg-slate-950/50 hover:bg-slate-900/40 transition-all cursor-pointer flex flex-col justify-between group shadow-lg"
                    >
                      <div>
                        {/* Top Card Row */}
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-bold text-cyan-300 tracking-wider">
                                {survey.id}
                              </span>
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300">
                                {survey.pingFrequencyKhz} kHz
                              </span>
                            </div>
                            <h4 className="text-sm font-semibold text-slate-100 mt-0.5 group-hover:text-cyan-200 transition-colors">
                              {survey.surveyArea}
                            </h4>
                          </div>

                          {/* Delete Button */}
                          <button
                            onClick={(e) => handleDelete(e, survey.id)}
                            title="Delete survey"
                            className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-900 rounded-lg transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Survey Telemetry / Metadata Summary */}
                        <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400 py-2 border-y border-slate-900">
                          <div>
                            <span className="text-slate-500">Date:</span> {survey.formattedDate}
                          </div>
                          <div>
                            <span className="text-slate-500">AUV:</span> {survey.auvId}
                          </div>
                          <div>
                            <span className="text-slate-500">Vessel:</span> {survey.vesselName}
                          </div>
                          <div>
                            <span className="text-slate-500">Trackline:</span> {survey.location}
                          </div>
                        </div>
                      </div>

                      {/* Bottom Card Row: Priority Badges & Actions */}
                      <div className="mt-4 pt-2 flex flex-wrap items-center justify-between gap-2">
                        {/* Priority Breakdown Pills */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] font-mono font-bold bg-slate-900 px-2 py-0.5 rounded text-cyan-300 border border-slate-800">
                            {survey.totalDetections} Total
                          </span>
                          {survey.priorityCounts.critical > 0 && (
                            <span className="text-[10px] font-mono font-bold bg-red-950/60 border border-red-500/40 text-red-400 px-2 py-0.5 rounded flex items-center gap-1">
                              <ShieldAlert className="w-3 h-3" /> {survey.priorityCounts.critical} Crit
                            </span>
                          )}
                          {survey.priorityCounts.high > 0 && (
                            <span className="text-[10px] font-mono font-bold bg-amber-950/60 border border-amber-500/40 text-amber-400 px-2 py-0.5 rounded">
                              {survey.priorityCounts.high} High
                            </span>
                          )}
                          {survey.priorityCounts.medium > 0 && (
                            <span className="text-[10px] font-mono font-bold bg-cyan-950/60 border border-cyan-500/40 text-cyan-400 px-2 py-0.5 rounded">
                              {survey.priorityCounts.medium} Med
                            </span>
                          )}
                          {survey.priorityCounts.low > 0 && (
                            <span className="text-[10px] font-mono font-bold bg-emerald-950/60 border border-emerald-500/40 text-emerald-400 px-2 py-0.5 rounded">
                              {survey.priorityCounts.low} Low
                            </span>
                          )}
                        </div>

                        {/* Action CTA */}
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleLoadAndClose(survey);
                            }}
                            className="px-2.5 py-1 text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 bg-emerald-950/40 hover:bg-emerald-950/80 border border-emerald-500/30 rounded-lg transition-colors cursor-pointer"
                          >
                            Load Dashboard
                          </button>
                          <span className="text-cyan-400 group-hover:translate-x-0.5 transition-transform">
                            <ChevronRight className="w-4 h-4" />
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

            </div>
          )}

          {/* VIEW 2: DETAILED INFORMATION VIEW */}
          {selectedSurvey && (
            <div className="space-y-6">

              {/* Top Banner / Actions */}
              <div className="glass-panel p-4 rounded-xl border border-slate-800 bg-slate-950/70 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono text-sm font-bold text-cyan-300">{selectedSurvey.id}</span>
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-cyan-950/80 text-cyan-300 border border-cyan-500/40 font-mono">
                      {selectedSurvey.pipeline}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-1">
                    <strong>Area:</strong> {selectedSurvey.surveyArea} • <strong>Vessel:</strong> {selectedSurvey.vesselName} • <strong>AUV:</strong> {selectedSurvey.auvId}
                  </p>
                  <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                    Trackline: ({selectedSurvey.startLat.toFixed(4)}°N, {selectedSurvey.startLng.toFixed(4)}°E) ── ({selectedSurvey.endLat.toFixed(4)}°N, {selectedSurvey.endLng.toFixed(4)}°E) | Alt: {selectedSurvey.altitudeMeters}m | Slant: {selectedSurvey.slantRangeMeters}m | Freq: {selectedSurvey.pingFrequencyKhz}kHz
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleLoadAndClose(selectedSurvey)}
                    className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-slate-950 bg-gradient-to-r from-cyan-400 to-emerald-400 hover:from-cyan-300 hover:to-emerald-300 rounded-xl shadow-[0_0_20px_rgba(0,229,255,0.3)] transition-all cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Load into Active Dashboard
                  </button>
                </div>
              </div>

              {/* KPI Breakdown Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="glass-panel p-3 rounded-xl border border-slate-800 bg-slate-950/60">
                  <span className="text-[10px] text-slate-400 font-semibold uppercase block">Total Targets</span>
                  <span className="text-xl font-bold font-mono text-cyan-300">{selectedSurvey.totalDetections}</span>
                </div>
                <div className="glass-panel p-3 rounded-xl border border-red-500/20 bg-red-950/20">
                  <span className="text-[10px] text-red-400 font-semibold uppercase block">Critical Priority</span>
                  <span className="text-xl font-bold font-mono text-red-400">{selectedSurvey.priorityCounts.critical}</span>
                </div>
                <div className="glass-panel p-3 rounded-xl border border-amber-500/20 bg-amber-950/20">
                  <span className="text-[10px] text-amber-400 font-semibold uppercase block">High Priority</span>
                  <span className="text-xl font-bold font-mono text-amber-400">{selectedSurvey.priorityCounts.high}</span>
                </div>
                <div className="glass-panel p-3 rounded-xl border border-cyan-500/20 bg-cyan-950/20">
                  <span className="text-[10px] text-cyan-400 font-semibold uppercase block">Medium Priority</span>
                  <span className="text-xl font-bold font-mono text-cyan-400">{selectedSurvey.priorityCounts.medium}</span>
                </div>
                <div className="glass-panel p-3 rounded-xl border border-emerald-500/20 bg-emerald-950/20">
                  <span className="text-[10px] text-emerald-400 font-semibold uppercase block">Low Priority</span>
                  <span className="text-xl font-bold font-mono text-emerald-400">{selectedSurvey.priorityCounts.low}</span>
                </div>
              </div>

              {/* GIS Leaflet Map with Priority-Based Markers */}
              <div className="glass-panel rounded-xl p-4 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5 font-mono">
                    <MapPin className="w-3.5 h-3.5" /> Geotagged Targets on Survey Trackline
                  </h3>
                  <div className="flex items-center gap-3 text-[11px] font-mono">
                    <span className="flex items-center gap-1 text-red-400">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#FF4757]"></span> Critical
                    </span>
                    <span className="flex items-center gap-1 text-amber-400">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#FFB300]"></span> High
                    </span>
                    <span className="flex items-center gap-1 text-cyan-400">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#00E5FF]"></span> Medium
                    </span>
                    <span className="flex items-center gap-1 text-emerald-400">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#00FF9D]"></span> Low
                    </span>
                  </div>
                </div>

                <div 
                  ref={mapContainerRef}
                  className="w-full h-[280px] rounded-lg overflow-hidden border border-slate-800"
                />
              </div>

              {/* Detected Objects Table */}
              <div className="glass-panel rounded-xl border border-slate-800 overflow-hidden space-y-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200 font-mono flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-cyan-400" />
                      All Detected Objects ({detailedHazards.length})
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Full catalog with acoustic shadow heights, physical dimensions, and GPS coordinates.
                    </p>
                  </div>

                  {/* Table Sub-Filters */}
                  <div className="flex items-center gap-2">
                    <select
                      value={detailPriorityFilter}
                      onChange={(e) => setDetailPriorityFilter(e.target.value)}
                      className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-300 outline-none focus:border-cyan-500"
                    >
                      <option value="All">All Priorities</option>
                      <option value="Critical">Critical</option>
                      <option value="High">High</option>
                      <option value="Medium">Medium</option>
                      <option value="Low">Low</option>
                    </select>

                    <select
                      value={detailTypeFilter}
                      onChange={(e) => setDetailTypeFilter(e.target.value)}
                      className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-300 outline-none focus:border-cyan-500"
                    >
                      <option value="All">All Types</option>
                      {HAZARD_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-900/60 text-[11px] text-slate-400 uppercase font-mono">
                        <th className="p-2.5">Object ID</th>
                        <th className="p-2.5">Type / Category</th>
                        <th className="p-2.5">Confidence</th>
                        <th className="p-2.5">Priority</th>
                        <th className="p-2.5">Severity</th>
                        <th className="p-2.5">Coordinates (Lat, Lng)</th>
                        <th className="p-2.5">Dimensions (L × W × H)</th>
                        <th className="p-2.5">Channel / Depth</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {detailedHazards.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="p-6 text-center text-slate-500 text-xs">
                            No objects match the selected criteria.
                          </td>
                        </tr>
                      ) : (
                        detailedHazards.map((hazard) => {
                          const priority = getHazardPriority(hazard.severity);
                          const isSelected = hazard.id === selectedHazardId;

                          return (
                            <tr
                              key={hazard.id}
                              onClick={() => setSelectedHazardId(hazard.id)}
                              className={`transition-colors cursor-pointer ${
                                isSelected ? 'bg-cyan-950/30' : 'hover:bg-slate-900/50'
                              }`}
                            >
                              {/* Object ID */}
                              <td className="p-2.5 font-mono text-cyan-300 font-semibold whitespace-nowrap">
                                {hazard.id}
                              </td>

                              {/* Type */}
                              <td className="p-2.5 font-semibold text-slate-200 whitespace-nowrap">
                                {hazard.category}
                              </td>

                              {/* Confidence */}
                              <td className="p-2.5 font-mono text-slate-300 whitespace-nowrap">
                                <span className="text-cyan-300 font-bold">{hazard.confidence}%</span>
                              </td>

                              {/* Priority */}
                              <td className="p-2.5 whitespace-nowrap">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                                  priority === 'Critical'
                                    ? 'bg-red-950/60 border-red-500/40 text-red-400'
                                    : priority === 'High'
                                    ? 'bg-amber-950/60 border-amber-500/40 text-amber-400'
                                    : priority === 'Medium'
                                    ? 'bg-cyan-950/60 border-cyan-500/40 text-cyan-400'
                                    : 'bg-emerald-950/60 border-emerald-500/40 text-emerald-400'
                                }`}>
                                  {priority}
                                </span>
                              </td>

                              {/* Severity */}
                              <td className="p-2.5 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                                {hazard.severity}
                              </td>

                              {/* Coordinates */}
                              <td className="p-2.5 font-mono text-slate-300 whitespace-nowrap">
                                {hazard.latitude.toFixed(5)}°N, {hazard.longitude.toFixed(5)}°E
                              </td>

                              {/* Size */}
                              <td className="p-2.5 font-mono text-slate-300 whitespace-nowrap">
                                {hazard.estimatedLengthM}m × {hazard.estimatedWidthM}m × {hazard.estimatedHeightM}m
                              </td>

                              {/* Channel & Depth */}
                              <td className="p-2.5 text-slate-400 whitespace-nowrap">
                                {hazard.channel} • {hazard.depthMeters}m
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-cyan-500/20 bg-slate-900/80 flex items-center justify-between text-xs text-slate-400">
          <div>
            AQUORA Survey Storage: <strong className="text-emerald-400">Vercel Persistent Ready</strong> (Zero Mock Data)
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
