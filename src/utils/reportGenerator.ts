import { jsPDF } from 'jspdf';
import { SonarHazard, PresetDataset } from '../types';

/**
 * Export anomalous detection report in JSON format
 */
export function exportToJSON(dataset: PresetDataset, hazards: SonarHazard[]) {
  const data = {
    system: 'AQUORA - Side-Scan Sonar Anomaly Detection Engine',
    version: '1.0.0-SIH2026',
    exportTimestamp: new Date().toISOString(),
    surveyInfo: {
      id: dataset.id,
      name: dataset.name,
      location: dataset.location,
      organization: dataset.organization
    },
    telemetry: dataset.metadata,
    summary: {
      totalDetections: hazards.length,
      criticalHazards: hazards.filter(h => h.severity === 'CRITICAL').length,
      highHazards: hazards.filter(h => h.severity === 'HIGH').length,
      mediumHazards: hazards.filter(h => h.severity === 'MEDIUM').length,
      lowHazards: hazards.filter(h => h.severity === 'LOW').length,
      filteredFalsePositives: hazards.filter(h => h.isFalsePositiveFiltered).length
    },
    hazards: hazards.map(h => ({
      hazardId: h.id,
      classification: h.category,
      severity: h.severity,
      confidencePercentage: h.confidence,
      channel: h.channel,
      coordinates: {
        latitude: h.latitude,
        longitude: h.longitude,
        depthMeters: h.depthMeters
      },
      dimensions: {
        lengthMeters: h.estimatedLengthM,
        widthMeters: h.estimatedWidthM,
        heightMeters: h.estimatedHeightM,
        shadowLengthMeters: h.shadowLengthM
      },
      acousticMetrics: {
        snrDb: h.snrDb,
        highlightScore: h.acousticHighlightScore,
        shadowMatchScore: h.shadowMatchScore
      },
      description: h.description
    }))
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `AQUORA_Sonar_Report_${dataset.id}_${Date.now()}.json`);
}

/**
 * Export anomalous detection report in CSV format (MoES / NIOT Standard)
 */
export function exportToCSV(dataset: PresetDataset, hazards: SonarHazard[]) {
  const headers = [
    'Hazard_ID',
    'Classification',
    'Severity',
    'Confidence_Pct',
    'Channel',
    'Latitude',
    'Longitude',
    'Depth_m',
    'Est_Length_m',
    'Est_Width_m',
    'Est_Height_m',
    'Shadow_Length_m',
    'SNR_dB',
    'AUV_ID',
    'Survey_Area',
    'Timestamp'
  ];

  const rows = hazards.map(h => [
    h.id,
    `"${h.category}"`,
    h.severity,
    h.confidence.toFixed(1),
    h.channel,
    h.latitude.toFixed(6),
    h.longitude.toFixed(6),
    h.depthMeters.toFixed(1),
    h.estimatedLengthM.toFixed(2),
    h.estimatedWidthM.toFixed(2),
    h.estimatedHeightM.toFixed(2),
    h.shadowLengthM.toFixed(2),
    h.snrDb.toFixed(1),
    `"${dataset.metadata.auvId}"`,
    `"${dataset.metadata.surveyArea}"`,
    new Date().toISOString()
  ]);

  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `AQUORA_Debris_Report_${dataset.id}_${Date.now()}.csv`);
}

/**
 * Export to GeoJSON for GIS / QGIS software integration
 */
export function exportToGeoJSON(dataset: PresetDataset, hazards: SonarHazard[]) {
  const geojson = {
    type: 'FeatureCollection',
    name: `AQUORA_Hazards_${dataset.name}`,
    crs: {
      type: 'name',
      properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' }
    },
    features: hazards.map(h => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [h.longitude, h.latitude, -h.depthMeters]
      },
      properties: {
        id: h.id,
        category: h.category,
        severity: h.severity,
        confidence: h.confidence,
        channel: h.channel,
        lengthMeters: h.estimatedLengthM,
        widthMeters: h.estimatedWidthM,
        heightMeters: h.estimatedHeightM,
        snrDb: h.snrDb,
        survey: dataset.name
      }
    }))
  };

  const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/geo+json' });
  downloadBlob(blob, `AQUORA_Spatial_Hazards_${dataset.id}.geojson`);
}

/**
 * Export PDF Executive Summary Report using jsPDF
 */
export function exportToPDF(dataset: PresetDataset, hazards: SonarHazard[]) {
  const doc = new jsPDF();
  const timestamp = new Date().toLocaleString();

  // Header Banner
  doc.setFillColor(6, 11, 20); // Dark Ocean
  doc.rect(0, 0, 210, 35, 'F');
  
  doc.setTextColor(0, 229, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('AQUORA | AI Sonar Anomaly Detection Report', 14, 18);

  doc.setTextColor(148, 163, 184);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Ministry of Earth Sciences (MoES) - National Institute of Ocean Technology (NIOT)', 14, 26);
  doc.text(`Generated: ${timestamp}`, 145, 26);

  // Survey Overview Box
  doc.setLineWidth(0.5);
  doc.setDrawColor(0, 229, 255);
  doc.rect(14, 42, 182, 32);

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('SURVEY TELEMETRY & METADATA', 18, 50);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Survey Target: ${dataset.name}`, 18, 58);
  doc.text(`Location: ${dataset.location}`, 18, 64);
  doc.text(`AUV Unit: ${dataset.metadata.auvId}`, 18, 70);

  doc.text(`Frequency: ${dataset.metadata.pingFrequencyKhz} kHz`, 115, 58);
  doc.text(`Altitude: ${dataset.metadata.altitudeMeters} m`, 115, 64);
  doc.text(`Speed: ${dataset.metadata.speedKnots} kts | Resolution: ${dataset.metadata.resolutionCm} cm`, 115, 70);

  // Summary Metrics
  const criticalCount = hazards.filter(h => h.severity === 'CRITICAL').length;
  const highCount = hazards.filter(h => h.severity === 'HIGH').length;

  doc.setFillColor(241, 245, 249);
  doc.rect(14, 80, 182, 20, 'F');
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(220, 38, 38);
  doc.text(`TOTAL HAZARDS DETECTED: ${hazards.length}`, 18, 92);
  doc.text(`CRITICAL HAZARDS: ${criticalCount}`, 90, 92);
  doc.setTextColor(217, 119, 6);
  doc.text(`HIGH SEVERITY: ${highCount}`, 150, 92);

  // Table Headers
  let y = 112;
  doc.setFillColor(15, 23, 42);
  doc.rect(14, y - 6, 182, 8, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('ID', 16, y - 1);
  doc.text('CATEGORY', 42, y - 1);
  doc.text('SEVERITY', 78, y - 1);
  doc.text('CONF.', 102, y - 1);
  doc.text('LATITUDE', 120, y - 1);
  doc.text('LONGITUDE', 148, y - 1);
  doc.text('EST. L x W x H (m)', 174, y - 1);

  // Table Body
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);

  hazards.forEach((h, idx) => {
    if (y > 270) {
      doc.addPage();
      y = 20;
    }

    if (idx % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(14, y - 5, 182, 7, 'F');
    }

    doc.text(h.id, 16, y);
    doc.text(h.category, 42, y);
    doc.text(h.severity, 78, y);
    doc.text(`${h.confidence.toFixed(1)}%`, 102, y);
    doc.text(h.latitude.toFixed(5), 120, y);
    doc.text(h.longitude.toFixed(5), 148, y);
    doc.text(`${h.estimatedLengthM}x${h.estimatedWidthM}x${h.estimatedHeightM}`, 174, y);

    y += 8;
  });

  // Footer Note
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('AQUORA Side-Scan Sonar Automated Detection Pipeline - MoES / NIOT Competition Entry SIH2026', 14, 285);

  doc.save(`AQUORA_Executive_Report_${dataset.id}.pdf`);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
