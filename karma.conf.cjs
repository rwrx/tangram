// CommonJS config (package.json has "type": "module", but Karma loads its config with require())
const babel = require('@rollup/plugin-babel').default;
const resolve = require('@rollup/plugin-node-resolve').default;
const commonjs = require('@rollup/plugin-commonjs').default;
const globals = require('rollup-plugin-node-globals');
const builtins = require('rollup-plugin-node-builtins');
const json = require('@rollup/plugin-json').default;

module.exports = async function (config) {
    // ESM-only plugin, must be loaded with dynamic import
    const { importAsString } = await import('rollup-plugin-string-import');

    config.set({
        basePath: '',
        frameworks: ['mocha', 'sinon'],
        files: [
            'https://unpkg.com/leaflet@1.3.4/dist/leaflet.js', // TODO: update leaflet version
            {
                pattern : 'test/fixtures/*',
                watched : false,
                included : false,
                served : true
            },
            {
                pattern: 'build/worker.test.js',
                watched : false,
                included: false,
                served: true
            },
            {
                pattern: 'test/**/*.js'
            }
        ],

        exclude: ['test/rollup.config.worker.js'], // skip rollup config for building worker
        preprocessors: {
            'test/**/*.js' : ['rollup']
        },

        rollupPreprocessor: {
            output: {
                format: 'umd',
                sourcemap: 'inline',
            },
            treeshake: false, // treeshaking can remove test code we need!
            plugins: [
                resolve({
                    browser: true,
                    preferBuiltins: false
                }),
                commonjs(),

                json({
                    exclude: ['node_modules/**', 'src/**'] // import JSON files
                }),
                importAsString({
                    include: ['**/*.glsl'] // inline shader files
                }),

                babel({
                    exclude: ['node_modules/**', '*.json'],
                    babelHelpers: "runtime"
                }),

                // These are needed for jszip node-environment compatibility,
                // previously provided by browserify
                globals({
                    exclude: ['node_modules/chai/**'] // plugin's parser doesn't support chai's modern syntax (class static blocks)
                }),
                builtins()
            ]
        },

        plugins: [
            'karma-rollup-preprocessor',
            'karma-mocha',
            'karma-sinon',
            'karma-chrome-launcher',
            'karma-mocha-reporter'
        ],
        reporters: ['mocha'],

        port: 9876,
        colors: true,

        logLevel: config.LOG_INFO,
        autoWatch: false,
        browsers: ['Chrome'],

        singleRun: false

    });
};
