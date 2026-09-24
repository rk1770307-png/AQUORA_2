"""
AQUORA MongoDB Integration Module
MoES / NIOT Autonomous Underwater Vehicle (AUV) Acoustic Survey Storage

Handles persistent storage for:
- Survey records and mission metadata
- Detected underwater hazards & anomalies (ghost nets, pipelines, cylinders, shipwrecks)
- Telemetry logs (AUV altitude, slant range, GPS tracklines, heading, speed)
- Processing run audit metrics
"""

import os
import time
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
import pymongo
from pymongo import MongoClient, ASCENDING, DESCENDING
from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError

# Environment configuration
MONGODB_URI = os.environ.get('MONGODB_URI', 'mongodb://localhost:27017/')
DB_NAME = os.environ.get('MONGODB_DB_NAME', 'AQUORA_Project')
TARGET_DBS = ['AQUORA_Project', 'AQUORA', 'aquora_db']

_client: Optional[MongoClient] = None
_db = None


def get_client() -> MongoClient:
    """Return or initialize thread-safe MongoClient instance."""
    global _client
    if _client is None:
        _client = MongoClient(
            MONGODB_URI,
            appname="AQUORA_Sonar_Engine",
            serverSelectionTimeoutMS=3000,
            connectTimeoutMS=3000,
            socketTimeoutMS=5000,
            maxPoolSize=50,
            retryWrites=True
        )
    return _client


def get_db():
    """Return the primary AQUORA database handle with ensured indexes."""
    global _db
    if _db is None:
        client = get_client()
        _db = client[DB_NAME]
        _ensure_indexes(_db)
    return _db


def get_all_dbs():
    """Return all target database handles (AQUORA_Project, AQUORA, aquora_db) so all are always in sync."""
    client = get_client()
    dbs = [client[name] for name in TARGET_DBS]
    for d in dbs:
        _ensure_indexes(d)
    return dbs


def _ensure_indexes(db):
    """Create optimal indexes and ensure permanent project_info document."""
    try:
        # Permanent project_info document ensures MongoDB NEVER auto-drops this database
        db.project_info.replace_one(
            {'project': 'AQUORA'},
            {
                'project': 'AQUORA',
                'name': 'AQUORA Deep-Sea Sonar Anomaly Platform',
                'organization': 'MoES / NIOT',
                'status': 'ACTIVE',
                'version': '1.0.0-SIH2026'
            },
            upsert=True
        )

        # Surveys collection indexes
        db.surveys.create_index([("id", ASCENDING)], unique=True)
        db.surveys.create_index([("timestamp", DESCENDING)])
        db.surveys.create_index([("surveyArea", ASCENDING)])
        db.surveys.create_index([("auvId", ASCENDING)])
        db.surveys.create_index([("vesselName", ASCENDING)])

        # Anomalies collection indexes
        db.anomalies.create_index([("surveyId", ASCENDING)])
        db.anomalies.create_index([("category", ASCENDING)])
        db.anomalies.create_index([("severity", ASCENDING)])
        db.anomalies.create_index([("confidence", DESCENDING)])
        db.anomalies.create_index([("latitude", ASCENDING), ("longitude", ASCENDING)])

        # Telemetry & processing logs indexes
        db.telemetry.create_index([("timestamp", DESCENDING)])
        db.processing_logs.create_index([("timestamp", DESCENDING)])
    except Exception as e:
        print(f"[AQUORA-DB] Warning initializing indexes: {e}")


def check_db_status() -> Dict[str, Any]:
    """Check MongoDB health, ping latency, and collection stats."""
    start = time.time()
    try:
        client = get_client()
        # Ping the server
        client.admin.command('ping')
        latency_ms = round((time.time() - start) * 1000, 2)
        db = get_db()
        server_info = client.server_info()

        surveys_count = db.surveys.count_documents({})
        anomalies_count = db.anomalies.count_documents({})
        telemetry_count = db.telemetry.count_documents({})
        logs_count = db.processing_logs.count_documents({})

        return {
            'connected': True,
            'status': 'ONLINE',
            'database': DB_NAME,
            'host': client.address[0] if client.address else 'localhost',
            'port': client.address[1] if client.address else 27017,
            'version': server_info.get('version', 'unknown'),
            'latency_ms': latency_ms,
            'counts': {
                'surveys': surveys_count,
                'anomalies': anomalies_count,
                'telemetry': telemetry_count,
                'processing_logs': logs_count,
            },
            'collections': db.list_collection_names()
        }
    except (ConnectionFailure, ServerSelectionTimeoutError) as e:
        return {
            'connected': False,
            'status': 'OFFLINE',
            'database': DB_NAME,
            'error': str(e),
            'counts': {'surveys': 0, 'anomalies': 0, 'telemetry': 0, 'processing_logs': 0}
        }
    except Exception as e:
        return {
            'connected': False,
            'status': 'ERROR',
            'database': DB_NAME,
            'error': str(e),
            'counts': {'surveys': 0, 'anomalies': 0, 'telemetry': 0, 'processing_logs': 0}
        }


def _clean_doc(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Convert MongoDB _id to string for JSON serialization."""
    if not doc:
        return doc
    clean = dict(doc)
    if '_id' in clean:
        clean['_id'] = str(clean['_id'])
    return clean


def save_survey(survey_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Save or update a survey record in MongoDB.
    Also syncs individual detections into the 'anomalies' collection.
    """
    db = get_db()

    survey_id = survey_data.get('id')
    if not survey_id:
        now = datetime.now(timezone.utc)
        rand = os.urandom(2).hex().upper()
        survey_id = f"SURV-{now.strftime('%Y%m%d')}-{rand}"
        survey_data['id'] = survey_id

    if 'timestamp' not in survey_data or not survey_data['timestamp']:
        survey_data['timestamp'] = datetime.now(timezone.utc).isoformat()

    if 'formattedDate' not in survey_data or not survey_data['formattedDate']:
        survey_data['formattedDate'] = datetime.now().strftime("%b %d, %Y, %I:%M %p")

    hazards = survey_data.get('hazards', [])
    survey_data['totalDetections'] = len(hazards)

    # Compute priority counts if not present
    if 'priorityCounts' not in survey_data or not survey_data['priorityCounts']:
        counts = {'critical': 0, 'high': 0, 'medium': 0, 'low': 0}
        for h in hazards:
            sev = str(h.get('severity', '')).upper()
            if sev == 'CRITICAL':
                counts['critical'] += 1
            elif sev == 'HIGH':
                counts['high'] += 1
            elif sev == 'MEDIUM':
                counts['medium'] += 1
            else:
                counts['low'] += 1
        survey_data['priorityCounts'] = counts

    # Upsert survey into all target MongoDB databases
    survey_data['updatedAt'] = datetime.now(timezone.utc).isoformat()
    anomaly_docs = []
    if hazards:
        for h in hazards:
            anomaly_docs.append({
                'surveyId': survey_id,
                'hazardId': h.get('id'),
                'category': h.get('category'),
                'confidence': h.get('confidence'),
                'bbox': h.get('bbox'),
                'channel': h.get('channel'),
                'latitude': h.get('latitude'),
                'longitude': h.get('longitude'),
                'depthMeters': h.get('depthMeters'),
                'estimatedLengthM': h.get('estimatedLengthM'),
                'estimatedWidthM': h.get('estimatedWidthM'),
                'estimatedHeightM': h.get('estimatedHeightM'),
                'shadowLengthM': h.get('shadowLengthM'),
                'snrDb': h.get('snrDb'),
                'severity': h.get('severity'),
                'description': h.get('description'),
                'timestamp': survey_data.get('timestamp')
            })

    for d in get_all_dbs():
        try:
            d.surveys.update_one(
                {'id': survey_id},
                {'$set': survey_data},
                upsert=True
            )
            d.anomalies.delete_many({'surveyId': survey_id})
            if anomaly_docs:
                d.anomalies.insert_many([dict(doc) for doc in anomaly_docs])
        except Exception as e:
            print(f"[AQUORA-DB] Sync error on {d.name}: {e}")

    saved = db.surveys.find_one({'id': survey_id})
    return _clean_doc(saved) if saved else survey_data


def get_surveys(limit: int = 100, skip: int = 0, query: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    """Retrieve surveys sorted by newest first."""
    db = get_db()
    q = query or {}
    cursor = db.surveys.find(q).sort("timestamp", DESCENDING).skip(skip).limit(limit)
    return [_clean_doc(doc) for doc in cursor]


def get_survey_by_id(survey_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve single survey by ID."""
    db = get_db()
    doc = db.surveys.find_one({'id': survey_id})
    return _clean_doc(doc) if doc else None


def delete_survey(survey_id: str) -> bool:
    """Delete a survey and its associated anomalies from all databases."""
    deleted_count = 0
    for d in get_all_dbs():
        res = d.surveys.delete_one({'id': survey_id})
        d.anomalies.delete_many({'surveyId': survey_id})
        deleted_count += res.deleted_count
    return deleted_count > 0


def clear_all_surveys() -> int:
    """Delete all surveys and anomalies from all databases."""
    total = 0
    for d in get_all_dbs():
        res = d.surveys.delete_many({})
        d.anomalies.delete_many({})
        total += res.deleted_count
    return total


def get_anomalies(
    category: Optional[str] = None,
    severity: Optional[str] = None,
    min_confidence: Optional[float] = None,
    limit: int = 200
) -> List[Dict[str, Any]]:
    """Query anomalies across all surveys."""
    db = get_db()
    q: Dict[str, Any] = {}
    if category and category != 'All':
        q['category'] = category
    if severity and severity != 'All':
        q['severity'] = severity.upper()
    if min_confidence is not None:
        q['confidence'] = {'$gte': float(min_confidence)}

    cursor = db.anomalies.find(q).sort("confidence", DESCENDING).limit(limit)
    return [_clean_doc(doc) for doc in cursor]


def log_telemetry_batch(telemetry_records: List[Dict[str, Any]]) -> int:
    """Ingest AUV telemetry sensor readings."""
    if not telemetry_records:
        return 0
    db = get_db()
    for rec in telemetry_records:
        if 'timestamp' not in rec:
            rec['timestamp'] = datetime.now(timezone.utc).isoformat()
    res = db.telemetry.insert_many(telemetry_records)
    return len(res.inserted_ids)


def log_processing_run(run_metadata: Dict[str, Any]) -> str:
    """Log an execution of the sonar processing engine."""
    db = get_db()
    doc = dict(run_metadata)
    doc['timestamp'] = datetime.now(timezone.utc).isoformat()
    res = db.processing_logs.insert_one(doc)
    return str(res.inserted_id)


def seed_default_missions_if_empty() -> int:
    """
    Seeds initial realistic MoES / NIOT underwater mission surveys if database is empty.
    Ensures immediate data visibility in MongoDB Compass and dashboard.
    """
    try:
        db = get_db()
        if db.surveys.count_documents({}) > 0:
            return 0

        seed_data = [
            {
                "id": "SURV-20260901-ALPHA",
                "timestamp": "2026-09-01T08:30:00Z",
                "formattedDate": "Sep 01, 2026, 08:30 AM",
                "surveyArea": "Bay of Bengal - Coral Conservation Block B",
                "location": "13°06'12\"N, 80°22'45\"E (Off Chennai Coast)",
                "pingFrequencyKhz": 450.0,
                "auvId": "NIOT-AUV-EXPLORER-04",
                "vesselName": "ORV Sagar Nidhi",
                "headingDeg": 142.5,
                "speedKnots": 2.8,
                "altitudeMeters": 12.4,
                "slantRangeMeters": 75.0,
                "startLat": 13.1033,
                "startLng": 80.3792,
                "endLat": 13.1185,
                "endLng": 80.3920,
                "pipeline": "AQUORA-YOLOv8+AcousticCV",
                "hazards": [
                    {
                        "id": "HAZ-BOB-001",
                        "category": "Ghost Net",
                        "confidence": 94.8,
                        "bbox": {"x": 18, "y": 28, "width": 14, "height": 12},
                        "channel": "Port",
                        "latitude": 13.1054,
                        "longitude": 80.3812,
                        "depthMeters": 48.2,
                        "estimatedLengthM": 18.5,
                        "estimatedWidthM": 8.2,
                        "estimatedHeightM": 2.4,
                        "shadowLengthM": 6.8,
                        "snrDb": 18.4,
                        "severity": "CRITICAL",
                        "description": "Large discarded nylon monofilament gill net entangled around submerged rock outcrop.",
                        "acousticHighlightScore": 0.96,
                        "shadowMatchScore": 0.92
                    },
                    {
                        "id": "HAZ-BOB-002",
                        "category": "Cylinder",
                        "confidence": 89.2,
                        "bbox": {"x": 72, "y": 65, "width": 8, "height": 6},
                        "channel": "Starboard",
                        "latitude": 13.1120,
                        "longitude": 80.3875,
                        "depthMeters": 49.5,
                        "estimatedLengthM": 3.2,
                        "estimatedWidthM": 1.1,
                        "estimatedHeightM": 0.9,
                        "shadowLengthM": 2.5,
                        "snrDb": 15.8,
                        "severity": "HIGH",
                        "description": "Metallic pressure vessel/cylinder resting on sandy bottom with strong specular return.",
                        "acousticHighlightScore": 0.91,
                        "shadowMatchScore": 0.88
                    },
                    {
                        "id": "HAZ-BOB-003",
                        "category": "Ghost Net",
                        "confidence": 87.5,
                        "bbox": {"x": 62, "y": 20, "width": 11, "height": 9},
                        "channel": "Starboard",
                        "latitude": 13.1145,
                        "longitude": 80.3898,
                        "depthMeters": 47.8,
                        "estimatedLengthM": 12.0,
                        "estimatedWidthM": 6.4,
                        "estimatedHeightM": 1.8,
                        "shadowLengthM": 4.9,
                        "snrDb": 14.2,
                        "severity": "HIGH",
                        "description": "Trawl net bundle caught on natural marine ridge.",
                        "acousticHighlightScore": 0.88,
                        "shadowMatchScore": 0.85
                    }
                ]
            },
            {
                "id": "SURV-20260905-BETA",
                "timestamp": "2026-09-05T14:15:00Z",
                "formattedDate": "Sep 05, 2026, 02:15 PM",
                "surveyArea": "Gulf of Mannar Pipeline & Industrial Scrap Corridor",
                "location": "09°12'30\"N, 79°15'10\"E (Rameswaram Trench)",
                "pingFrequencyKhz": 900.0,
                "auvId": "NIOT-AUV-SEABED-02",
                "vesselName": "BTV Sagar Kanya",
                "headingDeg": 218.0,
                "speedKnots": 3.2,
                "altitudeMeters": 8.6,
                "slantRangeMeters": 50.0,
                "startLat": 9.2083,
                "startLng": 79.2528,
                "endLat": 9.2215,
                "endLng": 79.2680,
                "pipeline": "AQUORA-YOLOv8+AcousticCV",
                "hazards": [
                    {
                        "id": "HAZ-GOM-001",
                        "category": "Subsea Pipe",
                        "confidence": 96.2,
                        "bbox": {"x": 10, "y": 38, "width": 80, "height": 8},
                        "channel": "Port",
                        "latitude": 9.2120,
                        "longitude": 79.2560,
                        "depthMeters": 62.4,
                        "estimatedLengthM": 45.0,
                        "estimatedWidthM": 1.4,
                        "estimatedHeightM": 1.4,
                        "shadowLengthM": 5.2,
                        "snrDb": 22.1,
                        "severity": "CRITICAL",
                        "description": "Exposed section of 24-inch unburied subsea pipeline spanning acoustic swath.",
                        "acousticHighlightScore": 0.98,
                        "shadowMatchScore": 0.95
                    },
                    {
                        "id": "HAZ-GOM-002",
                        "category": "Cylinder",
                        "confidence": 91.0,
                        "bbox": {"x": 48, "y": 72, "width": 7, "height": 6},
                        "channel": "Starboard",
                        "latitude": 9.2175,
                        "longitude": 79.2625,
                        "depthMeters": 63.8,
                        "estimatedLengthM": 2.8,
                        "estimatedWidthM": 0.9,
                        "estimatedHeightM": 0.8,
                        "shadowLengthM": 2.9,
                        "snrDb": 16.9,
                        "severity": "HIGH",
                        "description": "Submerged compressed gas bottle / mooring buoyancy sphere.",
                        "acousticHighlightScore": 0.93,
                        "shadowMatchScore": 0.89
                    }
                ]
            },
            {
                "id": "SURV-20260908-GAMMA",
                "timestamp": "2026-09-08T11:45:00Z",
                "formattedDate": "Sep 08, 2026, 11:45 AM",
                "surveyArea": "Andaman Subduction Trench Deep Archaeological Sector",
                "location": "11°38'05\"N, 92°44'20\"E (Port Blair Outer Shelf)",
                "pingFrequencyKhz": 300.0,
                "auvId": "NIOT-AUV-DEEPOCEAN-01",
                "vesselName": "ORV Sagar Nidhi",
                "headingDeg": 045.0,
                "speedKnots": 2.2,
                "altitudeMeters": 15.0,
                "slantRangeMeters": 100.0,
                "startLat": 11.6347,
                "startLng": 92.7389,
                "endLat": 11.6492,
                "endLng": 92.7540,
                "pipeline": "AQUORA-YOLOv8+AcousticCV",
                "hazards": [
                    {
                        "id": "HAZ-AND-001",
                        "category": "Shipwreck",
                        "confidence": 95.5,
                        "bbox": {"x": 35, "y": 30, "width": 32, "height": 22},
                        "channel": "Port",
                        "latitude": 11.6390,
                        "longitude": 92.7445,
                        "depthMeters": 142.0,
                        "estimatedLengthM": 38.0,
                        "estimatedWidthM": 11.5,
                        "estimatedHeightM": 5.8,
                        "shadowLengthM": 19.4,
                        "snrDb": 24.5,
                        "severity": "CRITICAL",
                        "description": "Historic wooden/steel cargo hull resting list 15 deg to port with massive acoustic shadow.",
                        "acousticHighlightScore": 0.97,
                        "shadowMatchScore": 0.96
                    },
                    {
                        "id": "HAZ-AND-002",
                        "category": "Aircraft Debris",
                        "confidence": 88.4,
                        "bbox": {"x": 78, "y": 55, "width": 12, "height": 10},
                        "channel": "Starboard",
                        "latitude": 11.6440,
                        "longitude": 92.7490,
                        "depthMeters": 145.2,
                        "estimatedLengthM": 7.4,
                        "estimatedWidthM": 3.8,
                        "estimatedHeightM": 1.9,
                        "shadowLengthM": 6.2,
                        "snrDb": 17.6,
                        "severity": "HIGH",
                        "description": "Fragmented swept-wing spar structure protruding from silt sediment.",
                        "acousticHighlightScore": 0.90,
                        "shadowMatchScore": 0.87
                    }
                ]
            }
        ]

        inserted = 0
        for s in seed_data:
            save_survey(s)
            inserted += 1

        print(f"[AQUORA-DB] Seeded {inserted} initial surveys into MongoDB '{DB_NAME}'.")
        return inserted
    except Exception as e:
        print(f"[AQUORA-DB] Error seeding initial surveys: {e}")
        return 0


def get_telemetry(auv_id: Optional[str] = None, limit: int = 100) -> List[Dict[str, Any]]:
    """Retrieve telemetry log entries."""
    db = get_db()
    q = {}
    if auv_id:
        q['auvId'] = auv_id
    cursor = db.telemetry.find(q).sort("timestamp", DESCENDING).limit(limit)
    return [_clean_doc(doc) for doc in cursor]


def delete_telemetry(auv_id: Optional[str] = None) -> int:
    """Delete telemetry logs."""
    db = get_db()
    q = {'auvId': auv_id} if auv_id else {}
    res = db.telemetry.delete_many(q)
    return res.deleted_count


def save_anomaly(anomaly_data: Dict[str, Any]) -> Dict[str, Any]:
    """Insert or update single classified anomaly across all mirrored databases."""
    hazard_id = anomaly_data.get('id') or anomaly_data.get('hazardId')
    if not hazard_id:
        hazard_id = f"HAZ-{int(time.time()*1000)}"
    anomaly_data['hazardId'] = hazard_id
    anomaly_data['id'] = hazard_id
    anomaly_data['updatedAt'] = datetime.now(timezone.utc).isoformat()

    primary_doc = None
    for d in get_all_dbs():
        d.anomalies.update_one(
            {'$or': [{'hazardId': hazard_id}, {'id': hazard_id}]},
            {'$set': anomaly_data},
            upsert=True
        )
        if primary_doc is None:
            primary_doc = d.anomalies.find_one({'$or': [{'hazardId': hazard_id}, {'id': hazard_id}]})
    return _clean_doc(primary_doc) if primary_doc else anomaly_data


def delete_anomaly(hazard_id: str) -> bool:
    """Delete a single anomaly by ID across all databases."""
    deleted = 0
    for d in get_all_dbs():
        res = d.anomalies.delete_one({'$or': [{'hazardId': hazard_id}, {'id': hazard_id}]})
        deleted += res.deleted_count
    return deleted > 0


def clear_all_data() -> Dict[str, int]:
    """Purge all data across all collections in the database."""
    db = get_db()
    s = db.surveys.delete_many({}).deleted_count
    a = db.anomalies.delete_many({}).deleted_count
    t = db.telemetry.delete_many({}).deleted_count
    p = db.processing_logs.delete_many({}).deleted_count
    return {'surveys': s, 'anomalies': a, 'telemetry': t, 'processing_logs': p}


def reset_database_to_defaults() -> Dict[str, Any]:
    """Wipe and re-seed default NIOT acoustic missions."""
    clear_all_data()
    count = seed_default_missions_if_empty()
    status = check_db_status()
    return {'reseeded_surveys': count, 'status': status}
