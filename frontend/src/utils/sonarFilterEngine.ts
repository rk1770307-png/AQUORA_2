import { SonarHazard, FilterSettings, DetectionResult, getMaterialType } from '../types';

/**
 * Filter hazards based on noise settings, acoustic shadow verification,
 * confidence threshold, and class selections.
 */
export function processSonarDetections(
  rawHazards: SonarHazard[],
  settings: FilterSettings
): DetectionResult {
  const startTime = performance.now();

  let filteredOutCount = 0;
  let totalSnr = 0;

  const processedHazards = rawHazards.map(hazard => {
    let conf = hazard.confidence;
    totalSnr += hazard.snrDb || 12.0;

    // Ensure materialType is assigned
    const materialType = hazard.materialType || getMaterialType(hazard.category);

    // 1. Speckle Noise Reduction Impact
    if (settings.speckleFilter !== 'none') {
      const snrBoost = settings.speckleFilter === 'lee' ? 4.5 : 3.0;
      conf = Math.min(99.9, conf + snrBoost);
    }

    // 2. CLAHE Contrast Enhancement
    if (settings.claheEnabled) {
      conf = Math.min(99.9, conf + 2.5);
    }

    // 3. Dual-Verification Shadow Filter (Targeted for Natural Rock Clusters)
    let isFalsePositive = false;
    if (settings.shadowVerification) {
      const combinedScore = (hazard.acousticHighlightScore + hazard.shadowMatchScore) / 2;
      if (hazard.category === 'Natural Rock Cluster') {
        isFalsePositive = true;
        conf = Math.max(15.0, conf - 30.0);
      } else if (combinedScore < 0.4) {
        isFalsePositive = true;
        conf = Math.max(20.0, conf - 15.0);
      }
    }

    // 4. Vehicle Motion / Heave Compensation
    if (settings.heaveCompensation) {
      conf = Math.min(99.9, conf + 1.8);
    }

    return {
      ...hazard,
      materialType,
      confidence: parseFloat(conf.toFixed(1)),
      isFalsePositiveFiltered: isFalsePositive
    };
  }).filter(hazard => {
    // Min confidence filter
    if (hazard.confidence < settings.minConfidence) {
      filteredOutCount++;
      return false;
    }

    // Category filter
    if (settings.selectedCategories.length > 0 && !settings.selectedCategories.includes(hazard.category)) {
      filteredOutCount++;
      return false;
    }

    return true;
  });

  const endTime = performance.now();

  return {
    hazards: processedHazards,
    filteredCount: filteredOutCount,
    processingTimeMs: Math.round(endTime - startTime + 12), // simulate low latency edge inference
    snrAverage: parseFloat((totalSnr / (rawHazards.length || 1)).toFixed(1))
  };
}
