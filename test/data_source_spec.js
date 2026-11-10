import * as chai from 'chai';
let assert = chai.assert;

import Geo from '../src/utils/geo';
import sampleTile from './fixtures/sample-tile.json';
import sampleGeoJSONResponse from './fixtures/sample-json-response.json';
import sampleTopoJSONResponse from './fixtures/sample-topojson-response.json';

import DataSource from '../src/sources/data_source';
import {
    GeoJSONTileSource,
    GeoJSONSource
} from '../src/sources/geojson';
import {
    TopoJSONTileSource,
    TopoJSONSource
} from '../src/sources/topojson';
import {MVTSource} from '../src/sources/mvt';

import Utils from '../src/utils/utils';

function getMockTile() {
    return Object.assign({}, sampleTile);
}

function getMockJSONResponse() {
    return JSON.stringify(Object.assign({}, sampleGeoJSONResponse));
}

function getMockTopoResponse() {
    return JSON.stringify(Object.assign({}, sampleTopoJSONResponse));
}


describe('DataSource', () => {

    let url      = 'http://localhost:8080/{z}/{y}/{x}';
    let max_zoom = 12;
    let name     = 'test-source';
    let options  = {url, max_zoom, name};

    describe('.constructor(options)', () => {
        let subject;
        beforeEach(() => {
            subject = new DataSource(options);
        });

        it('returns a new instance', () => {
            assert.instanceOf(subject, DataSource);
        });
        it('sets the max_zoom level', () => {
            assert.equal(subject.max_zoom, max_zoom);
        });
    });

    describe('DataSource.create(options)', () => {

        describe('when I ask for a GeoJSON source with a tile template URL', () => {
            let subject = DataSource.create(Object.assign({}, {type: 'GeoJSON'}, options));
            it('returns a new GeoJSONTileSource', () => {
                assert.instanceOf(subject, GeoJSONTileSource);
            });
        });

        describe('when I ask for a TopoJSON source with a tile template URL', () => {
            let subject = DataSource.create(Object.assign({}, {type: 'TopoJSON'}, options));
            it('returns a new TopoJSONTileSource', () => {
                assert.instanceOf(subject, TopoJSONTileSource);
            });
        });

        describe('when I ask for a GeoJSON source without a tile template URL', () => {
            let subject = DataSource.create(Object.assign({}, {type: 'GeoJSON'}, options, {url: 'http://localhost:8080/'}));
            it('returns a new GeoJSONSource', () => {
                assert.instanceOf(subject, GeoJSONSource);
            });
        });

        describe('when I ask for a TopoJSON source without a tile template URL', () => {
            let subject = DataSource.create(Object.assign({}, {type: 'TopoJSON'}, options, {url: 'http://localhost:8080/'}));
            it('returns a new TopoJSONSource', () => {
                assert.instanceOf(subject, TopoJSONSource);
            });
        });

        describe('when I ask for a MVTSource', () => {
            let subject = DataSource.create(Object.assign({}, {type: 'MVT'}, options));
            it('returns a new MVTSource', () => {
                assert.instanceOf(subject, MVTSource);
            });
        });
    });

    describe('DataSource.projectData(tile)', () => {
        let subject;
        beforeEach(() => {
            sinon.spy(Geo, 'transformGeometry');
            sinon.spy(Geo, 'latLngToMeters');
            subject = DataSource.projectData(sampleTile);
        });

        afterEach(() => {
            subject = undefined;
            Geo.transformGeometry.restore();
            Geo.latLngToMeters.restore();
        });

        it('calls the .transformGeometry() method', () => {
            sinon.assert.callCount(Geo.transformGeometry, 3);
        });

        it('calls the .latLngToMeters() method', () => {
            sinon.assert.callCount(Geo.latLngToMeters, 3);
        });

    });

    describe('DataSource.scaleData(tile)', () => {

        beforeEach(() => {
            sinon.spy(Geo, 'transformGeometry');
        });

        afterEach(() => {
            Geo.transformGeometry.restore();
        });

        it('calls the .transformGeometry() method', () => {

            DataSource.scaleData(sampleTile, sampleTile);
            assert.strictEqual(Geo.transformGeometry.callCount, 3);
        });

    });

    describe('NetworkSource', () => {

        describe('when creating an instance of a subclass of NetworkSource', () => {
            let subject = DataSource.create(Object.assign({}, {type: 'GeoJSON'}, options));
            it('sets the url', () => {
                assert.equal(subject.url, url);
            });
        });

    });

    describe('GeoJSONTileSource', () => {

        describe('.load(tile)', () => {

            describe('when there are no http errors', () => {
                let subject, mockTile;

                beforeEach(() => {
                    mockTile = getMockTile();
                    sinon.stub(Utils, 'io').returns(Promise.resolve({
                        status: 200,
                        body: getMockJSONResponse()
                    }));
                    subject = new GeoJSONTileSource(options);
                    return subject.load(mockTile);
                });

                afterEach(() => {
                    Utils.io.restore();
                    subject = undefined;
                });

                it('calls back with the tile object', async () => {
                    assert(!mockTile.source_data.error);
                    assert(await subject.load(mockTile));
                });
            });

            describe('when there are http errors', () => {
                let subject, mockTile;
                beforeEach(() => {
                    mockTile = getMockTile();
                    sinon.stub(Utils, 'io').returns(Promise.reject(new Error('I am an error')));
                    subject = new GeoJSONTileSource(options);
                    return subject.load(mockTile);
                });

                afterEach(() => {
                    Utils.io.restore();
                    subject = undefined;
                });

                it('resolves the promise but includes an error', () => {
                    assert(mockTile.source_data.error);
                });
            });
        });
    });

    describe('TopoJSONTileSource', () => {
        let subject;

        beforeEach(() => {
            subject = new TopoJSONTileSource(options);
        });

        describe('.constructor()', () => {
            it('returns a new instance', () => {
                assert.instanceOf(subject, TopoJSONTileSource);
            });
        });

        describe('.parseSourceData(dest, source, reponse)', () => {

            beforeEach(() => {
                sinon.spy(DataSource, 'projectData');
                sinon.spy(DataSource, 'scaleData');
            });

            afterEach(() => {
                DataSource.projectData.restore();
                DataSource.scaleData.restore();
            });

            it('calls .projectData()', () => {
                subject.parseSourceData(getMockTile(), {}, getMockTopoResponse());
                sinon.assert.called(DataSource.projectData);
            });

            it('calls .scaleData()', () => {
                subject.parseSourceData(getMockTile(), {},getMockTopoResponse());
                sinon.assert.called(DataSource.scaleData);
            });

            it('attaches the response to the tile object', () => {
                let tile = getMockTile();
                let source = {};

                subject.parseSourceData(tile, source, getMockTopoResponse());
                assert.property(source, 'layers');
                assert.isTrue(Object.keys(source.layers.buildings).length > 0);
                assert.isTrue(Object.keys(source.layers.water).length > 0);
            });
        });
    });

    describe('MVTSource', () => {
        let subject;

        beforeEach(() => {
            subject = new MVTSource(options);
        });

        describe('.constructor()', () => {
            it('returns a new instance', () => {
                assert.instanceOf(subject, MVTSource);
            });
        });

        describe('.load(tile) of a tile the server doesn\'t have', () => {
            const missing_tile_layers = { water: { kind: 'ocean', sort_rank: 200 } };

            const getHttpError = (status) => {
                const error = new Error(`Request error with a status of ${status}`);
                error.status = status;
                return error;
            };

            let source;
            const loadTile = async (source_options, error) => {
                sinon.stub(Utils, 'io').returns(Promise.reject(error));
                const tile = getMockTile();
                source = new MVTSource(Object.assign({}, options, source_options));
                await source.load(tile);
                return tile;
            };

            afterEach(() => {
                Utils.io.restore();
            });

            it('fills it with a polygon covering the whole tile in each layer, with their properties', async () => {
                const tile = await loadTile({ missing_tile_layers }, getHttpError(404));

                assert.isNull(tile.source_data.error);
                assert.deepEqual(Object.keys(tile.source_data.layers), ['water']);
                const features = tile.source_data.layers.water.features;
                assert.lengthOf(features, 1);
                assert.deepEqual(features[0].properties, missing_tile_layers.water);
                assert.equal(features[0].geometry.type, 'Polygon');
                // The Y coordinates are flipped and the tile slightly scaled up to cover seams
                const ring = features[0].geometry.coordinates[0];
                const xs = ring.map(([x]) => x);
                const ys = ring.map(([, y]) => y);
                assert.isAtMost(Math.min(...xs), 0);
                assert.isAtLeast(Math.max(...xs), Geo.tile_scale);
                assert.isAtMost(Math.min(...ys), -Geo.tile_scale);
                assert.isAtLeast(Math.max(...ys), 0);
                // Wound like the outer rings of MVT polygons (e.g. the ocean of a tile that's all sea), which are
                // counterclockwise once the Y coordinates are flipped
                assert.equal(source.default_winding, 'CCW');
            });

            it('gives each tile its own features', async () => {
                const tile = await loadTile({ missing_tile_layers }, getHttpError(404));
                Utils.io.restore();
                const other_tile = await loadTile({ missing_tile_layers }, getHttpError(404));

                const [feature] = tile.source_data.layers.water.features;
                const [other_feature] = other_tile.source_data.layers.water.features;
                assert.notStrictEqual(feature.geometry, other_feature.geometry);
                assert.notStrictEqual(feature.properties, other_feature.properties);
                assert.notStrictEqual(feature.properties, missing_tile_layers.water);
            });

            it('leaves it empty with an error without missing_tile_layers', async () => {
                const tile = await loadTile({}, getHttpError(404));

                assert(tile.source_data.error);
                assert.deepEqual(tile.source_data.layers, {});
            });

            it('leaves it empty with an error when missing_tile_layers aren\'t layers with properties', async () => {
                const tile = await loadTile({ missing_tile_layers: { water: 'ocean' } }, getHttpError(404));

                assert(tile.source_data.error);
                assert.deepEqual(tile.source_data.layers, {});
            });

            it('doesn\'t fill a tile that failed to load for another reason', async () => {
                const tile = await loadTile({ missing_tile_layers }, getHttpError(500));

                assert(tile.source_data.error);
                assert.deepEqual(tile.source_data.layers, {});
            });

            it('doesn\'t fill a tile that failed to load without a status (e.g. a network error)', async () => {
                const tile = await loadTile({ missing_tile_layers }, new Error('There was a network error'));

                assert(tile.source_data.error);
                assert.deepEqual(tile.source_data.layers, {});
            });

            it('fills it when the server answers with one of missing_tile_statuses', async () => {
                const source_options = { missing_tile_layers, missing_tile_statuses: [404, 500] };
                const tile = await loadTile(source_options, getHttpError(500));

                assert.isNull(tile.source_data.error);
                assert.deepEqual(tile.source_data.layers.water.features[0].properties, missing_tile_layers.water);
            });

            it('doesn\'t fill a missing tile when its status isn\'t one of missing_tile_statuses', async () => {
                const source_options = { missing_tile_layers, missing_tile_statuses: [500] };
                const tile = await loadTile(source_options, getHttpError(404));

                assert(tile.source_data.error);
                assert.deepEqual(tile.source_data.layers, {});
            });

            it('keeps filling 404 tiles when missing_tile_statuses aren\'t statuses', async () => {
                const source_options = { missing_tile_layers, missing_tile_statuses: '500' };
                const tile = await loadTile(source_options, getHttpError(404));

                assert.isNull(tile.source_data.error);
                assert.lengthOf(tile.source_data.layers.water.features, 1);
            });
        });
    });
});

describe('Utils.io(url)', () => {
    let xhr;

    beforeEach(() => {
        xhr = sinon.useFakeXMLHttpRequest();
        xhr.onCreate = request => setTimeout(() => request.respond(404, {}, 'Not Found'));
    });

    afterEach(() => {
        xhr.restore();
    });

    it('rejects with the status of a failed request', async () => {
        const error = await Utils.io('http://localhost:8080/14/1/2.mvt').then(
            () => assert.fail('the request should fail'),
            error => error
        );

        assert.equal(error.status, 404);
        assert.include(error.message, '404');
    });
});
