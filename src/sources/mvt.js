import DataSource, {NetworkTileSource} from './data_source';
import Geo from '../utils/geo';
import log from '../utils/log';

import Pbf from 'pbf';
import {VectorTile, VectorTileFeature} from '@mapbox/vector-tile';

const PARSE_JSON_TYPE = {
    NONE: 0,
    ALL: 1,
    SOME: 2
};

const PARSE_JSON_TEST = ['{', '[']; // one-time allocated array/strings

/**
 Mapbox Vector Tile format
 @class MVTSource
*/
export class MVTSource extends NetworkTileSource {

    constructor (source, sources) {
        super(source, sources);
        this.response_type = 'arraybuffer'; // binary data

        // Optionally parse some or all properties from JSON strings
        if (source.parse_json === true) {
            // try to parse all properties (least efficient)
            this.parse_json_type = PARSE_JSON_TYPE.ALL;
        }
        else if (Array.isArray(source.parse_json)) {
            // try to parse a specific list of property names (more efficient)
            this.parse_json_type = PARSE_JSON_TYPE.SOME;
            this.parse_json_prop_list = source.parse_json;
        }
        else {
            if (source.parse_json != null) {
                let msg = `Data source '${this.name}': 'parse_json' parameter should be 'true', or an array of ` +
                    `property names (was '${JSON.stringify(source.parse_json)}')`;
                log({ level: 'warn', once: true }, msg);
            }

            // skip parsing entirely (default behavior)
            this.parse_json_type = PARSE_JSON_TYPE.NONE;
        }

        // Optionally fill a tile the server doesn't have (404) with a polygon covering the whole tile in each layer,
        // with the given properties, e.g. `{ water: { kind: ocean } }` when the server has no tiles of the open sea
        const missing_tile_layers = source.missing_tile_layers;
        if (missing_tile_layers != null && typeof missing_tile_layers === 'object' && !Array.isArray(missing_tile_layers) &&
            Object.values(missing_tile_layers).every(properties => properties != null && typeof properties === 'object')) {
            this.missing_tile_layers = missing_tile_layers;
        }
        else if (missing_tile_layers != null) {
            log({ level: 'warn', once: true },
                `Data source '${this.name}': 'missing_tile_layers' parameter should be an object of layer names ` +
                `and their feature properties (was '${JSON.stringify(missing_tile_layers)}')`);
        }

        // The HTTP statuses the server answers with for a tile it doesn't have, 404 by default (some servers
        // answer e.g. 500 for the tiles of the open sea)
        const missing_tile_statuses = source.missing_tile_statuses;
        if (Array.isArray(missing_tile_statuses) && missing_tile_statuses.every(Number.isInteger)) {
            this.missing_tile_statuses = missing_tile_statuses;
        }
        else {
            if (missing_tile_statuses != null) {
                log({ level: 'warn', once: true },
                    `Data source '${this.name}': 'missing_tile_statuses' parameter should be an array of HTTP ` +
                    `statuses (was '${JSON.stringify(missing_tile_statuses)}')`);
            }
            this.missing_tile_statuses = [404];
        }
    }

    missingTileLayers (status) {
        if (!this.missing_tile_layers || this.missing_tile_statuses.indexOf(status) === -1) {
            return null;
        }

        // Wound like the outer rings of MVT polygons (before load() flips the Y coordinates), e.g. the ocean
        // of a tile that's all sea, so the polygon can also set the source's default winding
        const size = Geo.tile_scale;
        const layers = {};
        for (const layer in this.missing_tile_layers) {
            layers[layer] = {
                type: 'FeatureCollection',
                features: [{
                    type: 'Feature',
                    // New objects for each tile, the geometry is transformed in place and the properties can be changed
                    geometry: {
                        type: 'Polygon',
                        coordinates: [[[size, size], [0, size], [0, 0], [size, 0], [size, size]]]
                    },
                    properties: Object.assign({}, this.missing_tile_layers[layer])
                }]
            };
        }
        return layers;
    }

    parseSourceData (tile, source, response) {
        // Convert Mapbox vector tile to GeoJSON
        var data = new Uint8Array(response);
        var buffer = new Pbf(data);
        source.data = new VectorTile(buffer);
        source.layers = this.toGeoJSON(source.data);

        // Apply optional data transform
        if (typeof this.transform === 'function') {
            const tile_data = {
                min: Object.assign({}, tile.min),
                max: Object.assign({}, tile.max),
                coords: Object.assign({}, tile.coords)
            };
            source.layers = this.transform(source.layers, this.extra_data, tile_data);
        }

        delete source.data; // comment out to save raw data for debugging
    }

    // Loop through layers/features using Mapbox lib API, convert to GeoJSON features
    // Returns an object with keys for each layer, e.g. { layer: geojson }
    toGeoJSON (tile) {
        var layers = {};
        for (var l in tile.layers) {
            var layer = tile.layers[l];
            var scale = Geo.tile_scale / layer.extent;
            var layer_geojson = {
                type: 'FeatureCollection',
                features: []
            };

            for (var f=0; f < layer.length; f++) {
                var feature = layer.feature(f);
                var feature_geojson = {
                    type: 'Feature',
                    geometry: {},
                    id: feature.id,
                    properties: feature.properties
                };

                this.parseJSONProperties(feature_geojson);

                var geometry = feature_geojson.geometry;
                var coordinates = feature.loadGeometry();
                // The first point in tile coordinates, before they're scaled below (replaced, not modified)
                var first_point = coordinates.length > 0 ? coordinates[0][0] : undefined;
                for (var r=0; r < coordinates.length; r++) {
                    var ring = coordinates[r];
                    for (var c=0; c < ring.length; c++) {
                        ring[c] = [
                            ring[c].x * scale,
                            ring[c].y * scale
                        ];
                    }
                }
                geometry.coordinates = coordinates;

                if (VectorTileFeature.types[feature.type] === 'Point') {
                    if (coordinates.length === 1) {
                        geometry.type = 'Point';
                        geometry.coordinates = geometry.coordinates[0][0];
                        // Keep the original tile geometry and extent, so FeatureSelection.makeColor can
                        // compute the point's lat/lng (it doesn't get the full tile data in its arguments)
                        geometry.latLng = { _geometry: first_point, _extent: layer.extent };
                    }
                    else {
                        geometry.type = 'MultiPoint';
                        geometry.coordinates = geometry.coordinates[0];
                    }
                }
                else if (VectorTileFeature.types[feature.type] === 'LineString') {
                    if (coordinates.length === 1) {
                        geometry.type = 'LineString';
                        geometry.coordinates = geometry.coordinates[0];
                    }
                    else {
                        geometry.type = 'MultiLineString';
                    }
                }
                else if (VectorTileFeature.types[feature.type] === 'Polygon') {
                    geometry = decodeMultiPolygon(geometry); // un-flatten rings
                }

                layer_geojson.features.push(feature_geojson);
            }
            layers[l] = layer_geojson;
        }
        return layers;
    }

    // Optionally parse some or all feature properties from JSON strings
    parseJSONProperties (feature) {
        if (this.parse_json_type !== PARSE_JSON_TYPE.NONE) {
            const props = feature.properties;

            // if specified, check list of explicit properties to parse
            if (this.parse_json_type === PARSE_JSON_TYPE.SOME) {
                this.parse_json_prop_list.forEach(p => {
                    try {
                        props[p] = JSON.parse(props[p]);
                    } catch (e) {
                        // continue with original value if couldn't parse as JSON
                    }
                });
            }
            // otherwise try to parse all properties
            else {
                for (const p in props) {
                    // check if this property looks like JSON, and parse if so
                    if (PARSE_JSON_TEST.indexOf(props[p][0]) > -1) {
                        try {
                            props[p] = JSON.parse(props[p]);
                        } catch (e) {
                            // continue with original value if couldn't parse as JSON
                        }
                    }
                }
            }
        }
    }
}

// Decode multipolygons, which are encoded as a single set of rings
// Winding order of first ring is assumed to indicate exterior ring,
// the opposite winding order indicates the start of a new polygon.
export function decodeMultiPolygon (geom) {
    let polys = [];
    let poly = [];
    let outer_winding;
    for (let r=0; r < geom.coordinates.length; r++) {
        let ring = geom.coordinates[r];
        let winding = Geo.ringWinding(ring);
        if (winding == null) {
            continue; // skip zero-area rings
        }

        outer_winding = outer_winding || winding; // assume first ring indicates outer ring winding

        if (winding === outer_winding && poly.length > 0) {
            polys.push(poly);
            poly = [];
        }
        poly.push(ring);
    }
    if (poly.length > 0) {
        polys.push(poly);
    }

    // Single or multi?
    if (polys.length === 1) {
        geom.type = 'Polygon';
        geom.coordinates = polys[0];
    }
    else if (polys.length > 1) {
        geom.type = 'MultiPolygon';
        geom.coordinates = polys;
    }
    else {
        geom = null;
    }

    return geom;
}

DataSource.register('MVT', () => MVTSource);
