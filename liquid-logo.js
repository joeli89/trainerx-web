/* ─────────────────────────────────────────────────────────────────
   Liquid-metal logo — Paper Shaders (vanilla core, no build step)

   The React <LiquidMetal> component does two things for you that we
   have to do by hand here: preprocess the source SVG into the texture
   the shader expects (R = edge gradient, G = opacity), and map the
   friendly param names onto u_* uniforms. Both are mirrored below.

   Progressive enhancement: the <img> fallback stays in the DOM and is
   only swapped out once the shader has actually mounted, so no WebGL,
   a blocked CDN or a thrown shader all leave the plain mark in place.
   ───────────────────────────────────────────────────────────────── */

const CDN = 'https://esm.sh/@paper-design/shaders@0.0.80';

// colorBack is fully transparent so the shader paints the mark and
// nothing else. The board's #E4E4E4 is applied as the host's CSS
// background instead — that way the two drop shadows can follow the
// mark's own outline rather than the square edge of the canvas.
// Note: the string 'transparent' does NOT work here, the parser returns
// mid-grey for it; an explicit zero-alpha colour is required.
const PARAMS = {
  colorBack:  'rgba(0,0,0,0)',
  colorTint:  '#FFFFFF',
  repetition: 2,
  softness:   0.1,
  shiftRed:   0.3,
  shiftBlue:  0.3,
  distortion: 0.07,
  contour:    0.4,
  angle:      70,
  speed:      1,
  scale:      0.62,
  fit:        'contain',
};

async function mountLiquidLogo() {
  const host = document.getElementById('app-icon');
  if (!host) return;

  const src = host.dataset.logo;
  if (!src) return;

  // Static first frame rather than no shader at all — the mark still
  // gets its metal, it just doesn't flow.
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const {
    ShaderMount,
    liquidMetalFragmentShader,
    toProcessedLiquidMetal,
    getShaderColorFromString,
    ShaderFitOptions,
    defaultObjectSizing,
    LiquidMetalShapes,
  } = await import(/* @vite-ignore */ CDN);

  const { pngBlob } = await toProcessedLiquidMetal(src);

  // The vanilla mount wants a decoded HTMLImageElement for a sampler2D
  // uniform; only the React wrapper accepts a bare URL string.
  // decode() can hang on a large detached image, so wait on load instead.
  // The object URL is deliberately left alive: ShaderMount uploads the
  // element to a GL texture asynchronously and revoking early can race it.
  const url = URL.createObjectURL(pngBlob);
  const texture = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error('texture failed to load'));
    img.src = url;
  });

  // defaultObjectSizing is keyed with the friendly param names, so it
  // has to be mapped across to u_* rather than spread in as-is.
  const sizing = { ...defaultObjectSizing, fit: PARAMS.fit, scale: PARAMS.scale };

  const uniforms = {
    u_colorBack:  getShaderColorFromString(PARAMS.colorBack),
    u_colorTint:  getShaderColorFromString(PARAMS.colorTint),
    u_image:      texture,
    u_contour:    PARAMS.contour,
    u_distortion: PARAMS.distortion,
    u_softness:   PARAMS.softness,
    u_repetition: PARAMS.repetition,
    u_shiftRed:   PARAMS.shiftRed,
    u_shiftBlue:  PARAMS.shiftBlue,
    u_angle:      PARAMS.angle,
    u_isImage:    true,
    u_shape:      LiquidMetalShapes.none,

    u_fit:         ShaderFitOptions[sizing.fit],
    u_scale:       sizing.scale,
    u_rotation:    sizing.rotation,
    u_originX:     sizing.originX,
    u_originY:     sizing.originY,
    u_offsetX:     sizing.offsetX,
    u_offsetY:     sizing.offsetY,
    u_worldWidth:  sizing.worldWidth,
    u_worldHeight: sizing.worldHeight,
  };

  new ShaderMount(
    host,
    liquidMetalFragmentShader,
    uniforms,
    undefined,
    still ? 0 : PARAMS.speed,
    0,           // frame
    2,           // minPixelRatio
    undefined,   // maxPixelCount — leave at the library default
    ['u_image'],
  );

  // Only now is it safe to drop the fallback.
  host.classList.add('is-shaded');
}

mountLiquidLogo().catch(err => {
  console.warn('[liquid-logo] falling back to static mark:', err);
});
