import { SonarHazard, SurveyRecord } from '../types';

export interface SonarUploadMetadata {
  altitude: number;
  slantRange: number;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  pingFreq: number;
  auvId: string;
  vesselName: string;
  heading: number;
  speed: number;
  resolution: number;
  surveyArea?: string;
}

export interface BackendProcessResponse {
  detections: SonarHazard[];
  total_found: number;
  status: string;
  pipeline: string;
  yolo_active: boolean;
  image_size: {
    width: number;
    height: number;
  };
  metadata: {
    altitude: number;
    slant_range: number;
    start_lat: number;
    start_lng: number;
    end_lat: number;
    end_lng: number;
    vessel_name?: string;
    auv_id?: string;
    survey_area?: string;
  };
  analysis_report?: {
    report_title: string;
    dominant_anomaly: string;
    survey_area: string;
    seabed_characterization: string;
    critical_count: number;
    high_count: number;
    average_snr_db: number;
    max_shadow_height_m: number;
    total_targets: number;
  };
  telemetry?: Record<string, any>;
  saved_survey_id?: string;
  database_synced?: boolean;
}

export interface MongoDbStatus {
  connected: boolean;
  status: 'ONLINE' | 'OFFLINE' | 'ERROR';
  database: string;
  host?: string;
  port?: number;
  version?: string;
  latency_ms?: number;
  counts?: {
    surveys: number;
    anomalies: number;
    telemetry: number;
    processing_logs: number;
  };
  collections?: string[];
  error?: string;
}

const BACKEND_BASE_URL = typeof window !== 'undefined' ? '' : 'http://localhost:5000';

export async function processSonarImageOnBackend(
  file: File,
  metadata: SonarUploadMetadata
): Promise<BackendProcessResponse> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('altitude', metadata.altitude.toString());
  formData.append('slant_range', metadata.slantRange.toString());
  formData.append('start_lat', metadata.startLat.toString());
  formData.append('start_lng', metadata.startLng.toString());
  formData.append('end_lat', metadata.endLat.toString());
  formData.append('end_lng', metadata.endLng.toString());
  formData.append('ping_freq', metadata.pingFreq.toString());
  formData.append('auv_id', metadata.auvId);
  formData.append('vessel_name', metadata.vesselName);
  formData.append('heading', metadata.heading.toString());
  formData.append('speed', metadata.speed.toString());
  formData.append('resolution', metadata.resolution.toString());
  if (metadata.surveyArea) {
    formData.append('survey_area', metadata.surveyArea);
  }

  const response = await fetch(`${BACKEND_BASE_URL}/api/process-sonar`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => 'Unknown error');
    throw new Error(`AQUORA Backend Error (${response.status}): ${errText}`);
  }

  const data: BackendProcessResponse = await response.json();
  return data;
}

export async function checkBackendHealth(): Promise<{ online: boolean; message: string; database?: MongoDbStatus }> {
  try {
    const res = await fetch(`${BACKEND_BASE_URL}/api/health`, { method: 'GET' });
    if (res.ok) {
      const data = await res.json();
      return { online: true, message: data.system || 'Online', database: data.database };
    }
    return { online: false, message: `Status code ${res.status}` };
  } catch (err: any) {
    return { online: false, message: err?.message || 'Cannot reach backend' };
  }
}

/**
 * Fetch live MongoDB status and metrics
 */
export async function getMongoDbStatus(): Promise<MongoDbStatus> {
  try {
    const res = await fetch(`${BACKEND_BASE_URL}/api/db/status`, { method: 'GET' });
    if (res.ok) {
      return await res.json();
    }
    return {
      connected: false,
      status: 'OFFLINE',
      database: 'aquora_db',
      error: `HTTP ${res.status}`
    };
  } catch (err: any) {
    return {
      connected: false,
      status: 'OFFLINE',
      database: 'aquora_db',
      error: err?.message || 'Failed to connect to backend MongoDB API'
    };
  }
}

/**
 * Fetch all sonar surveys from MongoDB
 */
export async function fetchSurveysFromDb(search?: string): Promise<SurveyRecord[]> {
  try {
    const queryParam = search ? `?search=${encodeURIComponent(search)}` : '';
    const res = await fetch(`${BACKEND_BASE_URL}/api/surveys${queryParam}`, { method: 'GET' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return (data.surveys || []) as SurveyRecord[];
  } catch (err) {
    console.warn('Could not fetch surveys from MongoDB:', err);
    throw err;
  }
}

/**
 * Save or update survey in MongoDB
 */
export async function saveSurveyToDb(survey: Partial<SurveyRecord>): Promise<SurveyRecord> {
  const res = await fetch(`${BACKEND_BASE_URL}/api/surveys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(survey)
  });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`Failed to save survey to MongoDB: ${msg}`);
  }
  const data = await res.json();
  return data.survey as SurveyRecord;
}

/**
 * Delete survey from MongoDB
 */
export async function deleteSurveyFromDb(id: string): Promise<boolean> {
  const res = await fetch(`${BACKEND_BASE_URL}/api/surveys/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
  return res.ok;
}

/**
 * Clear all surveys from MongoDB
 */
export async function clearAllSurveysFromDb(): Promise<boolean> {
  const res = await fetch(`${BACKEND_BASE_URL}/api/surveys`, {
    method: 'DELETE'
  });
  return res.ok;
}

/**
 * Query classified anomalies directly from MongoDB
 */
export async function fetchAnomaliesFromDb(params?: {
  category?: string;
  severity?: string;
  minConfidence?: number;
}): Promise<any[]> {
  const query = new URLSearchParams();
  if (params?.category && params.category !== 'All') query.append('category', params.category);
  if (params?.severity && params.severity !== 'All') query.append('severity', params.severity);
  if (params?.minConfidence) query.append('min_confidence', params.minConfidence.toString());

  const res = await fetch(`${BACKEND_BASE_URL}/api/anomalies?${query.toString()}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.anomalies || [];
}

/**
 * Fetch telemetry stream records from MongoDB
 */
export async function fetchTelemetryFromDb(auvId?: string, limit: number = 100): Promise<any[]> {
  try {
    const q = new URLSearchParams();
    if (auvId) q.append('auv_id', auvId);
    q.append('limit', limit.toString());
    const res = await fetch(`${BACKEND_BASE_URL}/api/telemetry?${q.toString()}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.telemetry || [];
  } catch (err) {
    console.warn('Failed to fetch telemetry from MongoDB:', err);
    return [];
  }
}

/**
 * Ingest real-time AUV telemetry stream directly into MongoDB
 */
export async function ingestTelemetryToDb(telemetry: any | any[]): Promise<number> {
  try {
    const res = await fetch(`${BACKEND_BASE_URL}/api/telemetry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(telemetry)
    });
    if (!res.ok) return 0;
    const data = await res.json();
    return data.inserted || 0;
  } catch (err) {
    console.warn('Failed to ingest telemetry into MongoDB:', err);
    return 0;
  }
}

/**
 * Delete telemetry records from MongoDB
 */
export async function deleteTelemetryFromDb(auvId?: string): Promise<boolean> {
  const q = auvId ? `?auv_id=${encodeURIComponent(auvId)}` : '';
  const res = await fetch(`${BACKEND_BASE_URL}/api/telemetry${q}`, {
    method: 'DELETE'
  });
  return res.ok;
}

/**
 * Save single anomaly to MongoDB
 */
export async function saveAnomalyToDb(anomaly: any): Promise<any> {
  const res = await fetch(`${BACKEND_BASE_URL}/api/anomalies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(anomaly)
  });
  if (!res.ok) throw new Error('Failed to save anomaly to MongoDB');
  const data = await res.json();
  return data.anomaly;
}

/**
 * Delete single anomaly by ID from MongoDB
 */
export async function deleteAnomalyFromDb(hazardId: string): Promise<boolean> {
  const res = await fetch(`${BACKEND_BASE_URL}/api/anomalies/${encodeURIComponent(hazardId)}`, {
    method: 'DELETE'
  });
  return res.ok;
}

/**
 * Reset MongoDB to fresh seed state
 */
export async function resetDatabase(): Promise<any> {
  const res = await fetch(`${BACKEND_BASE_URL}/api/db/reset`, {
    method: 'POST'
  });
  if (!res.ok) throw new Error('Failed to reset database');
  return await res.json();
}

/**
 * Clear all data from all collections in MongoDB
 */
export async function clearEntireDatabase(): Promise<any> {
  const res = await fetch(`${BACKEND_BASE_URL}/api/db/clear`, {
    method: 'DELETE'
  });
  if (!res.ok) throw new Error('Failed to clear database');
  return await res.json();
}
