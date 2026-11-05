import log from '../../utils/log';
import Utils from '../../utils/utils';
import FontFaceObserver from 'fontfaceobserver';

const FontManager = {

    // Font detection
    fonts_loaded: Promise.resolve(), // resolves when all requested fonts have been detected (or added, see below)
    last_loaded: null,               // tracks last set of fonts loaded
    loading_css: new Map(),          // loads of the fonts of CSS font values, see loadFontsFor()

    // How long text waits for a font to load before it uses a fallback font (like FontFaceObserver's default)
    load_timeout: 3000,

    // Load set of custom font faces
    // `fonts` is an object where the key is a font family name, and the value is one or more font face
    // definitions. The value can be either a single object, or an array of such objects.
    // If the special string value 'external' is used, it indicates the the font will be loaded via external CSS.
    //
    // With the native font loading API, faces with a URL are only added to the document here, and each is
    // downloaded when text first needs it (see loadFontsFor): faces the map doesn't show aren't downloaded, and
    // the downloads don't compete with the page's own requests while the scene is loading.
    loadFonts (fonts) {
        const same = (JSON.stringify(fonts) === this.last_loaded);
        if (fonts && !same) {
            const queue = [];
            for (const family in fonts) {
                if (Array.isArray(fonts[family])) {
                    fonts[family].forEach(face => queue.push(this.loadFontFace(family, face)));
                }
                else {
                    queue.push(this.loadFontFace(family, fonts[family]));
                }
            }

            this.last_loaded = JSON.stringify(fonts);
            this.fonts_loaded = Promise.all(queue.filter(x => x));
            this.loading_css = new Map(); // fonts may now be available for other faces
        }
        return this.fonts_loaded;
    },

    // Waits until the font faces that text drawn with these CSS font values (e.g. `italic 600 12px Poppins`)
    // would use are loaded - and loads them if they aren't, see loadFonts()
    async loadFontsFor (fonts_css) {
        await this.fonts_loaded;
        if (!this.supportsNativeFontLoading()) {
            return; // loadFonts() has loaded all faces
        }
        await Promise.all(fonts_css.map(font_css => this.loadFontCSS(font_css)));
    },

    // Loads the font faces that match a CSS font value, or times out
    loadFontCSS (font_css) {
        let loading = this.loading_css.get(font_css);
        if (!loading) {
            let timer;
            const timeout = new Promise((resolve, reject) => {
                timer = setTimeout(() => reject(new Error(`${this.load_timeout}ms timeout exceeded`)), this.load_timeout);
            });
            loading = Promise.race([document.fonts.load(font_css), timeout])
                .then(
                    () => {
                        clearTimeout(timer);
                        log('debug', `Fonts for '${font_css}' are available`);
                    },
                    e => {
                        clearTimeout(timer);
                        log('warn', `Fonts for '${font_css}' are NOT available`, e); // text uses a fallback font
                    }
                );
            this.loading_css.set(font_css, loading);
        }
        return loading;
    },

    supportsNativeFontLoading () {
        if (this.supports_native_font_loading === undefined) {
            this.supports_native_font_loading = (typeof window !== 'undefined' && window.FontFace !== undefined &&
                typeof document !== 'undefined' && document.fonts !== undefined);
        }
        return this.supports_native_font_loading;
    },

    // Load a single font face
    // `face` contains the font face definition, with optional parameters for `weight`, `style`, and `url`.
    // If the `url` is defined, the font is injected into the document as a CSS font-face.
    // If the object's value is the special string 'external', or if no `url` is defined, then the font face
    // is assumed is assumed to been loaded via external CSS. In either case, the function returns a promise
    // that resolves when the font face has loaded, or times out.
    // (With the native font loading API, a face with a URL is only added: loadFontsFor() loads it when needed.
    // Faces from external CSS are still waited for here: their CSS may not have been added to the document yet.)
    async loadFontFace (family, face) {
        if (face == null || (typeof face !== 'object' && face !== 'external')) {
            return;
        }

        const options = { family };

        if (typeof face === 'object') {
            Object.assign(options, face);

            // If URL is defined, inject font into document
            if (typeof face.url === 'string') {
                await this.injectFontFace(options);
                if (this.supportsNativeFontLoading()) {
                    return; // loaded when text needs it
                }
            }
        }

        // Wait for font to load
        try {
            // FontFaceObserver does not directly support variable fonts syntax, which allows for ranges,
            // e.g. `font-weight: 100 800`. FontFaceObserver will insert the entire string value into a
            // CSS `font` shorthand property, causing an error. To get around this, we simply take the first
            // value, because as soon as one variant of the variable font is available, they all should be.
            // See https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Fonts/Variable_Fonts_Guide
            options.weight = typeof options.weight === 'string' ? options.weight.split(' ')[0] : options.weight;
            const observer = new FontFaceObserver(family, options);
            await observer.load();
            // Promise resolves, font is available
            log('debug', `Font face '${family}' is available`, options);
        }
        catch (e) {
            // Promise rejects, font is not available
            log('warn', `Font face '${family}' is NOT available`, options, e);
        }
    },

    // Loads a font face via either the native FontFace API, or CSS injection
    // TODO: consider support for multiple format URLs per face, unicode ranges
    async injectFontFace ({ family, url, weight, style }) {
        this.supportsNativeFontLoading();

        // Convert blob URLs, depending on whether the native FontFace API will be used or not.
        //
        // When the FontFace API *is* supported, the blob URL is read into a raw data array.
        // NB: it's inefficient to be converting blob URLs into typed arrays here, since they originated
        // as raw data *before* they were converted into blob URLs. However, this process should be fast since
        // these are native browser functions and all data is local (no network request), and it keeps the
        // logic streamlined by allowing us to continue to use a URL-based interface for all scene resources.
        //
        // When the FontFace API is *not* supported, the blob URL data is converted to a base64 data URL.
        // This avoids security restricions in some browsers.
        // Also see https://github.com/bramstein/fontloader/blob/598e9399117bdc946ff786fa2c5007a6bd7d3b9e/src/fontface.js#L145-L153
        let data = url;
        if (url.slice(0, 5) === 'blob:') {
            data = (await Utils.io(url, 60000, 'arraybuffer')).body;
            let bytes = new Uint8Array(data);
            if (this.supports_native_font_loading) {
                data = bytes; // use raw binary data
            }
            else {
                let str = '';
                for (let i = 0; i < bytes.length; i++) {
                    str += String.fromCharCode(bytes[i]);
                }
                data = 'data:font/opentype;base64,' + btoa(str); // base64 encode as data URL
            }
        }

        if (this.supports_native_font_loading) {
            // Use native FontFace API
            let face;
            if (typeof data === 'string') { // add as URL
                face = new FontFace(family, `url(${encodeURI(data)})`, { weight, style });
            }
            else if (data instanceof Uint8Array) { // add as binary data
                face = new FontFace(family, data, { weight, style });
            }
            document.fonts.add(face);
            log('trace', 'Adding FontFace to document.fonts:', face);
        }
        else {
            // Use CSS injection
            let css = `
                @font-face {
                    font-family: '${family}';
                    font-weight: ${weight || 'normal'};
                    font-style: ${style || 'normal'};
                    src: url(${encodeURI(data)});
                }`;
            let style_el = document.createElement('style');
            style_el.appendChild(document.createTextNode(''));
            document.head.appendChild(style_el);
            style_el.sheet.insertRule(css, 0);
            log('trace', 'Injecting CSS font face:', css);
        }
    }

};

export default FontManager;
