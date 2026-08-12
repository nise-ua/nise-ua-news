import sharp from 'sharp';

/** Perceptual luminance above this → use dark text on a bright background. */
export const BRIGHTNESS_THRESHOLD = 118;

/**
 * Locked Google-Earth-style readability band for the upper 25% of the frame.
 * Dark panel behind branding + headline + detail so white text stays readable
 * on any background.
 */
export const UPPER_READABILITY_BAND = {
  /** Fraction of frame height covered by the solid dark panel. */
  solidRatio: 0.26,
  /** Extra fade below the solid panel (fraction of frame height). */
  fadeRatio: 0.07,
  solidColor: '#000000',
  solidOpacity: 0.84,
  fadeStops: [
    ['0%', 'black', 0.84],
    ['100%', 'black', 0],
  ],
};

export function pickOverlayTheme(luminance) {
  return Number(luminance) >= BRIGHTNESS_THRESHOLD ? 'dark' : 'light';
}

export function getOverlayThemeColors(themeName = 'light') {
  if (themeName === 'dark') {
    return {
      gradientStops: [
        ['0%', 'white', 0.62],
        ['55%', 'white', 0.28],
        ['100%', 'white', 0],
      ],
      brandNiSeFill: '#0f172a',
      brandNewsFill: '#E41E48',
      dotsFill: '#1e3a5f',
      dotsOpacity: 0.9,
      headlineFill: '#0f172a',
      headlineStroke: '#ffffff',
      headlineStrokeOpacity: 0.4,
      headlineStrokeWidth: 2,
      detailFill: '#0f172a',
      detailStroke: 'none',
      detailStrokeOpacity: 0,
      detailStrokeWidth: 0,
      detailFontWeight: 900,
    };
  }

  // Default reel layout: white text on the locked dark upper readability band.
  return {
    gradientStops: UPPER_READABILITY_BAND.fadeStops,
    brandNiSeFill: '#ffffff',
    brandNewsFill: '#E41E48',
    dotsFill: '#ffffff',
    dotsOpacity: 0.8,
    headlineFill: '#ffffff',
    headlineStroke: '#000000',
    headlineStrokeOpacity: 0.25,
    headlineStrokeWidth: 2,
    detailFill: '#ffffff',
    detailStroke: 'none',
    detailStrokeOpacity: 0,
    detailStrokeWidth: 0,
    detailFontWeight: 900,
  };
}

/** Left column where headline/detail/branding are rendered. */
export const TEXT_REGION = {
  left: 0,
  top: 40,
  width: 920,
  brandHeight: 120,
  headlineTop: 280,
  headlineHeight: 260,
  /** Detail sentence sits below the headline block in the upper safe zone. */
  detailTop: 540,
  detailHeight: 180,
};

function luminanceFromChannels(channels) {
  const mean = 0.2126 * channels[0].mean + 0.7152 * channels[1].mean + 0.0722 * channels[2].mean;
  const max = 0.2126 * channels[0].max + 0.7152 * channels[1].max + 0.0722 * channels[2].max;
  return { mean, max, blended: 0.55 * mean + 0.45 * max };
}

async function regionLuminance(imageBuffer, region) {
  const slice = await sharp(imageBuffer)
    .extract(region)
    .png()
    .toBuffer();
  const { channels } = await sharp(slice).stats();
  return luminanceFromChannels(channels);
}

/**
 * Measure brightness where headline + detail text sit.
 * Uses the darker of those two zones so a single bright hotspot cannot force
 * dark text onto an otherwise dark background (e.g. moody Google Earth shots).
 */
export async function analyzeTextRegionBrightness(imageBuffer, width = 1080, height = 1920) {
  const meta = await sharp(imageBuffer).metadata();
  const frameWidth = meta.width || width;
  const frameHeight = meta.height || height;
  const textWidth = Math.min(TEXT_REGION.width, frameWidth);
  const brandHeight = Math.min(TEXT_REGION.brandHeight, frameHeight - TEXT_REGION.top);
  const headlineTop = Math.min(TEXT_REGION.headlineTop, Math.max(0, frameHeight - 1));
  const headlineHeight = Math.min(TEXT_REGION.headlineHeight, frameHeight - headlineTop);

  const brand = await regionLuminance(imageBuffer, {
    left: TEXT_REGION.left,
    top: TEXT_REGION.top,
    width: textWidth,
    height: Math.max(1, brandHeight),
  });
  const headline = await regionLuminance(imageBuffer, {
    left: TEXT_REGION.left,
    top: headlineTop,
    width: textWidth,
    height: Math.max(1, headlineHeight),
  });
  const detailTop = Math.min(TEXT_REGION.detailTop, Math.max(0, frameHeight - 1));
  const detailHeight = Math.min(TEXT_REGION.detailHeight, frameHeight - detailTop);
  const detail = await regionLuminance(imageBuffer, {
    left: TEXT_REGION.left,
    top: detailTop,
    width: textWidth,
    height: Math.max(1, detailHeight),
  });

  const textBlock = Math.min(headline.blended, detail.blended);
  const peak = Math.max(brand.blended, headline.blended, detail.blended);
  return { brand: brand.blended, headline: headline.blended, detail: detail.blended, textBlock, peak };
}

export async function resolveOverlayTheme(imageBuffer, width = 1080, height = 1920) {
  const regions = await analyzeTextRegionBrightness(imageBuffer, width, height);
  const luminance = regions.textBlock;
  return {
    theme: pickOverlayTheme(luminance),
    luminance,
    regions,
  };
}
