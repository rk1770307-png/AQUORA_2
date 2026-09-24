/**
 * Helper to procedurally render realistic Side-Scan Sonar (SSS) imagery
 * onto HTML Canvas elements for previewing sonar datasets.
 */

export function drawProceduralSonar(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  colorMap: 'copper' | 'cyan' | 'grayscale' | 'magma' = 'copper',
  noiseLevel: 'Low' | 'Medium' | 'High' = 'Medium',
  objects: Array<{
    xPct: number;
    yPct: number;
    wPct: number;
    hPct: number;
    type: string;
  }> = []
) {
  const imgData = ctx.createImageData(width, height);
  const data = imgData.data;
  const halfW = Math.floor(width / 2);
  const nadirWidth = Math.floor(width * 0.08); // Central water column (Nadir gap)

  const noiseFactor = noiseLevel === 'High' ? 45 : noiseLevel === 'Medium' ? 25 : 12;

  // Render seafloor texture & nadir water column
  for (let y = 0; y < height; y++) {
    const waveRipple = Math.sin(y * 0.05) * 8 + Math.cos(y * 0.02) * 5;
    
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const distFromCenter = Math.abs(x - halfW);

      let intensity = 0;

      // 1. Nadir gap (water column right below AUV - low acoustic return)
      if (distFromCenter < nadirWidth / 2) {
        // Dark water column with altitude reflections at boundary
        const edgeDist = Math.abs(distFromCenter - nadirWidth / 2);
        intensity = Math.max(5, 40 - edgeDist * 3) + (Math.random() * 10);
      } else {
        // 2. Seafloor reverberation background
        const slantFactor = 1 - (distFromCenter / halfW) * 0.4;
        const ripple = Math.sin((x + waveRipple) * 0.08) * 15;
        const speckle = (Math.random() - 0.5) * noiseFactor;
        
        intensity = 110 * slantFactor + ripple + speckle;
        intensity = Math.min(255, Math.max(10, intensity));
      }

      // Render based on selected color map
      applyColorMap(data, idx, intensity, colorMap);
    }
  }

  // 3. Render Object Highlights & Trailing Acoustic Shadows
  objects.forEach(obj => {
    const ox = Math.floor((obj.xPct / 100) * width);
    const oy = Math.floor((obj.yPct / 100) * height);
    const ow = Math.floor((obj.wPct / 100) * width);
    const oh = Math.floor((obj.hPct / 100) * height);

    // Determine direction of acoustic shadow (pointing outward away from central Nadir gap)
    const shadowDirection = ox < halfW ? -1 : 1; // Left side shadow goes left, Right side shadow goes right
    const shadowLength = Math.floor(ow * 1.8);

    // Draw Acoustic Highlight (bright reflection facing sonar head)
    for (let y = oy; y < oy + oh; y++) {
      for (let x = ox; x < ox + ow; x++) {
        if (x >= 0 && x < width && y >= 0 && y < height) {
          const idx = (y * width + x) * 4;
          const highlightIntensity = Math.min(255, 230 + Math.random() * 25);
          applyColorMap(data, idx, highlightIntensity, colorMap);
        }
      }
    }

    // Draw Acoustic Shadow (dark region behind the object blocking acoustic wave)
    for (let y = oy - 2; y < oy + oh + 2; y++) {
      for (let step = 1; step <= shadowLength; step++) {
        const sx = shadowDirection < 0 ? ox - step : ox + ow + step;
        if (sx >= 0 && sx < width && y >= 0 && y < height) {
          const idx = (y * width + sx) * 4;
          // Shadow fades slightly at far end
          const shadowDarkness = Math.max(2, step * 2);
          applyColorMap(data, idx, shadowDarkness, colorMap);
        }
      }
    }
  });

  ctx.putImageData(imgData, 0, 0);
}

function applyColorMap(
  data: Uint8ClampedArray,
  idx: number,
  intensity: number,
  colorMap: 'copper' | 'cyan' | 'grayscale' | 'magma'
) {
  const norm = intensity / 255;

  if (colorMap === 'copper') {
    // Sonar Amber / Copper (Classic side-scan sonar palette)
    data[idx] = Math.min(255, Math.floor(intensity * 1.2)); // R
    data[idx + 1] = Math.floor(intensity * 0.7);            // G
    data[idx + 2] = Math.floor(intensity * 0.15);           // B
  } else if (colorMap === 'cyan') {
    // High-tech Sonar Emerald / Cyan
    data[idx] = Math.floor(intensity * 0.1);                // R
    data[idx + 1] = Math.min(255, Math.floor(intensity * 1.1)); // G
    data[idx + 2] = Math.min(255, Math.floor(intensity * 1.2)); // B
  } else if (colorMap === 'magma') {
    // Thermal Magma / Heatmap
    data[idx] = Math.floor(Math.pow(norm, 0.7) * 255);
    data[idx + 1] = Math.floor(Math.pow(norm, 1.8) * 220);
    data[idx + 2] = Math.floor(Math.sin(norm * Math.PI) * 180);
  } else {
    // Grayscale
    data[idx] = intensity;
    data[idx + 1] = intensity;
    data[idx + 2] = intensity;
  }
  data[idx + 3] = 255; // Alpha
}
