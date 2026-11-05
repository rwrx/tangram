export default function(context) {
  const ESM = (process.env.ESM !== 'false'); // default to ESM on
  const cache = context.cache(() => ESM);
  // The ES module build is for apps with their own build step (Trackbook: Vite, which also builds a legacy
  // version for older browsers), so it keeps the syntax of browsers from the last few years, like Vite's default
  // target: smaller and faster than code compiled for the first browsers with ES modules (2017)
  const targets = ESM ?
    { browsers: ['chrome >= 107', 'edge >= 107', 'firefox >= 104', 'safari >= 16'] } :
    { browsers: ['ie >= 11'] };

  return {
    presets: [
      [
        '@babel/preset-env', {
          targets,
          bugfixes: true,
          // debug: true, // uncomment for debugging build issues
          exclude: [
            // we don't want these because we're using fast-async instead
            'transform-async-to-generator',
            'transform-regenerator',
            'proposal-async-generator-functions'
          ]
        }
      ],
    ],
    plugins: [
      '@babel/plugin-transform-runtime',
      ESM ? false : ['module:fast-async', {
        spec: true // spec setting sticks to pure promises
      },]
    ].filter(x => x)
  };
}
