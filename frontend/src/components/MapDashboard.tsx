import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { SonarHazard, PresetDataset, getMaterialType, getMaterialStyle } from '../types';
import { MapPin, Navigation } from 'lucide-react';

interface MapDashboardProps {
  dataset: PresetDataset;
  hazards: SonarHazard[];
  onSelectHazard: (hazard: SonarHazard) => void;
  selectedHazardId: string | null;
}

export const MapDashboard: React.FC<MapDashboardProps> = ({
  dataset,
  hazards,
  onSelectHazard,
  selectedHazardId
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersGroupRef = useRef<L.LayerGroup | null>(null);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [13.1, 80.38],
      zoom: 13,
      zoomControl: true
    });

    // ArcGIS World Imagery / Satellite Ocean view
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: '&copy; Esri, Maxar, Earthstar Geographics &amp; NIOT Marine Survey',
      maxZoom: 18
    }).addTo(map);

    markersGroupRef.current = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      markersGroupRef.current = null;
    };
  }, []);

  // Update center, trackline & hazard markers when dataset or hazards change
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersGroup = markersGroupRef.current;
    if (!map || !markersGroup) return;

    // Clear existing markers & tracklines
    markersGroup.clearLayers();

    const mapCenter: [number, number] = [
      (dataset.metadata.startLat + dataset.metadata.endLat) / 2,
      (dataset.metadata.startLng + dataset.metadata.endLng) / 2
    ];
    map.setView(mapCenter, 13);

    // Draw trackline
    const tracklinePoints: [number, number][] = [
      [dataset.metadata.startLat, dataset.metadata.startLng],
      [dataset.metadata.endLat, dataset.metadata.endLng]
    ];
    L.polyline(tracklinePoints, {
      color: '#00E5FF',
      weight: 3,
      dashArray: '6, 6',
      opacity: 0.8
    }).addTo(markersGroup);

    // Add Start/End AUV markers
    L.circleMarker([dataset.metadata.startLat, dataset.metadata.startLng], {
      radius: 6,
      color: '#00FF9D',
      fillColor: '#00FF9D',
      fillOpacity: 1
    }).bindPopup('<b>AUV Start Point</b>').addTo(markersGroup);

    // Add Hazard Pins
    hazards.forEach(h => {
      const isSelected = h.id === selectedHazardId;
      const mat = h.materialType || getMaterialType(h.category);
      const style = getMaterialStyle(mat);
      const color = isSelected ? '#00E5FF' : style.accentColor;

      const html = `
        <div style="
          width: ${isSelected ? '28px' : '22px'};
          height: ${isSelected ? '28px' : '22px'};
          background-color: ${color};
          border: 2px solid #060B14;
          border-radius: 50%;
          box-shadow: 0 0 14px ${color};
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          cursor: pointer;
        ">
          ${style.icon}
        </div>
      `;

      const customIcon = L.divIcon({
        html,
        className: 'custom-sonar-marker',
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });

      const marker = L.marker([h.latitude, h.longitude], { icon: customIcon });

      const popupContent = `
        <div style="font-family: monospace; font-size: 11px; color: #F1F5F9; padding: 4px;">
          <div style="display:flex; justify-content:space-between; border-bottom:1px solid #334155; padding-bottom:4px; margin-bottom:4px;">
            <strong style="color:${style.accentColor};">${h.id}</strong>
            <span style="background:#092e38; color:#00E5FF; padding:1px 5px; border-radius:3px; font-weight:bold;">${h.confidence}% CONF</span>
          </div>
          <div><strong>Material:</strong> ${style.icon} ${mat.toUpperCase()}</div>
          <div><strong>Classification:</strong> ${h.category}</div>
          <div><strong>Coordinates:</strong> ${h.latitude.toFixed(5)}N, ${h.longitude.toFixed(5)}E</div>
          <div><strong>Depth:</strong> ${h.depthMeters}m</div>
          <div><strong>Est Size:</strong> ${h.estimatedLengthM}m × ${h.estimatedWidthM}m</div>
          <div><strong>Shadow Height:</strong> ${h.estimatedHeightM}m</div>
          <div style="font-style:italic; color:#94A3B8; margin-top:4px;">${h.description}</div>
        </div>
      `;

      marker.bindPopup(popupContent);
      marker.on('click', () => onSelectHazard(h));
      marker.addTo(markersGroup);
    });
  }, [dataset, hazards, selectedHazardId, onSelectHazard]);

  return (
    <div className="glass-panel rounded-xl p-4 flex flex-col gap-3 h-full border border-cyan-500/20 shadow-xl">
      {/* Header Bar */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-cyan-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider font-mono text-slate-200">
            Geotagged Spatial Map & AUV Trackline
          </h3>
        </div>

        <div className="flex items-center gap-3 font-mono text-[11px] text-slate-400">
          <span className="flex items-center gap-1 text-slate-300">
            <Navigation className="w-3 h-3 text-cyan-400 rotate-[45deg]" />
            Heading: <strong className="text-cyan-300">{dataset.metadata.headingDeg}°</strong>
          </span>
          <span>
            AUV Altitude: <strong className="text-emerald-400">{dataset.metadata.altitudeMeters}m</strong>
          </span>
        </div>
      </div>

      {/* Leaflet Map DOM Container */}
      <div className="relative overflow-hidden rounded-lg border border-slate-800 h-[360px] w-full">
        <div ref={mapContainerRef} className="h-full w-full rounded-lg" />

        {/* Legend */}
        <div className="absolute bottom-3 left-3 z-[1000] bg-slate-950/90 border border-slate-800 p-2.5 rounded-lg text-[11px] font-mono text-slate-300 flex flex-col gap-1 shadow-lg">
          <div className="font-bold text-cyan-400 mb-0.5 text-[10px] uppercase">Acoustic Material Legend</div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-[0_0_6px_#f59e0b]"></span>
            <span>🧲 Iron / Metal Scrap & Pipes</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_6px_#06b6d4]"></span>
            <span>🧴 Plastic Marine Debris</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#10b981]"></span>
            <span>🕸️ Wet Debris & Ghost Nets</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-400 shadow-[0_0_6px_#a855f7]"></span>
            <span>⚠️ Seafloor Anomalies</span>
          </div>
        </div>
      </div>
    </div>
  );
};
