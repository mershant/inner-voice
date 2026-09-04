export default {
    input: 'src/index.js',
    output: {
        file: 'index.js',
        format: 'es',
        inlineDynamicImports: true,
    },
    external: [
        '/scripts/extensions/regex/engine.js'
    ],
};
