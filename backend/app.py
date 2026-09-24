import os
import time
import cv2
import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS
from sonar_processor import SonarProcessor
import database

app = Flask(__name__)
CORS(app)

# Seed default missions on startup if MongoDB is fresh
try:
    database.seed_default_missions_if_empty()
except Exception as e:
    print(f"[AQUORA-INIT] Note: Could not auto-seed database: {e}")


@app.route('/api/health', methods=['GET'])
def health_check():
    db_status = database.check_db_status()
    return jsonify({
        'status': 'ONLINE',
        'system': 'AQUORA Python Sonar Processing Backend',
        'version': '1.0.0-SIH2026',
        'organization': 'MoES / NIOT',
        'database': db_status
    })


@app.route('/api/db/status', methods=['GET'])
def get_db_status():
    """Return live MongoDB connection metrics, database statistics and collection counts."""
    status = database.check_db_status()
    return jsonify(status)


@app.route('/api/surveys', methods=['GET'])
def list_surveys():
    """
    Fetch stored sonar mission surveys from MongoDB.
    Supports query parameters: limit, skip, search, area, auv
    """
    limit = int(request.args.get('limit', 100))
    skip = int(request.args.get('skip', 0))
    search = request.args.get('search', '').strip()
    area = request.args.get('area', '').strip()
    auv = request.args.get('auv', '').strip()

    query = {}
    if search:
        query['$or'] = [
            {'id': {'$regex': search, '$options': 'i'}},
            {'surveyArea': {'$regex': search, '$options': 'i'}},
            {'location': {'$regex': search, '$options': 'i'}},
            {'vesselName': {'$regex': search, '$options': 'i'}},
            {'auvId': {'$regex': search, '$options': 'i'}}
        ]
    if area:
        query['surveyArea'] = {'$regex': area, '$options': 'i'}
    if auv:
        query['auvId'] = {'$regex': auv, '$options': 'i'}

    try:
        surveys = database.get_surveys(limit=limit, skip=skip, query=query)
        return jsonify({
            'success': True,
            'count': len(surveys),
            'surveys': surveys
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/surveys', methods=['POST'])
def create_or_update_survey():
    """Save or update a sonar survey in MongoDB with linked hazards."""
    payload = request.get_json(force=True, silent=True)
    if not payload or not isinstance(payload, dict):
        return jsonify({'error': 'Invalid JSON body'}), 400

    try:
        saved = database.save_survey(payload)
        return jsonify({
            'success': True,
            'message': 'Survey saved to MongoDB successfully',
            'survey': saved
        }), 201
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/surveys/<survey_id>', methods=['GET'])
def get_survey(survey_id: str):
    """Fetch single survey by its identifier."""
    try:
        survey = database.get_survey_by_id(survey_id)
        if not survey:
            return jsonify({'error': f'Survey {survey_id} not found'}), 404
        return jsonify({'success': True, 'survey': survey})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/surveys/<survey_id>', methods=['DELETE'])
def delete_survey(survey_id: str):
    """Delete survey and associated anomalies from MongoDB."""
    try:
        ok = database.delete_survey(survey_id)
        if ok:
            return jsonify({'success': True, 'message': f'Survey {survey_id} deleted'})
        return jsonify({'error': f'Survey {survey_id} not found'}), 404
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/surveys', methods=['DELETE'])
def clear_all_surveys():
    """Clear all survey history and anomalies from MongoDB."""
    try:
        count = database.clear_all_surveys()
        return jsonify({'success': True, 'message': f'Deleted {count} surveys from MongoDB'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/anomalies', methods=['GET'])
def list_anomalies():
    """Query classified underwater hazards directly from MongoDB."""
    category = request.args.get('category')
    severity = request.args.get('severity')
    min_confidence = request.args.get('min_confidence', type=float)
    limit = int(request.args.get('limit', 200))

    try:
        anomalies = database.get_anomalies(
            category=category,
            severity=severity,
            min_confidence=min_confidence,
            limit=limit
        )
        return jsonify({
            'success': True,
            'count': len(anomalies),
            'anomalies': anomalies
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/anomalies', methods=['POST'])
def create_or_update_anomaly():
    """Store or update single anomaly in MongoDB."""
    payload = request.get_json(force=True, silent=True)
    if not payload or not isinstance(payload, dict):
        return jsonify({'error': 'Invalid JSON body'}), 400
    try:
        saved = database.save_anomaly(payload)
        return jsonify({'success': True, 'anomaly': saved}), 201
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/anomalies/<hazard_id>', methods=['DELETE'])
def delete_anomaly(hazard_id: str):
    """Delete a single anomaly from MongoDB."""
    try:
        ok = database.delete_anomaly(hazard_id)
        if ok:
            return jsonify({'success': True, 'message': f'Anomaly {hazard_id} deleted'})
        return jsonify({'error': f'Anomaly {hazard_id} not found'}), 404
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/telemetry', methods=['GET'])
def list_telemetry():
    """Retrieve AUV telemetry stream entries from MongoDB."""
    auv_id = request.args.get('auv_id')
    limit = int(request.args.get('limit', 100))
    try:
        logs = database.get_telemetry(auv_id=auv_id, limit=limit)
        return jsonify({'success': True, 'count': len(logs), 'telemetry': logs})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/telemetry', methods=['POST'])
def ingest_telemetry():
    """Ingest real-time AUV navigation & acoustic sensor telemetry stream into MongoDB."""
    payload = request.get_json(force=True, silent=True)
    if not payload:
        return jsonify({'error': 'No telemetry payload provided'}), 400

    records = payload if isinstance(payload, list) else [payload]
    try:
        count = database.log_telemetry_batch(records)
        return jsonify({'success': True, 'inserted': count})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/telemetry', methods=['DELETE'])
def delete_telemetry():
    """Delete telemetry entries from MongoDB."""
    auv_id = request.args.get('auv_id')
    try:
        count = database.delete_telemetry(auv_id=auv_id)
        return jsonify({'success': True, 'message': f'Deleted {count} telemetry entries'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/db/reset', methods=['POST'])
def reset_database():
    """Reset database to fresh default MoES/NIOT seed state."""
    try:
        res = database.reset_database_to_defaults()
        return jsonify({'success': True, 'result': res})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/db/clear', methods=['DELETE'])
def clear_entire_database():
    """Wipe all data across all collections in MongoDB."""
    try:
        deleted_counts = database.clear_all_data()
        return jsonify({'success': True, 'deleted': deleted_counts})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/process-sonar', methods=['POST'])
def process_sonar():
    # Ingest sonar image file, run Acoustic Computer Vision & Shadow Trigonometry pipeline,
    # and persist results + telemetry directly into MongoDB!
    start_time = time.time()
    if 'file' not in request.files:
        return jsonify({'error': 'No sonar file provided'}), 400

    file = request.files['file']
    filename = file.filename or 'sonar_capture.png'
    file_bytes = np.frombuffer(file.read(), np.uint8)
    image = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)

    if image is None:
        return jsonify({'error': 'Failed to decode image'}), 400

    # Extract full acoustic & telemetry metadata
    metadata = {
        'altitude': float(request.form.get('altitude', 12.4)),
        'slant_range': float(request.form.get('slant_range', 75.0)),
        'start_lat': float(request.form.get('start_lat', 13.1033)),
        'start_lng': float(request.form.get('start_lng', 80.3792)),
        'end_lat': float(request.form.get('end_lat', 13.1185)),
        'end_lng': float(request.form.get('end_lng', 80.3920)),
        'ping_freq': float(request.form.get('ping_freq', 450.0)),
        'auv_id': request.form.get('auv_id', 'NIOT-AUV-01'),
        'vessel_name': request.form.get('vessel_name', 'ORV Sagar Nidhi'),
        'heading': float(request.form.get('heading', 90.0)),
        'speed': float(request.form.get('speed', 2.5)),
        'resolution': float(request.form.get('resolution', 5.0)),
        'survey_area': request.form.get('survey_area', '').strip(),
    }

    # Run core Sonar Processor
    results = SonarProcessor.analyze_sonar_image(image, metadata)
    results['telemetry'] = metadata
    duration_ms = round((time.time() - start_time) * 1000, 2)

    # Persist survey into MongoDB
    try:
        resolved_area = (
            metadata['survey_area']
            or (results.get('analysis_report', {}) or {}).get('survey_area')
            or 'Side-Scan Sonar Acoustic Swath'
        )
        location_str = f"{metadata['start_lat']:.4f}°N, {metadata['start_lng']:.4f}°E"

        survey_record = {
            'surveyArea': resolved_area,
            'location': location_str,
            'pingFrequencyKhz': metadata['ping_freq'],
            'auvId': metadata['auv_id'],
            'vesselName': metadata['vessel_name'],
            'headingDeg': metadata['heading'],
            'speedKnots': metadata['speed'],
            'altitudeMeters': metadata['altitude'],
            'slantRangeMeters': metadata['slant_range'],
            'startLat': metadata['start_lat'],
            'startLng': metadata['start_lng'],
            'endLat': metadata['end_lat'],
            'endLng': metadata['end_lng'],
            'hazards': results.get('detections', []),
            'pipeline': results.get('pipeline', 'AQUORA-AcousticCV'),
            'totalDetections': results.get('total_found', len(results.get('detections', [])))
        }

        saved_survey = database.save_survey(survey_record)
        results['saved_survey_id'] = saved_survey.get('id')
        results['database_synced'] = True

        # Log audit entry in processing_logs collection
        database.log_processing_run({
            'survey_id': saved_survey.get('id'),
            'filename': filename,
            'duration_ms': duration_ms,
            'total_detections': len(results.get('detections', [])),
            'image_size': results.get('image_size'),
            'pipeline': results.get('pipeline')
        })
    except Exception as e:
        print(f"[AQUORA-DB] Warning: Could not automatically persist to MongoDB: {e}")
        results['database_synced'] = False
        results['database_error'] = str(e)

    return jsonify(results)


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print(f"Starting AQUORA Python Backend Engine on port {port}...")
    print(f"MongoDB Target: {database.MONGODB_URI} (Database: {database.DB_NAME})")
    app.run(host='0.0.0.0', port=port, debug=True)
