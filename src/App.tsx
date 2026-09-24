import React, { useState, useMemo, useEffect } from 'react';
import { Header } from './components/Header';
import { SonarCanvasVisualizer } from './components/SonarCanvasVisualizer';
import { ControlPanel } from './components/ControlPanel';
import { MapDashboard } from './components/MapDashboard';
import { AnomalyReportTable } from './components/AnomalyReportTable';
import { StreamSimulatorModal } from './components/StreamSimulatorModal';
import { MoESInfoModal } from './components/MoESInfoModal';
import { UploadSonarModal } from './components/UploadSonarModal';
import { SurveyHistoryModal } from './components/SurveyHistoryModal';
import { PRESET_DATASETS } from './data/presetDatasets';
import { FilterSettings, PresetDataset, SonarHazard, SurveyRecord } from './types';
import { processSonarDetections } from './utils/sonarFilterEngine';
import { BackendProcessResponse, getMongoDbStatus, MongoDbStatus } from './utils/backendApi';
import { getSurveyHistory, saveSurvey, compressImageFileToDataUrl, syncSurveysWithDb } from './utils/surveyStorage';

export function App() {
  const [activeDataset, setActiveDataset] = useState<PresetDataset>(PRESET_DATASETS[0]);
  const [customImageFile, setCustomImageFile] = useState<File | null>(null);
  const [backendHazards, setBackendHazards] = useState<SonarHazard[] | null>(null);
  const [selectedHazardId, setSelectedHazardId] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>('aquora-acoustic-cv');

  // Modals
  const [isStreamModalOpen, setIsStreamModalOpen] = useState<boolean>(false);
  const [isInfoModalOpen, setIsInfoModalOpen] = useState<boolean>(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState<boolean>(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState<boolean>(false);

  // Survey History State (MongoDB persistent storage + local cache)
  const [surveyHistory, setSurveyHistory] = useState<SurveyRecord[]>(() => getSurveyHistory());
  const [dbStatus, setDbStatus] = useState<MongoDbStatus | null>(null);

  useEffect(() => {
    // 1. Query MongoDB status and sync records
    const syncDb = async () => {
      try {
        const status = await getMongoDbStatus();
        setDbStatus(status);
        const synced = await syncSurveysWithDb();
        if (synced && synced.length > 0) {
          setSurveyHistory(synced);
        }
      } catch (err) {
        console.warn('Initial MongoDB sync warning:', err);
      }
    };
    syncDb();

    // 3. Heartbeat polling for live database connection status
    const timer = setInterval(async () => {
      try {
        const status = await getMongoDbStatus();
        setDbStatus(status);
      } catch {
        // quiet
      }
    }, 15000);

    return () => clearInterval(timer);
  }, []);

  const refreshSurveyHistory = async () => {
    try {
      const status = await getMongoDbStatus();
      setDbStatus(status);
      const synced = await syncSurveysWithDb();
      setSurveyHistory(synced);
    } catch {
      setSurveyHistory(getSurveyHistory());
    }
  };

  // Default Filter & Pre-processing Settings
  const [filterSettings, setFilterSettings] = useState<FilterSettings>({
    speckleFilter: 'lee',
    speckleKernelSize: 5,
    claheEnabled: true,
    claheClipLimit: 2.0,
    heaveCompensation: true,
    shadowVerification: true,
    minConfidence: 40,
    colorMap: 'copper',
    showSegmentationMasks: true,
    showBoundingBoxes: true,
    selectedCategories: []
  });

  // Pick active hazards pool: uploaded backend detections if available, otherwise preset dataset
  const rawHazards = useMemo(() => {
    return backendHazards ?? activeDataset.hazards;
  }, [backendHazards, activeDataset]);

  // Calculate filtered hazards in real-time
  const detectionResult = useMemo(() => {
    return processSonarDetections(rawHazards, filterSettings);
  }, [rawHazards, filterSettings]);

  const handleSelectDataset = (dataset: PresetDataset) => {
    setActiveDataset(dataset);
    setBackendHazards(null);
    setCustomImageFile(null);
    setSelectedHazardId(null);
  };

  const handleDetectionsSuccess = async (
    file: File,
    syntheticDataset: PresetDataset,
    hazards: SonarHazard[],
    response: BackendProcessResponse
  ) => {
    setCustomImageFile(file);
    setActiveDataset(syntheticDataset);
    setBackendHazards(hazards);
    setSelectedHazardId(null);

    // Compress thumbnail asynchronously for persistent storage
    let thumbnailBase64 = '';
    try {
      thumbnailBase64 = await compressImageFileToDataUrl(file);
    } catch (e) {
      console.warn('Could not compress thumbnail:', e);
    }

    const meta = syntheticDataset.metadata;
    const resolvedArea = response.analysis_report?.report_title
      || syntheticDataset.name
      || meta.surveyArea;

    // Automatically save every actual processed sonar survey to persistent history
    saveSurvey({
      id: response.saved_survey_id,
      surveyArea: resolvedArea,
      location: syntheticDataset.location,
      pingFrequencyKhz: meta.pingFrequencyKhz,
      auvId: meta.auvId,
      vesselName: meta.vesselName,
      headingDeg: meta.headingDeg,
      speedKnots: meta.speedKnots,
      altitudeMeters: meta.altitudeMeters,
      slantRangeMeters: meta.slantRangeMeters,
      startLat: meta.startLat,
      startLng: meta.startLng,
      endLat: meta.endLat,
      endLng: meta.endLng,
      hazards: hazards,
      thumbnailUrl: thumbnailBase64,
      pipeline: response.pipeline || 'AQUORA-YOLOv8+AcousticCV'
    });

    // Update history state so it immediately appears in the History section
    refreshSurveyHistory();
  };

  const handleLoadSurveyToDashboard = (survey: SurveyRecord) => {
    const synthetic: PresetDataset = {
      id: survey.id,
      name: survey.surveyArea,
      location: survey.location,
      organization: `${survey.vesselName} / ${survey.auvId}`,
      description: `Historical Mission Survey: ${survey.pipeline}`,
      imageUrl: survey.thumbnailUrl || '',
      metadata: {
        auvId: survey.auvId,
        vesselName: survey.vesselName,
        surveyArea: survey.surveyArea,
        headingDeg: survey.headingDeg,
        speedKnots: survey.speedKnots,
        altitudeMeters: survey.altitudeMeters,
        slantRangeMeters: survey.slantRangeMeters,
        startLat: survey.startLat,
        startLng: survey.startLng,
        endLat: survey.endLat,
        endLng: survey.endLng,
        pingFrequencyKhz: survey.pingFrequencyKhz,
        resolutionCm: 5.0,
        heaveM: 0.15,
        pitchDeg: 0.8,
        rollDeg: 0.4
      },
      hazards: survey.hazards,
      speckleNoiseLevel: 'Medium'
    };

    setActiveDataset(synthetic);
    setBackendHazards(survey.hazards);
    setCustomImageFile(null);
    setSelectedHazardId(null);
  };

  const handleSelectHazard = (hazard: SonarHazard) => {
    setSelectedHazardId(prev => prev === hazard.id ? null : hazard.id);
  };

  const criticalCount = useMemo(() => {
    return detectionResult.hazards.filter(h => h.severity === 'CRITICAL').length;
  }, [detectionResult.hazards]);

  return (
    <div className="min-h-screen bg-[#060B14] text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-slate-950">
      {/* Top Application Header Bar */}
      <Header
        activeDataset={activeDataset}
        onSelectDataset={handleSelectDataset}
        onOpenUploadModal={() => setIsUploadModalOpen(true)}
        onOpenHistory={() => setIsHistoryModalOpen(true)}
        historyCount={surveyHistory.length}
        onOpenStream={() => setIsStreamModalOpen(true)}
        onOpenInfo={() => setIsInfoModalOpen(true)}
        totalHazards={detectionResult.hazards.length}
        criticalHazards={criticalCount}
        dbStatus={dbStatus}
      />

      {/* Main Dashboard Layout Grid */}
      <main className="flex-1 p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-5 max-w-[1700px] w-full mx-auto">
        {/* Left Column: AI Control Panel (3 cols) */}
        <div className="lg:col-span-3">
          <ControlPanel
            settings={filterSettings}
            onChangeSettings={setFilterSettings}
            selectedModel={selectedModel}
            onSelectModel={setSelectedModel}
            processingTimeMs={detectionResult.processingTimeMs}
            snrAverage={detectionResult.snrAverage}
            filteredCount={detectionResult.filteredCount}
          />
        </div>

        {/* Center/Right Column: Canvas & GIS Map (9 cols) */}
        <div className="lg:col-span-9 flex flex-col gap-5">
          {/* Top Half: Dual-Channel Sonar Visualizer Canvas & Map Grid */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            {/* Side-Scan Sonar Canvas */}
            <div className="xl:col-span-1 min-h-[460px]">
              <SonarCanvasVisualizer
                dataset={activeDataset}
                hazards={detectionResult.hazards}
                filterSettings={filterSettings}
                onChangeFilterSettings={setFilterSettings}
                customImageFile={customImageFile}
                onSelectHazard={handleSelectHazard}
                selectedHazardId={selectedHazardId}
              />
            </div>

            {/* Ocean GIS Geotagging Map */}
            <div className="xl:col-span-1 min-h-[460px]">
              <MapDashboard
                dataset={activeDataset}
                hazards={detectionResult.hazards}
                onSelectHazard={handleSelectHazard}
                selectedHazardId={selectedHazardId}
              />
            </div>
          </div>

          {/* Bottom Half: Anomalous Reporting & Geotagging Engine Output Table */}
          <div>
            <AnomalyReportTable
              dataset={activeDataset}
              hazards={detectionResult.hazards}
              onSelectHazard={handleSelectHazard}
              selectedHazardId={selectedHazardId}
            />
          </div>
        </div>
      </main>

      {/* Real-time Sonar Log Ingestion & YOLOv8 Inference Modal */}
      <UploadSonarModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onDetectionsSuccess={handleDetectionsSuccess}
      />

      {/* Audited Survey History & Inspection Modal (Real Surveys, Vercel-compatible) */}
      <SurveyHistoryModal
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
        surveys={surveyHistory}
        onRefreshSurveys={refreshSurveyHistory}
        onLoadSurveyToDashboard={handleLoadSurveyToDashboard}
        onOpenUploadModal={() => setIsUploadModalOpen(true)}
        dbStatus={dbStatus}
      />

      {/* Live AUV Sweep Stream Simulator Modal */}
      {isStreamModalOpen && (
        <StreamSimulatorModal
          dataset={activeDataset}
          onClose={() => setIsStreamModalOpen(false)}
          onAddAnomaly={(newAnomaly) => {
            setBackendHazards(prev => prev ? [newAnomaly, ...prev] : [newAnomaly, ...activeDataset.hazards]);
          }}
        />
      )}

      {/* MoES / NIOT Problem Statement Info Modal */}
      {isInfoModalOpen && (
        <MoESInfoModal
          onClose={() => setIsInfoModalOpen(false)}
        />
      )}
    </div>
  );
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("AQUORA Component Error Boundary:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#060B14] flex items-center justify-center p-6 text-slate-100 font-mono">
          <div className="max-w-md w-full bg-slate-900 border border-red-500/50 p-6 rounded-2xl shadow-2xl space-y-4">
            <h2 className="text-base font-bold text-red-400 uppercase tracking-wider">AQUORA UI Recovery</h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              {this.state.error?.message || 'A visual error occurred while rendering the dashboard.'}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="w-full py-2 bg-cyan-500 text-slate-950 font-bold rounded-lg hover:bg-cyan-400 transition-colors cursor-pointer"
            >
              Reload Dashboard
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function RootApp() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}