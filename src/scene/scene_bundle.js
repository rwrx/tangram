import Utils from '../utils/utils';
import * as URLs from '../utils/urls';
import { isGlobalReference } from './globals';

import { parseSceneText } from './yaml';

export class SceneBundle {

    constructor(url, path, parent = null) {
        this.url = url;

        // If a base path was provided, use it for resolving local bundle resources only if
        // the base path is absolute, or this bundle's path is relative
        if (path && (!URLs.isRelativeURL(path) || URLs.isRelativeURL(this.url))) {
            this.path = path;
        }
        else {
            this.path = URLs.pathForURL(this.url);
        }

        this.parent = parent;

        // Parses the text of scene files, can return a promise (e.g. when parsing in a worker).
        // Imported scenes are parsed like the scene that imports them.
        this.parse = (parent && parent.parse) || parseSceneText;
    }

    load() {
        return loadResource(this.url, this.parse);
    }

    // Info for retrieving a specific resource from this bundle
    // url: fully qualified URL to retrieve the content of the resource
    // path: original path of the resource within the bundle (for resolving paths up the bundle tree)
    // type: file extension
    resourceFor(url) {
        return {
            url: this.urlFor(url),
            path: this.pathFor(url),
            type: this.typeFor(url)
        };
    }

    urlFor(url) {
        if (isGlobalReference(url)) {
            return url;
        }

        return URLs.addBaseURL(url, this.path);
    }

    pathFor(url) {
        return URLs.pathForURL(url);
    }

    typeFor(url) {
        return URLs.extensionForURL(url);
    }

}

// Zipped scenes (.zip scene bundles) aren't supported in this fork: decompressing them needed JSZip,
// which made the library much larger, and Trackbook loads its scenes as YAML
export function createSceneBundle(url, path, parent) {
    return new SceneBundle(url, path, parent);
}

function loadResource (source, parse = parseSceneText) {
    return new Promise((resolve, reject) => {
        if (typeof source === 'string') {
            Utils.io(source).then(({ body }) => {
                try {
                    resolve(parse(body)); // a parse that returns a promise is followed
                }
                catch(e) {
                    reject(e);
                }
            }, reject);
        } else {
            // shallow copy to avoid modifying provided object, allowing a single config object to be loaded multiple times
            // TODO: address possible modifications to nested properties (mostly harmless / due to data normalization)
            source = Object.assign({}, source);
            resolve(source);
        }
    });
}
