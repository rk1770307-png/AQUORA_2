export type MaterialType = 'Wet' | 'Plastic' | 'Iron' | 'Anomaly';

export type HazardCategory = 
  | 'Wet Debris (Ghost Net)'
  | 'Plastic Marine Debris'
  | 'Iron / Metal Scrap'
  | 'Subsea Pipe (Iron/Steel)'
  | 'Shipwreck (Iron Hull)'
  | 'Metallic Cylinder'
  | 'Munitions / UXO'
  | 'Seafloor Anomaly'
  | 'Ghost Net' 
  | 'Subsea Pipe' 
  | 'Cylinder' 
  | 'Shipwreck' 
  | 'Aircraft Debris' 
  | 'Plastic Cluster'
  | 'Natural Rock Cluster' 
  | 'Unknown Anomaly';

export type SeverityLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'BENIGN';

export interface BoundingBox {
  x: number; // percentage (0-100) or pixel
  y: number; // percentage (0-100) or pixel
  width: number;
  height: number;
}

export interface SonarHazard {
  id: string;
  category: HazardCategory;
  materialType?: MaterialType;
  confidence: number; // 0 to 100
  bbox: BoundingBox;
  channel: 'Port' | 'Starboard';
  latitude: number;
  longitude: number;
  depthMeters: number;
  estimatedLengthM: number;
  estimatedWidthM: number;
  estimatedHeightM: number; // derived from acoustic shadow length
  shadowLengthM: number;
  snrDb: number; // Signal to Noise ratio
  severity: SeverityLevel;
  description: string;
  acousticHighlightScore: number; // 0-1
  shadowMatchScore: number; // 0-1
  isFalsePositiveFiltered?: boolean;
}

/**
 * Determine acoustic material classification: Wet, Plastic, Iron, or Anomaly
 */
export function getMaterialType(category: string): MaterialType {
  const cat = (category || '').toLowerCase();
  if (cat.includes('iron') || cat.includes('metal') || cat.includes('pipe') || cat.includes('cylinder') || cat.includes('shipwreck') || cat.includes('steel') || cat.includes('drum')) {
    return 'Iron';
  }
  if (cat.includes('plastic') || cat.includes('poly') || cat.includes('synthetic') || cat.includes('container') || cat.includes('tarp')) {
    return 'Plastic';
  }
  if (cat.includes('wet') || cat.includes('net') || cat.includes('organic') || cat.includes('ghost') || cat.includes('rope') || cat.includes('fiber') || cat.includes('trawl')) {
    return 'Wet';
  }
  return 'Anomaly';
}

/**
 * Visual styling token mapping for each material type
 */
export function getMaterialStyle(material: MaterialType) {
  switch (material) {
    case 'Iron':
      return {
        label: 'IRON / METAL',
        borderColor: 'border-amber-400',
        activeBorder: 'border-amber-400 ring-2 ring-amber-400 shadow-[0_0_18px_rgba(245,158,11,0.85)]',
        bg: 'bg-amber-500/25',
        badgeBg: 'bg-amber-950/90 text-amber-300 border-amber-500/40',
        accentColor: '#F59E0B',
        dotColor: 'bg-amber-400',
        icon: '🧲'
      };
    case 'Plastic':
      return {
        label: 'PLASTIC DEBRIS',
        borderColor: 'border-cyan-400',
        activeBorder: 'border-cyan-400 ring-2 ring-cyan-400 shadow-[0_0_18px_rgba(6,182,212,0.85)]',
        bg: 'bg-cyan-500/25',
        badgeBg: 'bg-cyan-950/90 text-cyan-300 border-cyan-500/40',
        accentColor: '#06B6D4',
        dotColor: 'bg-cyan-400',
        icon: '🧴'
      };
    case 'Wet':
      return {
        label: 'WET / GHOST NET',
        borderColor: 'border-emerald-400',
        activeBorder: 'border-emerald-400 ring-2 ring-emerald-400 shadow-[0_0_18px_rgba(16,185,129,0.85)]',
        bg: 'bg-emerald-500/25',
        badgeBg: 'bg-emerald-950/90 text-emerald-300 border-emerald-500/40',
        accentColor: '#10B981',
        dotColor: 'bg-emerald-400',
        icon: '🕸️'
      };
    case 'Anomaly':
    default:
      return {
        label: 'SEAFLOOR ANOMALY',
        borderColor: 'border-purple-400',
        activeBorder: 'border-purple-400 ring-2 ring-purple-400 shadow-[0_0_18px_rgba(168,85,247,0.85)]',
        bg: 'bg-purple-500/25',
        badgeBg: 'bg-purple-950/90 text-purple-300 border-purple-500/40',
        accentColor: '#A855F7',
        dotColor: 'bg-purple-400',
        icon: '⚠️'
      };
  }
}

export interface TelemetryData {
  auvId: string;
  vesselName: string;
  surveyArea: string;
  headingDeg: number;
  speedKnots: number;
  altitudeMeters: number;
  slantRangeMeters: number;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  pingFrequencyKhz: number;
  resolutionCm: number;
  heaveM: number;
  pitchDeg: number;
  rollDeg: number;
}

export interface FilterSettings {
  speckleFilter: 'none' | 'lee' | 'frost' | 'median' | 'anisotropic';
  speckleKernelSize: number; // 3, 5, 7
  claheEnabled: boolean;
  claheClipLimit: number;
  heaveCompensation: boolean;
  shadowVerification: boolean;
  minConfidence: number; // 0-100
  colorMap: 'copper' | 'cyan' | 'grayscale' | 'magma';
  showSegmentationMasks: boolean;
  showBoundingBoxes: boolean;
  selectedCategories: HazardCategory[];
}

export interface PresetDataset {
  id: string;
  name: string;
  location: string;
  organization: string;
  description: string;
  imageUrl: string;
  metadata: TelemetryData;
  hazards: SonarHazard[];
  speckleNoiseLevel: 'Low' | 'Medium' | 'High';
}

export interface DetectionResult {
  hazards: SonarHazard[];
  filteredCount: number;
  processingTimeMs: number;
  snrAverage: number;
}

export type SurveyPriority = 'Critical' | 'High' | 'Medium' | 'Low';

export interface PriorityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface SurveyRecord {
  id: string;
  timestamp: string;
  formattedDate: string;
  surveyArea: string;
  location: string;
  pingFrequencyKhz: number;
  auvId: string;
  vesselName: string;
  headingDeg: number;
  speedKnots: number;
  altitudeMeters: number;
  slantRangeMeters: number;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  totalDetections: number;
  priorityCounts: PriorityCounts;
  hazards: SonarHazard[];
  thumbnailUrl?: string;
  pipeline: string;
}
