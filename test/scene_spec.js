import * as chai from 'chai';
let assert = chai.assert;
import sampleScene from './fixtures/sample-scene.json';
import ShaderProgram from '../src/gl/shader_program';

let nycLatLng = { lng: -73.97229, lat: 40.76456, zoom: 17 };

describe('Scene', function () {

    let subject;
    subject = makeScene({});
    sinon.stub(subject.view, 'findVisibleTileCoordinates').returns([]);
    subject.view.setView(nycLatLng);

    describe('.constructor()', () => {

        it('returns a new instance', () => {
            assert.isTrue(subject.constructor.name === 'Scene');
        });

    });

    describe('.load()', () => {

        describe('when the scene is not loaded', () => {

            beforeEach(() => {
                return subject.load();
            });

            it('correctly sets the value of the data source', () => {
                let source = subject.sources['osm'];
                assert.propertyVal(source, 'max_zoom', 18);
                assert.propertyVal(source, 'url', 'https://tile.mapzen.com/mapzen/vector/v1/all/{z}/{x}/{y}.json?api_key=mapzen-T3tPjn7&');
            });

            it('sets the initialized property', () => {
                assert.isTrue(subject.initialized);
            });

            it('sets the container property', () => {
                assert.instanceOf(subject.container, HTMLDivElement);
            });

            it('sets the canvas property', () => {
                assert.instanceOf(subject.canvas, HTMLCanvasElement);
            });

            it('sets the gl property', () => {
                assert.instanceOf(subject.gl, WebGLRenderingContext);
            });

        });

        describe('loading scene from an existing object', () => {

            beforeEach(() => {
                subject = makeScene({ config: sampleScene });
                return subject.load();
            });

            it('correctly sets the value of the config object', () => {
                assert.equal(subject.config_source, sampleScene);
            });

            it('sets the initialized property', () => {
                assert.isTrue(subject.initialized);
            });

        });

        describe('when the scene is already initialized', () => {

            it('handles second load() call', () => {
                return subject.load().then(() => {
                    return subject.load();
                });
            });

        });
    });

    describe('.resizeMap()', () => {
        let height = 100;
        let width = 200;
        let devicePixelRatio = window.devicePixelRatio;
        let computedHeight = Math.round(height * devicePixelRatio);
        let computedWidth  = Math.round(width * devicePixelRatio);

        beforeEach(() => {
            return subject.load().then(() => {
                sinon.spy(subject.gl, 'bindFramebuffer');
                sinon.spy(subject.gl, 'viewport');
                // Utils.device_pixel_ratio = devicePixelRatio;
                subject.resizeMap(width, height, devicePixelRatio);
            });
        });

        afterEach(() => {
            subject.gl.bindFramebuffer.restore();
            subject.gl.viewport.restore();
        });

        it('marks the scene as dirty', () => {
            assert.isTrue(subject.dirty);
        });

        it('sets the device size property', () => {
            assert.deepEqual(subject.view.size.device, {
                height: computedHeight,
                width: computedWidth
            });
        });

        it('calls the gl.bindFrameBuffer method', () => {
            assert.ok(subject.gl.bindFramebuffer.called);
        });

        it('calls the gl.viewport method', () => {
            assert.ok(subject.gl.viewport);
        });

        describe('-canvas.style', () => {
            it('sets the height', () => {
                assert.equal(subject.canvas.style.height, height + 'px');
            });

            it('sets the width', () => {
                assert.equal(subject.canvas.style.width, width + 'px');
            });
        });

        describe('-canvas', () => {
            it('sets the height property', () => {
                assert.equal(subject.canvas.height, computedHeight);
            });

            it('sets the width property', () => {
                assert.equal(subject.canvas.width, computedWidth);
            });

            it('keeps its drawing buffer when the size is the same', () => {
                // Setting the canvas size reallocates the drawing buffer, even to the same size
                const set = sinon.spy();
                for (const [property, value] of [['width', computedWidth], ['height', computedHeight]]) {
                    Object.defineProperty(subject.canvas, property, { configurable: true, get: () => value, set });
                }
                subject.resizeMap(width, height, devicePixelRatio);
                delete subject.canvas.width;
                delete subject.canvas.height;

                assert.notOk(set.called);
            });
        });


    });

    describe('.compileStylePrograms()', () => {

        let style;

        beforeEach(() => {
            return subject.load().then(() => {
                sinon.stub(subject.style_manager, 'getActiveBlendOrders').returns([{ blend_order: 0, styles: ['polygons'] }]);
                // A program that isn't compiled yet
                ShaderProgram.reset();
                style = subject.styles.polygons;
                style.compile_setup = false;
                style.program = null;
            });
        });

        afterEach(() => {
            subject.style_manager.getActiveBlendOrders.restore();
        });

        it('starts compiling the programs without waiting for the GPU, then finishes them in later frames', () => {
            let compiled = subject.compileStylePrograms();
            // Compiled already only when the browser tells the GPU is done (KHR_parallel_shader_compile)
            assert.ok(compiled || style.program.compiling);

            for (let frame = 0; !compiled && frame < 1000; frame++) {
                compiled = subject.compileStylePrograms();
            }
            assert.isTrue(compiled);
            assert.ok(style.program.compiled);
        });

        it('doesn\'t wait for a program that failed to compile', () => {
            sinon.stub(style, 'getProgram').throws(new Error('compile error'));
            const warning = sinon.spy();
            subject.subscribe({ warning });

            assert.isTrue(subject.compileStylePrograms());
            assert.ok(warning.calledWithMatch({ type: 'styles', style }));

            subject.unsubscribe({ warning });
            style.getProgram.restore();
        });

    });

    describe('.view.setView(lng, lat)', () => {
        let {lng, lat, zoom} = nycLatLng;

        beforeEach(() => {
            subject.view.setView(nycLatLng);
        });

        it('sets the view center', () => {
            assert.equal(subject.view.center.lng, lng);
            assert.equal(subject.view.center.lat, lat);
        });

        it('sets the view zoom', () => {
            assert.equal(subject.view.zoom, zoom);
        });

        it('marks the scene as dirty', () => {
            assert.isTrue(subject.dirty);
        });
    });

    describe('.view.setZoom(zoom)', () => {

        beforeEach(() => {
            subject.view.setZoom(10);
        });

        it('marks the scene as dirty', () => {
            assert.isTrue(subject.dirty);
        });

        it('updates the zoom level', () => {
            assert.equal(subject.view.zoom, 10);
        });

    });

});
