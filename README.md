# AQUORA — AI Automated Underwater Marine Debris & Sonar Anomaly System
### Smart India Hackathon (SIH 2026) | Problem ID #26057 | MoES / NIOT

AQUORA is an intelligent deep-sea acoustic analytics and survey platform developed for the **Ministry of Earth Sciences (MoES)** and the **National Institute of Ocean Technology (NIOT)**. It processes dual-channel side-scan sonar imagery, detects underwater marine debris (ghost nets, subsea pipelines, cylinders, shipwrecks, aircraft debris), calculates acoustic shadow trigonometry for height estimations, and geotags anomalies on an interactive Leaflet ocean GIS map.

---

## 🗄️ MongoDB Database Integration

AQUORA is configured with a persistent MongoDB database (`aquora_db`) storing:
- **`surveys`**: Side-scan sonar survey missions, AUV metadata, bounding boxes, priority counts, and summaries.
- **`anomalies`**: Granular detected hazards (ghost nets, pipelines, cylinders) with acoustic shadow lengths, derived heights, SNR, and GPS coordinates.
- **`telemetry`**: AUV navigation logs (altitude, slant range, speed, heading, ping frequencies).
- **`processing_logs`**: YOLOv8 + Acoustic CV pipeline execution audit logs.

### Connecting with MongoDB Compass
1. Launch **MongoDB Compass** on your PC.
2. In the connection URI, enter:
   ```text
   mongodb://localhost:27017
   ```
3. Click **Connect**.
4. In the left database navigation pane, select **`aquora_db`**.
5. Explore the collections:
   - `surveys`
   - `anomalies`
   - `telemetry`
   - `processing_logs`

---

## 🚀 Running AQUORA

### 1. One-Click Launch (Batch Script)
Double-click `run.bat` or run:
```cmd
run.bat
```
This automatically starts:
- **Backend API & MongoDB Sync:** `http://localhost:5000`
- **Frontend Web UI:** `http://localhost:5173`

### 2. Manual Launch

#### Python Backend
```powershell
cd backend
.venv\Scripts\activate
python app.py
```

#### Vite Frontend
```powershell
npm run dev
```

### 3. Database Utility & Seed Script
To re-seed or verify MongoDB status:
```powershell
backend\.venv\Scripts\python.exe backend\seed_data.py
```

---

## 🛠️ Technology Stack
- **AI / Acoustic Computer Vision**: YOLOv8 (`ultralytics`), OpenCV (`cv2`), SciPy, NumPy
- **Backend**: Python 3.12, Flask, PyMongo 4.18, Flask-CORS
- **Database**: MongoDB 8.3.7 Server + MongoDB Compass
- **Frontend**: React 18, Vite, TypeScript, TailwindCSS, Lucide Icons, Leaflet GIS
