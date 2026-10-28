let MAX_VALUE = Math.pow(2, 16) - 1;
let has_element_index_uint = false;
const INITIAL_SIZE = 1024;

// Element indices are written directly into a growable typed array (Uint16 until a value overflows,
// then upgraded to Uint32 if supported), avoiding a plain JS array and a final copy into a typed array
export default class VertexElements {
    constructor () {
        this.array = new Uint16Array(INITIAL_SIZE);
        this.length = 0;
        this.has_overflown = false;
    }
    push (value) {
        // If values have overflown and no Uint32 option is available, do not push values
        if (this.has_overflown && !has_element_index_uint) {
            return;
        }

        // Trigger overflow if value is greater than Uint16 max
        if (value > MAX_VALUE && !this.has_overflown) {
            this.has_overflown = true;
            if (!has_element_index_uint) {
                return;
            }
            this.resize(this.array.length, Uint32Array); // upgrade storage to fit larger indices
        }

        if (this.length === this.array.length) {
            this.resize(this.array.length * 2, this.array.constructor);
        }
        this.array[this.length++] = value;
    }
    resize (size, ArrayType) {
        const array = new ArrayType(size);
        array.set(this.array.subarray(0, this.length));
        this.array = array;
    }
    end () {
        if (this.length) {
            // copy to exact size, so that only the used portion is sent to main thread and GPU
            let buffer = this.array.slice(0, this.length);
            this.array = new Uint16Array(INITIAL_SIZE);
            this.length = 0;
            this.has_overflown = false;
            return buffer;
        }
        else {
            return false;
        }
    }
}

VertexElements.setElementIndexUint = function(flag) {
    has_element_index_uint = flag;
};
