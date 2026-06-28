// Polyfill to prevent ReferenceErrors in mic-recorder-to-mp3 / lamejs
// The library expects these variables to be in the global scope (window)
// and tries to assign to them without declaring them first, which fails in strict mode.

const globals = [
  'Lame',
  'Presets',
  'GainAnalysis',
  'QuantizePVT',
  'Quantize',
  'Reservoir',
  'Takehiro',
  'MPEGMode',
  'BitStream'
];

globals.forEach(name => {
  // @ts-expect-error lamejs expects globals on window
  if (typeof window[name] === 'undefined') {
    // @ts-expect-error lamejs expects globals on window
    window[name] = {};
  }
});
