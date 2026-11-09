import * as chai from 'chai';
let assert = chai.assert;

import {StyleManager} from '../src/styles/style_manager';
import {Style} from '../src/styles/style';
import Context from '../src/gl/context';
import ShaderProgram from '../src/gl/shader_program';
import Camera from '../src/scene/camera';
import Light from '../src/lights/light';

import sampleScene from './fixtures/sample-scene.json';

var canvas, gl;

describe('Styles:', () => {

    let style_manager;

    beforeEach(() => {
        style_manager = new StyleManager();
    });

    describe('StyleManager:', () => {

        beforeEach(() => {
            // These create global shader blocks required by all rendering styles
            Camera.create('default', null, { type: 'flat' });
            Light.inject();

            canvas = document.createElement('canvas');
            gl = Context.getContext(canvas, { alpha: false });

            style_manager.init();
        });

        afterEach(() => {
            style_manager.destroy();
            canvas = null;
            gl = null;
        });

        it('initializes built-in styles', () => {
            assert.equal(style_manager.styles.polygons.constructor, Style.constructor);
            assert.equal(style_manager.styles.points.constructor, Style.constructor);
            assert.equal(style_manager.styles.text.constructor, Style.constructor);
        });

        it('creates a custom style', () => {
            style_manager.create('rainbow', sampleScene.styles.rainbow);
            assert.equal(style_manager.styles.rainbow.constructor, Style.constructor);
            assert.equal(style_manager.styles.rainbow.base, 'polygons');
        });

        describe('builds custom styles w/dependencies from stylesheet', () => {

            beforeEach(() => {
                ShaderProgram.reset();
                style_manager.build(sampleScene.styles);
                style_manager.initStyles();
            });

            it('compiles parent custom style', () => {
                style_manager.styles.rainbow.setGL(gl);
                style_manager.styles.rainbow.getProgram();
                assert.equal(style_manager.styles.rainbow.constructor, Style.constructor);
                assert.equal(style_manager.styles.rainbow.base, 'polygons');
                assert.ok(style_manager.styles.rainbow.program.compiled);
            });

            it('compiles child style dependent on another custom style', () => {
                style_manager.styles.rainbow_child.setGL(gl);
                style_manager.styles.rainbow_child.getProgram();
                assert.equal(style_manager.styles.rainbow_child.constructor, Style.constructor);
                assert.equal(style_manager.styles.rainbow_child.base, 'polygons');
                assert.ok(style_manager.styles.rainbow_child.program.compiled);
            });

            it('compiles a style with the same style mixed by multiple ancestors', () => {
                style_manager.styles.descendant.setGL(gl);
                style_manager.styles.descendant.getProgram();
                assert.equal(style_manager.styles.descendant.constructor, Style.constructor);
                assert.equal(style_manager.styles.descendant.base, 'polygons');
                assert.ok(style_manager.styles.descendant.program.compiled);
            });

        });

    });

    describe('Style:', () => {

        beforeEach(() => {
            canvas = document.createElement('canvas');
            gl = Context.getContext(canvas, { alpha: false });
            style_manager.init();
        });

        afterEach(() => {
            style_manager.destroy();
            canvas = null;
            gl = null;
        });

        it('compiles a program', () => {
            style_manager.styles.polygons.init();
            style_manager.styles.polygons.setGL(gl);
            style_manager.styles.polygons.getProgram();
            assert.ok(style_manager.styles.polygons.program.compiled);
        });

        it('starts compiling a program without waiting for the GPU, then finishes it', () => {
            ShaderProgram.reset();
            const style = style_manager.styles.polygons;
            style.init();
            style.setGL(gl);

            const program = style.getProgram('program', { wait: false });
            // Compiled already only when the browser tells the GPU is done (KHR_parallel_shader_compile)
            assert.ok(program.compiling || program.compiled);

            program.finishCompile();
            assert.ok(program.compiled);
            assert.notOk(program.compiling);
            assert.strictEqual(style.getProgram(), program);
        });

        it('reuses a program with the same sources while it compiles', () => {
            ShaderProgram.reset();
            style_manager.create('first', { base: 'polygons' });
            style_manager.create('second', { base: 'polygons' });
            const [first, second] = ['first', 'second'].map(name => {
                const style = style_manager.styles[name];
                style.init();
                style.setGL(gl);
                return style.getProgram('program', { wait: false });
            });

            first.finishCompile();
            second.finishCompile();
            assert.ok(first.compiled);
            assert.ok(second.compiled);
            assert.strictEqual(first.program, second.program);
        });

        it('throws the shader errors when it finishes compiling', () => {
            ShaderProgram.reset();
            style_manager.create('broken', {
                base: 'polygons',
                shaders: { blocks: { color: 'color.rgb = not_defined;' } }
            });
            const style = style_manager.styles.broken;
            style.init();
            style.setGL(gl);

            assert.throws(() => style.getProgram());
            assert.equal(style.program.error.type, 'fragment');
            assert.isNotEmpty(style.program.shader_errors);
            // Not compiled again
            assert.isUndefined(style.getProgram());
        });

        it('injects a dependent uniform in a custom style', () => {
            style_manager.create('scale', sampleScene.styles.scale);
            style_manager.styles.scale.init();
            style_manager.styles.scale.setGL(gl);
            style_manager.styles.scale.getProgram();
            assert.ok(style_manager.styles.scale.program.compiled);
        });

    });

});
