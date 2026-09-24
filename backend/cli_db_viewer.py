"""
AQUORA Live Database Terminal Viewer & Connection Tool
Directly connects to MongoDB, lists active databases, collections, and inspects real-time documents.
"""

import sys
import os
import json

backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

import database

def main():
    print("=================================================================")
    print("        AQUORA MoES/NIOT Live MongoDB Terminal Viewer            ")
    print("=================================================================")
    
    status = database.check_db_status()
    if not status.get('connected'):
        print(f"[-] MongoDB Connection Failed: {status.get('error')}")
        return

    print(f"[+] Status:        CONNECTED & ONLINE")
    print(f"[+] MongoDB Host:  {status.get('host')}:{status.get('port')}")
    print(f"[+] Database:      {status.get('database')}")
    print(f"[+] Server Vers:   MongoDB v{status.get('version')}")
    print(f"[+] Ping Latency:  {status.get('latency_ms')} ms")
    print("-----------------------------------------------------------------")
    print("[+] Collections & Document Counts:")
    for coll, count in status.get('counts', {}).items():
        print(f"    [*] {coll.ljust(18)}: {count} documents")
    
    print("-----------------------------------------------------------------")
    print("[+] Recent Sonar Survey Missions in MongoDB:")
    surveys = database.get_surveys(limit=5)
    if not surveys:
        print("    (No surveys recorded yet)")
    for s in surveys:
        print(f"    - ID: {s.get('id')} | Area: {s.get('surveyArea')}")
        print(f"      Vessel: {s.get('vesselName')} | AUV: {s.get('auvId')} | Detections: {s.get('totalDetections')}")
        print(f"      Date: {s.get('formattedDate')} | Coords: {s.get('location')}")
        print()

    print("-----------------------------------------------------------------")
    print("[+] Classified Underwater Anomalies Sample:")
    anomalies = database.get_anomalies(limit=5)
    for a in anomalies:
        print(f"    - [{a.get('severity')}] {a.get('category')} (Confidence: {a.get('confidence')}%)")
        print(f"      Survey ID: {a.get('surveyId')} | Depth: {a.get('depthMeters')}m | Height: {a.get('estimatedHeightM')}m")
        print(f"      Coords: ({a.get('latitude')}, {a.get('longitude')})")
        print()

    print("=================================================================")
    print("To open directly in MongoDB Compass, run:")
    print('  Start-Process "C:\\Program Files\\MongoDB Compass\\MongoDBCompass.exe" -ArgumentList "mongodb://localhost:27017/aquora_db"')
    print("=================================================================")

if __name__ == '__main__':
    main()
