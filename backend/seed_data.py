"""
AQUORA MongoDB Seeder & Verification Tool
Seeds MoES / NIOT sonar missions, underwater hazards, acoustic anomalies, and telemetry into MongoDB.
"""

import sys
import os

# Ensure backend directory is in python path
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

import database

def main():
    print("==================================================")
    print("    AQUORA MoES/NIOT MongoDB Integration Suite    ")
    print("==================================================")
    print(f"Connecting to MongoDB at: {database.MONGODB_URI}")
    print(f"Target Database: {database.DB_NAME}\n")

    status = database.check_db_status()
    if not status.get('connected'):
        print(f"[-] MongoDB Connection FAILED: {status.get('error')}")
        print("Please ensure MongoDB is running ('Get-Service MongoDB').")
        sys.exit(1)

    print(f"[+] MongoDB ONLINE! Version: {status.get('version')}, Ping Latency: {status.get('latency_ms')} ms")
    print(f"[+] Current Collection Counts:")
    for k, v in status.get('counts', {}).items():
        print(f"    - {k}: {v}")

    print("\n[+] Seeding realistic NIOT deep-sea surveys and classified acoustic anomalies...")
    database.clear_all_surveys()
    count = database.seed_default_missions_if_empty()
    print(f"[+] Successfully populated {count} survey missions into '{database.DB_NAME}'.")

    # Ingest sample telemetry stream
    sample_telemetry = [
        {
            "auvId": "NIOT-AUV-EXPLORER-04",
            "vessel": "ORV Sagar Nidhi",
            "mission": "Track-Alpha-Coral-Conservation",
            "heading": 142.5,
            "speedKnots": 2.8,
            "altitudeM": 12.4,
            "slantRangeM": 75.0,
            "latitude": 13.1033,
            "longitude": 80.3792,
            "pingFrequencyKhz": 450.0,
            "depthM": 48.0
        },
        {
            "auvId": "NIOT-AUV-SEABED-02",
            "vessel": "BTV Sagar Kanya",
            "mission": "Rameswaram-Subsea-Corridor",
            "heading": 218.0,
            "speedKnots": 3.2,
            "altitudeM": 8.6,
            "slantRangeM": 50.0,
            "latitude": 9.2083,
            "longitude": 79.2528,
            "pingFrequencyKhz": 900.0,
            "depthM": 62.0
        }
    ]
    t_count = database.log_telemetry_batch(sample_telemetry)
    print(f"[+] Ingested {t_count} AUV telemetry log entries.")

    updated_status = database.check_db_status()
    print(f"\n[+] Updated Database State in '{database.DB_NAME}':")
    for k, v in updated_status.get('counts', {}).items():
        print(f"    - {k}: {v}")

    print("\n==================================================")
    print("Database is ready! You can now view these in MongoDB Compass:")
    print("  Connection string: mongodb://localhost:27017")
    print(f"  Database: {database.DB_NAME}")
    print("  Collections: surveys, anomalies, telemetry, processing_logs")
    print("==================================================")

if __name__ == '__main__':
    main()
