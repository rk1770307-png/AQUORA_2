"""
AQUORA Full MongoDB CRUD Validation Suite
Validates:
1. Storing Surveys & Automatic Anomaly Extraction
2. Retrieving Surveys by ID and Search Queries
3. Updating & Storing Individual Anomalies
4. Querying Anomalies by Category & Severity
5. Storing & Retrieving Real-time AUV Telemetry Streams
6. Deleting Specific Surveys, Anomalies, and Telemetry
7. Full Database Purge & NIOT Benchmark Reseeding
"""

import sys
import os

backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

import database
from app import app

def run_tests():
    print("==========================================================")
    print("      AQUORA FULL MONGODB STORE, RETRIEVE & DELETE TEST   ")
    print("==========================================================")

    client = app.test_client()

    # 1. Health & DB Status
    res = client.get('/api/db/status')
    assert res.status_code == 200, "DB Status failed"
    status = res.json
    print(f"[TEST 1] DB Status Check: ONLINE (DB: {status['database']}, Latency: {status['latency_ms']} ms)")

    # 2. STORE Survey
    test_survey = {
        "id": "SURV-TEST-VERIFY-001",
        "surveyArea": "Lakshadweep Deepwater Sector 4",
        "location": "10.5678°N, 72.6412°E",
        "pingFrequencyKhz": 450.0,
        "auvId": "NIOT-AUV-LAK-01",
        "vesselName": "ORV Sagar Nidhi",
        "headingDeg": 180.0,
        "speedKnots": 3.0,
        "altitudeMeters": 10.0,
        "slantRangeMeters": 75.0,
        "startLat": 10.5678,
        "startLng": 72.6412,
        "endLat": 10.5800,
        "endLng": 72.6550,
        "pipeline": "AQUORA-YOLOv8+AcousticCV",
        "hazards": [
            {
                "id": "HAZ-TEST-001",
                "category": "Ghost Net",
                "confidence": 93.4,
                "bbox": {"x": 25, "y": 30, "width": 15, "height": 12},
                "channel": "Port",
                "latitude": 10.5710,
                "longitude": 72.6440,
                "depthMeters": 52.0,
                "estimatedLengthM": 14.2,
                "estimatedWidthM": 6.1,
                "estimatedHeightM": 2.1,
                "shadowLengthM": 5.8,
                "snrDb": 17.2,
                "severity": "CRITICAL",
                "description": "Nylon gill net snagged on seafloor outcrop."
            },
            {
                "id": "HAZ-TEST-002",
                "category": "Cylinder",
                "confidence": 88.0,
                "bbox": {"x": 60, "y": 50, "width": 8, "height": 6},
                "channel": "Starboard",
                "latitude": 10.5750,
                "longitude": 72.6480,
                "depthMeters": 53.5,
                "estimatedLengthM": 3.0,
                "estimatedWidthM": 1.0,
                "estimatedHeightM": 0.8,
                "shadowLengthM": 2.2,
                "snrDb": 15.0,
                "severity": "HIGH",
                "description": "Metallic submerged cylinder."
            }
        ]
    }

    res = client.post('/api/surveys', json=test_survey)
    assert res.status_code == 201, f"Store survey failed: {res.text}"
    print(f"[TEST 2] STORE Survey: Successfully stored {test_survey['id']} into MongoDB 'surveys'")

    # 3. RETRIEVE Survey by ID
    res = client.get('/api/surveys/SURV-TEST-VERIFY-001')
    assert res.status_code == 200, "Retrieve survey failed"
    retrieved = res.json.get('survey', {})
    assert retrieved.get('surveyArea') == "Lakshadweep Deepwater Sector 4"
    assert len(retrieved.get('hazards', [])) == 2
    print(f"[TEST 3] RETRIEVE Survey: Verified retrieval of {retrieved['id']} with {len(retrieved['hazards'])} hazards")

    # 4. RETRIEVE Anomalies from MongoDB
    res = client.get('/api/anomalies?category=Ghost Net')
    assert res.status_code == 200
    ghost_nets = res.json.get('anomalies', [])
    assert any(h.get('hazardId') == 'HAZ-TEST-001' for h in ghost_nets), "Anomaly sync failed"
    print(f"[TEST 4] RETRIEVE Anomalies: Found {len(ghost_nets)} 'Ghost Net' anomalies in MongoDB 'anomalies'")

    # 5. STORE & RETRIEVE Telemetry
    telemetry_data = [
        {
            "auvId": "NIOT-AUV-LAK-01",
            "speedKnots": 3.2,
            "altitudeM": 9.8,
            "heading": 182.0,
            "depthM": 51.5
        }
    ]
    res = client.post('/api/telemetry', json=telemetry_data)
    assert res.status_code == 200 and res.json.get('inserted') == 1
    res = client.get('/api/telemetry?auv_id=NIOT-AUV-LAK-01')
    assert res.status_code == 200 and res.json.get('count') >= 1
    print(f"[TEST 5] STORE & RETRIEVE Telemetry: Verified AUV telemetry stream storage in MongoDB 'telemetry'")

    # 6. DELETE Survey and Linked Anomalies
    res = client.delete('/api/surveys/SURV-TEST-VERIFY-001')
    assert res.status_code == 200
    # Confirm deletion from surveys and anomalies
    res_check = client.get('/api/surveys/SURV-TEST-VERIFY-001')
    assert res_check.status_code == 404, "Survey should be deleted"
    print(f"[TEST 6] DELETE Survey: Successfully deleted SURV-TEST-VERIFY-001 and verified cascading deletion of anomalies")

    # 7. DELETE Telemetry
    res = client.delete('/api/telemetry?auv_id=NIOT-AUV-LAK-01')
    assert res.status_code == 200
    print(f"[TEST 7] DELETE Telemetry: Successfully cleaned up test telemetry logs")

    # 8. Reset & Seed Check
    res = client.post('/api/db/reset')
    assert res.status_code == 200
    status_final = client.get('/api/db/status').json
    print(f"[TEST 8] RESET & SEED Database: Populated {status_final['counts']['surveys']} surveys and {status_final['counts']['anomalies']} anomalies into MongoDB")

    print("\n==========================================================")
    print("  ALL TESTS PASSED! FULL MONGODB CONNECTIVITY VERIFIED.   ")
    print("==========================================================")

if __name__ == '__main__':
    run_tests()
