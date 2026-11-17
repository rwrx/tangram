import * as chai from 'chai';
let assert = chai.assert;

let nycLatLng = { lng: -73.97229909896852, lat: 40.76456761707639, zoom: 17 };
let midtownTile = { x: 38603, y: 49255, z: 17 };

describe('TileManager', function () {

    let scene, view, tile_manager;

    beforeEach(() => {
        scene = makeScene({});
        view = scene.view;
        tile_manager = scene.tile_manager;
        sinon.stub(view, 'findVisibleTileCoordinates').returns([]);
        view.setView(nycLatLng);
    });

    afterEach(() => {
        scene = null;
    });

    describe('.updateLabels()', () => {

        beforeEach(() => scene.load());

        it('finishes a label pass whose scene was destroyed meanwhile', async () => {
            // A built tile without labels, the pass has nothing to place
            tile_manager.renderable_tiles = [{
                key: 'k', valid: true, built: true, build_id: 1, meshes: {}, pending_label_meshes: {},
                coords: midtownTile, style_z: midtownTile.z, isProxy: () => false, swapPendingLabels: () => {},
                min: { x: 0, y: 0 }, span: { x: 256, y: 256 }
            }];
            tile_manager.collision.zoom = null;

            const pass = tile_manager.updateLabels();
            tile_manager.destroy();
            const results = await pass;

            assert.isOk(results);
            assert.isNull(tile_manager.collision.task);
        });

    });

    describe('.queueCoordinate(coords)', () => {

        let coords = midtownTile;

        beforeEach(() => {
            sinon.spy(tile_manager, 'queueCoordinate');

            return scene.load().then(() => {
                tile_manager.queueCoordinate(coords);
                tile_manager.loadQueuedCoordinates();
            });
        });

    });

    describe('.loadCoordinate(coords)', () => {

        let coords = midtownTile;

        beforeEach(() => {
            return scene.load();
        });

        describe('when the tile manager has not loaded the tile', () => {

            let tile, tiles;

            beforeEach(() => {
                tile_manager.loadCoordinate(coords);
                tiles = tile_manager.tiles;
                tile = tiles[Object.keys(tiles)[0]];
            });

            it('loads and keeps the tile', () => {
                tile_manager.loadCoordinate(coords);
                assert.isTrue(Object.keys(tiles).length === 1);
                assert.isTrue(tile.constructor.name === 'Tile');
            });

        });

        describe('when the tile manager already has the tile', () => {
            let tile, tiles;

            beforeEach(() => {
                tile_manager.loadCoordinate(coords);

                tiles = tile_manager.tiles;
                tile = tiles[Object.keys(tiles)[0]];

                sinon.spy(tile_manager, 'keepTile');
                sinon.spy(tile, 'build');

                tile_manager.loadCoordinate(coords);
            });

            afterEach(() => {
                tile_manager.keepTile.restore();
                tile.build.restore();
            });

            it('does not build the tile', () => {
                assert.isFalse(tile.build.called);
            });

            it('does not keep the tile', () => {
                assert.isFalse(tile_manager.keepTile.called);
            });

        });

    });

});
