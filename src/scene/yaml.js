import { load as loadYAML } from 'js-yaml';

// Parses the text of a scene file - on the main thread, or in a worker (see Scene.parseSceneText)
export function parseSceneText (text) {
    // jsyaml 'json' option allows duplicate keys
    // Keeping this for backwards compatibility, but should consider migrating to requiring
    // unique keys, as this is YAML spec. But Tangram ES currently accepts dupe keys as well,
    // so should consider how best to unify.
    return loadYAML(text, { json: true });
}
