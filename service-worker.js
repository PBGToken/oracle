// node_modules/@helios-lang/codec-utils/src/bits/ops.js
function byteToBits(b, n = 8, prefix = true) {
  if (b < 0 || b > 255) {
    throw new Error("invalid byte");
  }
  const bits = b.toString(2);
  if (n < bits.length) {
    throw new Error("n is smaller than the number of bits");
  }
  const s = padBits(bits, n);
  if (prefix) {
    return "0b" + s;
  } else {
    return s;
  }
}
function maskBits(b, i0, i1) {
  if (i0 >= i1 || i0 < 0 || i0 > 7 || i1 > 8 || b < 0 || b > 255) {
    throw new Error("unexpected");
  }
  const mask_bits = [
    255,
    127,
    63,
    31,
    15,
    7,
    3,
    1
  ];
  return (b & mask_bits[i0]) >> 8 - i1;
}
function padBits(bits, n) {
  const nBits = bits.length;
  if (nBits == n) {
    return bits;
  } else if (n <= 0) {
    throw new Error(`invalid pad length (must be > 0, got ${n})`);
  } else if (nBits % n != 0) {
    const nPad = n - nBits % n;
    bits = new Array(nPad).fill("0").join("") + bits;
  }
  return bits;
}
function getBit(bytes, i) {
  return bytes[Math.floor(i / 8)] >> i % 8 & 1;
}

// node_modules/@helios-lang/codec-utils/src/bits/BitReader.js
function makeBitReader(args) {
  return new BitReaderImpl(args.bytes, args.truncate ?? true);
}
var BitReaderImpl = class {
  /**
   * @private
   * @type {Uint8Array}
   */
  _view;
  /**
   * bit position, not byte position
   * @private
   * @type {number}
   */
  _pos;
  /**
   * If true then read last bits as low part of number, if false pad with zero bits (only applies when trying to read more bits than there are left )
   * @private
   * @type {boolean}
   */
  _truncate;
  /**
   * @param {number[] | Uint8Array} bytes
   * @param {boolean} truncate determines behavior when reading too many bits
   */
  constructor(bytes, truncate = true) {
    if (bytes instanceof Uint8Array) {
      this._view = bytes;
    } else {
      this._view = new Uint8Array(bytes);
    }
    this._pos = 0;
    this._truncate = truncate;
  }
  /**
   * @returns {boolean}
   */
  eof() {
    return Math.trunc(this._pos / 8) >= this._view.length;
  }
  /**
   * Moves position to next byte boundary
   * @param {boolean} force - if true then move to next byte boundary if already at byte boundary
   */
  moveToByteBoundary(force = false) {
    if (this._pos % 8 != 0) {
      let n = 8 - this._pos % 8;
      void this.readBits(n);
    } else if (force) {
      this.readBits(8);
    }
  }
  /**
   * Reads a number of bits (<= 8) and returns the result as an unsigned number
   * @param {number} n - number of bits to read
   * @returns {number}
   */
  readBits(n) {
    if (n > 8) {
      throw new Error("reading more than 1 byte");
    }
    let leftShift = 0;
    if (this._pos + n > this._view.length * 8) {
      const newN = this._view.length * 8 - this._pos;
      if (!this._truncate) {
        leftShift = n - newN;
      }
      n = newN;
    }
    if (n == 0) {
      throw new Error("eof");
    }
    let res = 0;
    let i0 = this._pos;
    for (let i = this._pos + 1; i <= this._pos + n; i++) {
      if (i % 8 == 0) {
        const nPart = i - i0;
        res += maskBits(this._view[Math.trunc(i / 8) - 1], i0 % 8, 8) << n - nPart;
        i0 = i;
      } else if (i == this._pos + n) {
        res += maskBits(this._view[Math.trunc(i / 8)], i0 % 8, i % 8);
      }
    }
    this._pos += n;
    return res << leftShift;
  }
  /**
   * Reads 8 bits
   * @returns {number}
   */
  readByte() {
    return this.readBits(8);
  }
};

// node_modules/@helios-lang/codec-utils/src/bits/BitWriter.js
function makeBitWriter(_args = {}) {
  return new BitWriterImpl();
}
var BitWriterImpl = class {
  /**
   * Concatenated and padded upon finalization
   * @private
   * @type {string[]}
   */
  _parts;
  /**
   * Number of bits written so far
   * @private
   * @type {number}
   */
  _n;
  constructor() {
    this._parts = [];
    this._n = 0;
  }
  /**
   * @type {number}
   */
  get length() {
    return this._n;
  }
  /**
   * Pads the BitWriter to align with the byte boundary and returns the resulting bytes.
   * @param {boolean} force - force padding (will add one byte if already aligned)
   * @returns {number[]}
   */
  finalize(force = true) {
    this.padToByteBoundary(force);
    let chars = this._parts.join("");
    let bytes = [];
    for (let i = 0; i < chars.length; i += 8) {
      let byteChars = chars.slice(i, i + 8);
      let byte = parseInt(byteChars, 2);
      bytes.push(byte);
    }
    return bytes;
  }
  /**
   * Add padding to the BitWriter in order to align with the byte boundary.
   * If 'force == true' then 8 bits are added if the BitWriter is already aligned.
   * @param {boolean} force
   */
  padToByteBoundary(force = false) {
    let nPad = 0;
    if (this._n % 8 != 0) {
      nPad = 8 - this._n % 8;
    } else if (force) {
      nPad = 8;
    }
    if (nPad != 0) {
      let padding = new Array(nPad).fill("0");
      padding[nPad - 1] = "1";
      this._parts.push(padding.join(""));
      this._n += nPad;
    }
  }
  /**
   * Pop n bits of the end
   * @param {number} n
   * @returns {string}
   */
  pop(n) {
    if (n > this._n) {
      throw new Error(
        `too many bits to pop, only have ${this._n} bits, but want ${n}`
      );
    }
    const n0 = n;
    const parts = [];
    while (n > 0) {
      const last = this._parts.pop();
      if (last) {
        if (last.length <= n) {
          parts.unshift(last);
          n -= last.length;
        } else {
          parts.unshift(last.slice(last.length - n));
          this._parts.push(last.slice(0, last.length - n));
          n = 0;
        }
      }
    }
    this._n -= n0;
    const bits = parts.join("");
    if (bits.length != n0) {
      throw new Error("unexpected");
    }
    return bits;
  }
  /**
   * Write a string of '0's and '1's to the BitWriter.
   * Returns the BitWriter to enable chaining
   * @param {string} bitChars
   * @returns {BitWriter}
   */
  writeBits(bitChars) {
    for (let c of bitChars) {
      if (c != "0" && c != "1") {
        throw new Error(
          `bit string contains invalid chars: ${bitChars}`
        );
      }
    }
    this._parts.push(bitChars);
    this._n += bitChars.length;
    return this;
  }
  /**
   * Returns the BitWriter to enable chaining
   * @param {number} byte
   * @returns {BitWriter}
   */
  writeByte(byte) {
    if (byte < 0 || byte > 255) {
      throw new Error("invalid byte");
    }
    this.writeBits(padBits(byte.toString(2), 8));
    return this;
  }
};

// node_modules/@helios-lang/codec-utils/src/bytes/base16.js
function hexToBytes(hex) {
  hex = hex.trim();
  if (hex.startsWith("#")) {
    hex = hex.slice(1);
  }
  const bytes = [];
  const n = hex.length;
  if (n % 2 != 0) {
    throw new Error(`invalid hexstring "${hex}" due to uneven length`);
  }
  for (let i = 0; i < n; i += 2) {
    const b = parseInt(hex.slice(i, i + 2), 16);
    if (Number.isNaN(b)) {
      throw new Error(`invalid hexstring "${hex}"`);
    }
    bytes.push(b);
  }
  return bytes;
}
function bytesToHex(bytes) {
  const parts = [];
  for (let b of bytes) {
    if (b < 0 || b > 255) {
      throw new Error("invalid byte");
    }
    parts.push(padBits(b.toString(16), 2));
  }
  return parts.join("");
}

// node_modules/@helios-lang/codec-utils/src/bytes/base32.js
var BASE32_DEFAULT_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";
var BASE32_DEFAULT_PAD_CHAR = "=";
var BASE32_DEFAULT_PROPS = {
  alphabet: BASE32_DEFAULT_ALPHABET,
  padChar: BASE32_DEFAULT_PAD_CHAR,
  strict: false
};
function makeBase32(props = BASE32_DEFAULT_PROPS) {
  const alphabet = props.alphabet ?? BASE32_DEFAULT_ALPHABET;
  const padChar = "padChar" in props ? props.padChar : "";
  const strict = "strict" in props ? props.strict ?? false : false;
  if (alphabet.length != 32) {
    throw new Error(
      `expected base32 alphabet with 32 characters, got ${alphabet.length} characters`
    );
  }
  if (new Set(alphabet.split("")).size != 32) {
    throw new Error(
      "invalid base32 alphabet, doesn't consist 32 unique characters"
    );
  }
  if ("padChar" in props && padChar.length != 1) {
    throw new Error("expected single base32 padChar");
  }
  if ("padChar" in props && alphabet.indexOf(padChar) != -1) {
    throw new Error("base32 padChar can't be part of alphabet");
  }
  return new Base32Impl(alphabet, padChar, strict);
}
var Base32Impl = class {
  /**
   * @readonly
   * @type {string}
   */
  alphabet;
  /**
   * @readonly
   * @type {string}
   */
  padChar;
  /**
   * @readonly
   * @type {boolean}
   */
  strict;
  /**
   * @param {string} alphabet
   * @param {string} padChar
   * @param {boolean} strict
   */
  constructor(alphabet, padChar, strict) {
    this.alphabet = alphabet;
    this.padChar = padChar;
    this.strict = strict;
  }
  /**
   * Checks if all the characters in `s` are in the given base32 alphabet.
   * Checks lengths if their pad characters at the end
   * @param {string} encoded
   * @returns {boolean}
   */
  isValid(encoded) {
    let n = encoded.length;
    if (this.padChar.length == 1 && (this.strict || encoded.endsWith(this.padChar))) {
      if (encoded.length % 8 != 0) {
        return false;
      }
      const iPad = encoded.indexOf(this.padChar);
      for (let i = iPad + 1; i < n; i++) {
        if (encoded.at(i) != this.padChar) {
          return false;
        }
      }
      const nPad = n - iPad;
      if (nPad != 6 && nPad != 4 && nPad != 3 && nPad != 1) {
        return false;
      }
      encoded = encoded.slice(0, iPad);
      n = iPad;
    }
    return encoded.split("").every((c, i) => {
      const code = this.alphabet.indexOf(c.toLowerCase());
      if (code < 0) {
        return false;
      }
      if (i == n - 1) {
        const nBitsExtra = n * 5 - Math.floor(n * 5 / 8) * 8;
        return ((1 << nBitsExtra) - 1 & code) == 0;
      } else {
        return true;
      }
    });
  }
  /**
   * @param {number[]} bytes
   * @returns {number[]} list of numbers between 0 and 32
   */
  encodeRaw(bytes) {
    const result = [];
    const reader = makeBitReader({ bytes, truncate: false });
    while (!reader.eof()) {
      result.push(reader.readBits(5));
    }
    return result;
  }
  /**
   * Trims the padding, asserting it is correctly formed
   * @private
   * @param {string} encoded
   * @returns {string}
   */
  trimPadding(encoded) {
    if (this.padChar.length == 1) {
      let n = encoded.length;
      while (n >= 0 && encoded.at(n - 1) == this.padChar) {
        n -= 1;
      }
      if ((this.strict || n < encoded.length) && encoded.length % 8 != 0) {
        throw new Error("invalid length (expected multiple of 8)");
      }
      const nPad = encoded.length - n;
      if (nPad != 0) {
        if (nPad != 6 && nPad != 4 && nPad != 3 && nPad != 1) {
          throw new Error(
            "invalid number of base32 padding characters"
          );
        }
      }
      return encoded.slice(0, n);
    } else {
      return encoded;
    }
  }
  /**
   * @param {string} encoded
   * @returns {number[]} numbers between 0 and 32
   */
  decodeRaw(encoded) {
    encoded = this.trimPadding(encoded);
    const n = encoded.length;
    const res = [];
    for (let i = 0; i < n; i++) {
      const c = encoded[i];
      if (c == this.padChar) {
        throw new Error("unexpected padding character");
      }
      const code = this.alphabet.indexOf(c.toLowerCase());
      if (code < 0) {
        throw new Error(`invalid base32 character ${c}`);
      } else if (i == n - 1) {
        const nBitsExtra = n * 5 - Math.floor(n * 5 / 8) * 8;
        if (((1 << nBitsExtra) - 1 & code) != 0) {
          throw new Error(`invalid base32 final character`);
        }
      }
      res.push(code);
    }
    return res;
  }
  /**
   * Encodes bytes in using Base32.
   * @param {number[]} bytes list of uint8 numbers
   * @returns {string}
   */
  encode(bytes) {
    const s = this.encodeRaw(bytes).map((c) => this.alphabet[c]).join("");
    const n = s.length;
    if (n % 8 != 0 && this.padChar.length != 0) {
      return s + new Array(8 - n % 8).fill(this.padChar).join("");
    } else {
      return s;
    }
  }
  /**
   * Decodes a Base32 string into bytes.
   * @param {string} encoded
   * @returns {number[]}
   */
  decode(encoded) {
    const writer = makeBitWriter();
    const raw = this.decodeRaw(encoded);
    const n = raw.length;
    raw.forEach((code, i) => {
      if (i == n - 1) {
        const nCut = n * 5 - 8 * Math.floor(n * 5 / 8);
        const bits = padBits(code.toString(2), 5);
        writer.writeBits(bits.slice(0, 5 - nCut));
      } else {
        const bits = padBits(code.toString(2), 5);
        writer.writeBits(bits);
      }
    });
    const result = writer.finalize(false);
    return result;
  }
};
var DEFAULT_BASE32_CODEC = makeBase32();

// node_modules/@helios-lang/codec-utils/src/bytes/base64.js
var BASE64_DEFAULT_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
var BASE64_DEFAULT_PAD_CHAR = "=";
var BASE64_DEFAULT_PROPS = {
  alphabet: BASE64_DEFAULT_ALPHABET,
  padChar: BASE64_DEFAULT_PAD_CHAR,
  strict: false
};
function makeBase64(props = BASE64_DEFAULT_PROPS) {
  const alphabet = props.alphabet ?? BASE64_DEFAULT_ALPHABET;
  const padChar = "padChar" in props ? props.padChar : "";
  const strict = "strict" in props ? props.strict ?? false : false;
  if (alphabet.length != 64) {
    throw new Error(
      `expected base64 alphabet with 64 characters, got ${alphabet.length} characters`
    );
  }
  if (new Set(alphabet.split("")).size != 64) {
    throw new Error(
      "invalid base64 alphabet, doesn't consist of 64 unique characters"
    );
  }
  if ("padChar" in props && padChar.length != 1) {
    throw new Error("base64 padChar can only be one character");
  }
  if ("padChar" in props && alphabet.indexOf(padChar) != -1) {
    throw new Error("base64 padChar can't be part of alphabet");
  }
  return new Base64Impl(alphabet, padChar, strict);
}
var Base64Impl = class {
  /**
   * @readonly
   * @type {string}
   */
  alphabet;
  /**
   * @readonly
   * @type {string}
   */
  padChar;
  /**
   * @readonly
   * @type {boolean}
   */
  strict;
  /**
   * @param {string} alphabet
   * @param {string} padChar
   * @param {boolean} strict
   */
  constructor(alphabet, padChar, strict) {
    this.alphabet = alphabet;
    this.padChar = padChar;
    this.strict = strict;
  }
  /**
   * Checks if base64 encoding is valid.
   * @param {string} encoded
   * @returns {boolean}
   */
  isValid(encoded) {
    let n = encoded.length;
    if (this.padChar.length == 1 && (this.strict || encoded.endsWith(this.padChar))) {
      if (encoded.length % 4 != 0) {
        return false;
      }
      const iPad = encoded.indexOf(this.padChar);
      for (let i = iPad + 1; i < n; i++) {
        if (encoded.at(i) != this.padChar) {
          return false;
        }
      }
      if (iPad < n - 2) {
        return false;
      }
      encoded = encoded.slice(0, iPad);
      n = iPad;
    }
    return encoded.split("").every((c, i) => {
      const code = this.alphabet.indexOf(c);
      if (code < 0) {
        return false;
      }
      if (i == n - 1) {
        const nBitsExtra = n * 6 - Math.floor(n * 6 / 8) * 8;
        return ((1 << nBitsExtra) - 1 & code) == 0;
      } else {
        return true;
      }
    });
  }
  /**
   * @param {number[]} bytes
   * @returns {number[]} list of numbers between 0 and 64
   */
  encodeRaw(bytes) {
    const result = [];
    const reader = makeBitReader({ bytes, truncate: false });
    while (!reader.eof()) {
      result.push(reader.readBits(6));
    }
    return result;
  }
  /**
   * Trims the padding, asserting it is correctly formed
   * @private
   * @param {string} encoded
   * @returns {string}
   */
  trimPadding(encoded) {
    if (this.padChar.length == 1) {
      let n = encoded.length;
      while (n >= 0 && encoded.at(n - 1) == this.padChar) {
        n -= 1;
      }
      if ((n < encoded.length || this.strict) && encoded.length % 4 != 0) {
        throw new Error("invalid length (expected multiple of 4)");
      }
      const nPad = encoded.length - n;
      if (nPad > 2) {
        throw new Error("too many base64 padding characters");
      }
      return encoded.slice(0, n);
    } else {
      return encoded;
    }
  }
  /**
   * @param {string} encoded
   * @returns {number[]} numbers between 0 and 64
   */
  decodeRaw(encoded) {
    encoded = this.trimPadding(encoded);
    const n = encoded.length;
    const res = [];
    for (let i = 0; i < n; i++) {
      const c = encoded[i];
      if (c == this.padChar) {
        throw new Error("unexpected base64 padding character");
      }
      const code = this.alphabet.indexOf(c);
      if (code < 0) {
        throw new Error(`invalid base64 character ${c}`);
      } else if (i == n - 1) {
        const nBitsExtra = n * 6 - Math.floor(n * 6 / 8) * 8;
        if (((1 << nBitsExtra) - 1 & code) != 0) {
          throw new Error(`invalid base64 final character`);
        }
      }
      res.push(code);
    }
    return res;
  }
  /**
   * @param {string} encoded
   * @returns {number[]}
   */
  decode(encoded) {
    const writer = makeBitWriter();
    const raw = this.decodeRaw(encoded);
    const n = raw.length;
    raw.forEach((code, i) => {
      if (i == n - 1) {
        const nCut = n * 6 - 8 * Math.floor(n * 6 / 8);
        const bits = padBits(code.toString(2), 6);
        writer.writeBits(bits.slice(0, 6 - nCut));
      } else {
        const bits = padBits(code.toString(2), 6);
        writer.writeBits(bits);
      }
    });
    const result = writer.finalize(false);
    return result;
  }
  /**
   * @param {number[]} bytes
   * @returns {string}
   */
  encode(bytes) {
    const s = this.encodeRaw(bytes).map((c) => this.alphabet[c]).join("");
    const n = s.length;
    if (n % 4 != 0 && this.padChar != "") {
      return s + new Array(4 - n % 4).fill(this.padChar).join("");
    } else {
      return s;
    }
  }
};
var DEFAULT_BASE64_CODEC = makeBase64();

// node_modules/@helios-lang/codec-utils/src/bytes/BytesLike.js
function toBytes(b) {
  if (Array.isArray(b)) {
    return b;
  } else if (typeof b == "string") {
    return hexToBytes(b);
  } else if (typeof b == "object" && "value" in b) {
    return b.value;
  } else if ("peekRemaining" in b) {
    return b.peekRemaining();
  } else if (typeof b == "object" && "bytes" in b) {
    return b.bytes;
  } else if (b instanceof Uint8Array) {
    return Array.from(b);
  } else {
    throw new Error("not BytesLike");
  }
}

// node_modules/@helios-lang/codec-utils/src/bytes/ByteArrayLike.js
function toUint8Array(bytes) {
  if (bytes instanceof Uint8Array) {
    return bytes;
  } else if (typeof bytes == "string") {
    return Uint8Array.from(hexToBytes(bytes));
  } else if (typeof bytes == "object" && "value" in bytes) {
    return Uint8Array.from(bytes.value);
  } else if (typeof bytes == "object" && "bytes" in bytes) {
    return Uint8Array.from(bytes.bytes);
  } else {
    return Uint8Array.from(bytes);
  }
}

// node_modules/@helios-lang/codec-utils/src/bytes/ByteStream.js
function makeByteStream(args) {
  const bytes = args.bytes;
  if (bytes instanceof ByteStreamImpl) {
    return bytes;
  } else if (typeof bytes == "string" || Array.isArray(bytes)) {
    return new ByteStreamImpl(toUint8Array(bytes), 0);
  } else if ("pos" in bytes && "bytes" in bytes) {
    return new ByteStreamImpl(toUint8Array(bytes.bytes), bytes.pos);
  } else {
    return new ByteStreamImpl(
      toUint8Array(bytes),
      "pos" in args ? args.pos : 0
    );
  }
}
var ByteStreamImpl = class _ByteStreamImpl {
  /**
   * @private
   * @type {Uint8Array}
   */
  _bytes;
  /**
   * @private
   * @type {number}
   */
  _pos;
  /**
   * Not intended for external use
   * @param {Uint8Array} bytes
   * @param {number} pos
   */
  constructor(bytes, pos = 0) {
    this._bytes = bytes;
    this._pos = pos;
  }
  /**
   * @type {Uint8Array}
   */
  get bytes() {
    return this._bytes;
  }
  /**
   * @type {number}
   */
  get pos() {
    return this._pos;
  }
  /**
   * Copy ByteStream so mutations doesn't change original ByteStream
   * @returns {ByteStream}
   */
  copy() {
    return new _ByteStreamImpl(this._bytes, this._pos);
  }
  /**
   * @returns {boolean}
   */
  isAtEnd() {
    return this._pos >= this._bytes.length;
  }
  /**
   * @returns {number}
   */
  peekOne() {
    if (this._pos < this._bytes.length) {
      return this._bytes[this._pos];
    } else {
      throw new Error("at end");
    }
  }
  /**
   * Throws an error if eof
   * @param {number} n
   * @returns {number[]}
   */
  peekMany(n) {
    if (n < 0) {
      throw new Error("unexpected negative n");
    }
    if (this._pos + n <= this._bytes.length) {
      return Array.from(this._bytes.slice(this._pos, this._pos + n));
    } else {
      throw new Error("at end");
    }
  }
  /**
   * @returns {number[]}
   */
  peekRemaining() {
    return Array.from(this._bytes.slice(this._pos));
  }
  /**
   * @returns {number}
   */
  shiftOne() {
    if (this._pos < this._bytes.length) {
      const b = this._bytes[this._pos];
      this._pos += 1;
      return b;
    } else {
      throw new Error("at end");
    }
  }
  /**
   * @param {number} n
   * @returns {number[]}
   */
  shiftMany(n) {
    if (n < 0) {
      throw new Error("unexpected negative n");
    }
    if (this._pos + n <= this._bytes.length) {
      const res = Array.from(this._bytes.slice(this._pos, this._pos + n));
      this._pos += n;
      return res;
    } else {
      throw new Error("at end");
    }
  }
  /**
   * @returns {number[]}
   */
  shiftRemaining() {
    const res = Array.from(this._bytes.slice(this._pos));
    this._pos = this._bytes.length;
    return res;
  }
};

// node_modules/@helios-lang/codec-utils/src/int/be.js
function encodeIntBE(x) {
  if (typeof x == "number") {
    return encodeIntBE(BigInt(x));
  } else if (x < 0n) {
    throw new Error("unexpected negative number");
  } else if (x == 0n) {
    return [0];
  } else {
    const res = [];
    while (x > 0n) {
      res.unshift(Number(x % 256n));
      x = x / 256n;
    }
    return res;
  }
}
function decodeIntBE(bytes) {
  if (bytes.length == 0) {
    throw new Error("empty bytes");
  }
  let p = 1n;
  let total = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) {
    const b = bytes[i];
    if (b < 0 || b > 255 || b % 1 != 0) {
      throw new Error(`invalid byte ${b}`);
    }
    total += BigInt(b) * p;
    p *= 256n;
  }
  return total;
}

// node_modules/@helios-lang/codec-utils/src/bytes/ops.js
function compareBytes(a, b, shortestFirst = false) {
  const na = a.length;
  const nb2 = b.length;
  if (shortestFirst && na != nb2) {
    return na < nb2 ? -1 : 1;
  }
  for (let i = 0; i < Math.min(na, nb2); i++) {
    if (a[i] < b[i]) {
      return -1;
    } else if (a[i] > b[i]) {
      return 1;
    }
  }
  if (na != nb2) {
    return na < nb2 ? -1 : 1;
  } else {
    return 0;
  }
}
function dummyBytes(n, seed = 0) {
  return padBytes(encodeIntBE(seed), n).slice(0, n);
}
function equalsBytes(a, b) {
  return compareBytes(a, b) == 0;
}
function padBytes(bytes, n) {
  const nBytes = bytes.length;
  if (nBytes == n) {
    return bytes;
  } else if (n <= 0) {
    throw new Error(`invalid pad length (must be > 0, got ${n})`);
  } else if (nBytes % n != 0 || nBytes == 0) {
    const nPad = n - nBytes % n;
    bytes = bytes.concat(new Array(nPad).fill(0));
  }
  return bytes;
}
function prepadBytes(bytes, n) {
  const nBytes = bytes.length;
  if (nBytes == n) {
    return bytes;
  } else if (n <= 0) {
    throw new Error(`invalid prepad length (must be > 0, got ${n})`);
  } else if (nBytes > n) {
    throw new Error(
      `padding goal length smaller than bytes length (${n} < ${nBytes})`
    );
  } else {
    const nPad = n - nBytes;
    return new Array(nPad).fill(0).concat(bytes);
  }
}

// node_modules/@helios-lang/codec-utils/src/float/float32.js
function decodeFloat32(bytes) {
  if (bytes.length != 4) {
    throw new Error(
      `expected 4 bytes for IEEE 754 encoded Float32, got ${bytes.length} bytes`
    );
  }
  const view = new DataView(Uint8Array.from(bytes).buffer);
  return view.getFloat32(0);
}
function encodeFloat32(f) {
  const view = new DataView(new ArrayBuffer(4));
  view.setFloat32(0, f);
  return Array.from(new Uint8Array(view.buffer));
}

// node_modules/@helios-lang/codec-utils/src/int/IntLike.js
function toInt(arg) {
  if (typeof arg == "bigint") {
    return Number(arg);
  } else if (arg % 1 == 0) {
    return arg;
  } else {
    throw new Error("not a whole number");
  }
}

// node_modules/@helios-lang/codec-utils/src/int/UInt64.js
function makeUInt64(args) {
  if ("high" in args) {
    return new UInt64Impl(args.high, args.low);
  } else if ("bytes" in args) {
    const bytes = args.bytes;
    const littleEndian = args.littleEndian ?? true;
    let low;
    let high;
    if (littleEndian) {
      low = bytes[0] << 0 | bytes[1] << 8 | bytes[2] << 16 | bytes[3] << 24;
      high = bytes[4] << 0 | bytes[5] << 8 | bytes[6] << 16 | bytes[7] << 24;
    } else {
      high = bytes[0] << 24 | bytes[1] << 16 | bytes[2] << 8 | bytes[3] << 0;
      low = bytes[4] << 24 | bytes[5] << 16 | bytes[6] << 8 | bytes[7] << 0;
    }
    return new UInt64Impl(high >>> 0, low >>> 0);
  } else if ("hex" in args) {
    const hex = args.hex;
    const high = parseInt(hex.slice(0, 8), 16);
    const low = parseInt(hex.slice(8, 16), 16);
    return new UInt64Impl(high >>> 0, low >>> 0);
  } else {
    throw new Error("invalid makeUInt64() arguments");
  }
}
function makeUInt64Fast(high, low) {
  return new UInt64Impl(high, low);
}
var UInt64Impl = class _UInt64Impl {
  /**
   * @type {number}
   */
  high;
  /**
   * @type {number}
   */
  low;
  /**
   * @param {number} high  - uint32 number
   * @param {number} low - uint32 number
   */
  constructor(high, low) {
    this.high = high;
    this.low = low;
  }
  /**
   * Returns [low[0], low[1], low[2], low[3], high[0], high[1], high[2], high[3]] if littleEndian==true
   * @param {boolean} littleEndian
   * @returns {number[]}
   */
  toBytes(littleEndian = true) {
    const res = [
      255 & this.low,
      (65280 & this.low) >>> 8,
      (16711680 & this.low) >>> 16,
      (4278190080 & this.low) >>> 24,
      255 & this.high,
      (65280 & this.high) >>> 8,
      (16711680 & this.high) >>> 16,
      (4278190080 & this.high) >>> 24
    ];
    if (!littleEndian) {
      res.reverse();
    }
    return res;
  }
  /**
   * @param {UInt64} other
   * @returns {boolean}
   */
  eq(other) {
    return this.high == other.high && this.low == other.low;
  }
  /**
   * @returns {UInt64}
   */
  not() {
    return new _UInt64Impl(~this.high, ~this.low);
  }
  /**
   * @param {UInt64} other
   * @returns {UInt64}
   */
  and(other) {
    return new _UInt64Impl(this.high & other.high, this.low & other.low);
  }
  /**
   * @param {UInt64} other
   * @returns {UInt64}
   */
  xor(other) {
    return new _UInt64Impl(
      (this.high ^ other.high) >>> 0,
      (this.low ^ other.low) >>> 0
    );
  }
  /**
   * @param {UInt64} other
   * @returns {UInt64}
   */
  add(other) {
    const low = this.low + other.low;
    let high = this.high + other.high;
    if (low >= 4294967296) {
      high += 1;
    }
    return new _UInt64Impl(high >>> 0, low >>> 0);
  }
  /**
   * @param {number} n
   * @returns {UInt64}
   */
  rotr(n) {
    let h = this.high;
    let l = this.low;
    if (n == 32) {
      return new _UInt64Impl(l, h);
    } else if (n > 32) {
      n -= 32;
      [h, l] = [l, h];
    }
    return new _UInt64Impl(
      (h >>> n | l << 32 - n) >>> 0,
      (l >>> n | h << 32 - n) >>> 0
    );
  }
  /**
   * @param {number} n
   * @returns {UInt64}
   */
  shiftr(n) {
    if (n >= 32) {
      return new _UInt64Impl(0, this.high >>> n - 32);
    } else {
      return new _UInt64Impl(
        this.high >>> n,
        (this.low >>> n | this.high << 32 - n) >>> 0
      );
    }
  }
};
var UINT64_ZERO = new UInt64Impl(0, 0);

// node_modules/@helios-lang/codec-utils/src/int/le.js
function decodeIntLE(bytes) {
  return decodeIntBE(Array.from(bytes).reverse());
}
function encodeIntLE32(x) {
  if (typeof x == "number") {
    return encodeIntLE32(BigInt(x));
  } else {
    return padBytes(encodeIntBE(x).reverse(), 32);
  }
}

// node_modules/@helios-lang/codec-utils/src/int/zigzag.js
function encodeZigZag(x) {
  if (typeof x == "number") {
    return encodeZigZag(BigInt(x));
  } else if (x < 0n) {
    return -x * 2n - 1n;
  } else {
    return x * 2n;
  }
}
function decodeZigZag(x) {
  if (typeof x == "number") {
    return decodeZigZag(BigInt(x));
  } else if (x < 0n) {
    throw new Error("invalid zigzag encoding");
  } else if (x % 2n == 0n) {
    return x / 2n;
  } else {
    return -(x + 1n) / 2n;
  }
}

// node_modules/@helios-lang/codec-utils/src/string/utf8.js
function isValidUtf8(bytes) {
  if (bytes.some((b) => b < 0 || b > 255)) {
    return false;
  }
  try {
    decodeUtf8(bytes);
    return true;
  } catch (e) {
    return false;
  }
}
function encodeUtf8(str) {
  return Array.from(new TextEncoder().encode(str));
}
function decodeUtf8(bytes) {
  return new TextDecoder("utf-8", { fatal: true }).decode(
    new Uint8Array(bytes).buffer
  );
}

// node_modules/@helios-lang/cbor/src/bool.js
var FALSE_BYTE = 244;
var TRUE_BYTE = 245;
function encodeBool(b) {
  if (b) {
    return [TRUE_BYTE];
  } else {
    return [FALSE_BYTE];
  }
}
function decodeBool(bytes) {
  const stream = makeByteStream({ bytes });
  const b = stream.shiftOne();
  if (b == TRUE_BYTE) {
    return true;
  } else if (b == FALSE_BYTE) {
    return false;
  } else {
    throw new Error("unexpected non-boolean cbor object");
  }
}

// node_modules/@helios-lang/cbor/src/head.js
function encodeDefHead(m, n) {
  if (n <= 23n) {
    return [32 * m + Number(n)];
  } else if (n >= 24n && n <= 255n) {
    return [32 * m + 24, Number(n)];
  } else if (n >= 256n && n <= 256n * 256n - 1n) {
    return [
      32 * m + 25,
      Number(BigInt(n) / 256n % 256n),
      Number(BigInt(n) % 256n)
    ];
  } else if (n >= 256n * 256n && n <= 256n * 256n * 256n * 256n - 1n) {
    const e4 = encodeIntBE(n);
    while (e4.length < 4) {
      e4.unshift(0);
    }
    return [32 * m + 26].concat(e4);
  } else if (n >= 256n * 256n * 256n * 256n && n <= 256n * 256n * 256n * 256n * 256n * 256n * 256n * 256n - 1n) {
    const e8 = encodeIntBE(n);
    while (e8.length < 8) {
      e8.unshift(0);
    }
    return [32 * m + 27].concat(e8);
  } else {
    throw new Error("n out of range");
  }
}
function decodeDefHead(bytes) {
  const stream = makeByteStream({ bytes });
  if (stream.isAtEnd()) {
    throw new Error("empty cbor head");
  }
  const first = stream.shiftOne();
  const m = Math.trunc(first / 32);
  if (first % 32 <= 23) {
    return [m, BigInt(first % 32)];
  } else if (first % 32 == 24) {
    return [m, decodeIntBE(stream.shiftMany(1))];
  } else if (first % 32 == 25) {
    if (m == 7) {
      throw new Error("decode Float16 by calling decodeFloat16 directly");
    } else {
      return [m, decodeIntBE(stream.shiftMany(2))];
    }
  } else if (first % 32 == 26) {
    if (m == 7) {
      throw new Error("decode Float32 by calling decodeFloat32 directly");
    } else {
      return [m, decodeIntBE(stream.shiftMany(4))];
    }
  } else if (first % 32 == 27) {
    if (m == 7) {
      throw new Error("decode Float64 by calling decodeFloat64 directly");
    } else {
      return [m, decodeIntBE(stream.shiftMany(8))];
    }
  } else if ((m == 2 || m == 3 || m == 4 || m == 5 || m == 7) && first % 32 == 31) {
    throw new Error(
      "unexpected header header (expected def instead of indef)"
    );
  } else {
    throw new Error("bad header");
  }
}
function peekMajorType(bytes) {
  const stream = makeByteStream({ bytes });
  return Math.trunc(stream.peekOne() / 32);
}
function encodeIndefHead(m) {
  return [32 * m + 31];
}

// node_modules/@helios-lang/cbor/src/bytes.js
function isDefBytes(bytes) {
  const stream = makeByteStream({ bytes });
  const m = peekMajorType(stream);
  return m == 2 && stream.peekOne() != 2 * 32 + 31;
}
function isIndefBytes(bytes) {
  const stream = makeByteStream({ bytes });
  return 2 * 32 + 31 == stream.peekOne();
}
function isBytes(bytes) {
  return peekMajorType(bytes) == 2;
}
function encodeBytes(bytes, splitIntoChunks = false) {
  bytes = bytes.slice();
  if (bytes.length <= 64 || !splitIntoChunks) {
    const head = encodeDefHead(2, BigInt(bytes.length));
    return head.concat(bytes);
  } else {
    let res = encodeIndefHead(2);
    while (bytes.length > 0) {
      const chunk = bytes.splice(0, 64);
      res = res.concat(encodeDefHead(2, BigInt(chunk.length))).concat(chunk);
    }
    res.push(255);
    return res;
  }
}
function decodeBytes(bytes) {
  const stream = makeByteStream({ bytes });
  if (isIndefBytes(bytes)) {
    void stream.shiftOne();
    let res = [];
    while (stream.peekOne() != 255) {
      const [_, n] = decodeDefHead(stream);
      if (n > 64n) {
        throw new Error("bytearray chunk too large");
      }
      res = res.concat(stream.shiftMany(Number(n)));
    }
    if (stream.shiftOne() != 255) {
      throw new Error("invalid indef bytes termination byte");
    }
    return res;
  } else {
    const [m, n] = decodeDefHead(stream);
    if (m != 2) {
      throw new Error("invalid def bytes");
    }
    return stream.shiftMany(Number(n));
  }
}

// node_modules/@helios-lang/cbor/src/generic.js
function decodeGeneric(stream, decoder) {
  if (decoder && "fromCbor" in decoder) {
    return decoder.fromCbor(stream);
  } else {
    return decoder(stream);
  }
}
function encodeGeneric(encodeable) {
  if (Array.isArray(encodeable)) {
    return encodeable;
  } else {
    return encodeable.toCbor();
  }
}

// node_modules/@helios-lang/cbor/src/int.js
function encodeInt(n) {
  if (typeof n == "number") {
    return encodeInt(BigInt(n));
  } else if (n >= 0n && n <= (2n << 63n) - 1n) {
    return encodeDefHead(0, n);
  } else if (n >= 2n << 63n) {
    return encodeDefHead(6, 2).concat(encodeBytes(encodeIntBE(n)));
  } else if (n <= -1n && n >= -(2n << 63n)) {
    return encodeDefHead(1, -n - 1n);
  } else {
    return encodeDefHead(6, 3).concat(encodeBytes(encodeIntBE(-n - 1n)));
  }
}
function decodeInt(bytes) {
  const stream = makeByteStream({ bytes });
  const [m, n] = decodeDefHead(stream);
  if (m == 0) {
    return n;
  } else if (m == 1) {
    return -n - 1n;
  } else if (m == 6) {
    if (n == 2n) {
      const b = decodeBytes(stream);
      return decodeIntBE(b);
    } else if (n == 3n) {
      const b = decodeBytes(stream);
      return -decodeIntBE(b) - 1n;
    } else {
      throw new Error(`unexpected tag n:${n}`);
    }
  } else {
    throw new Error(`unexpected tag m:${m}`);
  }
}

// node_modules/@helios-lang/cbor/node_modules/@helios-lang/type-utils/src/option.js
var None = null;

// node_modules/@helios-lang/cbor/src/list.js
function getIndexedDecoder(decoder) {
  if (decoder && "fromCbor" in decoder) {
    return (stream, _i) => {
      return decoder.fromCbor(stream);
    };
  } else {
    return decoder;
  }
}
function isIndefList(bytes) {
  const stream = makeByteStream({ bytes });
  if (stream.isAtEnd()) {
    throw new Error("empty cbor bytes");
  }
  return 4 * 32 + 31 == stream.peekOne();
}
function isDefList(bytes) {
  const stream = makeByteStream({ bytes });
  return peekMajorType(stream) == 4 && stream.peekOne() != 4 * 32 + 31;
}
function isList(bytes) {
  return peekMajorType(bytes) == 4;
}
function encodeIndefListStart() {
  return encodeIndefHead(4);
}
function encodeListInternal(list2) {
  let res = [];
  for (let item of list2) {
    res = res.concat(encodeGeneric(item));
  }
  return res;
}
function encodeIndefListEnd() {
  return [255];
}
function encodeList(items) {
  return items.length > 0 ? encodeIndefList(items) : encodeDefList(items);
}
function encodeIndefList(list2) {
  return encodeIndefListStart().concat(encodeListInternal(list2)).concat(encodeIndefListEnd());
}
function encodeDefListStart(n) {
  return encodeDefHead(4, n);
}
function encodeDefList(items) {
  return encodeDefListStart(BigInt(items.length)).concat(
    encodeListInternal(items)
  );
}
function decodeList(bytes, itemDecoder) {
  const stream = makeByteStream({ bytes });
  const itemDecoder_ = getIndexedDecoder(itemDecoder);
  const res = [];
  if (isIndefList(stream)) {
    void stream.shiftOne();
    let i = 0;
    while (stream.peekOne() != 255) {
      res.push(itemDecoder_(stream, i));
      i++;
    }
    if (stream.shiftOne() != 255) {
      throw new Error("invalid indef list termination byte");
    }
  } else {
    const [m, n] = decodeDefHead(stream);
    if (m != 4) {
      throw new Error("invalid def list head byte");
    }
    for (let i = 0; i < Number(n); i++) {
      res.push(itemDecoder_(stream, i));
    }
  }
  return res;
}
function decodeListLazy(bytes) {
  const stream = makeByteStream({ bytes });
  if (isIndefList(stream)) {
    let decodeItem2 = function(itemDecoder) {
      if (done) {
        throw new Error("end-of-list");
      }
      const itemDecoder_ = getIndexedDecoder(itemDecoder);
      const res = itemDecoder_(stream, i);
      i++;
      if (stream.peekOne() == 255) {
        stream.shiftOne();
        done = true;
      }
      return res;
    };
    var decodeItem = decodeItem2;
    void stream.shiftOne();
    let i = 0;
    let done = false;
    if (stream.peekOne() == 255) {
      stream.shiftOne();
      done = true;
    }
    return decodeItem2;
  } else {
    let decodeItem2 = function(itemDecoder) {
      if (i >= n) {
        throw new Error("end-of-list");
      }
      const itemDecoder_ = getIndexedDecoder(itemDecoder);
      const res = itemDecoder_(stream, i);
      i++;
      return res;
    };
    var decodeItem = decodeItem2;
    const [m, n] = decodeDefHead(stream);
    if (m != 4) {
      throw new Error("unexpected");
    }
    let i = 0;
    return decodeItem2;
  }
}

// node_modules/@helios-lang/cbor/src/constr.js
function isConstr(bytes) {
  const stream = makeByteStream({ bytes });
  const [m, n] = decodeDefHead(stream.copy());
  if (m == 6) {
    return n == 102n || n >= 121n && n <= 127n || n >= 1280n && n <= 1400n;
  } else {
    return false;
  }
}
function encodeConstrTag(tag) {
  if (tag < 0 || tag % 1 != 0) {
    throw new Error("invalid tag");
  } else if (tag >= 0 && tag <= 6) {
    return encodeDefHead(6, 121n + BigInt(tag));
  } else if (tag >= 7 && tag <= 127) {
    return encodeDefHead(6, 1280n + BigInt(tag - 7));
  } else {
    return encodeDefHead(6, 102n).concat(encodeDefHead(4, 2n)).concat(encodeInt(BigInt(tag)));
  }
}
function encodeConstr(tag, fields) {
  return encodeConstrTag(tag).concat(encodeList(fields));
}
function decodeConstrTag(bytes) {
  const stream = makeByteStream({ bytes });
  const [m, n] = decodeDefHead(stream);
  if (m != 6) {
    throw new Error("unexpected");
  }
  if (n < 102n) {
    throw new Error(`unexpected encoded constr tag ${n}`);
  } else if (n == 102n) {
    const [mCheck, nCheck] = decodeDefHead(stream);
    if (mCheck != 4 || nCheck != 2n) {
      throw new Error("unexpected");
    }
    return Number(decodeInt(stream));
  } else if (n < 121n) {
    throw new Error(`unexpected encoded constr tag ${n}`);
  } else if (n <= 127n) {
    return Number(n - 121n);
  } else if (n < 1280n) {
    throw new Error(`unexpected encoded constr tag ${n}`);
  } else if (n <= 1400n) {
    return Number(n - 1280n + 7n);
  } else {
    throw new Error(`unexpected encoded constr tag ${n}`);
  }
}
function decodeConstr(bytes, fieldDecoder) {
  const stream = makeByteStream({ bytes });
  const tag = decodeConstrTag(stream);
  const res = decodeList(stream, (itemStream, i) => {
    if (Array.isArray(fieldDecoder)) {
      const decoder = fieldDecoder[i];
      if (!decoder) {
        throw new Error(
          `expected ${fieldDecoder.length} fields, got more than ${i}`
        );
      }
      return decodeGeneric(itemStream, decoder);
    } else {
      return decodeGeneric(itemStream, fieldDecoder);
    }
  });
  if (Array.isArray(fieldDecoder)) {
    if (res.length < fieldDecoder.length) {
      throw new Error(
        `expected ${fieldDecoder.length} fields, only got ${res.length}`
      );
    }
  }
  return [tag, res];
}
function decodeConstrLazy(bytes) {
  const stream = makeByteStream({ bytes });
  const tag = decodeConstrTag(stream);
  const decodeField = decodeListLazy(bytes);
  return (
    /** @type {[number, typeof decodeField]} */
    [tag, decodeField]
  );
}

// node_modules/@helios-lang/cbor/src/float.js
var FLOAT32_HEAD = 250;
function decodeFloat322(bytes) {
  const stream = makeByteStream({ bytes });
  const head = stream.shiftOne();
  if (head != FLOAT32_HEAD) {
    throw new Error("invalid Float32 header");
  }
  return decodeFloat32(stream.shiftMany(4));
}
function encodeFloat322(f) {
  return [FLOAT32_HEAD].concat(encodeFloat32(f));
}

// node_modules/@helios-lang/cbor/src/map.js
function isMap(bytes) {
  return peekMajorType(bytes) == 5;
}
function isIndefMap(bytes) {
  const stream = makeByteStream({ bytes });
  return 5 * 32 + 31 == stream.peekOne();
}
function encodeMapInternal(pairList) {
  let res = [];
  for (let pair of pairList) {
    const key = pair[0];
    const value = pair[1];
    res = res.concat(encodeGeneric(key));
    res = res.concat(encodeGeneric(value));
  }
  return res;
}
function encodeDefMap(pairList) {
  return encodeDefHead(5, BigInt(pairList.length)).concat(
    encodeMapInternal(pairList)
  );
}
function encodeMap(pairs) {
  return encodeDefMap(pairs);
}
function decodeDefMap(stream, n, keyDecoder, valueDecoder) {
  const res = [];
  for (let i = 0; i < n; i++) {
    res.push([
      decodeGeneric(stream, keyDecoder),
      decodeGeneric(stream, valueDecoder)
    ]);
  }
  return res;
}
function decodeIndefMap(stream, keyDecoder, valueDecoder) {
  const res = [];
  while (stream.peekOne() != 255) {
    res.push([
      decodeGeneric(stream, keyDecoder),
      decodeGeneric(stream, valueDecoder)
    ]);
  }
  stream.shiftOne();
  return res;
}
function decodeMap(bytes, keyDecoder, valueDecoder) {
  const stream = makeByteStream({ bytes });
  if (isIndefMap(stream)) {
    void stream.shiftOne();
    return decodeIndefMap(stream, keyDecoder, valueDecoder);
  } else {
    const [m, n] = decodeDefHead(stream);
    if (m != 5) {
      throw new Error("invalid def map");
    }
    return decodeDefMap(stream, Number(n), keyDecoder, valueDecoder);
  }
}

// node_modules/@helios-lang/cbor/src/null.js
var NULL_BYTE = 246;
function isNull(bytes) {
  const stream = makeByteStream({ bytes });
  return stream.peekOne() == NULL_BYTE;
}
function encodeNull(_null = null) {
  return [NULL_BYTE];
}
function decodeNull(bytes) {
  const stream = makeByteStream({ bytes });
  const b = stream.shiftOne();
  if (b != NULL_BYTE) {
    throw new Error("not null");
  }
  return null;
}

// node_modules/@helios-lang/cbor/src/string.js
function isString2(bytes) {
  return peekMajorType(bytes) == 3;
}
function encodeString(str, split = false) {
  const bytes = encodeUtf8(str);
  if (split && bytes.length > 64) {
    const chunks = [];
    let i = 0;
    while (i < bytes.length) {
      let maxChunkLength = 64;
      let chunk;
      while (true) {
        chunk = bytes.slice(i, i + maxChunkLength);
        if (isValidUtf8(chunk)) {
          break;
        }
        maxChunkLength--;
      }
      chunks.push(encodeDefHead(3, BigInt(chunk.length)).concat(chunk));
      i += chunk.length;
    }
    return encodeDefList(chunks);
  } else {
    return encodeDefHead(3, BigInt(bytes.length)).concat(bytes);
  }
}
function decodeStringInternal(bytes) {
  const stream = makeByteStream({ bytes });
  const [m, n] = decodeDefHead(stream);
  if (m !== 3) {
    throw new Error("unexpected");
  }
  return decodeUtf8(stream.shiftMany(Number(n)));
}
function decodeString(bytes) {
  const stream = makeByteStream({ bytes });
  if (isDefList(stream)) {
    let result = "";
    decodeList(stream, (itemBytes, _) => {
      result += decodeStringInternal(itemBytes);
    });
    return result;
  } else {
    return decodeStringInternal(stream);
  }
}

// node_modules/@helios-lang/cbor/src/object.js
function isObject2(bytes) {
  return isMap(bytes);
}
function encodeObjectIKey(object) {
  const entries = object instanceof Map ? Array.from(object.entries()).map((pair) => [
    encodeInt(pair[0]),
    pair[1]
  ]) : Object.entries(object).map((pair) => [
    encodeInt(parseInt(pair[0])),
    pair[1]
  ]);
  return encodeDefMap(entries);
}
function decodeObjectTypeless(bytes, keyDecoder, fieldDecoders) {
  const stream = makeByteStream({ bytes });
  const res = {};
  decodeMap(
    stream,
    () => null,
    (pairStream) => {
      const key = decodeGeneric(pairStream, keyDecoder);
      const decoder = fieldDecoders[key];
      if (!decoder) {
        throw new Error(`unhandled object field ${key}`);
      }
      res[key] = decodeGeneric(pairStream, decoder);
    }
  );
  return res;
}
function decodeObjectIKey(bytes, fieldDecoders) {
  return decodeObjectTypeless(
    bytes,
    /**
     * @param {ByteStream} stream
     * @returns {number}
     */
    (stream) => Number(decodeInt(stream)),
    fieldDecoders
  );
}

// node_modules/@helios-lang/cbor/src/option.js
function decodeNullOption(bytes, decodeSome) {
  const stream = makeByteStream({ bytes });
  if (isNull(stream)) {
    return decodeNull(stream) ?? None;
  } else {
    return decodeGeneric(stream, decodeSome);
  }
}
function encodeNullOption(option) {
  return option ? encodeGeneric(option) : encodeNull();
}

// node_modules/@helios-lang/cbor/src/tag.js
function encodeTag(tag) {
  if (typeof tag == "number") {
    return encodeTag(BigInt(tag));
  } else if (tag < 0) {
    throw new Error("can't encode negative tag");
  }
  return encodeDefHead(6, tag);
}
function decodeTag(bytes) {
  const stream = makeByteStream({ bytes });
  const [m, n] = decodeDefHead(stream);
  if (m != 6) {
    throw new Error("unexpected");
  }
  return n;
}

// node_modules/@helios-lang/cbor/src/tagged.js
function decodeTagged(bytes) {
  const stream = makeByteStream({ bytes });
  if (isList(stream)) {
    const decodeItem = decodeListLazy(stream);
    const tag = Number(decodeItem(decodeInt));
    return (
      /** @type {[number, typeof decodeItem]} */
      [tag, decodeItem]
    );
  } else {
    return decodeConstrLazy(stream);
  }
}

// node_modules/@helios-lang/cbor/src/tuple.js
function isTuple2(bytes) {
  return isList(bytes);
}
function encodeTuple(tuple) {
  return encodeDefList(tuple);
}
function decodeTuple(bytes, itemDecoders, optionalDecoders = []) {
  const stream = makeByteStream({ bytes });
  const res = decodeList(stream, (itemStream, i) => {
    let decoder = itemDecoders[i];
    if (!decoder) {
      decoder = optionalDecoders[i - itemDecoders.length];
      if (!decoder) {
        throw new Error(
          `expected at most ${itemDecoders.length + optionalDecoders.length} items, got more than ${i}`
        );
      }
    }
    return decodeGeneric(itemStream, decoder);
  });
  if (res.length < itemDecoders.length) {
    throw new Error(
      `expected at least ${itemDecoders.length} items, only got ${res.length}`
    );
  }
  return res;
}
function decodeTupleLazy(bytes) {
  return decodeListLazy(bytes);
}

// node_modules/@helios-lang/crypto/src/checksum/bech32.js
var BECH32_BASE32_ALPHABET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
var BECH32_PAYLOAD_CODEC = makeBase32({
  alphabet: BECH32_BASE32_ALPHABET
});
function expandHrp(hrp) {
  const bytes = [];
  for (let c of hrp) {
    bytes.push(c.charCodeAt(0) >> 5);
  }
  bytes.push(0);
  for (let c of hrp) {
    bytes.push(c.charCodeAt(0) & 31);
  }
  return bytes;
}
function splitBech32(encoded) {
  const i = encoded.indexOf("1");
  if (i == -1 || i == 0) {
    return ["", encoded];
  } else {
    return [encoded.slice(0, i), encoded.slice(i + 1)];
  }
}
function polymod(bytes) {
  const GEN = [996825010, 642813549, 513874426, 1027748829, 705979059];
  let chk = 1;
  for (let b of bytes) {
    const c = chk >> 25;
    chk = (chk & 536870911) << 5 ^ b;
    for (let i = 0; i < 5; i++) {
      if ((c >> i & 1) != 0) {
        chk ^= GEN[i];
      }
    }
  }
  return chk;
}
function calcChecksum(hrp, data) {
  const bytes = expandHrp(hrp).concat(data);
  const chk = polymod(bytes.concat([0, 0, 0, 0, 0, 0])) ^ 1;
  const chkSum = [];
  for (let i = 0; i < 6; i++) {
    chkSum.push(chk >> 5 * (5 - i) & 31);
  }
  return chkSum;
}
function verifySplitBech32(hrp, payload) {
  if (hrp.length == 0) {
    return false;
  }
  const data = [];
  for (let c of payload) {
    const j = BECH32_BASE32_ALPHABET.indexOf(c);
    if (j == -1) {
      return false;
    }
    data.push(j);
  }
  const chkSumA = data.slice(data.length - 6);
  const chkSumB = calcChecksum(hrp, data.slice(0, data.length - 6));
  for (let j = 0; j < 6; j++) {
    if (chkSumA[j] != chkSumB[j]) {
      return false;
    }
  }
  return true;
}
function encodeBech32(hrp, payload) {
  if (hrp.length == 0) {
    throw new Error("human-readable-part must have non-zero length");
  }
  payload = BECH32_PAYLOAD_CODEC.encodeRaw(payload);
  const chkSum = calcChecksum(hrp, payload);
  return hrp + "1" + payload.concat(chkSum).map((i) => BECH32_BASE32_ALPHABET[i]).join("");
}
function decodeBech32(addr) {
  const [hrp, payload] = splitBech32(addr);
  if (!verifySplitBech32(hrp, payload)) {
    throw new Error("invalid bech32 addr");
  }
  const data = BECH32_PAYLOAD_CODEC.decode(
    payload.slice(0, payload.length - 6)
  );
  return [hrp, data];
}

// node_modules/@helios-lang/crypto/src/digest/blake2b.js
var WIDTH = 128;
var IV = [
  makeUInt64Fast(1779033703, 4089235720),
  makeUInt64Fast(3144134277, 2227873595),
  makeUInt64Fast(1013904242, 4271175723),
  makeUInt64Fast(2773480762, 1595750129),
  makeUInt64Fast(1359893119, 2917565137),
  makeUInt64Fast(2600822924, 725511199),
  makeUInt64Fast(528734635, 4215389547),
  makeUInt64Fast(1541459225, 327033209)
];
var SIGMA = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  [14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3],
  [11, 8, 12, 0, 5, 2, 15, 13, 10, 14, 3, 6, 7, 1, 9, 4],
  [7, 9, 3, 1, 13, 12, 11, 14, 2, 6, 5, 10, 4, 0, 15, 8],
  [9, 0, 5, 7, 2, 4, 10, 15, 14, 1, 11, 12, 6, 8, 3, 13],
  [2, 12, 6, 10, 0, 11, 8, 3, 4, 13, 7, 5, 15, 14, 1, 9],
  [12, 5, 1, 15, 14, 13, 4, 10, 0, 7, 6, 3, 9, 2, 8, 11],
  [13, 11, 7, 14, 12, 1, 3, 9, 5, 0, 15, 4, 8, 6, 2, 10],
  [6, 15, 14, 9, 11, 3, 0, 8, 12, 2, 13, 7, 1, 4, 10, 5],
  [10, 2, 8, 4, 7, 6, 1, 5, 15, 11, 9, 14, 3, 12, 13, 0]
];
function pad(src) {
  const dst = src.slice();
  const nZeroes = dst.length == 0 ? WIDTH : (WIDTH - dst.length % WIDTH) % WIDTH;
  for (let i = 0; i < nZeroes; i++) {
    dst.push(0);
  }
  return dst;
}
function mix(v, chunk, a, b, c, d, i, j) {
  const x = chunk[i];
  const y = chunk[j];
  v[a] = v[a].add(v[b]).add(x);
  v[d] = v[d].xor(v[a]).rotr(32);
  v[c] = v[c].add(v[d]);
  v[b] = v[b].xor(v[c]).rotr(24);
  v[a] = v[a].add(v[b]).add(y);
  v[d] = v[d].xor(v[a]).rotr(16);
  v[c] = v[c].add(v[d]);
  v[b] = v[b].xor(v[c]).rotr(63);
}
function compress(h, chunk, t, last) {
  const v = h.slice().concat(IV.slice());
  v[12] = v[12].xor(makeUInt64Fast(0, t >>> 0));
  if (last) {
    v[14] = v[14].xor(makeUInt64Fast(4294967295, 4294967295));
  }
  for (let round = 0; round < 12; round++) {
    const s = SIGMA[round % 10];
    for (let i = 0; i < 4; i++) {
      mix(v, chunk, i, i + 4, i + 8, i + 12, s[i * 2], s[i * 2 + 1]);
    }
    for (let i = 0; i < 4; i++) {
      mix(
        v,
        chunk,
        i,
        (i + 1) % 4 + 4,
        (i + 2) % 4 + 8,
        (i + 3) % 4 + 12,
        s[8 + i * 2],
        s[8 + i * 2 + 1]
      );
    }
  }
  for (let i = 0; i < 8; i++) {
    h[i] = h[i].xor(v[i].xor(v[i + 8]));
  }
}
function blake2b(bytes, digestSize = 32) {
  const nBytes = bytes.length;
  bytes = pad(bytes);
  const h = IV.slice();
  const paramBlock = new Uint8Array(64);
  paramBlock[0] = digestSize;
  paramBlock[1] = 0;
  paramBlock[2] = 1;
  paramBlock[3] = 1;
  const paramBlockView = new DataView(paramBlock.buffer);
  for (let i = 0; i < 8; i++) {
    h[i] = h[i].xor(
      makeUInt64Fast(
        paramBlockView.getUint32(i * 8 + 4, true),
        paramBlockView.getUint32(i * 8, true)
      )
    );
  }
  for (let chunkStart = 0; chunkStart < bytes.length; chunkStart += WIDTH) {
    const chunkEnd = chunkStart + WIDTH;
    const chunk = bytes.slice(chunkStart, chunkStart + WIDTH);
    const chunk64 = new Array(WIDTH / 8);
    for (let i = 0; i < WIDTH; i += 8) {
      chunk64[i / 8] = makeUInt64({ bytes: chunk.slice(i, i + 8) });
    }
    if (chunkStart == bytes.length - WIDTH) {
      compress(h, chunk64, nBytes, true);
    } else {
      compress(h, chunk64, chunkEnd, false);
    }
  }
  let hash4 = [];
  for (let i = 0; i < digestSize / 8; i++) {
    hash4 = hash4.concat(h[i].toBytes());
  }
  return hash4.slice(0, digestSize);
}

// node_modules/@helios-lang/crypto/src/digest/sha2_256.js
var K = [
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
];
var IV2 = [
  1779033703,
  3144134277,
  1013904242,
  2773480762,
  1359893119,
  2600822924,
  528734635,
  1541459225
];
function pad2(src) {
  const nBits = src.length * 8;
  let dst = src.slice();
  dst.push(128);
  if ((dst.length + 8) % 64 != 0) {
    let nZeroes = 64 - dst.length % 64 - 8;
    if (nZeroes < 0) {
      nZeroes += 64;
    }
    for (let i = 0; i < nZeroes; i++) {
      dst.push(0);
    }
  }
  if ((dst.length + 8) % 64 != 0) {
    throw new Error("bad padding");
  }
  const lengthPadding = encodeIntBE(BigInt(nBits));
  if (lengthPadding.length > 8) {
    throw new Error("input data too big");
  }
  while (lengthPadding.length < 8) {
    lengthPadding.unshift(0);
  }
  dst = dst.concat(lengthPadding);
  return dst;
}
function rotr(x, n) {
  return (x >>> n | x << 32 - n) >>> 0;
}
function sigma0(x) {
  return rotr(x, 7) ^ rotr(x, 18) ^ x >>> 3;
}
function sigma1(x) {
  return rotr(x, 17) ^ rotr(x, 19) ^ x >>> 10;
}
function sha2_256(bytes) {
  bytes = pad2(bytes);
  const hash4 = IV2.slice();
  for (let chunkStart = 0; chunkStart < bytes.length; chunkStart += 64) {
    const chunk = bytes.slice(chunkStart, chunkStart + 64);
    const w = new Array(64).fill(0);
    for (let i = 0; i < 16; i++) {
      w[i] = chunk[i * 4 + 0] << 24 | chunk[i * 4 + 1] << 16 | chunk[i * 4 + 2] << 8 | chunk[i * 4 + 3];
    }
    for (let i = 16; i < 64; i++) {
      w[i] = w[i - 16] + sigma0(w[i - 15]) + w[i - 7] + sigma1(w[i - 2]) >>> 0;
    }
    let a = hash4[0];
    let b = hash4[1];
    let c = hash4[2];
    let d = hash4[3];
    let e = hash4[4];
    let f = hash4[5];
    let g = hash4[6];
    let h = hash4[7];
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = e & f ^ ~e & g;
      const temp1 = h + S1 + ch + K[i] + w[i] >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = a & b ^ a & c ^ b & c;
      const temp2 = S0 + maj >>> 0;
      h = g;
      g = f;
      f = e;
      e = d + temp1 >>> 0;
      d = c;
      c = b;
      b = a;
      a = temp1 + temp2 >>> 0;
    }
    hash4[0] = hash4[0] + a >>> 0;
    hash4[1] = hash4[1] + b >>> 0;
    hash4[2] = hash4[2] + c >>> 0;
    hash4[3] = hash4[3] + d >>> 0;
    hash4[4] = hash4[4] + e >>> 0;
    hash4[5] = hash4[5] + f >>> 0;
    hash4[6] = hash4[6] + g >>> 0;
    hash4[7] = hash4[7] + h >>> 0;
  }
  const result = [];
  for (let i = 0; i < 8; i++) {
    const item = hash4[i];
    result.push(item >> 24 & 255);
    result.push(item >> 16 & 255);
    result.push(item >> 8 & 255);
    result.push(item >> 0 & 255);
  }
  return result;
}

// node_modules/@helios-lang/crypto/src/digest/sha2_512.js
var K2 = [
  1116352408,
  3609767458,
  1899447441,
  602891725,
  3049323471,
  3964484399,
  3921009573,
  2173295548,
  961987163,
  4081628472,
  1508970993,
  3053834265,
  2453635748,
  2937671579,
  2870763221,
  3664609560,
  3624381080,
  2734883394,
  310598401,
  1164996542,
  607225278,
  1323610764,
  1426881987,
  3590304994,
  1925078388,
  4068182383,
  2162078206,
  991336113,
  2614888103,
  633803317,
  3248222580,
  3479774868,
  3835390401,
  2666613458,
  4022224774,
  944711139,
  264347078,
  2341262773,
  604807628,
  2007800933,
  770255983,
  1495990901,
  1249150122,
  1856431235,
  1555081692,
  3175218132,
  1996064986,
  2198950837,
  2554220882,
  3999719339,
  2821834349,
  766784016,
  2952996808,
  2566594879,
  3210313671,
  3203337956,
  3336571891,
  1034457026,
  3584528711,
  2466948901,
  113926993,
  3758326383,
  338241895,
  168717936,
  666307205,
  1188179964,
  773529912,
  1546045734,
  1294757372,
  1522805485,
  1396182291,
  2643833823,
  1695183700,
  2343527390,
  1986661051,
  1014477480,
  2177026350,
  1206759142,
  2456956037,
  344077627,
  2730485921,
  1290863460,
  2820302411,
  3158454273,
  3259730800,
  3505952657,
  3345764771,
  106217008,
  3516065817,
  3606008344,
  3600352804,
  1432725776,
  4094571909,
  1467031594,
  275423344,
  851169720,
  430227734,
  3100823752,
  506948616,
  1363258195,
  659060556,
  3750685593,
  883997877,
  3785050280,
  958139571,
  3318307427,
  1322822218,
  3812723403,
  1537002063,
  2003034995,
  1747873779,
  3602036899,
  1955562222,
  1575990012,
  2024104815,
  1125592928,
  2227730452,
  2716904306,
  2361852424,
  442776044,
  2428436474,
  593698344,
  2756734187,
  3733110249,
  3204031479,
  2999351573,
  3329325298,
  3815920427,
  3391569614,
  3928383900,
  3515267271,
  566280711,
  3940187606,
  3454069534,
  4118630271,
  4000239992,
  116418474,
  1914138554,
  174292421,
  2731055270,
  289380356,
  3203993006,
  460393269,
  320620315,
  685471733,
  587496836,
  852142971,
  1086792851,
  1017036298,
  365543100,
  1126000580,
  2618297676,
  1288033470,
  3409855158,
  1501505948,
  4234509866,
  1607167915,
  987167468,
  1816402316,
  1246189591
];
var IV3 = [
  1779033703,
  4089235720,
  3144134277,
  2227873595,
  1013904242,
  4271175723,
  2773480762,
  1595750129,
  1359893119,
  2917565137,
  2600822924,
  725511199,
  528734635,
  4215389547,
  1541459225,
  327033209
];
function pad3(src) {
  const nBits = src.length * 8;
  let dst = src.slice();
  dst.push(128);
  if ((dst.length + 16) % 128 != 0) {
    let nZeroes = 128 - dst.length % 128 - 16;
    if (nZeroes < 0) {
      nZeroes += 128;
    }
    for (let i = 0; i < nZeroes; i++) {
      dst.push(0);
    }
  }
  if ((dst.length + 16) % 128 != 0) {
    throw new Error("bad padding");
  }
  const lengthPadding = encodeIntBE(BigInt(nBits));
  if (lengthPadding.length > 16) {
    throw new Error("input data too big");
  }
  while (lengthPadding.length < 16) {
    lengthPadding.unshift(0);
  }
  dst = dst.concat(lengthPadding);
  if (dst.length % 128 != 0) {
    throw new Error("bad length padding");
  }
  return dst;
}
function updateHash(hash4, i, h, l) {
  l = hash4[i + 1] + l;
  hash4[i] = hash4[i] + h + Math.floor(l / 4294967296) >>> 0;
  hash4[i + 1] = l >>> 0;
}
function sha2_512(bytes) {
  bytes = pad3(bytes);
  const hash4 = IV3.slice();
  for (let chunkStart = 0; chunkStart < bytes.length; chunkStart += 128) {
    const chunk = bytes.slice(chunkStart, chunkStart + 128);
    const w = new Array(160).fill(0);
    for (let i = 0; i < 32; i += 2) {
      const bs = chunk.slice(i * 4, i * 4 + 8);
      w[i + 0] = (bs[0] << 24 | bs[1] << 16 | bs[2] << 8 | bs[3] << 0) >>> 0;
      w[i + 1] = (bs[4] << 24 | bs[5] << 16 | bs[6] << 8 | bs[7] << 0) >>> 0;
    }
    for (let i = 32; i < 160; i += 2) {
      let h = w[i - 30];
      let l = w[i - 29];
      const sigma0h = ((h >>> 1 | l << 31) ^ (h >>> 8 | l << 24) ^ h >>> 7) >>> 0;
      const sigma0l = ((l >>> 1 | h << 31) ^ (l >>> 8 | h << 24) ^ (l >>> 7 | h << 25)) >>> 0;
      h = w[i - 4];
      l = w[i - 3];
      const sigma1h = ((h >>> 19 | l << 13) ^ (l >>> 29 | h << 3) ^ h >>> 6) >>> 0;
      const sigma1l = ((l >>> 19 | h << 13) ^ (h >>> 29 | l << 3) ^ (l >>> 6 | h << 26)) >>> 0;
      h = sigma1h + w[i - 14] + sigma0h + w[i - 32];
      l = sigma1l + w[i - 13] + sigma0l + w[i - 31];
      w[i] = h + Math.floor(l / 4294967296) >>> 0;
      w[i + 1] = l >>> 0;
    }
    let ah = hash4[0];
    let al = hash4[1];
    let bh = hash4[2];
    let bl = hash4[3];
    let ch = hash4[4];
    let cl = hash4[5];
    let dh = hash4[6];
    let dl = hash4[7];
    let eh = hash4[8];
    let el = hash4[9];
    let fh = hash4[10];
    let fl = hash4[11];
    let gh = hash4[12];
    let gl = hash4[13];
    let hh = hash4[14];
    let hl = hash4[15];
    for (let i = 0; i < 160; i += 2) {
      const S0h = ((ah >>> 28 | al << 4) ^ (al >>> 2 | ah << 30) ^ (al >>> 7 | ah << 25)) >>> 0;
      const S0l = ((al >>> 28 | ah << 4) ^ (ah >>> 2 | al << 30) ^ (ah >>> 7 | al << 25)) >>> 0;
      const S1h = ((eh >>> 14 | el << 18) ^ (eh >>> 18 | el << 14) ^ (el >>> 9 | eh << 23)) >>> 0;
      const S1l = ((el >>> 14 | eh << 18) ^ (el >>> 18 | eh << 14) ^ (eh >>> 9 | el << 23)) >>> 0;
      const majh = (ah & bh ^ ah & ch ^ bh & ch) >>> 0;
      const majl = (al & bl ^ al & cl ^ bl & cl) >>> 0;
      const chh = (eh & fh ^ ~eh & gh) >>> 0;
      const chl = (el & fl ^ ~el & gl) >>> 0;
      let temp1l = hl + S1l + chl + K2[i + 1] + w[i + 1];
      let temp1h = hh + S1h + chh + K2[i] + w[i] + Math.floor(temp1l / 4294967296) >>> 0;
      temp1l = temp1l >>> 0;
      let temp2l = S0l + majl;
      const temp2h = S0h + majh + Math.floor(temp2l / 4294967296) >>> 0;
      temp2l = temp2l >>> 0;
      hh = gh;
      hl = gl;
      gh = fh;
      gl = fl;
      fh = eh;
      fl = el;
      el = dl + temp1l;
      eh = dh + temp1h + Math.floor(el / 4294967296) >>> 0;
      el = el >>> 0;
      dh = ch;
      dl = cl;
      ch = bh;
      cl = bl;
      bh = ah;
      bl = al;
      al = temp1l + temp2l;
      ah = temp1h + temp2h + Math.floor(al / 4294967296) >>> 0;
      al = al >>> 0;
    }
    updateHash(hash4, 0, ah, al);
    updateHash(hash4, 2, bh, bl);
    updateHash(hash4, 4, ch, cl);
    updateHash(hash4, 6, dh, dl);
    updateHash(hash4, 8, eh, el);
    updateHash(hash4, 10, fh, fl);
    updateHash(hash4, 12, gh, gl);
    updateHash(hash4, 14, hh, hl);
  }
  let result = [];
  for (let i = 0; i < 16; i += 2) {
    const h = hash4[i];
    const l = hash4[i + 1];
    const bs = [
      (4278190080 & h) >>> 24,
      (16711680 & h) >>> 16,
      (65280 & h) >>> 8,
      255 & h,
      (4278190080 & l) >>> 24,
      (16711680 & l) >>> 16,
      (65280 & l) >>> 8,
      255 & l
    ];
    result = result.concat(bs);
  }
  return result;
}

// node_modules/@helios-lang/crypto/src/digest/hmac.js
function hmacInternal(algorithm, b, key, message) {
  if (key.length > b) {
    key = algorithm(key);
  } else {
    key = key.slice();
  }
  while (key.length < b) {
    key.push(0);
  }
  const iPadded = key.map((k) => k ^ 54);
  const oPadded = key.map((k) => k ^ 92);
  return algorithm(oPadded.concat(algorithm(iPadded.concat(message))));
}
function hmacSha2_256(key, message) {
  return hmacInternal((x) => sha2_256(x), 64, key, message);
}
function hmacSha2_512(key, message) {
  return hmacInternal((x) => sha2_512(x), 128, key, message);
}

// node_modules/@helios-lang/crypto/src/digest/keccak.js
var WIDTH2 = 200;
var RATE = 136;
var CAP = WIDTH2 - RATE;
var OFFSETS = [
  6,
  12,
  18,
  24,
  3,
  9,
  10,
  16,
  22,
  1,
  7,
  13,
  19,
  20,
  4,
  5,
  11,
  17,
  23,
  2,
  8,
  14,
  15,
  21
];
var SHIFTS = [
  -12,
  -11,
  21,
  14,
  28,
  20,
  3,
  -13,
  -29,
  1,
  6,
  25,
  8,
  18,
  27,
  -4,
  10,
  15,
  -24,
  -30,
  -23,
  -7,
  -9,
  2
];
var RC = [
  makeUInt64Fast(0, 1),
  makeUInt64Fast(0, 32898),
  makeUInt64Fast(2147483648, 32906),
  makeUInt64Fast(2147483648, 2147516416),
  makeUInt64Fast(0, 32907),
  makeUInt64Fast(0, 2147483649),
  makeUInt64Fast(2147483648, 2147516545),
  makeUInt64Fast(2147483648, 32777),
  makeUInt64Fast(0, 138),
  makeUInt64Fast(0, 136),
  makeUInt64Fast(0, 2147516425),
  makeUInt64Fast(0, 2147483658),
  makeUInt64Fast(0, 2147516555),
  makeUInt64Fast(2147483648, 139),
  makeUInt64Fast(2147483648, 32905),
  makeUInt64Fast(2147483648, 32771),
  makeUInt64Fast(2147483648, 32770),
  makeUInt64Fast(2147483648, 128),
  makeUInt64Fast(0, 32778),
  makeUInt64Fast(2147483648, 2147483658),
  makeUInt64Fast(2147483648, 2147516545),
  makeUInt64Fast(2147483648, 32896),
  makeUInt64Fast(0, 2147483649),
  makeUInt64Fast(2147483648, 2147516424)
];
function pad4(src, padByte) {
  const dst = src.slice();
  let nZeroes = RATE - 2 - dst.length % RATE;
  if (nZeroes < -1) {
    nZeroes += RATE - 2;
  }
  if (nZeroes == -1) {
    dst.push(128 + padByte);
  } else {
    dst.push(padByte);
    for (let i = 0; i < nZeroes; i++) {
      dst.push(0);
    }
    dst.push(128);
  }
  if (dst.length % RATE != 0) {
    throw new Error("bad padding");
  }
  return dst;
}
function permute(s) {
  const c = new Array(5);
  const b = new Array(25);
  for (let round = 0; round < 24; round++) {
    for (let i = 0; i < 5; i++) {
      c[i] = s[i].xor(s[i + 5]).xor(s[i + 10]).xor(s[i + 15]).xor(s[i + 20]);
    }
    for (let i = 0; i < 5; i++) {
      const i1 = (i + 1) % 5;
      const i2 = (i + 4) % 5;
      const tmp = c[i2].xor(c[i1].rotr(63));
      for (let j = 0; j < 5; j++) {
        s[i + 5 * j] = s[i + 5 * j].xor(tmp);
      }
    }
    b[0] = s[0];
    for (let i = 1; i < 25; i++) {
      const offset = OFFSETS[i - 1];
      const left = Math.abs(SHIFTS[i - 1]);
      const right = 32 - left;
      if (SHIFTS[i - 1] < 0) {
        b[i] = s[offset].rotr(right);
      } else {
        b[i] = s[offset].rotr(right + 32);
      }
    }
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 5; j++) {
        s[i * 5 + j] = b[i * 5 + j].xor(
          b[i * 5 + (j + 1) % 5].not().and(b[i * 5 + (j + 2) % 5])
        );
      }
    }
    s[0] = s[0].xor(RC[round]);
  }
}
function keccakInternal(bytes, padByte) {
  bytes = pad4(bytes, padByte);
  const state = new Array(WIDTH2 / 8).fill(UINT64_ZERO);
  for (let chunkStart = 0; chunkStart < bytes.length; chunkStart += RATE) {
    const chunk = bytes.slice(chunkStart, chunkStart + RATE).concat(new Array(CAP).fill(0));
    for (let i = 0; i < WIDTH2; i += 8) {
      state[i / 8] = state[i / 8].xor(
        makeUInt64({ bytes: chunk.slice(i, i + 8) })
      );
    }
    permute(state);
  }
  let hash4 = [];
  for (let i = 0; i < 4; i++) {
    hash4 = hash4.concat(state[i].toBytes());
  }
  return hash4;
}

// node_modules/@helios-lang/crypto/src/digest/keccak_256.js
function keccak_256(bytes) {
  return keccakInternal(bytes, 1);
}

// node_modules/@helios-lang/crypto/src/digest/sha3_256.js
function sha3_256(bytes) {
  return keccakInternal(bytes, 6);
}

// node_modules/@helios-lang/crypto/src/elliptic/common/mod.js
function mod(x, modulo) {
  const res = x % modulo;
  if (res < 0n) {
    return res + modulo;
  } else {
    return res;
  }
}

// node_modules/@helios-lang/crypto/src/elliptic/common/CubicFieldExt.js
var CubicFieldExt = class {
  /**
   * @readonly
   * @type {FieldWithOps<T>}
   */
  F;
  /**
   * When multiply these cubic polynomials, we can always replace v^3 by this constant
   * @readonly
   * @type {T}
   */
  V3;
  /**
   * @param {FieldWithOps<T>} F
   * @param {T} V3
   */
  constructor(F4, V3) {
    this.F = F4;
    this.V3 = V3;
  }
  /**
   * @type {[T, T, T]}
   */
  get ZERO() {
    const F4 = this.F;
    return [F4.ZERO, F4.ZERO, F4.ZERO];
  }
  /**
   * @type {[T, T, T]}
   */
  get ONE() {
    const F4 = this.F;
    return [F4.ONE, F4.ZERO, F4.ZERO];
  }
  /**
   * @param {[T, T, T]} a
   * @param {[T, T, T][]} b
   * @returns {[T, T, T]}
   */
  add([ax, ay, az], ...b) {
    const F4 = this.F;
    return [
      F4.add(ax, ...b.map((b2) => b2[0])),
      F4.add(ay, ...b.map((b2) => b2[1])),
      F4.add(az, ...b.map((b2) => b2[2]))
    ];
  }
  /**
   * @param {[T, T, T]} a
   * @param {bigint} s
   * @returns {[T, T, T]}
   */
  scale([ax, ay, az], s) {
    const F4 = this.F;
    return [F4.scale(ax, s), F4.scale(ay, s), F4.scale(az, s)];
  }
  /**
   * @param {[T, T, T]} a
   * @param {[T, T, T]} b
   * @returns {boolean}
   */
  equals([ax, ay, az], [bx, by, bz]) {
    const F4 = this.F;
    return F4.equals(ax, bx) && F4.equals(ay, by) && F4.equals(az, bz);
  }
  /**
   * (ax + ay*v + az*v^2)*(bx + by*v + bz*v^2)
   *  = ax*bx + ax*by*v + ax*bz*v^2 + ay*bx*v + ay*by*v^2 + ay*bz*v^3 + az*bx*v^2 + az*by*v^3 + az*bz*v^4
   *  = ax*bx + (ay*bz + az*by)*(u + 1)
   *  + (ax*by + ay*bx + az*bz*(u + 1))*v
   *  + (ax*bz + ay*by + az*bx)*v^2
   * @param {[T, T, T]} a
   * @param {[T, T, T]} b
   * @returns {[T, T, T]}
   */
  multiply([ax, ay, az], [bx, by, bz]) {
    const F4 = this.F;
    const V3 = this.V3;
    return [
      F4.add(
        F4.multiply(ax, bx),
        F4.multiply(F4.add(F4.multiply(ay, bz), F4.multiply(az, by)), V3)
      ),
      F4.add(
        F4.multiply(ax, by),
        F4.multiply(ay, bx),
        F4.multiply(F4.multiply(az, bz), V3)
      ),
      F4.add(F4.multiply(ax, bz), F4.multiply(ay, by), F4.multiply(az, bx))
    ];
  }
  /**
   * Calculates 1/(a + b*v + c*v^2)
   *
   * This can be expressed in terms of an inverse of the embedded field by multiplying numerator and denominator by:
   *   (a^2 - b*c*(u+1)) + (c^2*(u+1) - a*b)*v + (b^2 - a*c)*v^2
   *
   * All the v and v^2 coefficients in the denominator cancel out
   * @param {[T, T, T]} x
   * @returns {[T, T, T]}
   */
  invert([a, b, c]) {
    const F4 = this.F;
    const V3 = this.V3;
    const d = F4.subtract(F4.square(a), F4.multiply(F4.multiply(b, c), V3));
    const e = F4.subtract(F4.multiply(F4.square(c), V3), F4.multiply(a, b));
    const f = F4.subtract(F4.square(b), F4.multiply(a, c));
    const den = F4.add(F4.multiply(a, d), F4.multiply(b, f), F4.multiply(c, e));
    const denI = F4.invert(den);
    return [F4.multiply(d, denI), F4.multiply(e, denI), F4.multiply(f, denI)];
  }
};

// node_modules/@helios-lang/crypto/src/elliptic/common/CurveWithOps.js
var CurveWithOpsImpl = class {
  /**
   * @readonly
   * @protected
   * @type {C}
   */
  curve;
  /**
   * @param {C} curve
   */
  constructor(curve) {
    this.curve = curve;
  }
  /**
   * @type {T}
   */
  get ZERO() {
    return this.curve.ZERO;
  }
  /**
   * @param {T} point
   * @returns {boolean}
   */
  isZero(point) {
    return this.curve.equals(this.curve.ZERO, point);
  }
  /**
   * @param {T} point
   * @returns {boolean}
   */
  isValidPoint(point) {
    return this.curve.isValidPoint(point);
  }
  /**
   * @param {T} a
   * @param {T} b
   * @returns {boolean}
   */
  equals(a, b) {
    return this.curve.equals(a, b);
  }
  /**
   * @param {T} a
   * @param {T} b
   * @returns {T}
   */
  add(a, b) {
    return this.curve.add(a, b);
  }
  /**
   * @param {T} a
   * @param {T} b
   * @returns {T}
   */
  subtract(a, b) {
    return this.curve.add(a, this.curve.negate(b));
  }
  /**
   * @param {T} a
   * @returns {T}
   */
  negate(a) {
    return this.curve.negate(a);
  }
  /**
   * Double-and-add algorithm
   * Seems to have acceptable performance.
   * Not constant-time, but for the signing algorithms this scalar is always a random private number
   * @param {T} point
   * @param {bigint} s
   * @returns {T}
   */
  scale(point, s) {
    if (s == 0n) {
      console.log("scale returning 0");
      return this.curve.ZERO;
    } else if (s == 1n) {
      return point;
    } else if (s < 0n) {
      return this.scale(this.curve.negate(point), -s);
    } else {
      let sum = this.scale(point, s / 2n);
      sum = this.curve.add(sum, sum);
      if (s % 2n != 0n) {
        sum = this.curve.add(sum, point);
      }
      return sum;
    }
  }
};

// node_modules/@helios-lang/crypto/src/elliptic/common/FieldWithOps.js
var FieldWithOpsImpl = class {
  /**
   * @readonly
   * @type {Field<T>}
   */
  F;
  /**
   * @param {Field<T>} F
   */
  constructor(F4) {
    this.F = F4;
  }
  /**
   * @type {T}
   */
  get ZERO() {
    return this.F.ZERO;
  }
  /**
   * @type {T}
   */
  get ONE() {
    return this.F.ONE;
  }
  /**
   * @param {T} a
   * @returns {boolean}
   */
  isZero(a) {
    return this.equals(a, this.ZERO);
  }
  /**
   * @param {T} a
   * @returns {boolean}
   */
  isOne(a) {
    return this.equals(a, this.ONE);
  }
  /**
   * @param {T} a
   * @returns {T}
   */
  mod(a) {
    return this.F.scale(a, 1n);
  }
  /**
   * @param {T} a
   * @param {T[]} bs
   * @returns {T}
   */
  add(a, ...bs) {
    return this.F.add(a, ...bs);
  }
  /**
   * @param {T} a
   * @param {T} b
   * @returns {T}
   */
  subtract(a, b) {
    const F4 = this.F;
    return F4.add(a, F4.scale(b, -1n));
  }
  /**
   * @param {T} a
   * @param {bigint} s
   * @returns {T}
   */
  scale(a, s) {
    return this.F.scale(a, s);
  }
  /**
   * @param {T} a
   * @returns {T}
   */
  negate(a) {
    return this.F.scale(a, -1n);
  }
  /**
   * @param {T} a
   * @param {T} b
   * @returns {T}
   */
  multiply(a, b) {
    return this.F.multiply(a, b);
  }
  /**
   * @param {T} a
   * @returns {T}
   */
  square(a) {
    return this.F.multiply(a, a);
  }
  /**
   * @param {T} a
   * @returns {T}
   */
  cube(a) {
    return this.F.multiply(a, this.F.multiply(a, a));
  }
  /**
   * @param {T} a
   * @param {T} b
   * @returns {T}
   */
  divide(a, b) {
    return this.F.multiply(a, this.F.invert(b));
  }
  /**
   * @param {T} a
   * @returns {T}
   */
  invert(a) {
    return this.F.invert(a);
  }
  /**
   * Modular exponent
   * TODO: would a non-recursive version of this algorithm be faster?
   * @param {T} a
   * @param {bigint} p
   * @returns {T}
   */
  pow(a, p) {
    if (p == 0n) {
      return this.F.ONE;
    } else if (p == 1n) {
      return a;
    } else {
      let t = this.pow(a, p / 2n);
      t = this.F.multiply(t, t);
      if (p % 2n != 0n) {
        t = this.F.multiply(t, a);
      }
      return t;
    }
  }
  /**
   * @param {T} a
   * @param {T} b
   * @returns {boolean}
   */
  equals(a, b) {
    return this.F.equals(a, b);
  }
  /**
   * @param {T} a
   * @returns {T}
   */
  halve(a) {
    return this.divide(a, this.F.scale(this.F.ONE, 2n));
  }
};

// node_modules/@helios-lang/crypto/src/elliptic/common/QuadraticFieldExt.js
var QuadraticFieldExt = class {
  /**
   * Field used for each component
   * @readonly
   * @type {FieldWithOps<T>}
   */
  F;
  /**
   * We can always replace u^2 by this number (e.g. for complex numbers this is -1)
   * @readonly
   * @type {T}
   */
  U2;
  /**
   * @param {FieldWithOps<T>} F applied to each part separately
   * @param {T} U2
   */
  constructor(F4, U2) {
    this.F = F4;
    this.U2 = U2;
  }
  /**
   * @type {[T, T]}
   */
  get ZERO() {
    return [this.F.ZERO, this.F.ZERO];
  }
  /**
   * @type {[T, T]}
   */
  get ONE() {
    return [this.F.ONE, this.F.ZERO];
  }
  /**
   * @param {[T, T]} a
   * @param {[T, T][]} b
   * @returns {[T, T]}
   */
  add([ax, ay], ...b) {
    const F4 = this.F;
    return [
      F4.add(ax, ...b.map((b2) => b2[0])),
      F4.add(ay, ...b.map((b2) => b2[1]))
    ];
  }
  /**
   * @param {[T, T]} a
   * @param {bigint} s
   * @returns {[T, T]}
   */
  scale([ax, ay], s) {
    const F4 = this.F;
    return [F4.scale(ax, s), F4.scale(ay, s)];
  }
  /**
   * @param {[T, T]} a
   * @param {[T, T]} b
   * @returns {[T, T]}
   */
  multiply([ax, ay], [bx, by]) {
    const F4 = this.F;
    return [
      F4.add(F4.multiply(ax, bx), F4.multiply(F4.multiply(ay, by), this.U2)),
      F4.add(F4.multiply(ay, bx), F4.multiply(by, ax))
    ];
  }
  /**
   * @param {[T, T]} a
   * @param {[T, T]} b
   * @returns {boolean}
   */
  equals([ax, ay], [bx, by]) {
    const F4 = this.F;
    return F4.equals(ax, bx) && F4.equals(ay, by);
  }
  /**
   * Using the following formula we can derive the inverse of complex field element
   *   (ax + u*ay)*(ax - u*ay) = ax^2 - u^2*ay^2
   *   (ax + u*ay)^-1 = (ax - u*ay)/(ax^2 - u^2*ay^2)
   * @param {[T, T]} a
   * @returns {[T, T]}
   */
  invert([ax, ay]) {
    const F4 = this.F;
    const f = F4.invert(
      F4.subtract(F4.square(ax), F4.multiply(F4.square(ay), this.U2))
    );
    return [F4.multiply(ax, f), F4.multiply(ay, F4.negate(f))];
  }
};

// node_modules/@helios-lang/crypto/src/elliptic/common/ScalarField.js
var ScalarField = class {
  /**
   * Every operation is modulo this number
   * @readonly
   * @type {bigint}
   */
  modulo;
  /**
   * @param {bigint} modulo
   */
  constructor(modulo) {
    this.modulo = modulo;
  }
  /**
   * @type {bigint}
   */
  get ZERO() {
    return 0n;
  }
  /**
   * @type {bigint}
   */
  get ONE() {
    return 1n;
  }
  /**
   * @param {bigint} a
   * @param {bigint[]} b
   * @returns {bigint}
   */
  add(a, ...b) {
    return mod(
      b.reduce((sum, b2) => sum + b2, a),
      this.modulo
    );
  }
  /**
   * @param {bigint} a
   * @param {bigint} n
   * @returns {bigint}
   */
  scale(a, n) {
    return mod(a * n, this.modulo);
  }
  /**
   * Implemented separately from `scale` because it has a different meaning
   * @param {bigint} a
   * @param {bigint} b
   * @returns {bigint}
   */
  multiply(a, b) {
    return mod(a * b, this.modulo);
  }
  /**
   * @param {bigint} a
   * @param {bigint} b
   * @returns {boolean}
   */
  equals(a, b) {
    return mod(a, this.modulo) === mod(b, this.modulo);
  }
  /**
   *  Invert a number on a field (i.e. calculate n^-1 so that n*n^-1 = 1)
   * This is an expensive iterative procedure that is only guaranteed to converge if the modulo is a prime number
   * @param {bigint} n
   * @returns {bigint}
   */
  invert(n) {
    let a = mod(n, this.modulo);
    let b = this.modulo;
    let x = 0n;
    let y = 1n;
    let u = 1n;
    let v = 0n;
    while (a !== 0n) {
      const q = b / a;
      const r = b % a;
      const m = x - u * q;
      const n2 = y - v * q;
      b = a;
      a = r;
      x = u;
      y = v;
      u = m;
      v = n2;
    }
    return mod(x, this.modulo);
  }
};

// node_modules/@helios-lang/crypto/src/elliptic/common/ShortAffine.js
var ShortAffineImpl = class extends CurveWithOpsImpl {
  /**
   * @param {Field<T>} F
   * @param {T} b
   */
  constructor(F4, b) {
    super(new ShortAffineInternal(F4, b));
  }
  /**
   * @type {T}
   */
  get b() {
    return this.curve.b;
  }
  /**
   * This method makes it easier to swap out the affine curve for the projected curve
   * @param {Point2<T>} point
   * @returns {Point2<T>}
   */
  toAffine(point) {
    return point;
  }
  /**
   * This method makes it easier to swap out the affine curve for the projected curve
   * @param {Point2<T>} point
   * @returns {Point2<T>}
   */
  fromAffine(point) {
    return point;
  }
};
var ShortAffineInternal = class {
  /**
   * @readonly
   * @type {FieldWithOps<T>}
   */
  F;
  /**
   * Coefficient of curve formula
   * @readonly
   * @type {T}
   */
  b;
  /**
   * @param {Field<T>} F
   * @param {T} b
   */
  constructor(F4, b) {
    this.F = new FieldWithOpsImpl(F4);
    this.b = b;
  }
  /**
   * @type {Point2<T>}
   */
  get ZERO() {
    return { x: this.F.ZERO, y: this.F.ONE };
  }
  /**
   * Check that the elliptic equation for Secp256k1 holds:
   *   `y^2 === x^3 + b`
   * @param {Point2<T>} point
   * @returns {boolean}
   */
  isValidPoint(point) {
    if (this.equals(point, this.ZERO)) {
      return true;
    } else {
      const F4 = this.F;
      const { x, y } = point;
      const lhs = F4.square(y);
      const x3 = F4.cube(x);
      const rhs = F4.add(x3, this.b);
      return F4.equals(lhs, rhs);
    }
  }
  /**
   * @param {Point2<T>} a
   * @returns {Point2<T>}
   */
  negate(a) {
    if (this.equals(this.ZERO, a)) {
      return a;
    } else {
      return {
        x: a.x,
        y: this.F.scale(a.y, -1n)
      };
    }
  }
  /**
   * @param {Point2<T>} a
   * @param {Point2<T>} b
   * @returns {boolean}
   */
  equals(a, b) {
    const F4 = this.F;
    return F4.equals(a.x, b.x) && F4.equals(a.y, b.y);
  }
  /**
   * Taken from https://bitcoin.stackexchange.com/questions/119860/how-to-convert-the-results-of-point-doubling-rx1-and-ry1-to-point-addition-rx
   * @param {Point2<T>} point
   * @returns {Point2<T>}
   */
  double(point) {
    if (this.equals(point, this.ZERO)) {
      return point;
    } else {
      const F4 = this.F;
      const { x, y } = point;
      const tx = F4.scale(x, 2n);
      const ty = F4.scale(y, 2n);
      const x2 = F4.square(x);
      const tyi = F4.invert(ty);
      const s = F4.multiply(F4.scale(x2, 3n), tyi);
      const s2 = F4.square(s);
      const nx = F4.subtract(s2, tx);
      const ny = F4.subtract(F4.multiply(s, F4.subtract(x, nx)), y);
      return { x: nx, y: ny };
    }
  }
  /**
   * Taken from https://bitcoin.stackexchange.com/questions/119860/how-to-convert-the-results-of-point-doubling-rx1-and-ry1-to-point-addition-rx
   * @param {Point2<T>} a
   * @param {Point2<T>} b
   * @returns {Point2<T>}
   */
  add(a, b) {
    const F4 = this.F;
    if (this.equals(a, b)) {
      return this.double(a);
    } else if (this.equals(this.negate(a), b)) {
      return this.ZERO;
    } else if (F4.add(a.x, b.x) === 0n) {
      return this.ZERO;
    } else if (this.equals(a, this.ZERO)) {
      return b;
    } else if (this.equals(b, this.ZERO)) {
      return a;
    }
    const dx = F4.subtract(a.x, b.x);
    const dy = F4.subtract(a.y, b.y);
    const s = F4.multiply(dy, F4.invert(dx));
    const s2 = F4.square(s);
    const nx = F4.subtract(F4.subtract(s2, a.x), b.x);
    const ny = F4.subtract(F4.multiply(s, F4.subtract(a.x, nx)), a.y);
    return { x: nx, y: ny };
  }
};

// node_modules/@helios-lang/crypto/src/elliptic/common/ShortProjected.js
var ShortProjectedImpl = class extends CurveWithOpsImpl {
  /**
   * @param {Field<T>} F
   * @param {T} b
   */
  constructor(F4, b) {
    super(new ShortProjectedInternal(F4, b));
  }
  /**
   * @param {Point2<T>} point
   * @returns {Point3<T>}
   */
  fromAffine(point) {
    const F4 = this.curve.F;
    if (F4.isZero(point.x) && F4.isOne(point.y)) {
      return this.ZERO;
    } else {
      return { ...point, z: F4.ONE };
    }
  }
  /**
   * @param {Point3<T>} point
   * @returns {Point2<T>}
   */
  toAffine(point) {
    const F4 = this.curve.F;
    if (this.equals(point, this.ZERO)) {
      return { x: F4.ZERO, y: F4.ONE };
    } else {
      const zInverse = F4.invert(point.z);
      return {
        x: F4.multiply(point.x, zInverse),
        y: F4.multiply(point.y, zInverse)
      };
    }
  }
};
var ShortProjectedInternal = class {
  /**
   * @readonly
   * @type {FieldWithOps<T>}
   */
  F;
  /**
   * Coefficient of curve formula
   * @private
   * @readonly
   * @type {T}
   */
  b;
  /**
   * @param {Field<T>} F
   * @param {T} b
   */
  constructor(F4, b) {
    this.F = new FieldWithOpsImpl(F4);
    this.b = b;
  }
  /**
   * Using y == 1n instead of y == 0n makes the equals() method faster (no special checks needed for the ZERO case)
   * @type {Point3<T>}
   */
  get ZERO() {
    return { x: this.F.ZERO, y: this.F.ONE, z: this.F.ZERO };
  }
  /**
   * @param {Point3<T>} a
   * @param {Point3<T>} b
   * @returns {boolean}
   */
  equals(a, b) {
    const F4 = this.F;
    return F4.multiply(a.x, b.z) == F4.multiply(b.x, a.z) && F4.multiply(a.y, b.z) == F4.multiply(b.y, a.z);
  }
  /**
   * @param {Point3<T>} point
   * @returns {boolean}
   */
  isValidPoint(point) {
    if (this.equals(point, this.ZERO)) {
      return true;
    } else {
      const F4 = this.F;
      const { x, y, z } = point;
      const y2 = F4.square(y);
      const lhs = F4.multiply(z, y2);
      const x3 = F4.cube(x);
      const z3 = F4.cube(z);
      const bz3 = F4.multiply(this.b, z3);
      const rhs = F4.add(x3, bz3);
      return F4.equals(lhs, rhs);
    }
  }
  /**
   *
   * @param {Point3<T>} point
   * @returns {Point3<T>}
   */
  negate(point) {
    if (this.equals(point, this.ZERO)) {
      return point;
    } else {
      return {
        x: point.x,
        y: this.F.negate(point.y),
        z: point.z
      };
    }
  }
  /**
   * Taken from https://github.com/paulmillr/noble-secp256k1
   * Which in turns takes this formula from https://www.hyperelliptic.org/EFD/g1p/auto-shortw-projective.html (add-2015-rcb)
   * @param {Point3<T>} point1
   * @param {Point3<T>} point2
   * @returns {Point3<T>}
   */
  add(point1, point2) {
    if (this.equals(point1, this.ZERO)) {
      return point2;
    } else if (this.equals(point2, this.ZERO)) {
      return point1;
    } else {
      const F4 = this.F;
      const { x: x1, y: y1, z: z1 } = point1;
      const { x: x2, y: y2, z: z2 } = point2;
      let x3;
      let y3;
      let z3;
      const b3 = F4.scale(this.b, 3n);
      let t0 = F4.multiply(x1, x2);
      let t1 = F4.multiply(y1, y2);
      let t2 = F4.multiply(z1, z2);
      let t3 = F4.add(x1, y1);
      let t4 = F4.add(x2, y2);
      let t5 = F4.add(x2, z2);
      t3 = F4.multiply(t3, t4);
      t4 = F4.add(t0, t1);
      t3 = F4.subtract(t3, t4);
      t4 = F4.add(x1, z1);
      t4 = F4.multiply(t4, t5);
      t5 = F4.add(t0, t2);
      t4 = F4.subtract(t4, t5);
      t5 = F4.add(y1, z1);
      x3 = F4.add(y2, z2);
      t5 = F4.multiply(t5, x3);
      x3 = F4.add(t1, t2);
      t5 = F4.subtract(t5, x3);
      x3 = F4.multiply(b3, t2);
      z3 = x3;
      x3 = F4.subtract(t1, z3);
      z3 = F4.add(t1, z3);
      y3 = F4.multiply(x3, z3);
      t1 = F4.add(t0, t0);
      t1 = F4.add(t1, t0);
      t4 = F4.multiply(b3, t4);
      t0 = F4.multiply(t1, t4);
      y3 = F4.add(y3, t0);
      t0 = F4.multiply(t5, t4);
      x3 = F4.multiply(t3, x3);
      x3 = F4.subtract(x3, t0);
      t0 = F4.multiply(t3, t1);
      z3 = F4.multiply(t5, z3);
      z3 = F4.add(z3, t0);
      return {
        x: x3,
        y: y3,
        z: z3
      };
    }
  }
};

// node_modules/@helios-lang/crypto/src/elliptic/bls12_381/constants.js
var CURVE1 = {
  // Curve coordinate prime number
  P: 4002409555221667393417789825735904156556882819939007885332058136124031650490837864442687629129015664037894272559787n,
  // Curve scale order, prime <= max number of points on curve
  N: 52435875175126190479447740508185965837690552500527637822603658699938581184513n,
  // Cofactor
  h: 76329603384216526031706109802092473003n,
  // Generator point
  G: {
    x: 3685416753713387016781088315183077757961620795782546409894578378688607592378376318836054947676345821548104185464507n,
    y: 1339506544944476473020471379941921221584933875938349620426543736416511423956333506472724655353366534992391756441569n
  },
  X: 0xd201000000010000n
};

// node_modules/@helios-lang/crypto/src/elliptic/bls12_381/fields/F1.js
var P14 = (CURVE1.P + 1n) / 4n;
var FieldWithSqrt = class extends FieldWithOpsImpl {
  constructor() {
    super(new ScalarField(CURVE1.P));
  }
  /**
   * @param {bigint} a
   * @param {boolean | undefined} largest
   * @returns {bigint}
   */
  sqrt(a, largest = void 0) {
    let r = this.pow(a, P14);
    if (!this.equals(this.square(r), a)) {
      throw new Error("failed to compute sqrt");
    }
    if (largest !== void 0 && largest !== r > CURVE1.P / 2n) {
      r = this.scale(r, -1n);
    }
    return r;
  }
  /**
   * Returns 0 for even and 1 for odd
   * @param {bigint} a
   * @returns {number}
   */
  sign(a) {
    return Number(a % 2n);
  }
};
var F1 = new FieldWithSqrt();

// node_modules/@helios-lang/crypto/src/elliptic/bls12_381/fields/F2.js
var UPOWP = [
  1n,
  4002409555221667393417789825735904156556882819939007885332058136124031650490837864442687629129015664037894272559786n
  // P - 1
];
var P_MINUS_9_DIV_16 = (CURVE1.P ** 2n - 9n) / 16n;
var rv1 = 0x6af0e0437ff400b6831e36d6bd17ffe48395dabc2d3435e77f76e17009241c5ee67992f72ec05f4c81084fbede3cc09n;
var ev1 = 0x699be3b8c6870965e5bf892ad5d2cc7b0e85a117402dfd83b7f4a947e02d978498255a2aaec0ac627b5afbdf1bf1c90n;
var ev2 = 0x8157cd83046453f5dd0972b6e3949e4288020b5b8a9cc99ca07e27089a2ce2436d965026adad3ef7baba37f2183e9b5n;
var ev3 = 0xab1c2ffdd6c253ca155231eb3e71ba044fd562f6f72bc5bad5ec46a0b7a3b0247cf08ce6c6317f40edbc653a72dee17n;
var ev4 = 0xaa404866706722864480885d68ad0ccac1967c7544b447873cc37e0181271e006df72162a3d3e0287bf597fbf7f8fc1n;
var ROOTS_OF_UNITY = [
  [1n, 0n],
  [rv1, -rv1],
  [0n, 1n],
  [rv1, rv1],
  [-1n, 0n],
  [-rv1, rv1],
  [0n, -1n],
  [-rv1, -rv1]
];
var ETAs = [
  [ev1, ev2],
  [-ev2, ev1],
  [ev3, ev4],
  [-ev4, ev3]
];
var FieldWithExtraOps = class extends FieldWithOpsImpl {
  constructor() {
    super(new QuadraticFieldExt(F1, -1n));
  }
  /**
   * For now this method is only needed for restoring a point from its encoding, so we are not so concerned with speed.
   * Hence we will use the conceptually easiest formula to calculate the sqrt:
   *    (bx + by*u)^2 = ax + ay*u
   *    bx^2 - by^2 = ax  &  2*bx*by = ay
   * This forms a quadratic equation, which we can solve using F1 because it defines sqrt on the component field.
   *    bx^2 = (ax + sqrt(ax^2 + ay^2))/2
   *    by^2 = bx^2 - ax
   * Cost: 3 sqrts and 1 div on F1
   * @param {FieldElement} a
   * @param {boolean | undefined} largest
   * @returns {FieldElement}
   */
  sqrt([ax, ay], largest = void 0) {
    const ax2 = F1.square(ax);
    const ay2 = F1.square(ay);
    const h = F1.sqrt(F1.add(ax2, ay2));
    const axh = F1.add(ax, h);
    const bx2 = F1.divide(axh, 2n);
    const by2 = F1.subtract(bx2, ax);
    const bx = F1.sqrt(bx2);
    const by = F1.sqrt(by2);
    if (!this.equals(this.multiply([bx, by], [bx, by]), [ax, ay])) {
      throw new Error("F2 sqrt failed");
    }
    let r = [bx, by];
    if (bx < 0n || bx === 0n && by < 0n) {
      r = [-bx, -by];
    }
    if (largest !== void 0 && largest !== r[0] > CURVE1.P / 2n) {
      r = [F1.scale(r[0], -1n), F1.scale(r[1], -1n)];
    }
    return r;
  }
  /**
   * Calculates (a + b*u)^(p^n)
   * Using a combination of Fermat's little theorem and substitions of u^2
   * This is often referred to as the Frobenius endomorphism, and is used during the pairing calculation
   * @param {[bigint, bigint]} a
   * @param {number} n
   * @returns {[bigint, bigint]}
   */
  powp([ax, ay], n) {
    return [ax, F1.multiply(ay, UPOWP[n % 2])];
  }
  /**
   * @param {[bigint, bigint]} a
   * @returns {[bigint, bigint]}
   */
  multiplyu2(a) {
    return this.scale(a, -1n);
  }
  /**
   * a^2 + b^2*u*2
   * (a^2 + b^2) - a^2 - b^2
   * @param {[bigint, bigint]} a
   * @param {[bigint, bigint]} b
   * @returns {[[bigint, bigint], [bigint, bigint]]}
   */
  square2(a, b) {
    const a2 = this.square(a);
    const b2 = this.square(b);
    return [
      this.add(a2, this.multiplyu2(b2)),
      this.subtract(this.square(this.add(a, b)), this.add(a2, b2))
    ];
  }
  /**
   * @param {[bigint, bigint]} a
   * @returns {number}
   */
  sign([ax, ay]) {
    if (ax === 0n) {
      return Number(ay % 2n);
    } else {
      return Number(ax % 2n);
    }
  }
  /**
   * Returns uv⁷ * (uv¹⁵)^((p² - 9) / 16) * root of unity
   *  if valid square root is found
   * @param {[bigint, bigint]} u
   * @param {[bigint, bigint]} v
   * @returns {[bigint, bigint]}
   */
  gamma(u, v) {
    const v7 = this.pow(v, 7n);
    const uv7 = this.multiply(u, v7);
    const uv15 = this.multiply(uv7, F2.multiply(v7, v));
    return F2.multiply(F2.pow(uv15, P_MINUS_9_DIV_16), uv7);
  }
  /**
   * @private
   * @param {[bigint, bigint]} u
   * @param {[bigint, bigint]} v
   * @param {[bigint, bigint]} candidate
   * @param {[bigint, bigint][]} candidates
   * @returns {[bigint, bigint] | undefined}
   */
  sqrtUOverV(u, v, candidate, candidates) {
    let res = void 0;
    candidates.forEach((c) => {
      const sqrtCandidate = this.multiply(c, candidate);
      const tmp = this.subtract(
        this.multiply(this.pow(sqrtCandidate, 2n), v),
        u
      );
      if (res === void 0 && this.isZero(tmp)) {
        res = sqrtCandidate;
      }
    });
    return res;
  }
  /**
   *
   * @param {[bigint, bigint]} u
   * @param {[bigint, bigint]} v
   * @param {[bigint, bigint] | undefined} gamma_
   * @returns {[bigint, bigint] | undefined}
   */
  rootOfUnity(u, v, gamma_ = void 0) {
    let gamma = gamma_ === void 0 ? this.gamma(u, v) : gamma_;
    const positiveRootsOfUnity = ROOTS_OF_UNITY.slice(0, 4);
    return this.sqrtUOverV(u, v, gamma, positiveRootsOfUnity);
  }
  /**
   * @param {[bigint, bigint]} u
   * @param {[bigint, bigint]} v
   * @param {[bigint, bigint]} candidate
   * @returns {undefined | [bigint, bigint]}
   */
  eta(u, v, candidate) {
    return this.sqrtUOverV(u, v, candidate, ETAs);
  }
};
var F2 = new FieldWithExtraOps();

// node_modules/@helios-lang/crypto/src/elliptic/bls12_381/fields/F6.js
var VPOWP = [
  [1n, 0n],
  [
    0n,
    4002409555221667392624310435006688643935503118305586438271171395842971157480381377015405980053539358417135540939436n
  ],
  [
    793479390729215512621379701633421447060886740281060493010456487427281649075476305620758731620350n,
    0n
  ],
  [0n, 1n],
  [
    4002409555221667392624310435006688643935503118305586438271171395842971157480381377015405980053539358417135540939436n,
    0n
  ],
  [
    0n,
    793479390729215512621379701633421447060886740281060493010456487427281649075476305620758731620350n
  ]
];
var V2POWP = [
  [1n, 0n],
  [
    4002409555221667392624310435006688643935503118305586438271171395842971157480381377015405980053539358417135540939437n,
    0n
  ],
  [
    4002409555221667392624310435006688643935503118305586438271171395842971157480381377015405980053539358417135540939436n,
    0n
  ],
  [
    4002409555221667393417789825735904156556882819939007885332058136124031650490837864442687629129015664037894272559786n,
    0n
  ],
  [
    793479390729215512621379701633421447060886740281060493010456487427281649075476305620758731620350n,
    0n
  ],
  [
    793479390729215512621379701633421447060886740281060493010456487427281649075476305620758731620351n,
    0n
  ]
];
var FieldWithPowp = class extends FieldWithOpsImpl {
  constructor() {
    super(new CubicFieldExt(F2, [1n, 1n]));
  }
  /**
   * Calculates (a + b*v + c*v^2)^(p^n)
   * Using a combination of Fermat's little theorem and substitutions of v^3
   * This is often referred to as the Frobenius endomorphism, and is used during the pairing calculation
   * @param {FieldElement6} a
   * @param {number} n
   * @returns {FieldElement6}
   */
  powp([ax, ay, az], n) {
    return [
      F2.powp(ax, n),
      F2.multiply(F2.powp(ay, n), VPOWP[n % 6]),
      F2.multiply(F2.powp(az, n), V2POWP[n % 6])
    ];
  }
  /**
   * @param {FieldElement6} a
   * @param {[bigint, bigint]} b
   * @returns {FieldElement6}
   */
  multiplyF2([ax, ay, az], b) {
    return [F2.multiply(ax, b), F2.multiply(ay, b), F2.multiply(az, b)];
  }
};
var F6 = new FieldWithPowp();

// node_modules/@helios-lang/crypto/src/elliptic/bls12_381/fields/F12.js
var UPOWP2 = [
  [1n, 0n],
  // 0
  [
    3850754370037169011952147076051364057158807420970682438676050522613628423219637725072182697113062777891589506424760n,
    151655185184498381465642749684540099398075398968325446656007613510403227271200139370504932015952886146304766135027n
  ],
  // 1
  [
    793479390729215512621379701633421447060886740281060493010456487427281649075476305620758731620351n,
    0n
  ],
  // 2
  [
    2973677408986561043442465346520108879172042883009249989176415018091420807192182638567116318576472649347015917690530n,
    1028732146235106349975324479215795277384839936929757896155643118032610843298655225875571310552543014690878354869257n
  ],
  // 3
  [
    793479390729215512621379701633421447060886740281060493010456487427281649075476305620758731620350n,
    0n
  ],
  // 4
  [
    3125332594171059424908108096204648978570118281977575435832422631601824034463382777937621250592425535493320683825557n,
    877076961050607968509681729531255177986764537961432449499635504522207616027455086505066378536590128544573588734230n
  ],
  // 5
  [
    4002409555221667393417789825735904156556882819939007885332058136124031650490837864442687629129015664037894272559786n,
    0n
  ],
  // 6
  [
    151655185184498381465642749684540099398075398968325446656007613510403227271200139370504932015952886146304766135027n,
    3850754370037169011952147076051364057158807420970682438676050522613628423219637725072182697113062777891589506424760n
  ],
  // 7
  [
    4002409555221667392624310435006688643935503118305586438271171395842971157480381377015405980053539358417135540939436n,
    0n
  ],
  // 8
  [
    1028732146235106349975324479215795277384839936929757896155643118032610843298655225875571310552543014690878354869257n,
    2973677408986561043442465346520108879172042883009249989176415018091420807192182638567116318576472649347015917690530n
  ],
  // 9
  [
    4002409555221667392624310435006688643935503118305586438271171395842971157480381377015405980053539358417135540939437n,
    0n
  ],
  // 10
  [
    877076961050607968509681729531255177986764537961432449499635504522207616027455086505066378536590128544573588734230n,
    3125332594171059424908108096204648978570118281977575435832422631601824034463382777937621250592425535493320683825557n
  ]
  // 11
];
var Field12WithExtendedOpsImpl = class extends FieldWithOpsImpl {
  constructor() {
    super(new QuadraticFieldExt(F6, [F2.ZERO, F2.ONE, F2.ZERO]));
  }
  /**
   * @param {FieldElement12} a
   * @returns {FieldElement12}
   */
  conjugate([ax, ay]) {
    return [ax, F6.negate(ay)];
  }
  /**
   * Calculates (a + b*u)^(p^n)
   * Using a combination of Fermat's little theorem and substitutions of u^2
   * This is often referred to as the Frobenius endomorphism, and is used during the pairing calculation
   * @param {FieldElement12} a
   * @param {number} n
   * @returns {FieldElement12}
   */
  powp([a, b], n) {
    const [bx, by, bz] = F6.powp(b, n);
    const upn = UPOWP2[n % 12];
    return [
      F6.powp(a, n),
      [F2.multiply(bx, upn), F2.multiply(by, upn), F2.multiply(bz, upn)]
    ];
  }
  /**
   * @param {FieldElement12} a
   * @param {[bigint, bigint]} b
   * @returns {FieldElement12}
   */
  multiplyF2([ax, ay], b) {
    return [F6.multiplyF2(ax, b), F6.multiplyF2(ay, b)];
  }
};
var F12 = new Field12WithExtendedOpsImpl();

// node_modules/@helios-lang/crypto/src/elliptic/bls12_381/curves/AffineCurve1.js
var AffineCurve1Impl = class extends ShortAffineImpl {
  constructor() {
    super(F1, 4n);
  }
};
var affineCurve1 = new AffineCurve1Impl();

// node_modules/@helios-lang/crypto/src/elliptic/bls12_381/curves/ProjectedCurve1.js
var ProjectedCurve1Impl = class extends ShortProjectedImpl {
  constructor() {
    super(F1, 4n);
  }
  /**
   *
   * @param {Point3<bigint>} point
   * @returns {Point3<bigint>}
   */
  clearCofactor(point) {
    const t = this.scale(point, CURVE1.X);
    return this.add(t, point);
  }
};
var projectedCurve1 = new ProjectedCurve1Impl();

// node_modules/@helios-lang/crypto/src/elliptic/bls12_381/curves/AffineCurve2.js
var AffineCurve2Impl = class extends ShortAffineImpl {
  constructor() {
    super(F2, [4n, 4n]);
  }
};
var affineCurve2 = new AffineCurve2Impl();

// node_modules/@helios-lang/crypto/src/elliptic/bls12_381/curves/ProjectedCurve2.js
var ut_root = [F2.ZERO, F2.ONE, F2.ZERO];
var wsq = [ut_root, F6.ZERO];
var wcu = [F6.ZERO, ut_root];
var wsq_inv = F12.invert(wsq);
var wcu_inv = F12.invert(wcu);
var PSI2_C1 = 0x1a0111ea397fe699ec02408663d4de85aa0d857d89759ad4897d29650fb85f9b409427eb4f49fffd8bfd00000000aaacn;
var ProjectedCurve2Impl = class extends ShortProjectedImpl {
  constructor() {
    super(F2, [4n, 4n]);
  }
  /**
   * @param {Point3<[bigint, bigint]>} point
   * @returns {Point3<[bigint, bigint]>}
   */
  scalex(point) {
    return this.scale(point, -CURVE1.X);
  }
  /**
   *
   * @param {Point3<[bigint, bigint]>} point
   * @returns {Point3<[bigint, bigint]>}
   */
  psi(point) {
    const { x, y } = this.toAffine(point);
    const x2 = F12.multiply(
      F12.powp(F12.multiplyF2(wsq_inv, x), 1),
      wsq
    )[0][0];
    const y2 = F12.multiply(
      F12.powp(F12.multiplyF2(wcu_inv, y), 1),
      wcu
    )[0][0];
    return this.fromAffine({ x: x2, y: y2 });
  }
  /**
   * @param {Point3<[bigint, bigint]>} point
   * @returns {Point3<[bigint, bigint]>}
   */
  psi2(point) {
    const { x, y } = this.toAffine(point);
    return this.fromAffine({ x: F2.scale(x, PSI2_C1), y: F2.negate(y) });
  }
  /**
   * Maps the point into the prime-order subgroup G2.
   * clear_cofactor_bls12381_g2 from cfrg-hash-to-curve-11
   * https://eprint.iacr.org/2017/419.pdf
   * @param {Point3<[bigint, bigint]>} point
   * @returns {Point3<[bigint, bigint]>}
   */
  clearCofactor(point) {
    let t1 = this.scalex(point);
    let t2 = this.psi(point);
    let t3 = this.add(point, point);
    t3 = this.psi2(t3);
    t3 = this.subtract(t3, t2);
    t2 = this.add(t1, t2);
    t2 = this.scalex(t2);
    t3 = this.add(t3, t2);
    t3 = this.subtract(t3, t1);
    const Q = this.subtract(t3, point);
    return Q;
  }
};
var projectedCurve2 = new ProjectedCurve2Impl();

// node_modules/@helios-lang/crypto/src/elliptic/bls12_381/codec.js
function decodeG1Point(bytes) {
  if (bytes.length != 48) {
    throw new Error(
      `expected 48 bytes for encoded G1 point, got ${bytes.length}`
    );
  }
  const tmp = bytes.slice();
  const head = tmp[0];
  if (!(head & 128)) {
    throw new Error("unexpected encoding for G1 point");
  }
  if (head & 64) {
    if (head != 192) {
      throw new Error(
        "invalid zero representation, 3rd header bit not 0)"
      );
    } else if (bytes.slice(1).some((b) => b != 0)) {
      throw new Error(
        "invalid zero representation, some non-header bits not 0"
      );
    }
    return affineCurve1.ZERO;
  }
  const isYMax = (head & 32) != 0;
  tmp[0] = tmp[0] & 31;
  const x = decodeIntBE(tmp);
  if (x <= 0n || x >= CURVE1.P) {
    throw new Error(`x coordinate out of range`);
  }
  const x3 = F1.cube(x);
  const y2 = F1.add(x3, affineCurve1.b);
  let y = F1.sqrt(y2, isYMax);
  const point = { x, y };
  if (!affineCurve1.isValidPoint(point)) {
    throw new Error("decoded invalid G1 point");
  }
  return point;
}
function decodeG2Point(bytes) {
  if (bytes.length != 96) {
    throw new Error(
      `expected 96 bytes for encoded G2 point, got ${bytes.length}`
    );
  }
  const tmp = bytes.slice();
  const head = tmp[0];
  if ((head & 128) == 0) {
    throw new Error("unexpected encoding for G1 point");
  }
  if ((head & 64) != 0) {
    if (head != 192) {
      throw new Error(
        "invalid zero representation, 3rd header bit not 0)"
      );
    } else if (bytes.slice(1).some((b) => b != 0)) {
      throw new Error(
        "invalid zero representation, some non-header bits not 0"
      );
    }
    return affineCurve2.ZERO;
  }
  const isYMax = (head & 32) != 0;
  tmp[0] = tmp[0] & 31;
  const x = [decodeIntBE(tmp.slice(0, 48)), decodeIntBE(tmp.slice(48, 96))];
  const x3 = F2.cube(x);
  const y2 = F2.add(x3, affineCurve2.b);
  let y = F2.sqrt(y2, isYMax);
  const point = { x, y };
  if (!affineCurve2.isValidPoint(point)) {
    throw new Error("decoded invalid G2 point");
  }
  return point;
}
function encodeIntBE48(x) {
  const bytes = encodeIntBE(x);
  while (bytes.length < 48) {
    bytes.unshift(0);
  }
  if (bytes[0] & 224) {
    throw new Error("x doesn't fit in 381 bits");
  }
  return bytes;
}
function encodeG1Point(point) {
  if (affineCurve1.isZero(point)) {
    return [192].concat(new Array(47).fill(0));
  } else {
    const { x, y } = point;
    const head = y > CURVE1.P / 2n ? 160 : 128;
    const bytes = encodeIntBE48(x);
    bytes[0] = head | bytes[0];
    return bytes;
  }
}
function encodeG2Point(point) {
  if (affineCurve2.isZero(point)) {
    return [192].concat(new Array(95).fill(0));
  } else {
    const { x, y } = point;
    const head = y[0] > CURVE1.P / 2n ? 160 : 128;
    const bytes = encodeIntBE48(x[0]).concat(encodeIntBE48(x[1]));
    bytes[0] = head | bytes[0];
    return bytes;
  }
}

// node_modules/@helios-lang/crypto/src/elliptic/bls12_381/hash/constants.js
var ISOGENY_COEFFICIENTS_G1 = [
  // xNum
  [
    0x06e08c248e260e70bd1e962381edee3d31d79d7e22c837bc23c0bf1bc24c6b68c24b1b80b64d391fa9c8ba2e8ba2d229n,
    0x10321da079ce07e272d8ec09d2565b0dfa7dccdde6787f96d50af36003b14866f69b771f8c285decca67df3f1605fb7bn,
    0x169b1f8e1bcfa7c42e0c37515d138f22dd2ecb803a0c5c99676314baf4bb1b7fa3190b2edc0327797f241067be390c9en,
    0x080d3cf1f9a78fc47b90b33563be990dc43b756ce79f5574a2c596c928c5d1de4fa295f296b74e956d71986a8497e317n,
    0x17b81e7701abdbe2e8743884d1117e53356de5ab275b4db1a682c62ef0f2753339b7c8f8c8f475af9ccb5618e3f0c88en,
    0x0d6ed6553fe44d296a3726c38ae652bfb11586264f0f8ce19008e218f9c86b2a8da25128c1052ecaddd7f225a139ed84n,
    0x1630c3250d7313ff01d1201bf7a74ab5db3cb17dd952799b9ed3ab9097e68f90a0870d2dcae73d19cd13c1c66f652983n,
    0x0e99726a3199f4436642b4b3e4118e5499db995a1257fb3f086eeb65982fac18985a286f301e77c451154ce9ac8895d9n,
    0x1778e7166fcc6db74e0609d307e55412d7f5e4656a8dbf25f1b33289f1b330835336e25ce3107193c5b388641d9b6861n,
    0x0d54005db97678ec1d1048c5d10a9a1bce032473295983e56878e501ec68e25c958c3e3d2a09729fe0179f9dac9edcb0n,
    0x17294ed3e943ab2f0588bab22147a81c7c17e75b2f6a8417f565e33c70d1e86b4838f2a6f318c356e834eef1b3cb83bbn,
    0x11a05f2b1e833340b809101dd99815856b303e88a2d7005ff2627b56cdb4e2c85610c2d5f2e62d6eaeac1662734649b7n
  ],
  // xDen
  [
    0x000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001n,
    0x095fc13ab9e92ad4476d6e3eb3a56680f682b4ee96f7d03776df533978f31c1593174e4b4b7865002d6384d168ecdd0an,
    0x0a10ecf6ada54f825e920b3dafc7a3cce07f8d1d7161366b74100da67f39883503826692abba43704776ec3a79a1d641n,
    0x14a7ac2a9d64a8b230b3f5b074cf01996e7f63c21bca68a81996e1cdf9822c580fa5b9489d11e2d311f7d99bbdcc5a5en,
    0x0772caacf16936190f3e0c63e0596721570f5799af53a1894e2e073062aede9cea73b3538f0de06cec2574496ee84a3an,
    0x0e7355f8e4e667b955390f7f0506c6e9395735e9ce9cad4d0a43bcef24b8982f7400d24bc4228f11c02df9a29f6304a5n,
    0x13a8e162022914a80a6f1d5f43e7a07dffdfc759a12062bb8d6b44e833b306da9bd29ba81f35781d539d395b3532a21en,
    0x03425581a58ae2fec83aafef7c40eb545b08243f16b1655154cca8abc28d6fd04976d5243eecf5c4130de8938dc62cd8n,
    0x0b2962fe57a3225e8137e629bff2991f6f89416f5a718cd1fca64e00b11aceacd6a3d0967c94fedcfcc239ba5cb83e19n,
    0x12561a5deb559c4348b4711298e536367041e8ca0cf0800c0126c2588c48bf5713daa8846cb026e9e5c8276ec82b3bffn,
    0x08ca8d548cff19ae18b2e62f4bd3fa6f01d5ef4ba35b48ba9c9588617fc8ac62b558d681be343df8993cf9fa40d21b1cn
  ],
  // yNum
  [
    0x15e6be4e990f03ce4ea50b3b42df2eb5cb181d8f84965a3957add4fa95af01b2b665027efec01c7704b456be69c8b604n,
    0x05c129645e44cf1102a159f748c4a3fc5e673d81d7e86568d9ab0f5d396a7ce46ba1049b6579afb7866b1e715475224bn,
    0x0245a394ad1eca9b72fc00ae7be315dc757b3b080d4c158013e6632d3c40659cc6cf90ad1c232a6442d9d3f5db980133n,
    0x0b182cac101b9399d155096004f53f447aa7b12a3426b08ec02710e807b4633f06c851c1919211f20d4c04f00b971ef8n,
    0x18b46a908f36f6deb918c143fed2edcc523559b8aaf0c2462e6bfe7f911f643249d9cdf41b44d606ce07c8a4d0074d8en,
    0x19713e47937cd1be0dfd0b8f1d43fb93cd2fcbcb6caf493fd1183e416389e61031bf3a5cce3fbafce813711ad011c132n,
    0x0e1bba7a1186bdb5223abde7ada14a23c42a0ca7915af6fe06985e7ed1e4d43b9b3f7055dd4eba6f2bafaaebca731c30n,
    0x09fc4018bd96684be88c9e221e4da1bb8f3abd16679dc26c1e8b6e6a1f20cabe69d65201c78607a360370e577bdba587n,
    0x0987c8d5333ab86fde9926bd2ca6c674170a05bfe3bdd81ffd038da6c26c842642f64550fedfe935a15e4ca31870fb29n,
    0x04ab0b9bcfac1bbcb2c977d027796b3ce75bb8ca2be184cb5231413c4d634f3747a87ac2460f415ec961f8855fe9d6f2n,
    0x16603fca40634b6a2211e11db8f0a6a074a7d0d4afadb7bd76505c3d3ad5544e203f6326c95a807299b23ab13633a5f0n,
    0x08cc03fdefe0ff135caf4fe2a21529c4195536fbe3ce50b879833fd221351adc2ee7f8dc099040a841b6daecf2e8fedbn,
    0x01f86376e8981c217898751ad8746757d42aa7b90eeb791c09e4a3ec03251cf9de405aba9ec61deca6355c77b0e5f4cbn,
    0x00cc786baa966e66f4a384c86a3b49942552e2d658a31ce2c344be4b91400da7d26d521628b00523b8dfe240c72de1f6n,
    0x134996a104ee5811d51036d776fb46831223e96c254f383d0f906343eb67ad34d6c56711962fa8bfe097e75a2e41c696n,
    0x090d97c81ba24ee0259d1f094980dcfa11ad138e48a869522b52af6c956543d3cd0c7aee9b3ba3c2be9845719707bb33n
  ],
  // yDen
  [
    0x000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001n,
    0x0e0fa1d816ddc03e6b24255e0d7819c171c40f65e273b853324efcd6356caa205ca2f570f13497804415473a1d634b8fn,
    0x02660400eb2e4f3b628bdd0d53cd76f2bf565b94e72927c1cb748df27942480e420517bd8714cc80d1fadc1326ed06f7n,
    0x0ad6b9514c767fe3c3613144b45f1496543346d98adf02267d5ceef9a00d9b8693000763e3b90ac11e99b138573345ccn,
    0x0accbb67481d033ff5852c1e48c50c477f94ff8aefce42d28c0f9a88cea7913516f968986f7ebbea9684b529e2561092n,
    0x04d2f259eea405bd48f010a01ad2911d9c6dd039bb61a6290e591b36e636a5c871a5c29f4f83060400f8b49cba8f6aa8n,
    0x167a55cda70a6e1cea820597d94a84903216f763e13d87bb5308592e7ea7d4fbc7385ea3d529b35e346ef48bb8913f55n,
    0x1866c8ed336c61231a1be54fd1d74cc4f9fb0ce4c6af5920abc5750c4bf39b4852cfe2f7bb9248836b233d9d55535d4an,
    0x16a3ef08be3ea7ea03bcddfabba6ff6ee5a4375efa1f4fd7feb34fd206357132b920f5b00801dee460ee415a15812ed9n,
    0x166007c08a99db2fc3ba8734ace9824b5eecfdfa8d0cf8ef5dd365bc400a0051d5fa9c01a58b1fb93d1a1399126a775cn,
    0x08d9e5297186db2d9fb266eaac783182b70152c65550d881c5ecd87b6f0f5a6449f38db9dfa9cce202c6477faaf9b7acn,
    0x0be0e079545f43e4b00cc912f8228ddcc6d19c9f0f69bbb0542eda0fc9dec916a20b15dc0fd2ededda39142311a5001dn,
    0x16b7d288798e5395f20d23bf89edb4d1d115c5dbddbcd30e123da489e726af41727364f2c28297ada8d26d98445f5416n,
    0x058df3306640da276faaae7d6e8eb15778c4855551ae7f310c35a5dd279cd2eca6757cd636f96f891e2538b53dbf67f2n,
    0x1962d75c2381201e1a0cbd6c43c348b885c84ff731c4d59ca4a10356f453e01f78a4260763529e3532f6102c2e49a03dn,
    0x16112c4c3a9c98b252181140fad0eae9601a6de578980be6eec3232b5be72e7a07f3688ef60c206d01479253b03663c1n
  ]
];
var ISOGENY_COEFFICIENTS_G2 = [
  // xNum
  [
    [
      0x171d6541fa38ccfaed6dea691f5fb614cb14b4e7f4e810aa22d6108f142b85757098e38d0f671c7188e2aaaaaaaa5ed1n,
      0x0n
    ],
    [
      0x11560bf17baa99bc32126fced787c88f984f87adf7ae0c7f9a208c6b4f20a4181472aaa9cb8d555526a9ffffffffc71en,
      0x8ab05f8bdd54cde190937e76bc3e447cc27c3d6fbd7063fcd104635a790520c0a395554e5c6aaaa9354ffffffffe38dn
    ],
    [
      0x0n,
      0x11560bf17baa99bc32126fced787c88f984f87adf7ae0c7f9a208c6b4f20a4181472aaa9cb8d555526a9ffffffffc71an
    ],
    [
      0x5c759507e8e333ebb5b7a9a47d7ed8532c52d39fd3a042a88b58423c50ae15d5c2638e343d9c71c6238aaaaaaaa97d6n,
      0x5c759507e8e333ebb5b7a9a47d7ed8532c52d39fd3a042a88b58423c50ae15d5c2638e343d9c71c6238aaaaaaaa97d6n
    ]
  ],
  // xDen
  [
    [0x0n, 0x0n],
    [0x1n, 0x0n],
    [
      0xcn,
      0x1a0111ea397fe69a4b1ba7b6434bacd764774b84f38512bf6730d2a0f6b0f6241eabfffeb153ffffb9feffffffffaa9fn
    ],
    [
      0x0n,
      0x1a0111ea397fe69a4b1ba7b6434bacd764774b84f38512bf6730d2a0f6b0f6241eabfffeb153ffffb9feffffffffaa63n
    ]
  ],
  // yNum
  [
    [
      0x124c9ad43b6cf79bfbf7043de3811ad0761b0f37a1e26286b0e977c69aa274524e79097a56dc4bd9e1b371c71c718b10n,
      0x0n
    ],
    [
      0x11560bf17baa99bc32126fced787c88f984f87adf7ae0c7f9a208c6b4f20a4181472aaa9cb8d555526a9ffffffffc71cn,
      0x8ab05f8bdd54cde190937e76bc3e447cc27c3d6fbd7063fcd104635a790520c0a395554e5c6aaaa9354ffffffffe38fn
    ],
    [
      0x0n,
      0x5c759507e8e333ebb5b7a9a47d7ed8532c52d39fd3a042a88b58423c50ae15d5c2638e343d9c71c6238aaaaaaaa97ben
    ],
    [
      0x1530477c7ab4113b59a4c18b076d11930f7da5d4a07f649bf54439d87d27e500fc8c25ebf8c92f6812cfc71c71c6d706n,
      0x1530477c7ab4113b59a4c18b076d11930f7da5d4a07f649bf54439d87d27e500fc8c25ebf8c92f6812cfc71c71c6d706n
    ]
  ],
  // yDen
  [
    [0x1n, 0x0n],
    [
      0x12n,
      0x1a0111ea397fe69a4b1ba7b6434bacd764774b84f38512bf6730d2a0f6b0f6241eabfffeb153ffffb9feffffffffaa99n
    ],
    [
      0x0n,
      0x1a0111ea397fe69a4b1ba7b6434bacd764774b84f38512bf6730d2a0f6b0f6241eabfffeb153ffffb9feffffffffa9d3n
    ],
    [
      0x1a0111ea397fe69a4b1ba7b6434bacd764774b84f38512bf6730d2a0f6b0f6241eabfffeb153ffffb9feffffffffa8fbn,
      0x1a0111ea397fe69a4b1ba7b6434bacd764774b84f38512bf6730d2a0f6b0f6241eabfffeb153ffffb9feffffffffa8fbn
    ]
  ]
];

// node_modules/@helios-lang/crypto/src/elliptic/bls12_381/hash/hashToField.js
var hash = sha2_256;
var nb = 32;
var ns = 64;
function i2osp(x, n) {
  if (x >= Math.pow(256, n)) {
    throw new Error(`x doesn't fit in ${n} bytes`);
  }
  return encodeIntBE(x).slice(0, n);
}
function strxor(a, b) {
  if (a.length != b.length) {
    throw new Error("a and b don't have the same length");
  }
  return a.map((x, i) => x ^ b[i]);
}
function expandMessageXmd(msg, dst, n) {
  if (dst.length > 255) {
    throw new Error("domain specific tag too long");
  }
  const ell = Math.ceil(n / nb);
  if (ell > 255 || n > 65535) {
    throw new Error("too many requested bytes");
  }
  const dstPrime = dst.concat(i2osp(dst.length, 1));
  const zPad = i2osp(0, ns);
  const libStr = i2osp(n, 2);
  const msgPrime = zPad.concat(msg).concat(libStr).concat(i2osp(0, 1)).concat(dstPrime);
  const bytes = new Array(ell);
  bytes[0] = hash(msgPrime);
  bytes[1] = hash(bytes[0].concat(i2osp(1, 1)).concat(dstPrime));
  for (let i = 2; i <= ell; i++) {
    bytes[i] = hash(
      strxor(bytes[0], bytes[i - 1]).concat(i2osp(i, 1)).concat(dstPrime)
    );
  }
  const uniformBytes = bytes.slice(1).reduce((prev, bs) => prev.concat(bs), []);
  return uniformBytes.slice(0, n);
}
function expandMessage(msg, dst, n) {
  return expandMessageXmd(msg, dst, n);
}
var L = Math.ceil((381 + 128) / 8);
function hashToField(msg, dst, count, m) {
  const n = count * m * L;
  const uniformBytes = expandMessage(msg, dst, n);
  const res = new Array(count).fill([]);
  for (let i = 0; i < count; i++) {
    for (let j = 0; j < m - 1; j++) {
      const offset = L * (j + i * m);
      const tv = uniformBytes.slice(offset, L);
      res[i].push(decodeIntBE(tv) % CURVE1.P);
    }
  }
  return res;
}

// node_modules/@helios-lang/crypto/src/elliptic/bls12_381/hash/isogeny.js
function map_to_curve_simple_swu_3mod4(u) {
  const A = 0x144698a3b8e9433d693a02c96d4982b0ea985383ee66a8d8e8981aefd881ac98936f8da0e0f97f5cf428082d584c1dn;
  const B = 0x12e2908d11688030018b12e8753eee3b2016c1f0f24f4070a0b9c14fcef35ef55a23215a316ceaa5d1cc48e98e172be0n;
  const Z3 = 11n;
  const c1 = (CURVE1.P - 3n) / 4n;
  const c2 = F1.sqrt(F1.pow(F1.negate(Z3), 3n));
  const tv1 = F1.square(u);
  const tv3 = F1.multiply(Z3, tv1);
  let xDen = F1.add(F1.square(tv3), tv3);
  const xNum1 = F1.multiply(F1.add(xDen, F1.ONE), B);
  const xNum2 = F1.multiply(tv3, xNum1);
  xDen = F1.multiply(F1.negate(A), xDen);
  if (F1.isZero(xDen)) {
    xDen = F1.multiply(A, Z3);
  }
  let tv2 = F1.square(xDen);
  const gxd = F1.multiply(tv2, xDen);
  tv2 = F1.multiply(A, tv2);
  let gx1 = F1.multiply(F1.add(F1.square(xNum1), tv2), xNum1);
  tv2 = F1.multiply(B, gxd);
  gx1 = F1.add(gx1, tv2);
  tv2 = F1.multiply(gx1, gxd);
  const tv4 = F1.multiply(F1.square(gxd), tv2);
  const y1 = F1.multiply(F1.pow(tv4, c1), tv2);
  const y2 = F1.multiply(F1.multiply(F1.multiply(y1, c2), tv1), u);
  let xNum, yPos;
  if (F1.equals(F1.multiply(F1.square(y1), gxd), gx1)) {
    xNum = xNum1;
    yPos = y1;
  } else {
    xNum = xNum2;
    yPos = y2;
  }
  const yNeg = F1.negate(yPos);
  const y = u % 2n == yPos % 2n ? yPos : yNeg;
  const x = F1.divide(xNum, xDen);
  return [x, y];
}
function map_to_curve_simple_swu_9mod16(t) {
  const iso_3_a = [0n, 240n];
  const iso_3_b = [1012n, 1012n];
  const iso_3_z = [-2n, -1n];
  const t2 = F2.pow(t, 2n);
  const iso_3_z_t2 = F2.multiply(iso_3_z, t2);
  const ztzt = F2.add(iso_3_z_t2, F2.pow(iso_3_z_t2, 2n));
  let denominator = F2.negate(F2.multiply(iso_3_a, ztzt));
  let numerator = F2.multiply(iso_3_b, F2.add(ztzt, F2.ONE));
  if (F2.isZero(denominator)) {
    denominator = F2.multiply(iso_3_z, iso_3_a);
  }
  let v = F2.pow(denominator, 3n);
  let u = F2.add(
    F2.pow(numerator, 3n),
    F2.multiply(F2.multiply(iso_3_a, numerator), F2.pow(denominator, 2n)),
    F2.multiply(iso_3_b, v)
  );
  const gamma = F2.gamma(u, v);
  const rof = F2.rootOfUnity(u, v, gamma);
  const sqrtCandidateX1 = F2.multiply(gamma, F2.pow(t, 3n));
  u = F2.multiply(F2.pow(iso_3_z_t2, 3n), u);
  const eta = F2.eta(u, v, sqrtCandidateX1);
  let y = eta ?? rof;
  if (!y) {
    throw new Error("Hash to Curve - Optimized SWU failure");
  }
  if (eta) {
    numerator = F2.multiply(numerator, iso_3_z_t2);
  }
  if (F2.sign(t) !== F2.sign(y)) {
    y = F2.negate(y);
  }
  const x = F2.divide(numerator, denominator);
  return {
    x,
    y
  };
}
function hashToG1(msg, dst) {
  const [[u0], [u1]] = hashToField(msg, dst, 2, 1);
  const [x0, y0] = map_to_curve_simple_swu_3mod4(u0);
  const [x1, y1] = map_to_curve_simple_swu_3mod4(u1);
  const point2 = projectedCurve1.toAffine(
    projectedCurve1.add(projectedCurve1.fromAffine({ x: x0, y: y0 }), projectedCurve1.fromAffine({ x: x1, y: y1 }))
  );
  const point3 = isogenyMapG1(point2);
  return projectedCurve1.clearCofactor(projectedCurve1.fromAffine(point3));
}
function hashToG2(msg, dst) {
  const [[u0, u1], [v0, v1]] = hashToField(msg, dst, 2, 2);
  const point0 = map_to_curve_simple_swu_9mod16([u0, u1]);
  const point1 = map_to_curve_simple_swu_9mod16([v0, v1]);
  const point2 = projectedCurve2.toAffine(
    projectedCurve2.add(projectedCurve2.fromAffine(point0), projectedCurve2.fromAffine(point1))
  );
  const point3 = isogenyMapG2(point2);
  return projectedCurve2.clearCofactor(projectedCurve2.fromAffine(point3));
}
function isogenyMapG1(point) {
  return isogenyMap(F1, ISOGENY_COEFFICIENTS_G1, point);
}
function isogenyMapG2(point) {
  return isogenyMap(F2, ISOGENY_COEFFICIENTS_G2, point);
}
function isogenyMap(F4, coeffs, { x, y }) {
  const [xNum, xDen, yNum, yDen] = coeffs.map(
    (val) => val.reduce((acc, i) => F4.add(F4.multiply(acc, x), i))
  );
  x = F4.divide(xNum, xDen);
  y = F4.multiply(y, F4.divide(yNum, yDen));
  return { x, y };
}

// node_modules/@helios-lang/crypto/src/elliptic/bls12_381/pairing.js
function millerLoop(a, b) {
  if (affineCurve1.isZero(a) || !affineCurve1.isValidPoint(a)) {
    throw new Error("invalid first point for pairing");
  }
  if (affineCurve2.isZero(b) || !affineCurve2.isValidPoint(b)) {
    throw new Error("invalid second point for pairing");
  }
  const bs = precompute(b.x, b.y);
  return millerLoopInternal([a.x, a.y], bs);
}
function precompute(bx, by) {
  const Qx = bx;
  const Qy = by;
  const Qz = F2.ONE;
  let Rx = Qx;
  let Ry = Qy;
  let Rz = Qz;
  let res = [];
  for (let i = 62; i >= 0; i--) {
    let t0 = F2.square(Ry);
    let t1 = F2.square(Rz);
    let t2 = F2.multiply(F2.scale(t1, 3n), affineCurve2.b);
    let t3 = F2.scale(t2, 3n);
    let t4 = F2.subtract(F2.square(F2.add(Ry, Rz)), F2.add(t1, t0));
    res.push([
      F2.subtract(t2, t0),
      // T2 - T0
      F2.scale(F2.square(Rx), 3n),
      // 3 * Rx²
      F2.negate(t4)
      // -T4
    ]);
    Rx = F2.halve(F2.multiply(F2.subtract(t0, t3), F2.multiply(Rx, Ry)));
    Ry = F2.subtract(
      F2.square(F2.halve(F2.add(t0, t3))),
      F2.scale(F2.square(t2), 3n)
    );
    Rz = F2.multiply(t0, t4);
    if (getXBit(i)) {
      let t02 = F2.subtract(Ry, F2.multiply(Qy, Rz));
      let t12 = F2.subtract(Rx, F2.multiply(Qx, Rz));
      res.push([
        F2.subtract(F2.multiply(t02, Qx), F2.multiply(t12, Qy)),
        // T0 * Qx - T1 * Qy
        F2.negate(t02),
        // -T0
        t12
        // T1
      ]);
      let t22 = F2.square(t12);
      let t32 = F2.multiply(t22, t12);
      let t42 = F2.multiply(t22, Rx);
      let t5 = F2.add(
        F2.subtract(t32, F2.scale(t42, 2n)),
        F2.multiply(F2.square(t02), Rz)
      );
      Rx = F2.multiply(t12, t5);
      Ry = F2.subtract(
        F2.multiply(F2.subtract(t42, t5), t02),
        F2.multiply(t32, Ry)
      );
      Rz = F2.multiply(Rz, t32);
    }
  }
  return res;
}
var CURVEx = CURVE1.X;
function getBigIntBit(x, i) {
  return Number(x >> BigInt(i) & 1n);
}
function getXBit(i) {
  return Number(CURVEx >> BigInt(i) & 1n);
}
function millerLoopInternal([ax, ay], bs) {
  const Px = ax;
  const Py = ay;
  let res = F12.ONE;
  for (let j = 0, i = 62; i >= 0; i--, j++) {
    const E = bs[j];
    res = F12.multiply(res, [
      [E[0], F2.scale(E[1], Px), [0n, 0n]],
      [[0n, 0n], F2.scale(E[2], Py), [0n, 0n]]
    ]);
    if (getXBit(i)) {
      j += 1;
      const F4 = bs[j];
      res = F12.multiply(res, [
        [F4[0], F2.scale(F4[1], Px), [0n, 0n]],
        [[0n, 0n], F2.scale(F4[2], Py), [0n, 0n]]
      ]);
    }
    if (i !== 0) {
      res = F12.square(res);
    }
  }
  return F12.conjugate(res);
}
function finalExponentiate(res) {
  const x = CURVEx;
  let t0 = F12.divide(F12.powp(res, 6), res);
  let t1 = F12.multiply(F12.powp(t0, 2), t0);
  let t2 = cyclotomicPow(t1, x);
  let t3 = F12.multiply(F12.conjugate(cyclotomicSquare(t1)), t2);
  let t4 = cyclotomicPow(t3, x);
  let t5 = cyclotomicPow(t4, x);
  let t6 = F12.multiply(cyclotomicPow(t5, x), cyclotomicSquare(t2));
  let t7 = cyclotomicPow(t6, x);
  t2 = F12.powp(F12.multiply(t2, t5), 2);
  t4 = F12.powp(F12.multiply(t4, t1), 3);
  t6 = F12.powp(F12.multiply(t6, F12.conjugate(t1)), 1);
  t7 = F12.multiply(F12.multiply(t7, F12.conjugate(t3)), t1);
  return F12.multiply(F12.multiply(F12.multiply(t2, t4), t6), t7);
}
function finalVerify(a, b) {
  const c = F12.multiply(a, F12.invert(b));
  const cFinal = finalExponentiate(c);
  return F12.equals(cFinal, F12.ONE);
}
function cyclotomicSquare([ax, ay]) {
  const [c0c0, c0c1, c0c2] = ax;
  const [c1c0, c1c1, c1c2] = ay;
  const [t3, t4] = F2.square2(c0c0, c1c1);
  const [t5, t6] = F2.square2(c1c0, c0c2);
  const [t7, t8] = F2.square2(c0c1, c1c2);
  let t9 = F2.multiplyu2(t8);
  return [
    [
      F2.add(F2.scale(F2.subtract(t3, c0c0), 2n), t3),
      // 2 * (T3 - c0c0)  + T3
      F2.add(F2.scale(F2.subtract(t5, c0c1), 2n), t5),
      // 2 * (T5 - c0c1)  + T5
      F2.add(F2.scale(F2.subtract(t7, c0c2), 2n), t7)
      // 2 * (T7 - c0c2)  + T7
    ],
    [
      F2.add(F2.scale(F2.add(t9, c1c0), 2n), t9),
      // 2 * (T9 + c1c0) + T9
      F2.add(F2.scale(F2.add(t4, c1c1), 2n), t4),
      // 2 * (T4 + c1c1) + T4
      F2.add(F2.scale(F2.add(t6, c1c2), 2n), t6)
      // 2 * (T6 + c1c2) + T6
    ]
  ];
}
function cyclotomicPow(a, n) {
  let z = F12.ONE;
  for (let i = 63; i >= 0; i--) {
    z = cyclotomicSquare(z);
    if (getBigIntBit(n, i)) {
      z = F12.multiply(z, a);
    }
  }
  return F12.conjugate(z);
}

// node_modules/@helios-lang/crypto/src/elliptic/ed25519/constants.js
var P = 57896044618658097711785492504343953926634992332820282019728792003956564819949n;
var N = 7237005577332262213973186563042994240857116359379907606001950938285454250989n;
var D = -4513249062541557337682894930092624173785641285191125241628941591882900924598840740n;
var G = {
  x: 15112221349535400772501151409588531511454012693041857206046113283949847762202n,
  // recovered from Gy
  y: 46316835694926478169428394003475163141307993866256225615783033603165251855960n
  // (4n*invert(5n)) % P
};

// node_modules/@helios-lang/crypto/src/elliptic/ed25519/field.js
var P38 = 7237005577332262213973186563042994240829374041602535252466099000494570602494n;
var SQRT2P14 = 19681161376707505956807079304988542015446066515923890162744021073123829784752n;
var WithSqrtImpl = class extends FieldWithOpsImpl {
  constructor() {
    super(new ScalarField(P));
  }
  /**
   * @param {bigint} a
   * @returns {bigint}
   */
  sqrt(a) {
    let r = this.pow(a, P38);
    const r2 = this.multiply(r, r);
    if (!this.equals(r2, a)) {
      r = this.multiply(r, SQRT2P14);
    }
    return r;
  }
};
var F = new WithSqrtImpl();
var Z = new FieldWithOpsImpl(new ScalarField(N));

// node_modules/@helios-lang/crypto/src/elliptic/ed25519/ExtendedCurve.js
var ExtendedCurveInternal = class {
  constructor() {
  }
  /**
   * @type {Point4<bigint>}
   */
  get ZERO() {
    return { x: 0n, y: 1n, z: 1n, t: 0n };
  }
  /**
   * @param {Point4<bigint>} point
   * @returns {boolean}
   */
  isValidPoint(point) {
    if (this.equals(this.ZERO, point)) {
      return true;
    } else {
      const zInverse = F.invert(point.z);
      const x = F.multiply(point.x, zInverse);
      const y = F.multiply(point.y, zInverse);
      const xx = x * x;
      const yy = y * y;
      return F.equals(-xx + yy - 1n, D * xx * yy);
    }
  }
  /**
   * @param {Point4<bigint>} a
   * @param {Point4<bigint>} b
   * @returns {boolean}
   */
  equals(a, b) {
    return F.multiply(a.x, b.z) == F.multiply(b.x, a.z) && F.multiply(a.y, b.z) == F.multiply(b.y, a.z);
  }
  /**
   * @param {Point4<bigint>} point
   * @returns {Point4<bigint>}
   */
  negate(point) {
    return {
      x: F.negate(point.x),
      y: point.y,
      z: point.z,
      t: F.negate(point.t)
    };
  }
  /**
   * @param {Point4<bigint>} point1
   * @param {Point4<bigint>} point2
   * @returns {Point4<bigint>}
   */
  add(point1, point2) {
    const { x: x1, y: y1, z: z1, t: t1 } = point1;
    const { x: x2, y: y2, z: z2, t: t2 } = point2;
    const a = F.multiply(x1, x2);
    const b = F.multiply(y1, y2);
    const c = F.multiply(D * t1, t2);
    const d = F.multiply(z1, z2);
    const e = F.add((x1 + y1) * (x2 + y2), -a - b);
    const f = F.add(d, -c);
    const g = F.add(d, c);
    const h = F.add(a, b);
    const x3 = F.multiply(e, f);
    const y3 = F.multiply(g, h);
    const z3 = F.multiply(f, g);
    const t3 = F.multiply(e, h);
    return { x: x3, y: y3, z: z3, t: t3 };
  }
};
var ExtendedCurveImpl = class extends CurveWithOpsImpl {
  constructor() {
    super(new ExtendedCurveInternal());
  }
  /**
   * @param {Point4<bigint>} point
   * @returns {Point2<bigint>}
   */
  toAffine(point) {
    if (this.isZero(point)) {
      return { x: 0n, y: 1n };
    } else {
      const zInverse = F.invert(point.z);
      return {
        x: F.multiply(point.x, zInverse),
        y: F.multiply(point.y, zInverse)
      };
    }
  }
  /**
   * @param {Point2<bigint>} point
   * @returns {Point4<bigint>}
   */
  fromAffine(point) {
    const { x, y } = point;
    return {
      x,
      y,
      z: 1n,
      t: F.multiply(x, y)
    };
  }
};

// node_modules/@helios-lang/crypto/src/elliptic/ed25519/codec.js
function decodeScalar(bytes, truncate = false) {
  if (truncate) {
    bytes = bytes.slice(0, 32);
    bytes[0] &= 248;
    bytes[31] &= 63;
    bytes[31] |= 64;
  }
  return decodeIntLE(bytes);
}
function decodePrivateKey(bytes) {
  return decodeScalar(bytes, true);
}
function encodeScalar(x) {
  return encodeIntLE32(x);
}
function decodePoint(bytes) {
  if (bytes.length != 32) {
    throw new Error(
      `expected 32 bytes for encoded point, got ${bytes.length}`
    );
  }
  const tmp = bytes.slice();
  tmp[31] = tmp[31] & 127;
  const y = decodeScalar(tmp);
  const finalBit = getBit(bytes, 255);
  const y2 = y * y;
  const x2 = (y2 - 1n) * F.invert(1n + D * y2);
  let x = F.sqrt(x2);
  if (!x) {
    throw new Error(
      "sqrt not defined on Ed25519 field, unable to recover X"
    );
  }
  if (Number(x & 1n) != finalBit) {
    x = F.negate(x);
  }
  return { x, y };
}
function encodePoint(point) {
  const { x, y } = point;
  const evenOdd = Number(x & 1n);
  const bytes = encodeScalar(y);
  bytes[31] = bytes[31] & 255 | evenOdd * 128;
  return bytes;
}

// node_modules/@helios-lang/crypto/src/elliptic/ed25519/EdDSA.js
var hash2 = sha2_512;
function makeEdDSA(args) {
  return new EdDSAImpl(args.curve);
}
var EdDSAImpl = class {
  /**
   * @type {Ed25519Curve<T>}
   */
  curve;
  /**
   *
   * @param {Ed25519Curve<T>} curve
   */
  constructor(curve) {
    this.curve = curve;
  }
  /**
   * Combination hash and decodeCurveInt
   * @private
   * @param {number[]} bytes
   * @returns {bigint}
   */
  oneWay(bytes) {
    return decodeScalar(hash2(bytes));
  }
  /**
   * @param {number[]} privateKeyBytes
   * @param {boolean} hashPrivateKey - defaults to true, set to false when used in Bip32 algorithm
   * @returns {number[]} 32 byte public key.
   */
  derivePublicKey(privateKeyBytes, hashPrivateKey = true) {
    if (hashPrivateKey) {
      privateKeyBytes = hash2(privateKeyBytes);
    } else {
      if (privateKeyBytes.length != 64) {
        throw new Error(
          `expected extended privateKey with a length of 64 bytes, this privateKey is ${privateKeyBytes.length} bytes long (hint: pass hashPrivateKey = true)`
        );
      }
    }
    const privateKey = decodePrivateKey(privateKeyBytes);
    const publicKey = this.curve.scale(this.curve.fromAffine(G), privateKey);
    const publicKeyBytes = encodePoint(this.curve.toAffine(publicKey));
    return publicKeyBytes;
  }
  /**
   * Sign the message.
   * Even though this implementation isn't constant time, it isn't vulnerable to a timing attack (see detailed notes in the code)
   * @param {number[]} message
   * @param {number[]} privateKeyBytes
   * @param {boolean} hashPrivateKey - defaults to true, Bip32 passes this as false
   * @returns {number[]} 64 byte signature.
   */
  sign(message, privateKeyBytes, hashPrivateKey = true) {
    if (hashPrivateKey) {
      privateKeyBytes = hash2(privateKeyBytes);
    } else {
      if (privateKeyBytes.length != 64) {
        throw new Error(
          `expected extended privateKey with a length of 64 bytes, this privateKey is ${privateKeyBytes.length} bytes long (hint: pass hashPrivateKey = true)`
        );
      }
    }
    const privateKey = decodePrivateKey(privateKeyBytes);
    const publicKey = this.curve.scale(this.curve.fromAffine(G), privateKey);
    const publicKeyBytes = encodePoint(this.curve.toAffine(publicKey));
    const k = this.oneWay(privateKeyBytes.slice(32, 64).concat(message));
    const a = this.curve.scale(this.curve.fromAffine(G), k);
    const aEncoded = encodePoint(this.curve.toAffine(a));
    const f = this.oneWay(aEncoded.concat(publicKeyBytes).concat(message));
    const b = Z.add(k, f * privateKey);
    const bEncoded = encodeScalar(b);
    return aEncoded.concat(bEncoded);
  }
  /**
   * Returns `true` if the signature is correct.
   * Returns `false`:
   *   * if the signature is incorrect
   *   * if the signature doesn't lie on the curve,
   *   * if the publicKey doesn't lie on the curve
   * Throw an error:
   *   * signature isn't 64 bytes long
   *   * publickey isn't 32 bytes long (asserted inside `decodePoint()`)
   * @param {number[]} signature
   * @param {number[]} message
   * @param {number[]} publicKey
   * @returns {boolean}
   */
  verify(signature, message, publicKey) {
    if (signature.length != 64) {
      throw new Error(`unexpected signature length ${signature.length}`);
    }
    const a = this.curve.fromAffine(decodePoint(signature.slice(0, 32)));
    if (!this.curve.isValidPoint(a)) {
      return false;
    }
    const b = decodeScalar(signature.slice(32, 64));
    const h = this.curve.fromAffine(decodePoint(publicKey));
    if (!this.curve.isValidPoint(h)) {
      return false;
    }
    const f = this.oneWay(
      signature.slice(0, 32).concat(publicKey).concat(message)
    );
    const left = this.curve.scale(this.curve.fromAffine(G), b);
    const right = this.curve.add(a, this.curve.scale(h, f));
    return this.curve.equals(left, right);
  }
};
var Ed25519 = makeEdDSA({ curve: new ExtendedCurveImpl() });

// node_modules/@helios-lang/crypto/src/rand/drbg.js
var MAX_ITERS = 1e3;
function hmacDrbg(seed, pred) {
  let k = new Array(32).fill(0);
  let v = new Array(32).fill(1);
  k = hmacSha2_256(k, v.concat([0]).concat(seed));
  v = hmacSha2_256(k, v);
  k = hmacSha2_256(k, v.concat([1]).concat(seed));
  v = hmacSha2_256(k, v);
  for (let i = 0; i <= MAX_ITERS; i++) {
    v = hmacSha2_256(k, v);
    const res = pred(v);
    if (res !== void 0) {
      return res;
    }
    k = hmacSha2_256(k, v.concat([0]));
    v = hmacSha2_256(k, v);
  }
  throw new Error("too many iterations");
}

// node_modules/@helios-lang/crypto/src/elliptic/secp256k1/constants.js
var P2 = 115792089237316195423570985008687907853269984665640564039457584007908834671663n;
var N2 = 115792089237316195423570985008687907852837564279074904382605163141518161494337n;
var G2 = {
  x: 55066263022277343669578718895168534326250603453777594175500187360389116729240n,
  y: 32670510020758816978083085130507043184471273380659243275938904335757337482424n
};

// node_modules/@helios-lang/crypto/src/elliptic/secp256k1/field.js
var P142 = 28948022309329048855892746252171976963317496166410141009864396001977208667916n;
var WithSqrt = class extends FieldWithOpsImpl {
  constructor() {
    super(new ScalarField(P2));
  }
  /**
   * @param {bigint} a
   * @returns {bigint}
   */
  sqrt(a) {
    const r = this.pow(a, P142);
    const r2 = this.multiply(r, r);
    if (!this.equals(r2, a)) {
      throw new Error("sqrt failed");
    }
    return r;
  }
};
var F3 = new WithSqrt();
var Z2 = new FieldWithOpsImpl(new ScalarField(N2));

// node_modules/@helios-lang/crypto/src/elliptic/secp256k1/ProjectedCurve.js
var projectedCurve = new ShortProjectedImpl(F3, 7n);

// node_modules/@helios-lang/crypto/src/elliptic/secp256k1/codec.js
function decodeScalar2(bytes, truncate = false) {
  let x = decodeIntBE(bytes);
  if (truncate && bytes.length > 32) {
    x = x >> BigInt((bytes.length - 32) * 8);
  }
  return x;
}
function decodeMessageHash(bytes) {
  if (bytes.length != 32) {
    throw new Error(
      `expected 32 bytes for messageHash, got ${bytes.length}`
    );
  }
  return mod(decodeScalar2(bytes, true), N2);
}
function decodePrivateKey2(bytes) {
  if (bytes.length != 32) {
    throw new Error(
      `expected privateKey with a length of 32 bytes, this privateKey is ${bytes.length} bytes long`
    );
  }
  const d = decodeScalar2(bytes);
  if (d <= 0n || d >= N2) {
    throw new Error("private key out of range");
  }
  return d;
}
function decodeSignature(bytes, rModulo) {
  if (bytes.length != 64) {
    throw new Error(`expected 64 byte signature, got ${bytes.length} bytes`);
  }
  const r = decodeScalar2(bytes.slice(0, 32));
  const s = decodeScalar2(bytes.slice(32, 64));
  if (r <= 0n || r >= rModulo) {
    throw new Error("invalid first part of signature");
  }
  if (s <= 0n || s >= N2) {
    throw new Error("invalid second part of signature");
  }
  return [r, s];
}
function decodeECDSASignature(bytes) {
  return decodeSignature(bytes, N2);
}
function decodeSchnorrSignature(bytes) {
  return decodeSignature(bytes, P2);
}
function encodeScalar2(x) {
  const bytes = encodeIntBE(x);
  while (bytes.length < 32) {
    bytes.unshift(0);
  }
  return bytes;
}
function encodeSignature(r, s) {
  return encodeScalar2(r).concat(encodeScalar2(s));
}
function decodeECDSAPoint(bytes) {
  if (bytes.length != 33) {
    throw new Error(
      `expected 33 bytes for encoded point, got ${bytes.length}`
    );
  }
  const head = bytes[0];
  const x = decodeScalar2(bytes.slice(1));
  if (x <= 0n || x >= P2) {
    throw new Error(`x coordinate out of range`);
  }
  const x3 = F3.multiply(F3.multiply(x, x), x);
  const y2 = F3.add(x3, 7n);
  let y = F3.sqrt(y2);
  if (head == 3) {
    if (y % 2n == 0n) {
      y = F3.scale(y, -1n);
    }
  } else if (head == 2) {
    if (y % 2n != 0n) {
      y = F3.scale(y, -1n);
    }
  } else {
    throw new Error(`unexpected header byte ${head}`);
  }
  return { x, y };
}
function encodeECDSAPoint(point) {
  const { x, y } = point;
  const head = y % 2n == 0n ? 2 : 3;
  return [head].concat(encodeScalar2(x));
}
function decodeSchnorrPoint(bytes) {
  return decodeECDSAPoint([2].concat(bytes));
}
function encodeSchnorrPoint(point) {
  return encodeECDSAPoint(point).slice(1);
}

// node_modules/@helios-lang/crypto/src/elliptic/secp256k1/ECDSA.js
var ECDSAImpl = class {
  /**
   * @readonly
   * @type {CurveWithFromToAffine<bigint, T>}
   */
  curve;
  /**
   * @param {CurveWithFromToAffine<bigint, T>} curve
   */
  constructor(curve) {
    this.curve = curve;
  }
  /**
   * Derives a 33 byte public key from a 32 byte privateKey
   * @param {number[]} privateKeyBytes
   * @returns {number[]} 33 byte public key (first byte is evenOdd bit)
   */
  derivePublicKey(privateKeyBytes) {
    const privateKey = decodePrivateKey2(privateKeyBytes);
    const publicKey = this.curve.scale(this.curve.fromAffine(G2), privateKey);
    if (!this.curve.isValidPoint(publicKey)) {
      throw new Error("public key not on curve");
    }
    const publicKeyBytes = encodeECDSAPoint(this.curve.toAffine(publicKey));
    return publicKeyBytes;
  }
  /**
   * Sign the 32 messageHash.
   * Even though this implementation isn't constant time, it isn't vulnerable to a timing attack (see detailed notes in the code).
   * @param {number[]} messageHash 32 bytes
   * @param {number[]} privateKeyBytes 32 bytes
   * @returns {number[]} 64 byte signature.
   */
  sign(messageHash, privateKeyBytes) {
    const privateKey = decodePrivateKey2(privateKeyBytes);
    const h1 = decodeMessageHash(messageHash);
    return hmacDrbg(privateKeyBytes.concat(messageHash), (kBytes) => {
      const k = decodeScalar2(kBytes);
      if (k >= N2 || k <= 0n) {
        return;
      }
      const q = this.curve.scale(this.curve.fromAffine(G2), k);
      const r = Z2.mod(this.curve.toAffine(q).x);
      if (r === 0n) {
        return;
      }
      const ik = Z2.invert(k);
      let s = Z2.multiply(ik, Z2.add(h1, Z2.multiply(privateKey, r)));
      if (s === 0n) {
        return;
      }
      if (s > N2 >> 1n) {
        s = Z2.negate(s);
      }
      return encodeSignature(r, s);
    });
  }
  /**
   * Returns `true` if the signature is correct.
   * TODO: for invalid format inputs this method fails. Should it instead return `false` for some of these bad cases? (the plutus-core spec isn't clear at all)
   * @param {number[]} signature
   * @param {number[]} messageHash
   * @param {number[]} publicKeyBytes
   * @returns {boolean}
   */
  verify(signature, messageHash, publicKeyBytes) {
    if (publicKeyBytes.length != 33) {
      throw new Error(
        `unexpected publickey length ${publicKeyBytes.length}`
      );
    }
    const h1 = decodeMessageHash(messageHash);
    const [r, s] = decodeECDSASignature(signature);
    if (s > N2 >> 1n) {
      return false;
    }
    const si = Z2.invert(s);
    const u1 = Z2.multiply(h1, si);
    const u2 = Z2.multiply(r, si);
    const curve = this.curve;
    const publicKey = curve.fromAffine(decodeECDSAPoint(publicKeyBytes));
    if (!curve.isValidPoint(publicKey)) {
      throw new Error("publicKey not on curve");
    }
    const R = curve.add(
      curve.scale(curve.fromAffine(G2), u1),
      curve.scale(publicKey, u2)
    );
    return Z2.mod(curve.toAffine(R).x) === r;
  }
};
var ECDSASecp256k1 = new ECDSAImpl(projectedCurve);

// node_modules/@helios-lang/crypto/src/elliptic/secp256k1/Schnorr.js
var tagHashes = {
  "BIP0340/aux": [0],
  "BIP0340/challenge": [0],
  "BIP0340/nonce": [0]
};
function hash3(tag, bytes) {
  let tagHash = tagHashes[tag];
  if (tagHash.length != 32) {
    tagHash = sha2_256(encodeUtf8(tag));
    tagHashes[tag] = tagHash;
  }
  return sha2_256(tagHash.concat(tagHash).concat(bytes));
}
function makeSchnorr(args) {
  return new SchnorrImpl(args.curve);
}
var SchnorrImpl = class {
  /**
   * @type {CurveWithFromToAffine<bigint, T>}
   */
  curve;
  /**
   * @param {CurveWithFromToAffine<bigint, T>} curve
   */
  constructor(curve) {
    this.curve = curve;
  }
  /**
   * @param {number[]} privateKeyBytes
   * @returns {number[]} 32 byte public key.
   */
  derivePublicKey(privateKeyBytes) {
    const privateKey = decodePrivateKey2(privateKeyBytes);
    const publicKey = this.curve.scale(this.curve.fromAffine(G2), privateKey);
    const publicKeyBytes = encodeSchnorrPoint(
      this.curve.toAffine(publicKey)
    );
    return publicKeyBytes;
  }
  /**
   * @param {number[]} message any length
   * @param {number[]} privateKeyBytes 32 bytes
   * @param {number[]} nonce 32 bytes
   * @returns {number[]} 64 bytes
   */
  sign(message, privateKeyBytes, nonce) {
    if (nonce.length != 32) {
      throw new Error(
        `expected 32 bytes for nonce, got ${nonce.length} bytes`
      );
    }
    let privateKey = decodePrivateKey2(privateKeyBytes);
    const publicKey = this.curve.scale(this.curve.fromAffine(G2), privateKey);
    if (this.curve.isZero(publicKey)) {
      throw new Error(
        `unexpected publicKey point ${JSON.stringify(publicKey)}`
      );
    }
    if (this.curve.toAffine(publicKey).y % 2n != 0n) {
      privateKey = Z2.negate(privateKey);
      privateKeyBytes = encodeScalar2(privateKey);
    }
    const nonceHash = hash3("BIP0340/aux", nonce);
    const t = nonceHash.map((b, i) => privateKeyBytes[i] ^ b);
    const publicKeyBytes = encodeSchnorrPoint(
      this.curve.toAffine(publicKey)
    );
    const rand2 = hash3(
      "BIP0340/nonce",
      t.concat(publicKeyBytes.concat(message))
    );
    let k = mod(decodeScalar2(rand2), N2);
    if (k === 0n) {
      throw new Error("invalid nonce");
    }
    const R = this.curve.scale(this.curve.fromAffine(G2), k);
    if (this.curve.isZero(R)) {
      throw new Error("failed to sign");
    }
    if (this.curve.toAffine(R).y % 2n != 0n) {
      k = N2 - k;
    }
    const Rbytes = encodeSchnorrPoint(this.curve.toAffine(R));
    const eBytes = hash3(
      "BIP0340/challenge",
      Rbytes.concat(publicKeyBytes).concat(message)
    );
    const e = mod(decodeScalar2(eBytes), N2);
    const signature = Rbytes.concat(
      encodeScalar2(mod(k + mod(e * privateKey, N2), N2))
    );
    return signature;
  }
  /**
   * Returns `true` if the signature is correct.
   * TODO: for invalid format inputs this method fails. Should it instead return `false` for some of these bad cases? (the plutus-core spec isn't clear at all)
   * @param {number[]} signature
   * @param {number[]} message
   * @param {number[]} publicKeyBytes
   * @returns {boolean}
   */
  verify(signature, message, publicKeyBytes) {
    const publicKey = this.curve.fromAffine(
      decodeSchnorrPoint(publicKeyBytes)
    );
    if (!this.curve.isValidPoint(publicKey)) {
      throw new Error("publicKey not on curve");
    }
    const [r, s] = decodeSchnorrSignature(signature);
    const eBytes = hash3(
      "BIP0340/challenge",
      encodeScalar2(r).concat(publicKeyBytes).concat(message)
    );
    const e = mod(decodeScalar2(eBytes), N2);
    const a = this.curve.scale(this.curve.fromAffine(G2), s);
    const b = this.curve.scale(publicKey, Z2.negate(e));
    const R = this.curve.add(a, b);
    if (this.curve.isZero(R)) {
      throw new Error("failed to verify (bad R)");
    }
    if (this.curve.toAffine(R).y % 2n != 0n) {
      throw new Error("failed to verify (uneven R.y)");
    }
    return this.curve.toAffine(R).x == r;
  }
};
var SchnorrSecp256k1 = makeSchnorr({ curve: projectedCurve });

// node_modules/@helios-lang/uplc/src/costmodel/ArgSizesConstCost.js
function makeArgSizesConstCost(constant) {
  return new ArgSizesConstCost(constant);
}
var ArgSizesConstCost = class {
  /**
   * @readonly
   * @type {bigint}
   */
  constant;
  /**
   * @param {bigint} constant
   */
  constructor(constant) {
    this.constant = constant;
  }
  /**
   * @param {bigint[]} _argSizes
   * @returns {bigint}
   */
  calcCost(_argSizes) {
    return this.constant;
  }
};

// node_modules/@helios-lang/uplc/src/costmodel/ArgSizesDiagCost.js
function makeArgSizesDiagCost(a, b, constant) {
  return new ArgSizesDiagCost(a, b, constant);
}
var ArgSizesDiagCost = class {
  /**
   * Slope
   * @readonly
   * @type {bigint}
   */
  a;
  /**
   * Intercept
   * @readonly
   * @type {bigint}
   */
  b;
  /**
   * @readonly
   * @type {bigint}
   */
  constant;
  /**
   * @param {bigint} a - slope
   * @param {bigint} b - intercept
   * @param {bigint} constant
   */
  constructor(a, b, constant) {
    this.a = a;
    this.b = b;
    this.constant = constant;
  }
  /**
   * @param {bigint[]} argSizes
   * @returns {bigint}
   */
  calcCost(argSizes) {
    if (argSizes.length != 2) {
      throw new Error(
        `ArgSizesDiag cost model can only be used for two arguments, got ${argSizes.length} arguments`
      );
    }
    const [x, y] = argSizes;
    if (x == y) {
      return this.a * x + this.b;
    } else {
      return this.constant;
    }
  }
};

// node_modules/@helios-lang/uplc/src/costmodel/ArgSizesDiffCost.js
function makeArgSizesDiffCost(a, b, minimum) {
  return new ArgSizesDiffCost(a, b, minimum);
}
var ArgSizesDiffCost = class {
  /**
   * Slope
   * @readonly
   * @type {bigint}
   */
  a;
  /**
   * Intercept
   * @readonly
   * @type {bigint}
   */
  b;
  /**
   * @readonly
   * @type {bigint}
   */
  min;
  /**
   * @param {bigint} a - slope
   * @param {bigint} b - intercept
   * @param {bigint} minimum
   */
  constructor(a, b, minimum) {
    this.a = a;
    this.b = b;
    this.min = minimum;
  }
  /**
   * @param {bigint[]} argSizes
   * @returns {bigint}
   */
  calcCost(argSizes) {
    if (argSizes.length != 2) {
      throw new Error(
        `ArgSizesDiff cost model can only be used for two arguments, got ${argSizes.length} arguments`
      );
    }
    const [x, y] = argSizes;
    const d = x - y;
    if (d < this.min) {
      return this.min;
    } else {
      return d;
    }
  }
};

// node_modules/@helios-lang/uplc/src/costmodel/ArgSizesFirstCost.js
function makeArgSizesFirstCost(a, b) {
  return new ArgSizesFirstCost(a, b);
}
var ArgSizesFirstCost = class {
  /**
   * Slope
   * @readonly
   * @type {bigint}
   */
  a;
  /**
   * Intercept
   * @readonly
   * @type {bigint}
   */
  b;
  /**
   * @param {bigint} a - slope
   * @param {bigint} b - intercept
   */
  constructor(a, b) {
    this.a = a;
    this.b = b;
  }
  /**
   * @param {bigint[]} argSizes
   */
  calcCost(argSizes) {
    const s = argSizes[0];
    return this.a * s + this.b;
  }
};

// node_modules/@helios-lang/uplc/src/costmodel/ArgSizesLiteralYOrLinearZCost.js
function makeArgSizesLiteralYOrLinearZCost(slope, intercept) {
  return new ArgSizesLiteralYOrLinearZCost(slope, intercept);
}
var ArgSizesLiteralYOrLinearZCost = class {
  /**
   * @readonly
   * @type {bigint}
   */
  slope;
  /**
   * @readonly
   * @type {bigint}
   */
  intercept;
  /**
   * @param {bigint} slope
   * @param {bigint} intercept
   */
  constructor(slope, intercept) {
    this.slope = slope;
    this.intercept = intercept;
  }
  /**
   * @param {bigint[]} argSizes
   * @returns {bigint}
   */
  calcCost(argSizes) {
    const [_x, y, z] = argSizes;
    if (y == 0n) {
      return z * this.slope + this.intercept;
    } else {
      return y;
    }
  }
};

// node_modules/@helios-lang/uplc/src/costmodel/ArgSizesMaxCost.js
function makeArgSizesMaxCost(a, b) {
  return new ArgSizesMaxCost(a, b);
}
var ArgSizesMaxCost = class {
  /**
   * Slope
   * @readonly
   * @type {bigint}
   */
  a;
  /**
   * Intercept
   * @readonly
   * @type {bigint}
   */
  b;
  /**
   * @param {bigint} a - slope
   * @param {bigint} b - intercept
   */
  constructor(a, b) {
    this.a = a;
    this.b = b;
  }
  /**
   * @param  {bigint[]} argSizes
   * @returns {bigint}
   */
  calcCost(argSizes) {
    const m = argSizes.reduce((m2, s) => s > m2 ? s : m2, 0n);
    return m * this.a + this.b;
  }
};

// node_modules/@helios-lang/uplc/src/costmodel/ArgSizesMinCost.js
function makeArgSizesMinCost(a, b) {
  return new ArgSizesMinCost(a, b);
}
var ArgSizesMinCost = class {
  /**
   * Slope
   * @readonly
   * @type {bigint}
   */
  a;
  /**
   * Intercept
   * @readonly
   * @type {bigint}
   */
  b;
  /**
   * @param {bigint} a - slope
   * @param {bigint} b - intercept
   */
  constructor(a, b) {
    this.a = a;
    this.b = b;
  }
  /**
   * @param {bigint[]} argSizes
   * @returns {bigint}
   */
  calcCost(argSizes) {
    const m = argSizes.slice(1).reduce((m2, a) => a < m2 ? a : m2, argSizes[0]);
    return this.a * m + this.b;
  }
};

// node_modules/@helios-lang/uplc/src/costmodel/ArgSizesProdCost.js
function makeArgSizesProdCost(a, b, constant) {
  return new ArgSizesProdCost(a, b, constant);
}
var ArgSizesProdCost = class {
  /**
   * Slope
   * @readonly
   * @type {bigint}
   */
  a;
  /**
   * Intercept
   * @readonly
   * @type {bigint}
   */
  b;
  /**
   * @readonly
   * @type {bigint}
   */
  constant;
  /**
   * @param {bigint} a - slope
   * @param {bigint} b - intercept
   * @param {bigint} constant
   */
  constructor(a, b, constant) {
    this.a = a;
    this.b = b;
    this.constant = constant;
  }
  /**
   * @param {bigint[]} argSizes
   * @returns {bigint}
   */
  calcCost(argSizes) {
    if (argSizes.length != 2) {
      throw new Error(
        `expected only 2 arguments for ArgSizesProd cost model, got ${argSizes.length}`
      );
    }
    const [x, y] = argSizes;
    if (x < y) {
      return this.constant;
    } else {
      return x * y * this.a + this.b;
    }
  }
};

// node_modules/@helios-lang/uplc/src/costmodel/ArgSizesQuadXYCost.js
function makeArgSizesQuadXYCost(constant, minimum, coeffs) {
  return new ArgSizesQuadXYCost(constant, minimum, coeffs);
}
var ArgSizesQuadXYCost = class {
  /**
   * @readonly
   * @type {bigint}
   */
  constant;
  /**
   * @readonly
   * @type {bigint}
   */
  minimum;
  /**
   * @readonly
   * @type {QuadCoeffs}
   */
  coeffs;
  /**
   * @param{bigint} constant
   * @param {bigint} minimum
   * @param {QuadCoeffs} coeffs
   */
  constructor(constant, minimum, coeffs) {
    this.constant = constant;
    this.minimum = minimum;
    this.coeffs = coeffs;
  }
  /**
   * @param  {bigint[]} argSizes
   * @returns {bigint}
   */
  calcCost(argSizes) {
    const [x, y] = argSizes;
    if (x < y) {
      return this.constant;
    } else {
      const { c00, c10, c01, c20, c11, c02 } = this.coeffs;
      let s = c00 + c10 * x + c01 * y + c20 * x * x + c11 * x * y + c02 * y * y;
      return s < this.minimum ? this.minimum : s;
    }
  }
};

// node_modules/@helios-lang/uplc/src/costmodel/ArgSizesQuadYCost.js
function makeArgSizesQuadYCost(coeffs) {
  return new ArgSizesQuadYCost(coeffs);
}
var ArgSizesQuadYCost = class {
  /**
   * @readonly
   * @type {QuadCoeffs}
   */
  coeffs;
  /**
   * @param {QuadCoeffs} coeffs
   */
  constructor(coeffs) {
    this.coeffs = coeffs;
  }
  /**
   * @param  {bigint[]} argSizes
   * @returns {bigint}
   */
  calcCost(argSizes) {
    const [_x, y] = argSizes;
    const { c0, c1, c2 } = this.coeffs;
    return c0 + c1 * y + c2 * y * y;
  }
};

// node_modules/@helios-lang/uplc/src/costmodel/ArgSizesQuadZCost.js
function makeArgSizesQuadZCost(coeffs) {
  return new ArgSizesQuadZCost(coeffs);
}
var ArgSizesQuadZCost = class {
  /**
   * @readonly
   * @type {QuadCoeffs}
   */
  coeffs;
  /**
   * @param {QuadCoeffs} coeffs
   */
  constructor(coeffs) {
    this.coeffs = coeffs;
  }
  /**
   * @param  {bigint[]} argSizes
   * @returns {bigint}
   */
  calcCost(argSizes) {
    const [_x, _y, z] = argSizes;
    const { c0, c1, c2 } = this.coeffs;
    return c0 + c1 * z + c2 * z * z;
  }
};

// node_modules/@helios-lang/uplc/src/costmodel/ArgSizesSecondCost.js
function makeArgSizesSecondCost(a, b) {
  return new ArgSizesSecondCost(a, b);
}
var ArgSizesSecondCost = class {
  /**
   * Slope
   * @readonly
   * @type {bigint}
   */
  a;
  /**
   * Intercept
   * @readonly
   * @type {bigint}
   */
  b;
  /**
   * @param {bigint} a - slope
   * @param {bigint} b - intercept
   */
  constructor(a, b) {
    this.a = a;
    this.b = b;
  }
  /**
   * @param {bigint[]} argSizes
   */
  calcCost(argSizes) {
    const s = argSizes[1];
    return this.a * s + this.b;
  }
};

// node_modules/@helios-lang/uplc/src/costmodel/ArgSizesSumCost.js
function makeArgSizesSumCost(a, b) {
  return new ArgSizesSumCost(a, b);
}
var ArgSizesSumCost = class {
  /**
   * Slope
   * @readonly
   * @type {bigint}
   */
  a;
  /**
   * Intercept
   * @readonly
   * @type {bigint}
   */
  b;
  /**
   * @param {bigint} a - slope
   * @param {bigint} b - intercept
   */
  constructor(a, b) {
    this.a = a;
    this.b = b;
  }
  /**
   * @param  {bigint[]} argSizes
   * @returns {bigint}
   */
  calcCost(argSizes) {
    const s = argSizes.reduce((s2, a) => s2 + a, 0n);
    return s * this.a + this.b;
  }
};

// node_modules/@helios-lang/uplc/src/costmodel/ArgSizesThirdCost.js
function makeArgSizesThirdCost(a, b) {
  return new ArgSizesThirdCost(a, b);
}
var ArgSizesThirdCost = class {
  /**
   * Slope
   * @readonly
   * @type {bigint}
   */
  a;
  /**
   * Intercept
   * @readonly
   * @type {bigint}
   */
  b;
  /**
   * @param {bigint} a - slope
   * @param {bigint} b - intercept
   */
  constructor(a, b) {
    this.a = a;
    this.b = b;
  }
  /**
   * @param {bigint[]} argSizes
   */
  calcCost(argSizes) {
    const s = argSizes[2];
    return this.a * s + this.b;
  }
};

// node_modules/@helios-lang/uplc/src/costmodel/Cost.js
function decodeCost(bytes) {
  const [mem, cpu] = decodeTuple(bytes, [decodeInt, decodeInt]);
  return { cpu, mem };
}
function encodeCost(cost) {
  return encodeTuple([encodeInt(cost.mem), encodeInt(cost.cpu)]);
}

// node_modules/@helios-lang/uplc/src/costmodel/CostModel.js
function makeCostModel(params, builtins) {
  return new CostModelImpl(params, builtins);
}
var CostModelImpl = class {
  /**
   * @readonly
   * @type {Cost}
   */
  builtinTerm;
  /**
   * @readonly
   * @type {Cost}
   */
  callTerm;
  /**
   * @readonly
   * @type {Cost}
   */
  constTerm;
  /**
   * @readonly
   * @type {Cost}
   */
  delayTerm;
  /**
   * @readonly
   * @type {Cost}
   */
  forceTerm;
  /**
   * @readonly
   * @type {Cost}
   */
  lambdaTerm;
  /**
   * @readonly
   * @type {Cost}
   */
  startupTerm;
  /**
   * @readonly
   * @type {Cost}
   */
  varTerm;
  /**
   * @readonly
   * @type {Cost}
   */
  constrTerm;
  /**
   * @readonly
   * @type {Cost}
   */
  caseTerm;
  /**
   * @readonly
   * @type {Record<string, (argSizes: bigint[]) => Cost>}
   */
  builtins;
  /**
   * @param {CostModelParamsProxy} params
   * @param {BuiltinCostModel[]} builtins
   */
  constructor(params, builtins) {
    this.callTerm = {
      cpu: params.get(17),
      mem: params.get(18)
    };
    this.builtinTerm = {
      cpu: params.get(19),
      mem: params.get(20)
    };
    this.constTerm = {
      cpu: params.get(21),
      mem: params.get(22)
    };
    this.delayTerm = {
      cpu: params.get(23),
      mem: params.get(24)
    };
    this.forceTerm = {
      cpu: params.get(25),
      mem: params.get(26)
    };
    this.lambdaTerm = {
      cpu: params.get(27),
      mem: params.get(28)
    };
    this.startupTerm = {
      cpu: params.get(29),
      mem: params.get(30)
    };
    this.varTerm = {
      cpu: params.get(31),
      mem: params.get(32)
    };
    this.constrTerm = {
      cpu: params.get(193, 0n),
      mem: params.get(194, 0n)
    };
    this.caseTerm = {
      cpu: params.get(195, 0n),
      mem: params.get(196, 0n)
    };
    this.builtins = Object.fromEntries(
      builtins.map(
        /**
         * @param {BuiltinCostModel} b
         * @returns {[string, (argSizes: bigint[]) => Cost]}
         */
        (b) => {
          const cpuModel = b.cpuModel(params);
          const memModel = b.memModel(params);
          const calc = (argSizes) => {
            return {
              cpu: cpuModel.calcCost(argSizes),
              mem: memModel.calcCost(argSizes)
            };
          };
          return [b.name, calc];
        }
      )
    );
  }
};

// node_modules/@helios-lang/uplc/src/costmodel/CostModelParamsProxy.js
function makeCostModelParamsProxy(params) {
  return new CostModelParamsProxyImpl(params);
}
var CostModelParamsProxyImpl = class {
  /**
   * @private
   * @readonly
   * @type {number[]}
   */
  _params;
  /**
   * @param {number[]} params
   */
  constructor(params) {
    this._params = params;
  }
  /**
   * Throws an error if key not found
   * @param {number} key
   * @param {bigint | undefined} def
   * @returns {bigint}
   */
  get(key, def = void 0) {
    const v = this._params[key];
    if (v === void 0) {
      if (def !== void 0) {
        return def;
      } else {
        throw new Error(`CostModelParams[${key}] undefined`);
      }
    }
    if (!(typeof v == "number")) {
      throw new Error(`CostModelParams[${key}] isn't a number`);
    }
    if (v % 1 != 0) {
      throw new Error(`CostModelParams[${key}] isn't a whole number`);
    }
    return BigInt(v);
  }
};

// node_modules/@helios-lang/era/src/index.js
var ERA = "Conway";

// node_modules/@helios-lang/uplc/src/costmodel/CostModelParamsV1.js
function DEFAULT_COST_MODEL_PARAMS_V1() {
  switch (ERA) {
    case "Conway":
      return CONWAY_COST_MODEL_PARAMS_V1;
  }
}
var CONWAY_COST_MODEL_PARAMS_V1 = [
  100788,
  // 0: addInteger-cpu-arguments-intercept
  420,
  // 1: addInteger-cpu-arguments-slope
  1,
  // 2: addInteger-memory-arguments-intercept
  1,
  // 3: addInteger-memory-arguments-slope
  1e3,
  // 4: appendByteString-cpu-arguments-intercept
  173,
  // 5: appendByteString-cpu-arguments-slope
  0,
  // 6: appendByteString-memory-arguments-intercept
  1,
  // 7: appendByteString-memory-arguments-slope
  1e3,
  // 8: appendString-cpu-arguments-intercept
  59957,
  // 9: appendString-cpu-arguments-slope
  4,
  // 10: appendString-memory-arguments-intercept
  1,
  // 11: appendString-memory-arguments-slope
  11183,
  // 12: bData-cpu-arguments
  32,
  // 13: bData-memory-arguments
  201305,
  // 14: blake2b_256-cpu-arguments-intercept
  8356,
  // 15: blake2b_256-cpu-arguments-slope
  4,
  // 16: blake2b_256-memory-arguments
  16e3,
  // 17: cekApplyCost-exBudgetCPU
  100,
  // 18: cekApplyCost-exBudgetMemory
  16e3,
  // 19: cekBuiltinCost-exBudgetCPU
  100,
  // 20: cekBuiltinCost-exBudgetMemory
  16e3,
  // 21: cekConstCost-exBudgetCPU
  100,
  // 22: cekConstCost-exBudgetMemory
  16e3,
  // 23: cekDelayCost-exBudgetCPU
  100,
  // 24: cekDelayCost-exBudgetMemory
  16e3,
  // 25: cekForceCost-exBudgetCPU
  100,
  // 26: cekForceCost-exBudgetMemory
  16e3,
  // 27: cekLamCost-exBudgetCPU
  100,
  // 28: cekLamCost-exBudgetMemory
  100,
  // 29: cekStartupCost-exBudgetCPU
  100,
  // 30: cekStartupCost-exBudgetMemory
  16e3,
  // 31: cekVarCost-exBudgetCPU
  100,
  // 32: cekVarCost-exBudgetMemory
  94375,
  // 33: chooseData-cpu-arguments
  32,
  // 34: chooseData-memory-arguments
  132994,
  // 35: chooseList-cpu-arguments
  32,
  // 36: chooseList-memory-arguments
  61462,
  // 37: chooseUnit-cpu-arguments
  4,
  // 38: chooseUnit-memory-arguments
  72010,
  // 39: consByteString-cpu-arguments-intercept
  178,
  // 40: consByteString-cpu-arguments-slope
  0,
  // 41: consByteString-memory-arguments-intercept
  1,
  // 42: consByteString-memory-arguments-slope
  22151,
  // 43: constrData-cpu-arguments
  32,
  // 44: constrData-memory-arguments
  91189,
  // 45: decodeUtf8-cpu-arguments-intercept
  769,
  // 46: decodeUtf8-cpu-arguments-slope
  4,
  // 47: decodeUtf8-memory-arguments-intercept
  2,
  // 48: decodeUtf8-memory-arguments-slope
  85848,
  // 49: divideInteger-cpu-arguments-constant
  228465,
  // 50: divideInteger-cpu-arguments-model-arguments-intercept
  122,
  // 51: divideInteger-cpu-arguments-model-arguments-slope
  0,
  // 52: divideInteger-memory-arguments-intercept
  1,
  // 53: divideInteger-memory-arguments-minimum
  1,
  // 54: divideInteger-memory-arguments-slope
  1e3,
  // 55: encodeUtf8-cpu-arguments-intercept
  42921,
  // 56: encodeUtf8-cpu-arguments-slope
  4,
  // 57: encodeUtf8-memory-arguments-intercept
  2,
  // 58: encodeUtf8-memory-arguments-slope
  24548,
  // 59: equalsByteString-cpu-arguments-constant
  29498,
  // 60: equalsByteString-cpu-arguments-intercept
  38,
  // 61: equalsByteString-cpu-arguments-slope
  1,
  // 62: equalsByteString-memory-arguments
  898148,
  // 63: equalsData-cpu-arguments-intercept
  27279,
  // 64: equalsData-cpu-arguments-slope
  1,
  // 65: equalsData-memory-arguments
  51775,
  // 66: equalsInteger-cpu-arguments-intercept
  558,
  // 67: equalsInteger-cpu-arguments-slope
  1,
  // 68: equalsInteger-memory-arguments
  39184,
  // 69: equalsString-cpu-arguments-constant
  1e3,
  // 70: equalsString-cpu-arguments-intercept
  60594,
  // 71: equalsString-cpu-arguments-slope
  1,
  // 72: equalsString-memory-arguments
  141895,
  // 73: fstPair-cpu-arguments
  32,
  // 74: fstPair-memory-arguments
  83150,
  // 75: headList-cpu-arguments
  32,
  // 76: headList-memory-arguments
  15299,
  // 77: iData-cpu-arguments
  32,
  // 78: iData-memory-arguments
  76049,
  // 79: ifThenElse-cpu-arguments
  1,
  // 80: ifThenElse-memory-arguments
  13169,
  // 81: indexByteString-cpu-arguments
  4,
  // 82: indexByteString-memory-arguments
  22100,
  // 83: lengthOfByteString-cpu-arguments
  10,
  // 84: lengthOfByteString-memory-arguments
  28999,
  // 85: lessThanByteString-cpu-arguments-intercept
  74,
  // 86: lessThanByteString-cpu-arguments-slope
  1,
  // 87: lessThanByteString-memory-arguments
  28999,
  // 88: lessThanEqualsByteString-cpu-arguments-intercept
  74,
  // 89: lessThanEqualsByteString-cpu-arguments-slope
  1,
  // 90: lessThanEqualsByteString-memory-arguments
  43285,
  // 91: lessThanEqualsInteger-cpu-arguments-intercept
  552,
  // 92: lessThanEqualsInteger-cpu-arguments-slope
  1,
  // 93: lessThanEqualsInteger-memory-arguments
  44749,
  // 94: lessThanInteger-cpu-arguments-intercept
  541,
  // 95: lessThanInteger-cpu-arguments-slope
  1,
  // 96: lessThanInteger-memory-arguments
  33852,
  // 97: listData-cpu-arguments
  32,
  // 98: listData-memory-arguments
  68246,
  // 99: mapData-cpu-arguments
  32,
  // 100: mapData-memory-arguments
  72362,
  // 101: mkCons-cpu-arguments
  32,
  // 102: mkCons-memory-arguments
  7243,
  // 103: mkNilData-cpu-arguments
  32,
  // 104: mkNilData-memory-arguments
  7391,
  // 105: mkNilPairData-cpu-arguments
  32,
  // 106: mkNilPairData-memory-arguments
  11546,
  // 107: mkPairData-cpu-arguments
  32,
  // 108: mkPairData-memory-arguments
  85848,
  // 109: modInteger-cpu-arguments-constant
  228465,
  // 110: modInteger-cpu-arguments-model-arguments-intercept
  122,
  // 111: modInteger-cpu-arguments-model-arguments-slope
  0,
  // 112: modInteger-memory-arguments-intercept
  1,
  // 113: modInteger-memory-arguments-minimum
  1,
  // 114: modInteger-memory-arguments-slope
  90434,
  // 115: multiplyInteger-cpu-arguments-intercept
  519,
  // 116: multiplyInteger-cpu-arguments-slope
  0,
  // 117: multiplyInteger-memory-arguments-intercept
  1,
  // 118: multiplyInteger-memory-arguments-slope
  74433,
  // 119: nullList-cpu-arguments
  32,
  // 120: nullList-memory-arguments
  85848,
  // 121: quotientInteger-cpu-arguments-constant
  228465,
  // 122: quotientInteger-cpu-arguments-model-arguments-intercept
  122,
  // 123: quotientInteger-cpu-arguments-model-arguments-slope
  0,
  // 124: quotientInteger-memory-arguments-intercept
  1,
  // 125: quotientInteger-memory-arguments-minimum
  1,
  // 126: quotientInteger-memory-arguments-slope
  85848,
  // 127: remainderInteger-cpu-arguments-constant
  228465,
  // 128: remainderInteger-cpu-arguments-model-arguments-intercept
  122,
  // 129: remainderInteger-cpu-arguments-model-arguments-slope
  0,
  // 130: remainderInteger-memory-arguments-intercept
  1,
  // 131: remainderInteger-memory-arguments-minimum
  1,
  // 132: remainderInteger-memory-arguments-slope
  270652,
  // 133: sha2_256-cpu-arguments-intercept
  22588,
  // 134: sha2_256-cpu-arguments-slope
  4,
  // 135: sha2_256-memory-arguments
  1457325,
  // 136: sha3_256-cpu-arguments-intercept
  64566,
  // 137: sha3_256-cpu-arguments-slope
  4,
  // 138: sha3_256-memory-arguments
  20467,
  // 139: sliceByteString-cpu-arguments-intercept
  1,
  // 140: sliceByteString-cpu-arguments-slope
  4,
  // 141: sliceByteString-memory-arguments-intercept
  0,
  // 142: sliceByteString-memory-arguments-slope
  141992,
  // 143: sndPair-cpu-arguments
  32,
  // 144: sndPair-memory-arguments
  100788,
  // 145: subtractInteger-cpu-arguments-intercept
  420,
  // 146: subtractInteger-cpu-arguments-slope
  1,
  // 147: subtractInteger-memory-arguments-intercept
  1,
  // 148: subtractInteger-memory-arguments-slope
  81663,
  // 149: tailList-cpu-arguments
  32,
  // 150: tailList-memory-arguments
  59498,
  // 151: trace-cpu-arguments
  32,
  // 152: trace-memory-arguments
  20142,
  // 153: unBData-cpu-arguments
  32,
  // 154: unBData-memory-arguments
  24588,
  // 155: unConstrData-cpu-arguments
  32,
  // 156: unConstrData-memory-arguments
  20744,
  // 157: unIData-cpu-arguments
  32,
  // 158: unIData-memory-arguments
  25933,
  // 159: unListData-cpu-arguments
  32,
  // 160: unListData-memory-arguments
  24623,
  // 161: unMapData-cpu-arguments
  32,
  // 162: unMapData-memory-arguments
  53384111,
  // 163: verifyEd25519Signature-cpu-arguments-intercept
  14333,
  // 164: verifyEd25519Signature-cpu-arguments-slope
  10
  // 165: verifyEd25519Signature-memory-arguments
];

// node_modules/@helios-lang/uplc/src/costmodel/CostModelParamsV2.js
function DEFAULT_COST_MODEL_PARAMS_V2() {
  switch (ERA) {
    case "Conway":
      return CONWAY_COST_MODEL_PARAMS_V2;
  }
}
var CONWAY_COST_MODEL_PARAMS_V2 = [
  100788,
  // 0: addInteger-cpu-arguments-intercept
  420,
  // 1: addInteger-cpu-arguments-slope
  1,
  // 2: addInteger-memory-arguments-intercept
  1,
  // 3: addInteger-memory-arguments-slope
  1e3,
  // 4: appendByteString-cpu-arguments-intercept
  173,
  // 5: appendByteString-cpu-arguments-slope
  0,
  // 6: appendByteString-memory-arguments-intercept
  1,
  // 7: appendByteString-memory-arguments-slope
  1e3,
  // 8: appendString-cpu-arguments-intercept
  59957,
  // 9: appendString-cpu-arguments-slope
  4,
  // 10: appendString-memory-arguments-intercept
  1,
  // 11: appendString-memory-arguments-slope
  11183,
  // 12: bData-cpu-arguments
  32,
  // 13: bData-memory-arguments
  201305,
  // 14: blake2b_256-cpu-arguments-intercept
  8356,
  // 15: blake2b_256-cpu-arguments-slope
  4,
  // 16: blake2b_256-memory-arguments
  16e3,
  // 17: cekApplyCost-exBudgetCPU
  100,
  // 18: cekApplyCost-exBudgetMemory
  16e3,
  // 19: cekBuiltinCost-exBudgetCPU
  100,
  // 20: cekBuiltinCost-exBudgetMemory
  16e3,
  // 21: cekConstCost-exBudgetCPU
  100,
  // 22: cekConstCost-exBudgetMemory
  16e3,
  // 23: cekDelayCost-exBudgetCPU
  100,
  // 24: cekDelayCost-exBudgetMemory
  16e3,
  // 25: cekForceCost-exBudgetCPU
  100,
  // 26: cekForceCost-exBudgetMemory
  16e3,
  // 27: cekLamCost-exBudgetCPU
  100,
  // 28: cekLamCost-exBudgetMemory
  100,
  // 29: cekStartupCost-exBudgetCPU
  100,
  // 30: cekStartupCost-exBudgetMemory
  16e3,
  // 31: cekVarCost-exBudgetCPU
  100,
  // 32: cekVarCost-exBudgetMemory
  94375,
  // 33: chooseData-cpu-arguments
  32,
  // 34: chooseData-memory-arguments
  132994,
  // 35: chooseList-cpu-arguments
  32,
  // 36: chooseList-memory-arguments
  61462,
  // 37: chooseUnit-cpu-arguments
  4,
  // 38: chooseUnit-memory-arguments
  72010,
  // 39: consByteString-cpu-arguments-intercept
  178,
  // 40: consByteString-cpu-arguments-slope
  0,
  // 41: consByteString-memory-arguments-intercept
  1,
  // 42: consByteString-memory-arguments-slope
  22151,
  // 43: constrData-cpu-arguments
  32,
  // 44: constrData-memory-arguments
  91189,
  // 45: decodeUtf8-cpu-arguments-intercept
  769,
  // 46: decodeUtf8-cpu-arguments-slope
  4,
  // 47: decodeUtf8-memory-arguments-intercept
  2,
  // 48: decodeUtf8-memory-arguments-slope
  85848,
  // 49: divideInteger-cpu-arguments-constant
  228465,
  // 50: divideInteger-cpu-arguments-model-arguments-intercept
  122,
  // 51: divideInteger-cpu-arguments-model-arguments-slope
  0,
  // 52: divideInteger-memory-arguments-intercept
  1,
  // 53: divideInteger-memory-arguments-minimum
  1,
  // 54: divideInteger-memory-arguments-slope
  1e3,
  // 55: encodeUtf8-cpu-arguments-intercept
  42921,
  // 56: encodeUtf8-cpu-arguments-slope
  4,
  // 57: encodeUtf8-memory-arguments-intercept
  2,
  // 58: encodeUtf8-memory-arguments-slope
  24548,
  // 59: equalsByteString-cpu-arguments-constant
  29498,
  // 60: equalsByteString-cpu-arguments-intercept
  38,
  // 61: equalsByteString-cpu-arguments-slope
  1,
  // 62: equalsByteString-memory-arguments
  898148,
  // 63: equalsData-cpu-arguments-intercept
  27279,
  // 64: equalsData-cpu-arguments-slope
  1,
  // 65: equalsData-memory-arguments
  51775,
  // 66: equalsInteger-cpu-arguments-intercept
  558,
  // 67: equalsInteger-cpu-arguments-slope
  1,
  // 68: equalsInteger-memory-arguments
  39184,
  // 69: equalsString-cpu-arguments-constant
  1e3,
  // 70: equalsString-cpu-arguments-intercept
  60594,
  // 71: equalsString-cpu-arguments-slope
  1,
  // 72: equalsString-memory-arguments
  141895,
  // 73: fstPair-cpu-arguments
  32,
  // 74: fstPair-memory-arguments
  83150,
  // 75: headList-cpu-arguments
  32,
  // 76: headList-memory-arguments
  15299,
  // 77: iData-cpu-arguments
  32,
  // 78: iData-memory-arguments
  76049,
  // 79: ifThenElse-cpu-arguments
  1,
  // 80: ifThenElse-memory-arguments
  13169,
  // 81: indexByteString-cpu-arguments
  4,
  // 82: indexByteString-memory-arguments
  22100,
  // 83: lengthOfByteString-cpu-arguments
  10,
  // 84: lengthOfByteString-memory-arguments
  28999,
  // 85: lessThanByteString-cpu-arguments-intercept
  74,
  // 86: lessThanByteString-cpu-arguments-slope
  1,
  // 87: lessThanByteString-memory-arguments
  28999,
  // 88: lessThanEqualsByteString-cpu-arguments-intercept
  74,
  // 89: lessThanEqualsByteString-cpu-arguments-slope
  1,
  // 90: lessThanEqualsByteString-memory-arguments
  43285,
  // 91: lessThanEqualsInteger-cpu-arguments-intercept
  552,
  // 92: lessThanEqualsInteger-cpu-arguments-slope
  1,
  // 93: lessThanEqualsInteger-memory-arguments
  44749,
  // 94: lessThanInteger-cpu-arguments-intercept
  541,
  // 95: lessThanInteger-cpu-arguments-slope
  1,
  // 96: lessThanInteger-memory-arguments
  33852,
  // 97: listData-cpu-arguments
  32,
  // 98: listData-memory-arguments
  68246,
  // 99: mapData-cpu-arguments
  32,
  // 100: mapData-memory-arguments
  72362,
  // 101: mkCons-cpu-arguments
  32,
  // 102: mkCons-memory-arguments
  7243,
  // 103: mkNilData-cpu-arguments
  32,
  // 104: mkNilData-memory-arguments
  7391,
  // 105: mkNilPairData-cpu-arguments
  32,
  // 106: mkNilPairData-memory-arguments
  11546,
  // 107: mkPairData-cpu-arguments
  32,
  // 108: mkPairData-memory-arguments
  85848,
  // 109: modInteger-cpu-arguments-constant
  228465,
  // 110: modInteger-cpu-arguments-model-arguments-intercept
  122,
  // 111: modInteger-cpu-arguments-model-arguments-slope
  0,
  // 112: modInteger-memory-arguments-intercept
  1,
  // 113: modInteger-memory-arguments-minimum
  1,
  // 114: modInteger-memory-arguments-slope
  90434,
  // 115: multiplyInteger-cpu-arguments-intercept
  519,
  // 116: multiplyInteger-cpu-arguments-slope
  0,
  // 117: multiplyInteger-memory-arguments-intercept
  1,
  // 118: multiplyInteger-memory-arguments-slope
  74433,
  // 119: nullList-cpu-arguments
  32,
  // 120: nullList-memory-arguments
  85848,
  // 121: quotientInteger-cpu-arguments-constant
  228465,
  // 122: quotientInteger-cpu-arguments-model-arguments-intercept
  122,
  // 123: quotientInteger-cpu-arguments-model-arguments-slope
  0,
  // 124: quotientInteger-memory-arguments-intercept
  1,
  // 125: quotientInteger-memory-arguments-minimum
  1,
  // 126: quotientInteger-memory-arguments-slope
  85848,
  // 127: remainderInteger-cpu-arguments-constant
  228465,
  // 128: remainderInteger-cpu-arguments-model-arguments-intercept
  122,
  // 129: remainderInteger-cpu-arguments-model-arguments-slope
  0,
  // 130: remainderInteger-memory-arguments-intercept
  1,
  // 131: remainderInteger-memory-arguments-minimum
  1,
  // 132: remainderInteger-memory-arguments-slope
  955506,
  // 133: serialiseData-cpu-arguments-intercept
  213312,
  // 134: serialiseData-cpu-arguments-slope
  0,
  // 135: serialiseData-memory-arguments-intercept
  2,
  // 136: serialiseData-memory-arguments-slope
  270652,
  // 137: sha2_256-cpu-arguments-intercept
  22588,
  // 138: sha2_256-cpu-arguments-slope
  4,
  // 139: sha2_256-memory-arguments
  1457325,
  // 140: sha3_256-cpu-arguments-intercept
  64566,
  // 141: sha3_256-cpu-arguments-slope
  4,
  // 142: sha3_256-memory-arguments
  20467,
  // 143: sliceByteString-cpu-arguments-intercept
  1,
  // 144: sliceByteString-cpu-arguments-slope
  4,
  // 145: sliceByteString-memory-arguments-intercept
  0,
  // 146: sliceByteString-memory-arguments-slope
  141992,
  // 147: sndPair-cpu-arguments
  32,
  // 148: sndPair-memory-arguments
  100788,
  // 149: subtractInteger-cpu-arguments-intercept
  420,
  // 150: subtractInteger-cpu-arguments-slope
  1,
  // 151: subtractInteger-memory-arguments-intercept
  1,
  // 152: subtractInteger-memory-arguments-slope
  81663,
  // 153: tailList-cpu-arguments
  32,
  // 154: tailList-memory-arguments
  59498,
  // 155: trace-cpu-arguments
  32,
  // 156: trace-memory-arguments
  20142,
  // 157: unBData-cpu-arguments
  32,
  // 158: unBData-memory-arguments
  24588,
  // 159: unConstrData-cpu-arguments
  32,
  // 160: unConstrData-memory-arguments
  20744,
  // 161: unIData-cpu-arguments
  32,
  // 162: unIData-memory-arguments
  25933,
  // 163: unListData-cpu-arguments
  32,
  // 164: unListData-memory-arguments
  24623,
  // 165: unMapData-cpu-arguments
  32,
  // 166: unMapData-memory-arguments
  43053543,
  // 167: verifyEcdsaSecp256k1Signature-cpu-arguments
  10,
  // 168: verifyEcdsaSecp256k1Signature-memory-arguments
  53384111,
  // 169: verifyEd25519Signature-cpu-arguments-intercept
  14333,
  // 170: verifyEd25519Signature-cpu-arguments-slope
  10,
  // 171: verifyEd25519Signature-memory-arguments
  43574283,
  // 172: verifySchnorrSecp256k1Signature-cpu-arguments-intercept
  26308,
  // 173: verifySchnorrSecp256k1Signature-cpu-arguments-slope
  10
  // 174: verifySchnorrSecp256k1Signature-memory-arguments
];

// node_modules/@helios-lang/uplc/src/costmodel/CostTracker.js
function makeCostTracker(model) {
  return new CostTrackerImpl(model);
}
var CostTrackerImpl = class {
  /**
   * @type {bigint}
   */
  cpu;
  /**
   * @type {bigint}
   */
  mem;
  /**
   * @readonly
   * @type {CostModel}
   */
  costModel;
  /**
   * @readonly
   * @type {CostBreakdown}
   */
  breakdown;
  /**
   * @param {CostModel} costModel
   */
  constructor(costModel) {
    this.costModel = costModel;
    this.cpu = 0n;
    this.mem = 0n;
    this.breakdown = {};
  }
  /**
   * @private
   * @param {string} key
   * @param {Cost} d
   */
  incrCost(key, d) {
    this.cpu += d.cpu;
    this.mem += d.mem;
    if (key in this.breakdown) {
      const entry = this.breakdown[key];
      entry.count += 1;
      entry.mem += d.mem;
      entry.cpu += d.cpu;
    } else {
      this.breakdown[key] = { mem: d.mem, cpu: d.cpu, count: 1 };
    }
  }
  incrBuiltinCost() {
    this.incrCost("builtinTerm", this.costModel.builtinTerm);
  }
  incrCallCost() {
    this.incrCost("callTerm", this.costModel.callTerm);
  }
  incrConstCost() {
    this.incrCost("constTerm", this.costModel.constTerm);
  }
  incrDelayCost() {
    this.incrCost("delayTerm", this.costModel.delayTerm);
  }
  incrForceCost() {
    this.incrCost("forceTerm", this.costModel.forceTerm);
  }
  incrLambdaCost() {
    this.incrCost("lambdaTerm", this.costModel.lambdaTerm);
  }
  incrStartupCost() {
    this.incrCost("startupTerm", this.costModel.startupTerm);
  }
  incrVarCost() {
    this.incrCost("varTerm", this.costModel.varTerm);
  }
  /**
   * @param {string} name
   * @param  {bigint[]} argSizes
   */
  incrArgSizesCost(name, argSizes) {
    this.incrCost(name, this.costModel.builtins[name](argSizes));
  }
};

// node_modules/@helios-lang/uplc/src/flat/bytes.js
function decodeFlatBytes(reader) {
  reader.moveToByteBoundary(true);
  let bytes = [];
  let nChunk = reader.readByte();
  while (nChunk > 0) {
    for (let i = 0; i < nChunk; i++) {
      bytes.push(reader.readByte());
    }
    nChunk = reader.readByte();
  }
  return bytes;
}
function encodeFlatBytes(writer, bytes, pad5 = true) {
  if (pad5) {
    writer.padToByteBoundary(true);
  }
  let n = bytes.length;
  let pos = 0;
  while (pos < n) {
    let nChunk = Math.min(n - pos, 255);
    writer.writeBits(padBits(nChunk.toString(2), 8));
    for (let i = pos; i < pos + nChunk; i++) {
      let b = bytes[i];
      writer.writeBits(padBits(b.toString(2), 8));
    }
    pos += nChunk;
  }
  if (pad5) {
    writer.writeBits("00000000");
  }
}
function bytesFlatSize(n) {
  return 4 + n * 8 + Math.ceil(n / 256) * 8 + 8;
}

// node_modules/@helios-lang/uplc/src/flat/int.js
function pow2(p) {
  return p <= 0n ? 1n : 2n << p - 1n;
}
function decodeIntLE7(bytes) {
  let value = BigInt(0);
  let n = bytes.length;
  for (let i = 0; i < n; i++) {
    let b = bytes[i];
    value = value + BigInt(b) * pow2(BigInt(i) * 7n);
  }
  return value;
}
function parseRawByte(b) {
  return b & 127;
}
function rawByteIsLast(b) {
  return (b & 128) == 0;
}
function decodeFlatInt(reader) {
  let bytes = [];
  let b = reader.readByte();
  bytes.push(b);
  while (!rawByteIsLast(b)) {
    b = reader.readByte();
    bytes.push(b);
  }
  return decodeIntLE7(bytes.map((b2) => parseRawByte(b2)));
}
function encodeFlatInt(bitWriter, x) {
  let bitString = padBits(x.toString(2), 7);
  let parts = [];
  for (let i = 0; i < bitString.length; i += 7) {
    parts.push(bitString.slice(i, i + 7));
  }
  parts.reverse();
  for (let i = 0; i < parts.length; i++) {
    if (i == parts.length - 1) {
      bitWriter.writeBits("0" + parts[i]);
    } else {
      bitWriter.writeBits("1" + parts[i]);
    }
  }
}

// node_modules/@helios-lang/uplc/src/flat/FlatReader.js
function makeFlatReader(args) {
  return new FlatReaderImpl(
    args.bytes,
    args.readExpr,
    args.dispatchValueReader
  );
}
var FlatReaderImpl = class {
  /**
   * @readonly
   * @type {() => UplcTerm}
   */
  readExpr;
  /**
   * @private
   * @readonly
   * @type {BitReader}
   */
  _bitReader;
  /**
   * @private
   * @readonly
   * @type {(r: FlatReader, typeList: number[]) => (() => UplcValue)}
   */
  _dispatchValueReader;
  /**
   * @param {number[] | Uint8Array} bytes
   * @param {(r: FlatReader) => UplcTerm} readExpr
   * @param {(r: FlatReader, typeList: number[]) => (() => UplcValue)} dispatchValueReader
   */
  constructor(bytes, readExpr, dispatchValueReader2) {
    this.readExpr = () => readExpr(this);
    this._bitReader = makeBitReader({ bytes });
    this._dispatchValueReader = dispatchValueReader2;
  }
  /**
   * @returns {boolean}
   */
  readBool() {
    return this._bitReader.readBits(1) == 1;
  }
  /**
   * @returns {number}
   */
  readBuiltinId() {
    return this._bitReader.readBits(7);
  }
  /**
   * @returns {number[]}
   */
  readBytes() {
    return decodeFlatBytes(this._bitReader);
  }
  /**
   * @returns {bigint}
   */
  readInt() {
    return decodeFlatInt(this._bitReader);
  }
  /**
   * @returns {number}
   */
  readTag() {
    return this._bitReader.readBits(4);
  }
  /**
   * Reads a Plutus-core list with a specified size per element
   * Calls itself recursively until the end of the list is reached
   * @param {number} elemSize
   * @returns {number[]}
   */
  readLinkedList(elemSize) {
    let nilOrCons = this._bitReader.readBits(1);
    if (nilOrCons == 0) {
      return [];
    } else {
      return [this._bitReader.readBits(elemSize)].concat(
        this.readLinkedList(elemSize)
      );
    }
  }
  /**
   * @returns {UplcValue}
   */
  readValue() {
    let typeList = this.readLinkedList(4);
    const valueReader = this._dispatchValueReader(this, typeList);
    if (typeList.length != 0) {
      throw new Error("did not consume all type parameters");
    }
    return valueReader();
  }
};

// node_modules/@helios-lang/uplc/src/flat/FlatWriter.js
function makeFlatWriter(_args = {}) {
  return new FlatWriterImpl();
}
var FlatWriterImpl = class {
  /**
   * @private
   * @readonly
   * @type {BitWriter}
   */
  _bitWriter;
  constructor() {
    this._bitWriter = makeBitWriter();
  }
  /**
   * @param {boolean} b
   */
  writeBool(b) {
    if (b) {
      this._bitWriter.writeBits("1");
    } else {
      this._bitWriter.writeBits("0");
    }
  }
  /**
   * @param {number[]} bytes
   */
  writeBytes(bytes) {
    encodeFlatBytes(this._bitWriter, bytes);
  }
  /**
   * @param {bigint} x
   */
  writeInt(x) {
    encodeFlatInt(this._bitWriter, x);
  }
  /**
   * @param {{toFlat: (w: FlatWriter) => void}[]} items
   */
  writeList(items) {
    items.forEach((item) => {
      this._bitWriter.writeBits("1");
      item.toFlat(this);
    });
    this._bitWriter.writeBits("0");
  }
  /**
   * @param {number} tag
   */
  writeTermTag(tag) {
    this._bitWriter.writeBits(padBits(tag.toString(2), 4));
  }
  /**
   * @param {string} typeBits
   */
  writeTypeBits(typeBits) {
    this._bitWriter.writeBits("1" + typeBits + "0");
  }
  /**
   * @param {number} id
   */
  writeBuiltinId(id) {
    this._bitWriter.writeBits(padBits(id.toString(2), 7));
  }
  /**
   * @returns {number[]}
   */
  finalize() {
    return this._bitWriter.finalize();
  }
};

// node_modules/@helios-lang/uplc/src/values/UplcType.js
var INT = "0000";
var BYTE_ARRAY = "0001";
var STRING = "0010";
var UNIT = "0011";
var BOOL = "0100";
var LIST = "0101";
var PAIR = "0110";
var CONTAINER = "0111";
var DATA = "1000";
var BLS12_381_G1_ELEMENT = "1001";
var BLS12_381_G2_ELEMENT = "1010";
var BLS12_381_ML_RESULT = "1011";
function makeUplcType(args) {
  if ("typeBits" in args) {
    return new UplcTypeImpl(args.typeBits);
  } else {
    return new UplcTypeImpl(
      args.numbers.map((x) => byteToBits(x, 4, false)).join("1")
    );
  }
}
function makeListType(args) {
  return new UplcTypeImpl([CONTAINER, LIST, args.item.typeBits].join("1"));
}
function makePairType(args) {
  return new UplcTypeImpl(
    [
      CONTAINER,
      CONTAINER,
      PAIR,
      args.first.typeBits,
      args.second.typeBits
    ].join("1")
  );
}
var UplcTypeImpl = class {
  /**
   * @private
   * @readonly
   * @type {string}
   */
  _typeBits;
  /**
   * @param {string} typeBits
   */
  constructor(typeBits) {
    this._typeBits = typeBits;
  }
  /**
   * @type {string}
   */
  get typeBits() {
    return this._typeBits;
  }
  /**
   * @returns {boolean}
   */
  isData() {
    return this._typeBits == DATA;
  }
  /**
   * @returns {boolean}
   */
  isDataPair() {
    return this._typeBits == DATA_PAIR_TYPE.typeBits;
  }
  /**
   * @param {UplcType} value
   * @returns {boolean}
   */
  isEqual(value) {
    return this._typeBits == value.typeBits;
  }
  /**
   * @returns {string}
   */
  toString() {
    let typeBits = this._typeBits;
    const stack = [];
    function popBits() {
      const b = typeBits.slice(0, 4);
      typeBits = typeBits.slice(5);
      return b;
    }
    while (typeBits.length > 0) {
      let b = popBits();
      switch (b) {
        case INT:
          stack.push("integer");
          break;
        case BYTE_ARRAY:
          stack.push("bytestring");
          break;
        case STRING:
          stack.push("string");
          break;
        case UNIT:
          stack.push("unit");
          break;
        case BOOL:
          stack.push("bool");
          break;
        case DATA:
          stack.push("data");
          break;
        case BLS12_381_G1_ELEMENT:
          stack.push("bls12_381_G1_element");
          break;
        case BLS12_381_G2_ELEMENT:
          stack.push("bls12_381_G2_element");
          break;
        case BLS12_381_ML_RESULT:
          stack.push("bls12_381_mlresult");
          break;
        case CONTAINER: {
          b = popBits();
          switch (b) {
            case CONTAINER: {
              b = popBits();
              if (b != PAIR) {
                throw new Error("invalid UplcType");
              } else {
                stack.push("pair");
              }
              break;
            }
            case LIST:
              stack.push("list");
              break;
            default:
              throw new Error(
                `invalid UplcType ${this._typeBits}`
              );
          }
          break;
        }
        default:
          throw new Error("invalid UplcType");
      }
    }
    function stackToString(stack2) {
      const head = stack2[0];
      const tail = stack2.slice(1);
      switch (head) {
        case "integer":
        case "bytestring":
        case "string":
        case "unit":
        case "bool":
        case "data":
        case "bls12_381_G1_element":
        case "bls12_381_G2_element":
        case "bls12_381_mlresult":
          return [head, tail];
        case "list": {
          const [item, rest2] = stackToString(tail);
          return [`(list ${item})`, rest2];
        }
        case "pair": {
          const [first, rest1] = stackToString(tail);
          const [second, rest2] = stackToString(rest1);
          return [`(pair ${first} ${second})`, rest2];
        }
        default:
          throw new Error(`unhandled UplcType ${head}`);
      }
    }
    const [result, rest] = stackToString(stack);
    if (rest.length != 0) {
      throw new Error("invalid UplcType");
    }
    return result;
  }
};
var INT_TYPE = makeUplcType({ typeBits: INT });
var BYTE_ARRAY_TYPE = makeUplcType({ typeBits: BYTE_ARRAY });
var STRING_TYPE = makeUplcType({ typeBits: STRING });
var UNIT_TYPE = makeUplcType({ typeBits: UNIT });
var BOOL_TYPE = makeUplcType({ typeBits: BOOL });
var DATA_TYPE = makeUplcType({ typeBits: DATA });
var DATA_PAIR_TYPE = makePairType({
  first: DATA_TYPE,
  second: DATA_TYPE
});
var BLS12_381_G1_ELEMENT_TYPE = makeUplcType({
  typeBits: BLS12_381_G1_ELEMENT
});
var BLS12_381_G2_ELEMENT_TYPE = makeUplcType({
  typeBits: BLS12_381_G2_ELEMENT
});
var BLS12_381_ML_RESULT_TYPE = makeUplcType({
  typeBits: BLS12_381_ML_RESULT
});

// node_modules/@helios-lang/uplc/src/values/Bls12_381_G1_element.js
function makeBls12_381_G1_element(args) {
  if ("z" in args) {
    return new Bls12_381_G1_elementImpl(args);
  } else {
    const p = projectedCurve1.fromAffine(decodeG1Point(prepadBytes(args.bytes, 48)));
    return new Bls12_381_G1_elementImpl(p);
  }
}
var Bls12_381_G1_elementImpl = class {
  /**
   * @readonly
   * @type {Point3<bigint>}
   */
  point;
  /**
   * @param {Point3<bigint>} point
   */
  constructor(point) {
    this.point = point;
  }
  /**
   * @type {"bls12_381_G1_element"}
   */
  get kind() {
    return "bls12_381_G1_element";
  }
  /**
   * Though a G1_element can't be serialized, but the parent Const term can be converted to an Apply[Builtin(G1_uncompress), ByteString(48-bytes)]
   * Note: the parent Const term already returns 4
   * @type {number}
   */
  get flatSize() {
    return 4 + 7 + bytesFlatSize(48);
  }
  /**
   * 48 bytes per coordinate, so 144 bytes uncompressed, so 18 words (144/8)
   * @type {number}
   */
  get memSize() {
    return 18;
  }
  /**
   * @type {UplcType}
   */
  get type() {
    return BLS12_381_G1_ELEMENT_TYPE;
  }
  /**
   * @returns {number[]} - 48 bytes long
   */
  compress() {
    return encodeG1Point(projectedCurve1.toAffine(this.point));
  }
  /**
   * @param {UplcValue} other
   * @returns {boolean}
   */
  isEqual(other) {
    return other.kind == "bls12_381_G1_element" && projectedCurve1.equals(this.point, other.point);
  }
  /**
   * @param {FlatWriter} _writer
   */
  toFlat(_writer) {
    throw new Error("can't be serialized");
  }
  /**
   * Returns compressed form ByteString
   * @returns {string}
   */
  toString() {
    return `Bls12_381_G1_element(${this.point.x}, ${this.point.y}, ${this.point.z})`;
  }
};

// node_modules/@helios-lang/uplc/src/values/Bls12_381_G2_element.js
function makeBls12_381_G2_element(args) {
  if ("z" in args) {
    return new Bls12_381_G2_elementImpl(args);
  } else {
    const p = projectedCurve2.fromAffine(decodeG2Point(prepadBytes(args.bytes, 96)));
    return new Bls12_381_G2_elementImpl(p);
  }
}
var Bls12_381_G2_elementImpl = class {
  /**
   * @readonly
   * @type {Point3<[bigint, bigint]>}
   */
  point;
  /**
   * @param {Point3<[bigint, bigint]>} point
   */
  constructor(point) {
    this.point = point;
  }
  /**
   * @type {"bls12_381_G2_element"}
   */
  get kind() {
    return "bls12_381_G2_element";
  }
  /**
   * Though a G2_element can't be serialized, but the parent Const term can be converted to an Apply[Builtin(G2_uncompress), ByteString(96-bytes)]
   * Note: the parent Const term already returns 4
   * @type {number}
   */
  get flatSize() {
    return 4 + 7 + bytesFlatSize(96);
  }
  /**
   * Double that of G1_element, 96 bytes per coordinate, 288 for uncompressed Point3, 36 words
   * @type {number}
   */
  get memSize() {
    return 36;
  }
  /**
   * @type {UplcType}
   */
  get type() {
    return BLS12_381_G2_ELEMENT_TYPE;
  }
  /**
   * @returns {number[]} - 96 bytes long
   */
  compress() {
    return encodeG2Point(projectedCurve2.toAffine(this.point));
  }
  /**
   * @param {UplcValue} other
   * @returns {boolean}
   */
  isEqual(other) {
    return other.kind == "bls12_381_G2_element" && projectedCurve2.equals(this.point, other.point);
  }
  /**
   * Throws an error, serialization can only be done using data and the uncompress function
   * @param {FlatWriter} _writer
   */
  toFlat(_writer) {
    throw new Error("can't be serialized");
  }
  /**
   * @returns {string}
   */
  toString() {
    return `Bls12_381_G2_element(${this.point.x}, ${this.point.y}, ${this.point.z})`;
  }
};

// node_modules/@helios-lang/uplc/src/values/Bls12_381_MlResult.js
function makeBls12_381_MlResult(args) {
  return new Bls12_381_MlResultImpl(args);
}
var Bls12_381_MlResultImpl = class {
  /**
   * @readonly
   * @type {FieldElement12}
   */
  element;
  /**
   * @param {FieldElement12} element
   */
  constructor(element) {
    this.element = element;
  }
  /**
   * @type {"bls12_381_mlresult"}
   */
  get kind() {
    return "bls12_381_mlresult";
  }
  /**
   * Not serializable under any circumstance, so simply return 0 for now
   * @type {number}
   */
  get flatSize() {
    return 0;
  }
  /**
   * 12*48bytes, or 576 bytes, or 72 words (576/8)
   * @type {number}
   */
  get memSize() {
    return 72;
  }
  /**
   * @type {UplcType}
   */
  get type() {
    return BLS12_381_ML_RESULT_TYPE;
  }
  /**
   * @param {UplcValue} other
   * @returns {boolean}
   */
  isEqual(other) {
    return other.kind == "bls12_381_mlresult" && F12.equals(this.element, other.element);
  }
  /**
   * @param {FlatWriter} _writer
   */
  toFlat(_writer) {
    throw new Error("Bls12_381_MlResult can't be serialized");
  }
  /**
   * @returns {string}
   */
  toString() {
    return `Bls12_381_MlResult`;
  }
};

// node_modules/@helios-lang/uplc/src/data/UplcData.js
var UPLC_DATA_NODE_MEM_SIZE = 4;

// node_modules/@helios-lang/uplc/src/data/ByteArrayData.js
function makeByteArrayData(args) {
  return new ByteArrayDataImpl(args);
}
function calcByteArrayMemSize(bytes) {
  const n = bytes.length;
  if (n === 0) {
    return 1;
  } else {
    return Math.floor((n - 1) / 8) + 1;
  }
}
function compareByteArrayData(a, b, lengthFirst = false) {
  return compareBytes(a, b, lengthFirst);
}
function decodeByteArrayData(bytes) {
  return makeByteArrayData({ bytes: decodeBytes(bytes) });
}
var ByteArrayDataImpl = class {
  /**
   * @readonly
   * @type {number[]}
   */
  bytes;
  /**
   * @param {BytesLike} bytes
   */
  constructor(bytes) {
    this.bytes = toBytes(bytes);
  }
  /**
   * @type {"bytes"}
   */
  get kind() {
    return "bytes";
  }
  /**
   * @type {number}
   */
  get memSize() {
    return UPLC_DATA_NODE_MEM_SIZE + calcByteArrayMemSize(this.bytes);
  }
  /**
   * @param {UplcData} other
   * @returns {boolean}
   */
  isEqual(other) {
    if (other.kind == "bytes") {
      return compareByteArrayData(this.bytes, other.bytes) == 0;
    } else {
      return false;
    }
  }
  /**
   * @returns {number[]}
   */
  toCbor() {
    return encodeBytes(this.bytes, true);
  }
  /**
   * @returns {string}
   */
  toHex() {
    return bytesToHex(this.bytes);
  }
  /**
   * @returns {string}
   */
  toSchemaJson() {
    return `{"bytes": "${this.toHex()}"}`;
  }
  /**
   * @returns {string}
   */
  toString() {
    return `#${this.toHex()}`;
  }
};

// node_modules/@helios-lang/uplc/src/data/ConstrData.js
function makeConstrData(...args) {
  if (args.length == 1) {
    return new ConstrDataImpl(args[0].tag, args[0].fields);
  } else if (args.length == 2) {
    return new ConstrDataImpl(args[0], args[1]);
  } else {
    throw new Error("invalid number of arguments for makeConstrData()");
  }
}
function decodeConstrData(bytes, itemDecoder) {
  const [tag, fields] = decodeConstr(bytes, itemDecoder);
  return makeConstrData(tag, fields);
}
var ConstrDataImpl = class {
  /**
   * @readonly
   * @type {number}
   */
  tag;
  /**
   * @readonly
   * @type {UplcData[]}
   */
  fields;
  /**
   * @param {IntLike} tag
   * @param {UplcData[]} fields
   */
  constructor(tag, fields) {
    this.tag = toInt(tag);
    this.fields = fields;
  }
  /**
   * @type {"constr"}
   */
  get kind() {
    return "constr";
  }
  /**
   * @type {number}
   */
  get memSize() {
    let sum = UPLC_DATA_NODE_MEM_SIZE;
    for (let field of this.fields) {
      sum += field.memSize;
    }
    return sum;
  }
  /**
   * Number of fields in the constr
   * @type {number}
   */
  get length() {
    return this.fields.length;
  }
  /**
   * @param {UplcData} other
   * @returns {boolean}
   */
  isEqual(other) {
    if (other.kind == "constr") {
      if (this.tag == other.tag && this.length == other.length) {
        return this.fields.every((f, i) => f.isEqual(other.fields[i]));
      } else {
        return false;
      }
    } else {
      return false;
    }
  }
  /**
   * @param {number} n
   * @returns {ConstrData}
   */
  expectFields(n, msg = `expected ${n} ConstrData fields, got ${this.length} fields`) {
    if (n != this.length) {
      throw new Error(msg);
    } else {
      return this;
    }
  }
  /**
   * @param {number} tag
   * @param {string} msg
   * @returns {ConstrData}
   */
  expectTag(tag, msg = `expected ConstrData tag ${tag}, got ${this.tag}`) {
    if (this.tag != tag) {
      throw new Error(msg);
    } else {
      return this;
    }
  }
  /**
   * @returns {number[]}
   */
  toCbor() {
    return encodeConstr(this.tag, this.fields);
  }
  /**
   * @returns {string}
   */
  toSchemaJson() {
    return `{"constructor": ${this.tag.toString()}, "fields": [${this.fields.map((f) => f.toSchemaJson()).join(", ")}]}`;
  }
  /**
   * @returns {string}
   */
  toString() {
    let parts = this.fields.map((field) => field.toString());
    return `${this.tag.toString()}{${parts.join(", ")}}`;
  }
};

// node_modules/@helios-lang/uplc/src/data/IntData.js
function makeIntData(value) {
  if (typeof value == "number") {
    if (value % 1 != 0) {
      throw new Error("not a whole number");
    }
    return new IntDataImpl(BigInt(value));
  } else if (typeof value == "bigint") {
    return new IntDataImpl(value);
  } else {
    throw new Error("not a valid integer");
  }
}
function decodeIntData(bytes) {
  return new IntDataImpl(decodeInt(bytes));
}
function calcIntMemSize(value) {
  if (value == 0n) {
    return 1;
  } else {
    const abs = value > 0n ? value : -value;
    return Math.floor(Math.floor(Math.log2(Number(abs))) / 64) + 1;
  }
}
var IntDataImpl = class {
  /**
   * Arbitrary precision
   * @readonly
   * @type {bigint}
   */
  value;
  /**
   * @param {bigint} value
   */
  constructor(value) {
    this.value = value;
  }
  /**
   * @type {"int"}
   */
  get kind() {
    return "int";
  }
  /**
   * @type {number}
   */
  get memSize() {
    return UPLC_DATA_NODE_MEM_SIZE + calcIntMemSize(this.value);
  }
  /**
   * @param {UplcData} other
   * @returns {boolean}
   */
  isEqual(other) {
    return other.kind == "int" && other.value == this.value;
  }
  /**
   * @returns {number[]}
   */
  toCbor() {
    return encodeInt(this.value);
  }
  /**
   * Returns string, not js object, because of unbounded integers
   * @returns {string}
   */
  toSchemaJson() {
    return `{"int": ${this.value.toString()}}`;
  }
  /**
   * @returns {string}
   */
  toString() {
    return this.value.toString();
  }
};

// node_modules/@helios-lang/uplc/src/data/ListData.js
function makeListData(args) {
  return new ListDataImpl(args);
}
function decodeListData(bytes, itemDecoder) {
  const items = decodeList(bytes, itemDecoder);
  return new ListDataImpl(items);
}
var ListDataImpl = class {
  /**
   * @readonly
   * @type {UplcData[]}
   */
  items;
  /**
   * @param {UplcData[]} items
   */
  constructor(items) {
    this.items = items;
  }
  /**
   * @type {"list"}
   */
  get kind() {
    return "list";
  }
  /**
   * @type {number}
   */
  get length() {
    return this.items.length;
  }
  /**
   * Copies the array of items
   * @type {UplcData[]}
   */
  get list() {
    return this.items.slice();
  }
  /**
   * @type {number}
   */
  get memSize() {
    let sum = UPLC_DATA_NODE_MEM_SIZE;
    for (let item of this.items) {
      sum += item.memSize;
    }
    return sum;
  }
  /**
   * @param {UplcData} other
   * @returns {boolean}
   */
  isEqual(other) {
    if (other.kind == "list") {
      if (this.length == other.length) {
        return this.items.every(
          (item, i) => item.isEqual(other.items[i])
        );
      } else {
        return false;
      }
    } else {
      return false;
    }
  }
  /**
   * @returns {number[]}
   */
  toCbor() {
    return encodeList(this.items);
  }
  /**
   * @returns {string}
   */
  toSchemaJson() {
    return `{"list":[${this.items.map((item) => item.toSchemaJson()).join(", ")}]}`;
  }
  /**
   * @returns {string}
   */
  toString() {
    return `[${this.items.map((item) => item.toString()).join(", ")}]`;
  }
};

// node_modules/@helios-lang/uplc/src/data/MapData.js
function makeMapData(items) {
  return new MapDataImpl(items);
}
function decodeMapData(bytes, itemDecoder) {
  const items = decodeMap(bytes, itemDecoder, itemDecoder);
  return new MapDataImpl(items);
}
var MapDataImpl = class {
  /**
   * @readonly
   * @type {[UplcData, UplcData][]}
   */
  items;
  /**
   * @param {[UplcData, UplcData][]} items
   */
  constructor(items) {
    this.items = items;
  }
  /**
   * @type {"map"}
   */
  get kind() {
    return "map";
  }
  /**
   * Copies the internal list of items
   * @type {[UplcData, UplcData][]}
   */
  get list() {
    return this.items.slice();
  }
  /**
   * @type {number}
   */
  get length() {
    return this.items.length;
  }
  /**
   * @type {number}
   */
  get memSize() {
    let sum = UPLC_DATA_NODE_MEM_SIZE;
    for (let [k, v] of this.items) {
      sum += k.memSize + v.memSize;
    }
    return sum;
  }
  /**
   * @param {UplcData} other
   * @returns {boolean}
   */
  isEqual(other) {
    if (other.kind == "map") {
      if (this.length == other.length) {
        return this.items.every(([key, value], i) => {
          const [otherKey, otherValue] = other.items[i];
          return key.isEqual(otherKey) && value.isEqual(otherValue);
        });
      } else {
        return false;
      }
    } else {
      return false;
    }
  }
  /**
   * @returns {number[]}
   */
  toCbor() {
    return encodeMap(this.items);
  }
  /**
   * @returns {string}
   */
  toSchemaJson() {
    return `{"map": [${this.items.map((pair) => {
      return '{"k": ' + pair[0].toSchemaJson() + ', "v": ' + pair[1].toSchemaJson() + "}";
    }).join(", ")}]}`;
  }
  /**
   * @returns {string}
   */
  toString() {
    return `{${this.items.map(([fst, snd]) => `${fst.toString()}: ${snd.toString()}`).join(", ")}}`;
  }
};

// node_modules/@helios-lang/uplc/src/data/bool.js
function boolToUplcData(b) {
  return makeConstrData(b ? 1 : 0, []);
}

// node_modules/@helios-lang/uplc/src/data/decode.js
function decodeUplcData(bytes) {
  const stream = makeByteStream({ bytes });
  if (isList(stream)) {
    return decodeListData(stream, decodeUplcData);
  } else if (isIndefBytes(stream)) {
    return decodeByteArrayData(stream);
  } else {
    if (isDefBytes(stream)) {
      return decodeByteArrayData(stream);
    } else if (isMap(stream)) {
      return decodeMapData(stream, decodeUplcData);
    } else if (isConstr(stream)) {
      return decodeConstrData(stream, decodeUplcData);
    } else {
      return decodeIntData(stream);
    }
  }
}

// node_modules/@helios-lang/uplc/src/data/option.js
function wrapUplcDataOption(data) {
  if (data) {
    return makeConstrData(0, [data]);
  } else {
    return makeConstrData(1, []);
  }
}

// node_modules/@helios-lang/compiler-utils/src/tokens/TokenSite.js
var DUMMY_FILE_NAME = "::internal";
function makeTokenSite(props) {
  return new TokenSite(props);
}
var TokenSite = class _TokenSite {
  /**
   * @readonly
   * @type {string}
   */
  file;
  /**
   * first char of Token, 0-based index
   * @readonly
   * @type {number}
   */
  startLine;
  /**
   * first char of Token, 0-based index
   * @readonly
   * @type {number}
   */
  startColumn;
  /**
   * first char after Token (aka exclusive), 0-based index
   * defaults to startLine
   * @readonly
   * @type {number}
   */
  endLine;
  /**
   * first char after Token (aka exclusive), 0-based index
   * defaults to startColumn+1
   * @readonly
   * @type {number}
   */
  endColumn;
  /**
   * Used for content that has a distinct name in the original Helios source
   * @readonly
   * @type {string | undefined}
   */
  alias;
  /**
   * @param {TokenSiteProps} props
   */
  constructor({
    file,
    startLine,
    startColumn,
    endLine = startLine,
    endColumn = startColumn + 1,
    alias = void 0
  }) {
    this.file = file;
    this.startLine = startLine;
    this.startColumn = startColumn;
    this.endLine = endLine;
    this.endColumn = endColumn;
    this.alias = alias;
  }
  /**
   * @type {number}
   */
  get line() {
    return this.startLine;
  }
  /**
   * @type {number}
   */
  get column() {
    return this.startColumn;
  }
  /**
   * @type {Pos}
   */
  get end() {
    return {
      line: this.endLine,
      column: this.endColumn
    };
  }
  /**
   * Returns a 1-based representation of the Site
   * @returns {string}
   */
  toString() {
    return `${this.file}:${this.startLine + 1}:${this.startColumn + 1}`;
  }
  /**
   * @param {string} alias
   * @returns {TokenSite}
   */
  withAlias(alias) {
    return new _TokenSite({
      file: this.file,
      startLine: this.startLine,
      startColumn: this.startColumn,
      endLine: this.endLine,
      endColumn: this.endColumn,
      alias
    });
  }
};
function isDummySite(site) {
  return site.file == DUMMY_FILE_NAME && site.line == 0 && site.column == 0;
}
function makeDummySite() {
  return new TokenSite({
    file: DUMMY_FILE_NAME,
    startLine: 0,
    startColumn: 0
  });
}

// node_modules/@helios-lang/compiler-utils/src/tokens/RealLiteral.js
var REAL_PRECISION = 6;
var REAL_FACTOR = 10n ** BigInt(REAL_PRECISION);

// node_modules/@helios-lang/uplc/src/values/UplcBool.js
function makeUplcBool(args) {
  return new UplcBoolImpl(args);
}
function decodeUplcBoolFromFlat(r) {
  return new UplcBoolImpl(r.readBool());
}
var UplcBoolImpl = class {
  /**
   * @readonly
   * @type {boolean}
   */
  value;
  /**
   * @param {boolean} value
   */
  constructor(value) {
    this.value = value;
  }
  /**
   * @type {"bool"}
   */
  get kind() {
    return "bool";
  }
  /**
   * @type {number}
   */
  get memSize() {
    return 1;
  }
  /**
   * 4 for type, 1 for value
   * @type {number}
   */
  get flatSize() {
    return 5;
  }
  /**
   * @returns {UplcType}
   */
  get type() {
    return BOOL_TYPE;
  }
  /**
   * @type {boolean}
   */
  get bool() {
    return this.value;
  }
  /**
   * @param {UplcValue} other
   * @returns {boolean}
   */
  isEqual(other) {
    return other.kind == "bool" && other.value == this.value;
  }
  /**
   * @param {FlatWriter} w
   */
  toFlat(w) {
    w.writeBool(this.value);
  }
  /**
   * @returns {string}
   */
  toString() {
    return this.value ? "true" : "false";
  }
  /**
   * @returns {ConstrData}
   */
  toUplcData() {
    return makeConstrData(this.value ? 1 : 0, []);
  }
};

// node_modules/@helios-lang/uplc/src/values/UplcByteArray.js
function makeUplcByteArray(args) {
  return new UplcByteArrayImpl(args);
}
function decodeUplcByteArrayFromFlat(reader) {
  return new UplcByteArrayImpl(reader.readBytes());
}
var UplcByteArrayImpl = class {
  /**
   * @readonly
   * @type {number[]}
   */
  bytes;
  /**
   * @param {BytesLike} bytes
   */
  constructor(bytes) {
    this.bytes = toBytes(bytes);
  }
  /**
   * @type {"bytes"}
   */
  get kind() {
    return "bytes";
  }
  /**
   * @type {number}
   */
  get memSize() {
    return calcByteArrayMemSize(this.bytes);
  }
  /**
   * 4 for header, 8 bits per byte, 8 bits per chunk of 256 bytes, 8 bits final padding
   * @type {number}
   */
  get flatSize() {
    return bytesFlatSize(this.bytes.length);
  }
  /**
   * @returns {UplcType}
   */
  get type() {
    return BYTE_ARRAY_TYPE;
  }
  /**
   * @param {UplcValue} other
   * @returns {boolean}
   */
  isEqual(other) {
    return other.kind == "bytes" && equalsBytes(this.bytes, other.bytes);
  }
  /**
   * @param {FlatWriter} w
   */
  toFlat(w) {
    w.writeBytes(this.bytes);
  }
  /**
   * Returns hex representation of byte array
   * @returns {string}
   */
  toString() {
    return `#${bytesToHex(this.bytes)}`;
  }
};

// node_modules/@helios-lang/uplc/src/values/UplcDataValue.js
function makeUplcDataValue(args) {
  return new UplcDataValueImpl(args);
}
function decodeUplcDataValueFromFlat(r) {
  const bytes = r.readBytes();
  const data = decodeUplcData(bytes);
  return new UplcDataValueImpl(data);
}
var UplcDataValueImpl = class {
  /**
   * @readonly
   * @type {UplcData}
   */
  value;
  /**
   * @param {UplcData} data
   */
  constructor(data) {
    this.value = data;
  }
  /**
   * @type {"data"}
   */
  get kind() {
    return "data";
  }
  /**
   * @type {number}
   */
  get memSize() {
    return this.value.memSize;
  }
  /**
   * Same number of header bits as UplcByteArray
   * @type {number}
   */
  get flatSize() {
    const bytes = this.value.toCbor();
    return bytesFlatSize(bytes.length);
  }
  /**
   * @returns {UplcType}
   */
  get type() {
    return DATA_TYPE;
  }
  /**
   * @param {UplcValue} other
   * @returns {boolean}
   */
  isEqual(other) {
    return other.kind == "data" && other.value.isEqual(this.value);
  }
  /**
   * @param {FlatWriter} w
   */
  toFlat(w) {
    w.writeBytes(this.value.toCbor());
  }
  /**
   * @returns {string}
   */
  toString() {
    function dataToString(data) {
      switch (data.kind) {
        case "bytes":
          return `B ${data.toString()}`;
        case "int":
          return `I ${data.toString()}`;
        case "constr":
          return `Constr ${data.tag} [${data.fields.map((field) => dataToString(field)).join(", ")}]`;
        case "list":
          return `List [${data.items.map((item) => dataToString(item)).join(", ")}]`;
        case "map":
          return `Map[${data.items.map(
            ([first, second]) => `(${dataToString(first)}, ${dataToString(
              second
            )})`
          ).join(", ")}]`;
        default:
          throw new Error("unhandled UplcData type");
      }
    }
    return `(${dataToString(this.value)})`;
  }
};

// node_modules/@helios-lang/uplc/src/values/UplcInt.js
function makeUplcInt(args) {
  if (typeof args == "number" || typeof args == "bigint") {
    return new UplcIntImpl(args);
  } else {
    return new UplcIntImpl(args.value, args.signed ?? true);
  }
}
function decodeUplcIntFromFlat(r, signed = false) {
  const i = r.readInt();
  if (signed) {
    return new UplcIntImpl(decodeZigZag(i), true);
  } else {
    return new UplcIntImpl(i, false);
  }
}
var UplcIntImpl = class _UplcIntImpl {
  /**
   * Arbitrary precision integer
   * @readonly
   * @type {bigint}
   */
  value;
  /**
   * @readonly
   * @type {boolean}
   */
  signed;
  /**
   * @param {IntLike} value
   * @param {boolean} signed - unsigned is only for internal use
   */
  constructor(value, signed = true) {
    if (typeof value == "number") {
      if (value % 1 != 0) {
        throw new Error("not a whole number");
      }
      this.value = BigInt(value);
    } else if (typeof value == "bigint") {
      this.value = value;
    } else {
      throw new Error(`expected an integer, ${typeof value}`);
    }
    this.signed = signed;
  }
  /**
   * @type {"int"}
   */
  get kind() {
    return "int";
  }
  /**
   * @type {number}
   */
  get memSize() {
    return calcIntMemSize(this.value);
  }
  /**
   * 4 for type + 7 for simple int, or 4 + (7 + 1)*ceil(n/7) for large int
   * @type {number}
   */
  get flatSize() {
    const n = this.toUnsigned().value.toString(2).length;
    return 4 + (n <= 7 ? 7 : Math.ceil(n / 7) * 8);
  }
  /**
   * @returns {UplcType}
   */
  get type() {
    return INT_TYPE;
  }
  /**
   * @param {UplcValue} other
   * @returns {boolean}
   */
  isEqual(other) {
    return other.kind == "int" && this.value == other.value;
  }
  /**
   * @param {FlatWriter} w
   */
  toFlat(w) {
    if (!this.signed) {
      throw new Error("not signed");
    }
    w.writeInt(this.toUnsigned().value);
  }
  /**
   * Encodes unsigned integer with plutus flat encoding.
   * Throws error if signed.
   * Used by encoding plutus core program version and debruijn indices.
   * @param {FlatWriter} w
   */
  toFlatUnsigned(w) {
    if (this.signed) {
      throw new Error("not unsigned");
    }
    w.writeInt(this.toUnsigned().value);
  }
  /**
   * @returns {string}
   */
  toString() {
    return this.value.toString();
  }
  /**
   * Unapplies zigzag encoding
   * @returns {UplcInt}
   */
  toSigned() {
    if (this.signed) {
      return this;
    } else {
      return new _UplcIntImpl(decodeZigZag(this.value), true);
    }
  }
  /**
   * Applies zigzag encoding
   * @returns {UplcInt}
   */
  toUnsigned() {
    if (this.signed) {
      return new _UplcIntImpl(encodeZigZag(this.value), false);
    } else {
      return this;
    }
  }
};

// node_modules/@helios-lang/uplc/src/values/UplcList.js
function makeUplcList(args) {
  return new UplcListImpl(args.itemType, args.items);
}
function decodeUplcListFromFlat(r, itemType, itemReader) {
  const items = [];
  while (r.readBool()) {
    items.push(itemReader());
  }
  return new UplcListImpl(itemType, items);
}
var UplcListImpl = class {
  /**
   * @readonly
   * @type {UplcType}
   */
  itemType;
  /**
   * @readonly
   * @type {UplcValue[]}
   */
  items;
  /**
   * @param {UplcType} itemType
   * @param {UplcValue[]} items
   */
  constructor(itemType, items) {
    this.itemType = itemType;
    this.items = items;
  }
  /**
   * @type {"list"}
   */
  get kind() {
    return "list";
  }
  /**
   * @type {number}
   */
  get length() {
    return this.items.length;
  }
  /**
   * @type {number}
   */
  get memSize() {
    let sum = 0;
    for (let item of this.items) {
      sum += item.memSize;
    }
    return sum;
  }
  /**
   * 10 + nItemType type bits, value bits of each item (must be corrected by itemType)
   * @type {number}
   */
  get flatSize() {
    const nItemType = this.itemType.typeBits.length;
    return 10 + nItemType + this.items.reduce(
      (prev, item) => item.flatSize - nItemType + prev,
      0
    );
  }
  /**
   * 7 (5) (type bits of content)
   * @returns {UplcType}
   */
  get type() {
    return makeListType({ item: this.itemType });
  }
  /**
   * @returns {boolean}
   */
  isDataList() {
    return this.itemType.isData();
  }
  /**
   * @returns {boolean}
   */
  isDataMap() {
    return this.itemType.isDataPair();
  }
  /**
   * @param {UplcValue} other
   * @returns {boolean}
   */
  isEqual(other) {
    return other.kind == "list" && this.items.length == other.items.length && this.items.every((item, i) => item.isEqual(other.items[i]));
  }
  /**
   * @param {FlatWriter} w
   */
  toFlat(w) {
    w.writeList(this.items);
  }
  /**
   * @returns {string}
   */
  toString() {
    return `[${this.items.map((item) => item.toString()).join(", ")}]`;
  }
};

// node_modules/@helios-lang/uplc/src/values/UplcPair.js
function makeUplcPair(args) {
  return new UplcPairImpl(args.first, args.second);
}
var UplcPairImpl = class {
  /**
   * @readonly
   * @type {UplcValue}
   */
  first;
  /**
   * @readonly
   * @type {UplcValue}
   */
  second;
  /**
   * @param {UplcValue} first
   * @param {UplcValue} second
   */
  constructor(first, second) {
    this.first = first;
    this.second = second;
  }
  /**
   * @type {"pair"}
   */
  get kind() {
    return "pair";
  }
  /**
   * @type {number}
   */
  get memSize() {
    return this.first.memSize + this.second.memSize;
  }
  /**
   * 16 additional type bits on top of first and second bits
   * @type {number}
   */
  get flatSize() {
    return 16 + this.first.flatSize + this.second.flatSize;
  }
  /**
   * 7 (7 (6) (fst)) (snd)
   * @returns {UplcType}
   */
  get type() {
    return makePairType({
      first: this.first.type,
      second: this.second.type
    });
  }
  /**
   * @param {UplcValue} other
   * @returns {boolean}
   */
  isEqual(other) {
    return other.kind == "pair" && other.first.isEqual(this.first) && other.second.isEqual(this.second);
  }
  /**
   * @param {FlatWriter} w
   */
  toFlat(w) {
    this.first.toFlat(w);
    this.second.toFlat(w);
  }
  /**
   * @returns {string}
   */
  toString() {
    return `(${this.first.toString()}, ${this.second.toString()})`;
  }
};

// node_modules/@helios-lang/uplc/src/values/UplcString.js
function makeUplcString(args) {
  return new UplcStringImpl(args);
}
function decodeUplcStringFromFlat(r) {
  const bytes = r.readBytes();
  const s = decodeUtf8(bytes);
  return new UplcStringImpl(s);
}
var UplcStringImpl = class {
  /**
   * @readonly
   * @type {string}
   */
  value;
  /**
   * @param {string} value
   */
  constructor(value) {
    this.value = value;
  }
  /**
   * @type {"string"}
   */
  get kind() {
    return "string";
  }
  /**
   * @type {number}
   */
  get memSize() {
    return this.value.length;
  }
  /**
   * @type {number}
   */
  get flatSize() {
    const bytes = encodeUtf8(this.value);
    return bytesFlatSize(bytes.length);
  }
  /**
   * @type {string}
   */
  get string() {
    return this.value;
  }
  /**
   * @returns {UplcType}
   */
  get type() {
    return STRING_TYPE;
  }
  /**
   * @param {UplcValue} other
   * @returns {boolean}
   */
  isEqual(other) {
    return other.kind == "string" && other.value == this.value;
  }
  /**
   * @param {FlatWriter} w
   */
  toFlat(w) {
    const bytes = encodeUtf8(this.value);
    w.writeBytes(bytes);
  }
  /**
   * @returns {string}
   */
  toString() {
    return `"${this.value}"`;
  }
};

// node_modules/@helios-lang/uplc/src/values/UplcUnit.js
var UplcUnitImpl = class {
  constructor() {
  }
  /**
   * @type {"unit"}
   */
  get kind() {
    return "unit";
  }
  /**
   * @type {number}
   */
  get memSize() {
    return 1;
  }
  /**
   * @type {number}
   */
  get flatSize() {
    return 4;
  }
  /**
   * @returns {UplcType}
   */
  get type() {
    return UNIT_TYPE;
  }
  /**
   * @param {UplcValue} other
   * @returns {boolean}
   */
  isEqual(other) {
    return other.kind == "unit";
  }
  /**
   * @returns {string}
   */
  toString() {
    return "()";
  }
  /**
   * Doesn't add any bits (typeBits are written by the UplcConst term)
   * @param {FlatWriter} _writer
   */
  toFlat(_writer) {
  }
};
var UNIT_VALUE = new UplcUnitImpl();

// node_modules/@helios-lang/uplc/src/values/reader.js
function dispatchValueReader(r, typeList) {
  const type = typeList.shift();
  if (type === void 0) {
    throw new Error("empty type list");
  }
  switch (type) {
    case 0:
      return () => decodeUplcIntFromFlat(r, true);
    case 1:
      return () => decodeUplcByteArrayFromFlat(r);
    case 2:
      return () => decodeUplcStringFromFlat(r);
    case 3:
      return () => UNIT_VALUE;
    // no reading needed
    case 4:
      return () => decodeUplcBoolFromFlat(r);
    case 5:
    case 6:
      throw new Error("unexpected type tag without type application");
    case 7:
      const containerType = typeList.shift();
      if (containerType === void 0) {
        throw new Error("expected nested type for container");
      } else if (containerType == 5) {
        const itemType = makeUplcType({ numbers: typeList });
        const itemReader = dispatchValueReader(r, typeList);
        return () => decodeUplcListFromFlat(r, itemType, itemReader);
      } else if (containerType == 7) {
        const nestedContainerType = typeList.shift();
        if (nestedContainerType == void 0) {
          throw new Error("expected nested type for container");
        } else if (nestedContainerType == 6) {
          const leftReader = dispatchValueReader(r, typeList);
          const rightReader = dispatchValueReader(r, typeList);
          return () => makeUplcPair({
            first: leftReader(),
            second: rightReader()
          });
        } else {
          throw new Error("unexpected nested container type tag");
        }
      } else {
        throw new Error("unexpected container type tag");
      }
    case 8:
      return () => decodeUplcDataValueFromFlat(r);
    case 9:
      throw new Error(`Bls12_381_G1_element can't be deserialized`);
    case 10:
      throw new Error(`Bls12_381_G2_element can't be deserialized`);
    case 11:
      throw new Error(`Bls12_381_MlResult can't be deserialized`);
    default:
      throw new Error(`unhandled value type ${type.toString()}`);
  }
}

// node_modules/@helios-lang/uplc/src/builtins/cast.js
function asCekValue(value) {
  return { value };
}
function asUplcValue(value) {
  if ("value" in value) {
    return value.value;
  } else {
    return void 0;
  }
}
function asUplcValues(values) {
  return values.map((v) => asUplcValue(v));
}

// node_modules/@helios-lang/uplc/src/builtins/v1/addInteger.js
var addInteger = {
  name: "addInteger",
  forceCount: 0,
  nArgs: 2,
  cpuModel: (params) => makeArgSizesMaxCost(params.get(1), params.get(0)),
  memModel: (params) => makeArgSizesMaxCost(params.get(3), params.get(2)),
  call: (args, _ctx) => {
    const [a, b] = asUplcValues(args);
    if (a?.kind != "int") {
      throw new Error(
        `expected integer for first arg of addInteger, got ${a?.toString()}`
      );
    }
    if (b?.kind != "int") {
      throw new Error(
        `expected integer for second arg of addInteger, got ${b?.toString()}`
      );
    }
    return asCekValue(makeUplcInt(a.value + b.value));
  }
};

// node_modules/@helios-lang/uplc/src/builtins/v1/appendByteString.js
var appendByteString = {
  name: "appendByteString",
  forceCount: 0,
  nArgs: 2,
  cpuModel: (params) => makeArgSizesSumCost(params.get(5), params.get(4)),
  memModel: (params) => makeArgSizesSumCost(params.get(7), params.get(6)),
  call: (args, _ctx) => {
    const [a, b] = asUplcValues(args);
    if (a?.kind != "bytes") {
      throw new Error(
        `expected a byte array for the first argument of appendByteString, got ${a?.toString()}`
      );
    }
    if (b?.kind != "bytes") {
      throw new Error(
        `expected a byte array for the second argument of appendByteString, got ${b?.toString()}`
      );
    }
    return asCekValue(makeUplcByteArray(a.bytes.concat(b.bytes)));
  }
};

// node_modules/@helios-lang/uplc/src/builtins/v1/appendString.js
var appendStringV1 = {
  name: "appendString",
  forceCount: 0,
  nArgs: 2,
  cpuModel: (params) => makeArgSizesSumCost(params.get(9), params.get(8)),
  memModel: (params) => makeArgSizesSumCost(params.get(11), params.get(10)),
  call: (args, _ctx) => {
    const [a, b] = asUplcValues(args);
    if (a?.kind != "string") {
      throw new Error(
        `expected a string for the first argument of appendString, got ${a?.toString()}`
      );
    }
    if (b?.kind != "string") {
      throw new Error(
        `expected a string for the second argument of appendString, got ${b?.toString()}`
      );
    }
    return asCekValue(makeUplcString(a.value + b.value));
  }
};

// node_modules/@helios-lang/uplc/src/builtins/v1/bData.js
var bData = {
  name: "bData",
  forceCount: 0,
  nArgs: 1,
  cpuModel: (params) => makeArgSizesConstCost(params.get(12)),
  memModel: (params) => makeArgSizesConstCost(params.get(13)),
  call: (args, _ctx) => {
    const [a] = asUplcValues(args);
    if (a?.kind != "bytes") {
      throw new Error(
        `expected a byte array as the first argument of bData, got ${a?.toString()}`
      );
    }
    return asCekValue(
      makeUplcDataValue(makeByteArrayData({ bytes: a.bytes }))
    );
  }
};

// node_modules/@helios-lang/uplc/src/builtins/v1/blake2b_256.js
var blake2b_256 = {
  name: "blake2b_256",
  forceCount: 0,
  nArgs: 1,
  cpuModel: (params) => makeArgSizesFirstCost(params.get(15), params.get(14)),
  memModel: (params) => makeArgSizesConstCost(params.get(16)),
  call: (args, _ctx) => {
    const [a] = asUplcValues(args);
    if (a?.kind != "bytes") {
      throw new Error(
        `expected a byte array for the first argument of blake2b_256, got ${a?.toString()}`
      );
    }
    return asCekValue(makeUplcByteArray(blake2b(a.bytes)));
  }
};

// node_modules/@helios-lang/uplc/src/builtins/v1/chooseData.js
var chooseData = {
  name: "chooseData",
  forceCount: 1,
  nArgs: 6,
  cpuModel: (params) => makeArgSizesConstCost(params.get(33)),
  memModel: (params) => makeArgSizesConstCost(params.get(34)),
  call: (args, _ctx) => {
    const data = asUplcValue(args[0]);
    if (data?.kind != "data") {
      throw new Error(
        `expected data value as first argument of chooseData, got ${data?.toString()}`
      );
    }
    switch (data.value.kind) {
      case "constr":
        return args[1];
      case "map":
        return args[2];
      case "list":
        return args[3];
      case "int":
        return args[4];
      case "bytes":
        return args[5];
      default:
        throw new Error("unexpected data type in chooseData");
    }
  }
};

// node_modules/@helios-lang/uplc/src/builtins/v1/chooseList.js
var chooseList = {
  name: "chooseList",
  forceCount: 2,
  nArgs: 3,
  cpuModel: (params) => makeArgSizesConstCost(params.get(35)),
  memModel: (params) => makeArgSizesConstCost(params.get(36)),
  call: (args, _ctx) => {
    const list2 = asUplcValue(args[0]);
    if (list2?.kind != "list") {
      throw new Error(
        `expected a list as first argument of chooseList, got ${list2?.toString()}`
      );
    }
    return list2.length == 0 ? args[1] : args[2];
  }
};

// node_modules/@helios-lang/uplc/src/builtins/v1/chooseUnit.js
var chooseUnit = {
  name: "chooseUnit",
  forceCount: 1,
  nArgs: 2,
  cpuModel: (params) => makeArgSizesConstCost(params.get(37)),
  memModel: (params) => makeArgSizesConstCost(params.get(38)),
  call: (args, _ctx) => {
    const a = asUplcValue(args[0]);
    if (a?.kind != "unit") {
      throw new Error(
        `expected a unit value for the first argument of chooseUnit, got ${a?.toString()}`
      );
    }
    return args[1];
  }
};

// node_modules/@helios-lang/uplc/src/builtins/v1/consByteString.js
var consByteString = {
  name: "consByteString",
  forceCount: 0,
  nArgs: 2,
  cpuModel: (params) => makeArgSizesSecondCost(params.get(40), params.get(39)),
  memModel: (params) => makeArgSizesSumCost(params.get(42), params.get(41)),
  call: (args, _ctx) => {
    const [a, b] = asUplcValues(args);
    if (a?.kind != "int") {
      throw new Error(
        `expected an integer for the first argument of consByteString, got ${a?.toString()}`
      );
    }
    if (b?.kind != "bytes") {
      throw new Error(
        `expected a byte array for the second argument of consByteString, got ${b?.toString()}`
      );
    }
    return asCekValue(
      makeUplcByteArray([Number(a.value % 256n)].concat(b.bytes))
    );
  }
};

// node_modules/@helios-lang/uplc/src/builtins/v1/constrData.js
var constrData = {
  name: "constrData",
  forceCount: 0,
  nArgs: 2,
  cpuModel: (params) => makeArgSizesConstCost(params.get(43)),
  memModel: (params) => makeArgSizesConstCost(params.get(44)),
  call: (args, _ctx) => {
    const [tag, fields] = asUplcValues(args);
    if (tag?.kind != "int") {
      throw new Error(
        `expected an integer as first argument of constrData, got ${tag?.toString()}`
      );
    }
    if (fields?.kind != "list") {
      throw new Error(
        `expected a list as second argument of constrData, got ${fields?.toString()}`
      );
    }
    if (!fields.isDataList()) {
      throw new Error("second argument of constrData is not a data list");
    }
    return asCekValue(
      makeUplcDataValue(
        makeConstrData(
          tag.value,
          fields.items.map((f) => {
            if (f.kind == "data") {
              return f.value;
            } else {
              throw new Error("expected only data value fields");
            }
          })
        )
      )
    );
  }
};

// node_modules/@helios-lang/uplc/src/builtins/v1/decodeUtf8.js
var decodeUtf82 = {
  name: "decodeUtf8",
  forceCount: 0,
  nArgs: 1,
  cpuModel: (params) => makeArgSizesFirstCost(params.get(46), params.get(45)),
  memModel: (params) => makeArgSizesFirstCost(params.get(48), params.get(47)),
  call: (args, _ctx) => {
    const [a] = asUplcValues(args);
    if (a?.kind != "bytes") {
      throw new Error(
        `expected a byte array for the first argument of decodeUtf8, got ${a?.toString()}`
      );
    }
    return asCekValue(makeUplcString(decodeUtf8(a.bytes)));
  }
};

// node_modules/@helios-lang/uplc/src/builtins/v1/divideInteger.js
var divideInteger = {
  name: "divideInteger",
  forceCount: 0,
  nArgs: 2,
  cpuModel: (params) => makeArgSizesProdCost(params.get(51), params.get(50), params.get(49)),
  memModel: (params) => makeArgSizesDiffCost(params.get(54), params.get(52), params.get(53)),
  call: evalDivideInteger
};
function evalDivideInteger(args, _ctx) {
  const [a, b] = asUplcValues(args);
  if (a?.kind != "int") {
    throw new Error(
      `expected an integer for the first argument of divideInteger, got ${a?.toString()}`
    );
  }
  if (b?.kind != "int") {
    throw new Error(
      `expected an integer for the second argument of divideInteger, got ${b?.toString()}`
    );
  }
  if (b.value === 0n) {
    throw new Error(`division by 0`);
  }
  const x = a.value;
  const y = b.value;
  return asCekValue(
    makeUplcInt(x / y - (x % y != 0n && x < 0n != y < 0n ? 1n : 0n))
  );
}

// node_modules/@helios-lang/uplc/src/builtins/v1/encodeUtf8.js
var encodeUtf82 = {
  name: "encodeUtf8",
  forceCount: 0,
  nArgs: 1,
  cpuModel: (params) => makeArgSizesFirstCost(params.get(56), params.get(55)),
  memModel: (params) => makeArgSizesFirstCost(params.get(58), params.get(57)),
  call: (args, _ctx) => {
    const [a] = asUplcValues(args);
    if (a?.kind != "string") {
      throw new Error(
        `expected a string for the first argument of encodeUtf8, got ${a?.toString()}`
      );
    }
    return asCekValue(makeUplcByteArray(encodeUtf8(a.value)));
  }
};

// node_modules/@helios-lang/uplc/src/builtins/v1/equalsByteString.js
var equalsByteString = {
  name: "equalsByteString",
  forceCount: 0,
  nArgs: 2,
  cpuModel: (params) => makeArgSizesDiagCost(params.get(61), params.get(60), params.get(59)),
  memModel: (params) => makeArgSizesConstCost(params.get(62)),
  call: (args, _ctx) => {
    const [a, b] = asUplcValues(args);
    if (a?.kind != "bytes") {
      throw new Error(
        `expected a byte array for the first argument of equalsByteString, got ${a?.toString()}`
      );
    }
    if (b?.kind != "bytes") {
      throw new Error(
        `expected a byte array for the second argument of equalsByteString, got ${b?.toString()}`
      );
    }
    return asCekValue(
      makeUplcBool(compareByteArrayData(a.bytes, b.bytes) == 0)
    );
  }
};

// node_modules/@helios-lang/uplc/src/builtins/v1/equalsData.js
var equalsData = {
  name: "equalsData",
  forceCount: 0,
  nArgs: 2,
  cpuModel: (params) => makeArgSizesMinCost(params.get(64), params.get(63)),
  memModel: (params) => makeArgSizesConstCost(params.get(65)),
  call: (args, _ctx) => {
    const [a, b] = asUplcValues(args);
    if (a?.kind != "data") {
      throw new Error(
        `expected an data as first argument of equalsData, got ${a?.toString()}`
      );
    }
    if (b?.kind != "data") {
      throw new Error(
        `expected an data as second argument of equalsData, got ${b?.toString()}`
      );
    }
    return asCekValue(makeUplcBool(a.value.isEqual(b.value)));
  }
};

// node_modules/@helios-lang/uplc/src/builtins/v1/equalsInteger.js
var equalsInteger = {
  name: "equalsInteger",
  forceCount: 0,
  nArgs: 2,
  cpuModel: (params) => makeArgSizesMinCost(params.get(67), params.get(66)),
  memModel: (params) => makeArgSizesConstCost(params.get(68)),
  call: (args, _ctx) => {
    const [a, b] = asUplcValues(args);
    if (a?.kind != "int") {
      throw new Error(
        `expected an integer for the first argument of equalsInteger, got ${a?.toString()}`
      );
    }
    if (b?.kind != "int") {
      throw new Error(
        `expected an integer for the second argument of equalsInteger, got ${b?.toString()}`
      );
    }
    return asCekValue(makeUplcBool(a.value == b.value));
  }
};

// node_modules/@helios-lang/uplc/src/builtins/v1/equalsString.js
var equalsString = {
  name: "equalsString",
  forceCount: 0,
  nArgs: 2,
  cpuModel: (params) => makeArgSizesDiagCost(params.get(71), params.get(70), params.get(69)),
  memModel: (params) => makeArgSizesConstCost(params.get(72)),
  call: (args, _ctx) => {
    const [a, b] = asUplcValues(args);
    if (a?.kind != "string") {
      throw new Error(
        `expected a string for the first argument of equalsString, got ${a?.toString()}`
      );
    }
    if (b?.kind != "string") {
      throw new Error(
        `expected a string for the second argument of equalsString, got ${b?.toString()}`
      );
    }
    return asCekValue(makeUplcBool(a.value == b.value));
  }
};

// node_modules/@helios-lang/uplc/src/builtins/v1/fstPair.js
var fstPair = {
  name: "fstPair",
  forceCount: 2,
  nArgs: 1,
  cpuModel: (params) => makeArgSizesConstCost(params.get(73)),
  memModel: (params) => makeArgSizesConstCost(params.get(74)),
  call: (args, _ctx) => {
    const [a] = asUplcValues(args);
    if (a?.kind != "pair") {
      throw new Error(
        `expected a pair as first argument of fstPair, got ${a?.toString()}`
      );
    }
    return asCekValue(a.first);
  }
};

// node_modules/@helios-lang/uplc/src/builtins/v1/headList.js
var headList = {
  name: "headList",
  forceCount: 1,
  nArgs: 1,
  cpuModel: (params) => makeArgSizesConstCost(params.get(75)),
  memModel: (params) => makeArgSizesConstCost(params.get(76)),
  call: (args, _ctx) => {
    const [list2] = asUplcValues(args);
    if (list2?.kind != "list") {
      throw new Error(
        `expected list as first argument of headList, got ${list2?.toString()}`
      );
    }
    if (list2.length == 0) {
      throw new Error("empty list in headList");
    }
    return asCekValue(list2.items[0]);
  }
};

// node_modules/@helios-lang/uplc/src/builtins/v1/iData.js
var iData = {
  name: "iData",
  forceCount: 0,
  nArgs: 1,
  cpuModel: (params) => makeArgSizesConstCost(params.get(77)),
  memModel: (params) => makeArgSizesConstCost(params.get(78)),
  call: (args, _ctx) => {
    const [a] = asUplcValues(args);
    if (a?.kind != "int") {
      throw new Error(
        `expected an integer as the first argument of iData, got ${a?.toString()}`
      );
    }
    return asCekValue(makeUplcDataValue(makeIntData(a.value)));
  }
};

// node_modules/@helios-lang/uplc/src/builtins/v1/ifThenElse.js
var ifThenElse = {
  name: "ifThenElse",
  forceCount: 1,
  nArgs: 3,
  cpuModel: (params) => makeArgSizesConstCost(params.get(79)),
  memModel: (params) => makeArgSizesConstCost(params.get(80)),
  call: (args, _ctx) => {
    const cond = asUplcValue(args[0]);
    if (cond?.kind != "bool") {
      throw new Error(
        `expected a bool for first argument of ifThenElse, got ${cond?.toString()}`
      );
    }
    return cond.value ? args[1] : args[2];
  }
};

// node_modules/@helios-lang/uplc/src/builtins/v1/indexByteString.js
var indexByteString = {
  name: "indexByteString",
  forceCount: 0,
  nArgs: 2,
  cpuModel: (params) => makeArgSizesConstCost(params.get(81)),
  memModel: (params) => makeArgSizesConstCost(params.get(82)),
  call: (args, _ctx) => {
    const [a, b] = asUplcValues(args);
    if (a?.kind != "bytes") {
      throw new Error(
        `expected a byte array for the first argument of indexByteString, got ${a?.toString()}`
      );
    }
    if (b?.kind != "int") {
      throw new Error(
        `expected an integer for the second argument of indexByteString, got ${b?.toString()}`
      );
    }
    const bytes = a.bytes;
    const i = Number(b.value);
    if (i < 0 || i >= bytes.length) {
      throw new Error("index out of range");
    }
    return asCekValue(makeUplcInt(BigInt(bytes[i])));
  }
};

// node_modules/@helios-lang/uplc/src/builtins/v1/lengthOfByteString.js
var lengthOfByteString = {
  name: "lengthOfByteString",
  forceCount: 0,
  nArgs: 1,
  cpuModel: (params) => makeArgSizesConstCost(params.get(83)),
  memModel: (params) => makeArgSizesConstCost(params.get(84)),
  call: (args, _ctx) => {
    const [a] = asUplcValues(args);
    if (a?.kind != "bytes") {
      throw new Error(
        `expected a byte array for the first argument of lengthOfByteString, got ${a?.toString()}`
      );
    }
    return asCekValue(makeUplcInt(a.bytes.length));
  }
};

// node_modules/@helios-lang/uplc/src/builtins/v1/lessThanByteString.js
var lessThanByteString = {
  name: "lessThanByteString",
  forceCount: 0,
  nArgs: 2,
  cpuModel: (params) => makeArgSizesMinCost(params.get(86), params.get(85)),
  memModel: (params) => makeArgSizesConstCost(params.get(87)),
  call: (args, _ctx) => {
    const [a, b] = asUplcValues(args);
    if (a?.kind != "bytes") {
      throw new Error(
        `expected a byte array for the first argument of lessThanByteString, got ${a?.toString()}`
      );
    }
    if (b?.kind != "bytes") {
      throw new Error(
        `expected a byte array for the second argument of lessThanByteString, got ${b?.toString()}`
      );
    }
    return asCekValue(
      makeUplcBool(compareByteArrayData(a.bytes, b.bytes) == -1)
    );
  }
};

// node_modules/@helios-lang/uplc/src/builtins/v1/lessThanEqualsByteString.js
var lessThanEqualsByteString = {
  name: "lessThanEqualsByteString",
  forceCount: 0,
  nArgs: 2,
  cpuModel: (params) => makeArgSizesMinCost(params.get(89), params.get(88)),
  memModel: (params) => makeArgSizesConstCost(params.get(90)),
  call: (args, _ctx) => {
    const [a, b] = asUplcValues(args);
    if (a?.kind != "bytes") {
      throw new Error(
        `expected a byte array for the first argument of lessThanEqualsByteString, got ${a?.toString()}`
      );
    }
    if (b?.kind != "bytes") {
      throw new Error(
        `expected a byte array for the second argument of lessThanEqualsByteString, got ${b?.toString()}`
      );
    }
    return asCekValue(
      makeUplcBool(compareByteArrayData(a.bytes, b.bytes) <= 0)
    );
  }
};

// node_modules/@helios-lang/uplc/src/builtins/v1/lessThanEqualsInteger.js
var lessThanEqualsInteger = {
  name: "lessThanEqualsInteger",
  forceCount: 0,
  nArgs: 2,
  cpuModel: (params) => makeArgSizesMinCost(params.get(92), params.get(91)),
  memModel: (params) => makeArgSizesConstCost(params.get(93)),
  call: (args, _ctx) => {
    const [a, b] = asUplcValues(args);
    if (a?.kind != "int") {
      throw new Error(
        `expected an integer for the first argument of lessThanEqualsInteger, got ${a?.toString()}`
      );
    }
    if (b?.kind != "int") {
      throw new Error(
        `expected an integer for the second argument of lessThanEqualsInteger, got ${b?.toString()}`
      );
    }
    return asCekValue(makeUplcBool(a.value <= b.value));
  }
};

// node_modules/@helios-lang/uplc/src/builtins/v1/lessThanInteger.js
var lessThanInteger = {
  name: "lessThanInteger",
  forceCount: 0,
  nArgs: 2,
  cpuModel: (params) => makeArgSizesMinCost(params.get(95), params.get(94)),
  memModel: (params) => makeArgSizesConstCost(params.get(96)),
  call: (args, _ctx) => {
    const [a, b] = asUplcValues(args);
    if (a?.kind != "int") {
      throw new Error(
        `expected an integer for the first argument of lessThanInteger, got ${a?.toString()}`
      );
    }
    if (b?.kind != "int") {
      throw new Error(
        `expected an integer for the second argument of lessThanInteger, got ${b?.toString()}`
      );
    }
    return asCekValue(makeUplcBool(a.value < b.value));
  }
};

// node_modules/@helios-lang/uplc/src/builtins/v1/listData.js
var listData = {
  name: "listData",
  forceCount: 0,
  nArgs: 1,
  cpuModel: (params) => makeArgSizesConstCost(params.get(97)),
  memModel: (params) => makeArgSizesConstCost(params.get(98)),
  call: (args, _ctx) => {
    const [list2] = asUplcValues(args);
    if (list2?.kind != "list") {
      throw new Error(
        `expected a list as first argument of listData, got ${list2?.toString()}`
      );
    }
    if (!list2.isDataList()) {
      throw new Error(
        `first argument of listData isn't a data list (i.e. not a list of data items)`
      );
    }
    return asCekValue(
      makeUplcDataValue(
        makeListData(
          list2.items.map((item) => {
            if (item.kind == "data") {
              return item.value;
            } else {
              throw new Error("unexpected data list item");
            }
          })
        )
      )
    );
  }
};

// node_modules/@helios-lang/uplc/src/builtins/v1/mapData.js
var mapData = {
  name: "mapData",
  forceCount: 0,
  nArgs: 1,
  cpuModel: (params) => makeArgSizesConstCost(params.get(99)),
  memModel: (params) => makeArgSizesConstCost(params.get(100)),
  call: (args, _ctx) => {
    const [list2] = asUplcValues(args);
    if (list2?.kind != "list") {
      throw new Error(
        `expected a list as first argument of mapData, got ${list2?.toString()}`
      );
    }
    if (!list2.isDataMap()) {
      throw new Error(
        `first argument of mapData isn't a data map (i.e. not a list of data pairs)`
      );
    }
    return asCekValue(
      makeUplcDataValue(
        makeMapData(
          list2.items.map((item) => {
            if (item.kind == "pair") {
              const a = item.first;
              const b = item.second;
              if (a.kind != "data") {
                throw new Error(
                  "unexpected non-data first entry in pair"
                );
              }
              if (b.kind != "data") {
                throw new Error(
                  "unexpected non-data second entry in pair"
                );
              }
              return [a.value, b.value];
            } else {
              throw new Error("unexpected data map item");
            }
          })
        )
      )
    );
  }
};

// node_modules/@helios-lang/uplc/src/builtins/v1/mkCons.js
var mkCons = {
  name: "mkCons",
  forceCount: 1,
  nArgs: 2,
  cpuModel: (params) => makeArgSizesConstCost(params.get(101)),
  memModel: (params) => makeArgSizesConstCost(params.get(102)),
  call: (args, _ctx) => {
    const [item, list2] = asUplcValues(args);
    if (list2?.kind != "list") {
      throw new Error(
        `expected list as second argument of mkCons, got ${list2?.toString()}`
      );
    }
    if (item === void 0) {
      throw new Error(
        `expected UplcValue as first argument of mkCons, got undefined`
      );
    }
    if (!list2.itemType.isEqual(item.type)) {
      throw new Error(
        `item type doesn't correspond with list type in mkCons`
      );
    }
    return asCekValue(
      makeUplcList({
        itemType: list2.itemType,
        items: [item].concat(list2.items)
      })
    );
  }
};

// node_modules/@helios-lang/uplc/src/builtins/v1/mkNilData.js
var mkNilData = {
  name: "mkNilData",
  forceCount: 0,
  nArgs: 1,
  cpuModel: (params) => makeArgSizesConstCost(params.get(103)),
  memModel: (params) => makeArgSizesConstCost(params.get(104)),
  call: (args, _ctx) => {
    const a = asUplcValue(args[0]);
    if (a?.kind != "unit") {
      throw new Error(
        `expected a unit value for the first argument of mkNilData, got ${a?.toString()}`
      );
    }
    return asCekValue(makeUplcList({ itemType: DATA_TYPE, items: [] }));
  }
};

// node_modules/@helios-lang/uplc/src/builtins/v1/mkNilPairData.js
var mkNilPairData = {
  name: "mkNilPairData",
  forceCount: 0,
  nArgs: 1,
  cpuModel: (params) => makeArgSizesConstCost(params.get(105)),
  memModel: (params) => makeArgSizesConstCost(params.get(106)),
  call: (args, _ctx) => {
    const a = asUplcValue(args[0]);
    if (a?.kind != "unit") {
      throw new Error(
        `expected a unit value for the first argument of mkNilPairData, got ${a?.toString()}`
      );
    }
    return asCekValue(makeUplcList({ itemType: DATA_PAIR_TYPE, items: [] }));
  }
};

// node_modules/@helios-lang/uplc/src/builtins/v1/mkPairData.js
var mkPairData = {
  name: "mkPairData",
  forceCount: 0,
  nArgs: 2,
  cpuModel: (params) => makeArgSizesConstCost(params.get(107)),
  memModel: (params) => makeArgSizesConstCost(params.get(108)),
  call: (args, _ctx) => {
    const [a, b] = asUplcValues(args);
    if (a?.kind != "data") {
      throw new Error(
        `expected an data as first argument of mkPairData, got ${a?.toString()}`
      );
    }
    if (b?.kind != "data") {
      throw new Error(
        `expected an data as second argument of mkPairData, got ${b?.toString()}`
      );
    }
    return asCekValue(makeUplcPair({ first: a, second: b }));
  }
};

// node_modules/@helios-lang/uplc/src/builtins/v1/modInteger.js
var modInteger = {
  name: "modInteger",
  forceCount: 0,
  nArgs: 2,
  cpuModel: (params) => makeArgSizesProdCost(params.get(111), params.get(110), params.get(109)),
  memModel: (params) => makeArgSizesDiffCost(params.get(114), params.get(112), params.get(113)),
  call: evalModInteger
};
function evalModInteger(args, _ctx) {
  const [a, b] = asUplcValues(args);
  if (a?.kind != "int") {
    throw new Error(
      `expected an integer for the first argument of modInteger, got ${a?.toString()}`
    );
  }
  if (b?.kind != "int") {
    throw new Error(
      `expected an integer for the second argument of modInteger, got ${b?.toString()}`
    );
  }
  if (b.value === 0n) {
    throw new Error(`division by 0 in modInteger`);
  }
  let m = a.value % b.value;
  if (b.value > 0 && m < 0) {
    m += b.value;
  } else if (b.value < 0 && m > 0) {
    m += b.value;
  }
  return asCekValue(makeUplcInt(m));
}

// node_modules/@helios-lang/uplc/src/builtins/v1/multiplyInteger.js
var multiplyInteger = {
  name: "multiplyInteger",
  forceCount: 0,
  nArgs: 2,
  cpuModel: (params) => makeArgSizesSumCost(params.get(116), params.get(115)),
  memModel: (params) => makeArgSizesSumCost(params.get(118), params.get(117)),
  call: (args, _ctx) => {
    const [a, b] = asUplcValues(args);
    if (a?.kind != "int") {
      throw new Error(
        `expected an integer for the first argument of multiplyInteger, got ${a?.toString()}`
      );
    }
    if (b?.kind != "int") {
      throw new Error(
        `expected an integer for the second argument of multiplyInteger, got ${b?.toString()}`
      );
    }
    return asCekValue(makeUplcInt(a.value * b.value));
  }
};

// node_modules/@helios-lang/uplc/src/builtins/v1/nullList.js
var nullList = {
  name: "nullList",
  forceCount: 1,
  nArgs: 1,
  cpuModel: (params) => makeArgSizesConstCost(params.get(119)),
  memModel: (params) => makeArgSizesConstCost(params.get(120)),
  call: (args, _ctx) => {
    const [list2] = asUplcValues(args);
    if (list2?.kind != "list") {
      throw new Error(
        `expected list as first argument of nullList, got ${list2?.toString()}`
      );
    }
    return asCekValue(makeUplcBool(list2.length == 0));
  }
};

// node_modules/@helios-lang/uplc/src/builtins/v1/quotientInteger.js
var quotientInteger = {
  name: "quotientInteger",
  forceCount: 0,
  nArgs: 2,
  cpuModel: (params) => makeArgSizesProdCost(params.get(123), params.get(122), params.get(121)),
  memModel: (params) => makeArgSizesDiffCost(params.get(126), params.get(124), params.get(125)),
  call: evalQuotientInteger
};
function evalQuotientInteger(args, _ctx) {
  const [a, b] = asUplcValues(args);
  if (a?.kind != "int") {
    throw new Error(
      `expected an integer for the first argument of quotientInteger, got ${a?.toString()}`
    );
  }
  if (b?.kind != "int") {
    throw new Error(
      `expected an integer for the second argument of quotientInteger, got ${b?.toString()}`
    );
  }
  if (b.value === 0n) {
    throw new Error(`division by 0 in quotientInteger`);
  }
  return asCekValue(makeUplcInt(a.value / b.value));
}

// node_modules/@helios-lang/uplc/src/builtins/v1/remainderInteger.js
var remainderInteger = {
  name: "remainderInteger",
  forceCount: 0,
  nArgs: 2,
  cpuModel: (params) => makeArgSizesProdCost(params.get(129), params.get(128), params.get(127)),
  memModel: (params) => makeArgSizesDiffCost(params.get(132), params.get(130), params.get(131)),
  call: evalRemainderInteger
};
function evalRemainderInteger(args, _ctx) {
  const [a, b] = asUplcValues(args);
  if (a?.kind != "int") {
    throw new Error(
      `expected an integer for the first argument of remainederInteger, got ${a?.toString()}`
    );
  }
  if (b?.kind != "int") {
    throw new Error(
      `expected an integer for the second argument of remainederInteger, got ${b?.toString()}`
    );
  }
  if (b.value === 0n) {
    throw new Error(`division by 0 in remainederInteger`);
  }
  return asCekValue(
    makeUplcInt(
      a.value % b.value
      //a.value -
      //  (a.value / b.value + (b.value < 0n ? 1n : 0n)) * b.value
    )
  );
}

// node_modules/@helios-lang/uplc/src/builtins/v1/sha2_256.js
var sha2_2562 = {
  name: "sha2_256",
  forceCount: 0,
  nArgs: 1,
  cpuModel: (params) => makeArgSizesFirstCost(params.get(134), params.get(133)),
  memModel: (params) => makeArgSizesConstCost(params.get(135)),
  call: (args, _ctx) => {
    const [a] = asUplcValues(args);
    if (a?.kind != "bytes") {
      throw new Error(
        `expected a byte array for the first argument of sha2_256, got ${a?.toString()}`
      );
    }
    return asCekValue(makeUplcByteArray(sha2_256(a.bytes)));
  }
};

// node_modules/@helios-lang/uplc/src/builtins/v1/sha3_256.js
var sha3_2562 = {
  name: "sha3_256",
  forceCount: 0,
  nArgs: 1,
  cpuModel: (params) => makeArgSizesFirstCost(params.get(137), params.get(136)),
  memModel: (params) => makeArgSizesConstCost(params.get(138)),
  call: (args, _ctx) => {
    const [a] = asUplcValues(args);
    if (a?.kind != "bytes") {
      throw new Error(
        `expected a byte array for the first argument of sha3_256, got ${a?.toString()}`
      );
    }
    return asCekValue(makeUplcByteArray(sha3_256(a.bytes)));
  }
};

// node_modules/@helios-lang/uplc/src/builtins/v1/sliceByteString.js
var sliceByteString = {
  name: "sliceByteString",
  forceCount: 0,
  nArgs: 3,
  cpuModel: (params) => makeArgSizesThirdCost(params.get(140), params.get(139)),
  memModel: (params) => makeArgSizesThirdCost(params.get(142), params.get(141)),
  call: (args, _ctx) => {
    const [a, b, c] = asUplcValues(args);
    if (a?.kind != "int") {
      throw new Error(
        `expected an integer for the first argument of sliceByteString, got ${a?.toString()}`
      );
    }
    if (b?.kind != "int") {
      throw new Error(
        `expected an integer for the second argument of sliceByteString, got ${b?.toString()}`
      );
    }
    if (c?.kind != "bytes") {
      throw new Error(
        `expected a byte array for the third argument of sliceByteString, got ${c?.toString()}`
      );
    }
    const bytes = c.bytes;
    const start = Math.max(Number(a.value), 0);
    const end = Math.min(start + Number(b.value) - 1, bytes.length - 1);
    const res = end < start ? [] : bytes.slice(start, end + 1);
    return asCekValue(makeUplcByteArray(res));
  }
};

// node_modules/@helios-lang/uplc/src/builtins/v1/sndPair.js
var sndPair = {
  name: "sndPair",
  forceCount: 2,
  nArgs: 1,
  cpuModel: (params) => makeArgSizesConstCost(params.get(143)),
  memModel: (params) => makeArgSizesConstCost(params.get(144)),
  call: (args, _ctx) => {
    const [a] = asUplcValues(args);
    if (a?.kind != "pair") {
      throw new Error(
        `expected a pair as first argument of sndPair, got ${a?.toString()}`
      );
    }
    return asCekValue(a.second);
  }
};

// node_modules/@helios-lang/uplc/src/builtins/v1/subtractInteger.js
var subtractInteger = {
  name: "subtractInteger",
  forceCount: 0,
  nArgs: 2,
  cpuModel: (params) => makeArgSizesMaxCost(params.get(146), params.get(145)),
  memModel: (params) => makeArgSizesMaxCost(params.get(148), params.get(147)),
  call: (args, _ctx) => {
    const [a, b] = asUplcValues(args);
    if (a?.kind != "int") {
      throw new Error(
        `expected integer for first arg of subtractInteger, got ${a?.toString()}`
      );
    }
    if (b?.kind != "int") {
      throw new Error(
        `expected integer for second arg of subtractInteger, got ${b?.toString()}`
      );
    }
    return asCekValue(makeUplcInt(a.value - b.value));
  }
};

// node_modules/@helios-lang/uplc/src/builtins/v1/tailList.js
var tailList = {
  name: "tailList",
  forceCount: 1,
  nArgs: 1,
  cpuModel: (params) => makeArgSizesConstCost(params.get(149)),
  memModel: (params) => makeArgSizesConstCost(params.get(150)),
  call: (args, _ctx) => {
    const [list2] = asUplcValues(args);
    if (list2?.kind != "list") {
      throw new Error(
        `expected list as first argument of tailList, got ${list2?.toString()}`
      );
    }
    if (list2.length == 0) {
      throw new Error("empty list in tailList");
    }
    return asCekValue(
      makeUplcList({
        itemType: list2.itemType,
        items: list2.items.slice(1)
      })
    );
  }
};

// node_modules/@helios-lang/uplc/src/builtins/v1/trace.js
var trace = {
  name: "trace",
  forceCount: 1,
  nArgs: 2,
  cpuModel: (params) => makeArgSizesConstCost(params.get(151)),
  memModel: (params) => makeArgSizesConstCost(params.get(152)),
  call: (args, ctx) => {
    const message = asUplcValue(args[0]);
    if (message?.kind != "string") {
      throw new Error(
        `expected a string as first argument of trace, got ${message?.toString()}`
      );
    }
    ctx.print(message.value);
    return args[1];
  }
};

// node_modules/@helios-lang/uplc/src/builtins/v1/unBData.js
var unBData = {
  name: "unBData",
  forceCount: 0,
  nArgs: 1,
  cpuModel: (params) => makeArgSizesConstCost(params.get(153)),
  memModel: (params) => makeArgSizesConstCost(params.get(154)),
  call: (args, _ctx) => {
    const [dataValue] = asUplcValues(args);
    if (dataValue?.kind != "data") {
      throw new Error(
        `expected an data as first argument of unBData, got ${dataValue?.toString()}`
      );
    }
    const data = dataValue.value;
    if (data.kind != "bytes") {
      throw new Error(
        `expected ByteArrayData as first argument of unBData, got ${data?.toString()}`
      );
    }
    return asCekValue(makeUplcByteArray(data.bytes));
  }
};

// node_modules/@helios-lang/uplc/src/builtins/v1/unConstrData.js
var unConstrData = {
  name: "unConstrData",
  forceCount: 0,
  nArgs: 1,
  cpuModel: (params) => makeArgSizesConstCost(params.get(155)),
  memModel: (params) => makeArgSizesConstCost(params.get(156)),
  call: (args, _ctx) => {
    const [dataValue] = asUplcValues(args);
    if (dataValue?.kind != "data") {
      throw new Error(
        `expected an data as first argument of unConstrData, got ${dataValue?.toString()}`
      );
    }
    const data = dataValue.value;
    if (data.kind != "constr") {
      throw new Error(
        `expected ConstrData as first argument of unConstrData, got ${data?.toString()}`
      );
    }
    return asCekValue(
      makeUplcPair({
        first: makeUplcInt(data.tag),
        second: makeUplcList({
          itemType: DATA_TYPE,
          items: data.fields.map(makeUplcDataValue)
        })
      })
    );
  }
};

// node_modules/@helios-lang/uplc/src/builtins/v1/unIData.js
var unIData = {
  name: "unIData",
  forceCount: 0,
  nArgs: 1,
  cpuModel: (params) => makeArgSizesConstCost(params.get(157)),
  memModel: (params) => makeArgSizesConstCost(params.get(158)),
  call: (args, _ctx) => {
    const [dataValue] = asUplcValues(args);
    if (dataValue?.kind != "data") {
      throw new Error(
        `expected an data as first argument of unIData, got ${dataValue?.toString()}`
      );
    }
    const data = dataValue.value;
    if (data.kind != "int") {
      throw new Error(
        `expected IntData as first argument of unIData, got ${data?.toString()}`
      );
    }
    return asCekValue(makeUplcInt(data.value));
  }
};

// node_modules/@helios-lang/uplc/src/builtins/v1/unListData.js
var unListData = {
  name: "unListData",
  forceCount: 0,
  nArgs: 1,
  cpuModel: (params) => makeArgSizesConstCost(params.get(159)),
  memModel: (params) => makeArgSizesConstCost(params.get(160)),
  call: (args, _ctx) => {
    const [dataValue] = asUplcValues(args);
    if (dataValue?.kind != "data") {
      throw new Error(
        `expected an data as first argument of unListData, got ${dataValue?.toString()}`
      );
    }
    const data = dataValue.value;
    if (data.kind != "list") {
      throw new Error(
        `expected ListData as first argument of unListData, got ${data?.toString()}`
      );
    }
    return asCekValue(
      makeUplcList({
        itemType: DATA_TYPE,
        items: data.items.map(makeUplcDataValue)
      })
    );
  }
};

// node_modules/@helios-lang/uplc/src/builtins/v1/unMapData.js
var unMapData = {
  name: "unMapData",
  forceCount: 0,
  nArgs: 1,
  cpuModel: (params) => makeArgSizesConstCost(params.get(161)),
  memModel: (params) => makeArgSizesConstCost(params.get(162)),
  call: (args, _ctx) => {
    const [dataValue] = asUplcValues(args);
    if (dataValue?.kind != "data") {
      throw new Error(
        `expected an data as first argument of unMapData, got ${dataValue?.toString()}`
      );
    }
    const data = dataValue.value;
    if (data.kind != "map") {
      throw new Error(
        `expected MapData as first argument of unMapData, got ${data?.toString()}`
      );
    }
    return asCekValue(
      makeUplcList({
        itemType: DATA_PAIR_TYPE,
        items: data.items.map(
          ([k, v]) => makeUplcPair({
            first: makeUplcDataValue(k),
            second: makeUplcDataValue(v)
          })
        )
      })
    );
  }
};

// node_modules/@helios-lang/uplc/src/builtins/v1/verifyEd25519Signature.js
var verifyEd25519Signature = {
  name: "verifyEd25519Signature",
  forceCount: 0,
  nArgs: 3,
  cpuModel: (params) => makeArgSizesThirdCost(params.get(164), params.get(163)),
  memModel: (params) => makeArgSizesConstCost(params.get(165)),
  call: (args, _ctx) => {
    const [publicKey, message, signature] = asUplcValues(args);
    if (publicKey?.kind != "bytes") {
      throw new Error(
        `expected a byte array for the first argument of verifyEd25519Signature, got ${publicKey?.toString()}`
      );
    }
    if (message?.kind != "bytes") {
      throw new Error(
        `expected a byte array for the second argument of verifyEd25519Signature, got ${message?.toString()}`
      );
    }
    if (signature?.kind != "bytes") {
      throw new Error(
        `expected a byte array for the third argument of verifyEd25519Signature, got ${signature?.toString()}`
      );
    }
    if (publicKey.bytes.length != 32) {
      throw new Error(
        `expected a publicKey length of 32 in verifyEd25519Signature, got a publicKey of length ${publicKey.bytes.length}`
      );
    }
    if (signature.bytes.length != 64) {
      throw new Error(
        `expected a signature length of 64 in verifyEd25519Signature, got a signature of length ${publicKey.bytes.length}`
      );
    }
    const b = Ed25519.verify(
      signature.bytes,
      message.bytes,
      publicKey.bytes
    );
    return asCekValue(makeUplcBool(b));
  }
};

// node_modules/@helios-lang/uplc/src/builtins/v1/index.js
var builtinsV1 = [
  addInteger,
  // 0
  subtractInteger,
  // 1
  multiplyInteger,
  // 2
  divideInteger,
  // 3
  quotientInteger,
  // 4
  remainderInteger,
  // 5
  modInteger,
  // 6
  equalsInteger,
  // 7
  lessThanInteger,
  // 8
  lessThanEqualsInteger,
  // 9
  appendByteString,
  // 10
  consByteString,
  // 11
  sliceByteString,
  // 12
  lengthOfByteString,
  // 13
  indexByteString,
  // 14
  equalsByteString,
  // 15
  lessThanByteString,
  // 16
  lessThanEqualsByteString,
  // 17
  sha2_2562,
  // 18
  sha3_2562,
  // 19
  blake2b_256,
  // 20
  verifyEd25519Signature,
  // 21
  appendStringV1,
  // 22
  equalsString,
  // 23
  encodeUtf82,
  // 24
  decodeUtf82,
  // 25
  ifThenElse,
  // 26
  chooseUnit,
  // 27
  trace,
  // 28
  fstPair,
  // 29
  sndPair,
  // 30
  chooseList,
  // 31
  mkCons,
  // 32
  headList,
  // 33
  tailList,
  // 34
  nullList,
  // 35
  chooseData,
  // 36
  constrData,
  // 37
  mapData,
  // 38
  listData,
  // 39
  iData,
  // 40
  bData,
  // 41
  unConstrData,
  // 42
  unMapData,
  // 43
  unListData,
  // 44
  unIData,
  // 45
  unBData,
  // 46
  equalsData,
  // 47
  mkPairData,
  // 48
  mkNilData,
  // 49
  mkNilPairData
  // 50
];
var builtinsV1Map = new Map(builtinsV1.map((bi) => [bi.name, bi]));

// node_modules/@helios-lang/uplc/src/builtins/v2/serialiseData.js
var serialiseData = {
  name: "serialiseData",
  forceCount: 0,
  nArgs: 1,
  cpuModel: (params) => makeArgSizesFirstCost(params.get(134), params.get(133)),
  memModel: (params) => makeArgSizesFirstCost(params.get(136), params.get(135)),
  call: (args, _ctx) => {
    const [a] = asUplcValues(args);
    if (a?.kind != "data") {
      throw new Error(
        `expected a data value for the first argument of serialiseData, got ${a?.toString()}`
      );
    }
    return asCekValue(makeUplcByteArray(a.value.toCbor()));
  }
};

// node_modules/@helios-lang/uplc/src/builtins/v2/sha2_256.js
var sha2_2563 = {
  ...sha2_2562,
  cpuModel: (params) => makeArgSizesFirstCost(params.get(138), params.get(137)),
  memModel: (params) => makeArgSizesConstCost(params.get(139))
};

// node_modules/@helios-lang/uplc/src/builtins/v2/sha3_256.js
var sha3_2563 = {
  ...sha3_2562,
  cpuModel: (params) => makeArgSizesFirstCost(params.get(141), params.get(140)),
  memModel: (params) => makeArgSizesConstCost(params.get(142))
};

// node_modules/@helios-lang/uplc/src/builtins/v2/sliceByteString.js
var sliceByteString2 = {
  ...sliceByteString,
  cpuModel: (params) => makeArgSizesThirdCost(params.get(144), params.get(143)),
  memModel: (params) => makeArgSizesThirdCost(params.get(146), params.get(145))
};

// node_modules/@helios-lang/uplc/src/builtins/v2/sndPair.js
var sndPair2 = {
  ...sndPair,
  cpuModel: (params) => makeArgSizesConstCost(params.get(147)),
  memModel: (params) => makeArgSizesConstCost(params.get(148))
};

// node_modules/@helios-lang/uplc/src/builtins/v2/subtractInteger.js
var subtractInteger2 = {
  ...subtractInteger,
  cpuModel: (params) => makeArgSizesMaxCost(params.get(150), params.get(149)),
  memModel: (params) => makeArgSizesMaxCost(params.get(152), params.get(151))
};

// node_modules/@helios-lang/uplc/src/builtins/v2/tailList.js
var tailList2 = {
  ...tailList,
  cpuModel: (params) => makeArgSizesConstCost(params.get(153)),
  memModel: (params) => makeArgSizesConstCost(params.get(154))
};

// node_modules/@helios-lang/uplc/src/builtins/v2/trace.js
var trace2 = {
  ...trace,
  cpuModel: (params) => makeArgSizesConstCost(params.get(155)),
  memModel: (params) => makeArgSizesConstCost(params.get(156))
};

// node_modules/@helios-lang/uplc/src/builtins/v2/unBData.js
var unBData2 = {
  ...unBData,
  cpuModel: (params) => makeArgSizesConstCost(params.get(157)),
  memModel: (params) => makeArgSizesConstCost(params.get(158))
};

// node_modules/@helios-lang/uplc/src/builtins/v2/unConstrData.js
var unConstrData2 = {
  ...unConstrData,
  cpuModel: (params) => makeArgSizesConstCost(params.get(159)),
  memModel: (params) => makeArgSizesConstCost(params.get(160))
};

// node_modules/@helios-lang/uplc/src/builtins/v2/unIData.js
var unIData2 = {
  ...unIData,
  cpuModel: (params) => makeArgSizesConstCost(params.get(161)),
  memModel: (params) => makeArgSizesConstCost(params.get(162))
};

// node_modules/@helios-lang/uplc/src/builtins/v2/unListData.js
var unListData2 = {
  ...unListData,
  cpuModel: (params) => makeArgSizesConstCost(params.get(163)),
  memModel: (params) => makeArgSizesConstCost(params.get(164))
};

// node_modules/@helios-lang/uplc/src/builtins/v2/unMapData.js
var unMapData2 = {
  ...unMapData,
  cpuModel: (params) => makeArgSizesConstCost(params.get(165)),
  memModel: (params) => makeArgSizesConstCost(params.get(166))
};

// node_modules/@helios-lang/uplc/src/builtins/v2/verifyEcdsaSecp256k1Signature.js
var verifyEcdsaSecp256k1Signature = {
  name: "verifyEcdsaSecp256k1Signature",
  forceCount: 0,
  nArgs: 3,
  cpuModel: (params) => makeArgSizesConstCost(params.get(167)),
  memModel: (params) => makeArgSizesConstCost(params.get(168)),
  call: (args, _ctx) => {
    const [publicKey, message, signature] = asUplcValues(args);
    if (publicKey?.kind != "bytes") {
      throw new Error(
        `expected a byte array for the first argument of verifyEcdsaSecp256k1Signature, got ${publicKey?.toString()}`
      );
    }
    if (message?.kind != "bytes") {
      throw new Error(
        `expected a byte array for the second argument of verifyEcdsaSecp256k1Signature, got ${message?.toString()}`
      );
    }
    if (signature?.kind != "bytes") {
      throw new Error(
        `expected a byte array for the third argument of verifyEcdsaSecp256k1Signature, got ${signature?.toString()}`
      );
    }
    if (publicKey.bytes.length != 33) {
      throw new Error(
        `expected a publicKey length of 32 in verifyEcdsaSecp256k1Signature, got a publicKey of length ${publicKey.bytes.length}`
      );
    }
    if (message.bytes.length != 32) {
      throw new Error(
        `expected a message length of 32 in verifyEcdsaSecp256k1Signature, got a message of length ${message.bytes.length}`
      );
    }
    if (signature.bytes.length != 64) {
      throw new Error(
        `expected a signature length of 64 in verifyEcdsaSecp256k1Signature, got a signature of length ${publicKey.bytes.length}`
      );
    }
    const b = ECDSASecp256k1.verify(
      signature.bytes,
      message.bytes,
      publicKey.bytes
    );
    return asCekValue(makeUplcBool(b));
  }
};

// node_modules/@helios-lang/uplc/src/builtins/v2/verifyEd25519Signature.js
var verifyEd25519Signature2 = {
  ...verifyEd25519Signature,
  cpuModel: (params) => makeArgSizesThirdCost(params.get(170), params.get(169)),
  memModel: (params) => makeArgSizesConstCost(params.get(171))
};

// node_modules/@helios-lang/uplc/src/builtins/v2/verifySchnorrSecp256k1Signature.js
var verifySchnorrSecp256k1Signature = {
  name: "verifySchnorrSecp256k1Signature",
  forceCount: 0,
  nArgs: 3,
  cpuModel: (params) => makeArgSizesThirdCost(params.get(173), params.get(172)),
  memModel: (params) => makeArgSizesConstCost(params.get(174)),
  call: (args, _ctx) => {
    const [publicKey, message, signature] = asUplcValues(args);
    if (publicKey?.kind != "bytes") {
      throw new Error(
        `expected a byte array for the first argument of verifySchnorrSecp256k1Signature, got ${publicKey?.toString()}`
      );
    }
    if (message?.kind != "bytes") {
      throw new Error(
        `expected a byte array for the second argument of verifySchnorrSecp256k1Signature, got ${message?.toString()}`
      );
    }
    if (signature?.kind != "bytes") {
      throw new Error(
        `expected a byte array for the third argument of verifySchnorrSecp256k1Signature, got ${signature?.toString()}`
      );
    }
    if (publicKey.bytes.length != 32) {
      throw new Error(
        `expected a publicKey length of 32 in verifySchnorrSecp256k1Signature, got a publicKey of length ${publicKey.bytes.length}`
      );
    }
    if (signature.bytes.length != 64) {
      throw new Error(
        `expected a signature length of 64 in verifySchnorrSecp256k1Signature, got a signature of length ${publicKey.bytes.length}`
      );
    }
    const b = SchnorrSecp256k1.verify(
      signature.bytes,
      message.bytes,
      publicKey.bytes
    );
    return asCekValue(makeUplcBool(b));
  }
};

// node_modules/@helios-lang/uplc/src/builtins/v2/index.js
var builtinsV2 = [
  addInteger,
  // 0
  subtractInteger2,
  // 1
  multiplyInteger,
  // 2
  divideInteger,
  // 3
  quotientInteger,
  // 4
  remainderInteger,
  // 5
  modInteger,
  // 6
  equalsInteger,
  // 7
  lessThanInteger,
  // 8
  lessThanEqualsInteger,
  // 9
  appendByteString,
  // 10
  consByteString,
  // 11
  sliceByteString2,
  // 12
  lengthOfByteString,
  // 13
  indexByteString,
  // 14
  equalsByteString,
  // 15
  lessThanByteString,
  // 16
  lessThanEqualsByteString,
  // 17
  sha2_2563,
  // 18
  sha3_2563,
  // 19
  blake2b_256,
  // 20
  verifyEd25519Signature2,
  // 21
  appendStringV1,
  // 22
  equalsString,
  // 23
  encodeUtf82,
  // 24
  decodeUtf82,
  // 25
  ifThenElse,
  // 26
  chooseUnit,
  // 27
  trace2,
  // 28
  fstPair,
  // 29
  sndPair2,
  // 30
  chooseList,
  // 31
  mkCons,
  // 32
  headList,
  // 33
  tailList2,
  // 34
  nullList,
  // 35
  chooseData,
  // 36
  constrData,
  // 37
  mapData,
  // 38
  listData,
  // 39
  iData,
  // 40
  bData,
  // 41
  unConstrData2,
  // 42
  unMapData2,
  // 43
  unListData2,
  // 44
  unIData2,
  // 45
  unBData2,
  // 46
  equalsData,
  // 47
  mkPairData,
  // 48
  mkNilData,
  // 49
  mkNilPairData,
  // 50
  serialiseData,
  // 51
  verifyEcdsaSecp256k1Signature,
  // 52
  verifySchnorrSecp256k1Signature
  // 53
];
var builtinsV2Map = new Map(builtinsV2.map((bi) => [bi.name, bi]));

// node_modules/@helios-lang/uplc/src/builtins/v3/blake2b_224.js
var blake2b_224 = {
  name: "blake2b_224",
  forceCount: 0,
  nArgs: 1,
  cpuModel: (params) => makeArgSizesFirstCost(params.get(239), params.get(238)),
  memModel: (params) => makeArgSizesConstCost(params.get(240)),
  call: (args, _ctx) => {
    const [a] = asUplcValues(args);
    if (a?.kind != "bytes") {
      throw new Error(
        `expected a byte array for the first argument of blake2b_224, got ${a?.toString()}`
      );
    }
    return asCekValue(makeUplcByteArray(blake2b(a.bytes, 28)));
  }
};

// node_modules/@helios-lang/uplc/src/builtins/v3/bls12_381_G1_add.js
var bls12_381_G1_add = {
  name: "bls12_381_G1_add",
  forceCount: 0,
  nArgs: 2,
  cpuModel: (params) => makeArgSizesConstCost(params.get(197)),
  memModel: (params) => makeArgSizesConstCost(params.get(198)),
  call: (args, _ctx) => {
    const [a, b] = asUplcValues(args);
    if (a?.kind != "bls12_381_G1_element") {
      throw new Error(
        `expected Bls12_381_G1_element for first arg of bls12_381_G1_add`
      );
    }
    if (b?.kind != "bls12_381_G1_element") {
      throw new Error(
        `expected Bls12_381_G1_element for second arg of bls12_381_G1_add`
      );
    }
    const res = projectedCurve1.add(a.point, b.point);
    return asCekValue(makeBls12_381_G1_element(res));
  }
};

// node_modules/@helios-lang/uplc/src/builtins/v3/bls12_381_G1_compress.js
var bls12_381_G1_compress = {
  name: "bls12_381_G1_compress",
  forceCount: 0,
  nArgs: 1,
  cpuModel: (params) => makeArgSizesConstCost(params.get(199)),
  memModel: (params) => makeArgSizesConstCost(params.get(200)),
  call: (args, _ctx) => {
    const [a] = asUplcValues(args);
    if (a?.kind != "bls12_381_G1_element") {
      throw new Error(
        `expected Bls12_381_G1_element for first arg of bls12_381_G1_compress`
      );
    }
    return asCekValue(makeUplcByteArray(a.compress()));
  }
};

// node_modules/@helios-lang/uplc/src/builtins/v3/bls12_381_G1_equal.js
var bls12_381_G1_equal = {
  name: "bls12_381_G1_equal",
  forceCount: 0,
  nArgs: 2,
  cpuModel: (params) => makeArgSizesConstCost(params.get(201)),
  memModel: (params) => makeArgSizesConstCost(params.get(202)),
  call: (args, _ctx) => {
    const [a, b] = asUplcValues(args);
    if (a?.kind != "bls12_381_G1_element") {
      throw new Error(
        `expected Bls12_381_G1_element for first arg of bls12_381_G1_equal`
      );
    }
    if (b?.kind != "bls12_381_G1_element") {
      throw new Error(
        `expected Bls12_381_G1_element for second arg of bls12_381_G1_equal`
      );
    }
    const res = projectedCurve1.equals(a.point, b.point);
    return asCekValue(makeUplcBool(res));
  }
};

// node_modules/@helios-lang/uplc/src/builtins/v3/bls12_381_G1_hashToGroup.js
var bls12_381_G1_hashToGroup = {
  name: "bls12_381_G1_hashToGroup",
  forceCount: 0,
  nArgs: 2,
  cpuModel: (params) => makeArgSizesFirstCost(params.get(204), params.get(203)),
  memModel: (params) => makeArgSizesConstCost(params.get(205)),
  call: (args, _ctx) => {
    const [a, b] = asUplcValues(args);
    if (a?.kind != "bytes") {
      throw new Error(
        `expected UplcByteArray for first arg of bls12_381_G1_hashToGroup`
      );
    }
    if (b?.kind != "bytes") {
      throw new Error(
        `expected UplcByteArray for second arg of bls12_381_G1_hashToGroup`
      );
    }
    const point = hashToG1(a.bytes, b.bytes);
    return asCekValue(makeBls12_381_G1_element(point));
  }
};

// node_modules/@helios-lang/uplc/src/builtins/v3/bls12_381_G1_neg.js
var bls12_381_G1_neg = {
  name: "bls12_381_G1_neg",
  forceCount: 0,
  nArgs: 1,
  cpuModel: (params) => makeArgSizesConstCost(params.get(206)),
  memModel: (params) => makeArgSizesConstCost(params.get(207)),
  call: (args, _ctx) => {
    const [a] = asUplcValues(args);
    if (a?.kind != "bls12_381_G1_element") {
      throw new Error(
        `expected Bls12_381_G1_element for first arg of bls12_381_G1_neg`
      );
    }
    return asCekValue(makeBls12_381_G1_element(projectedCurve1.negate(a.point)));
  }
};

// node_modules/@helios-lang/uplc/src/builtins/v3/bls12_381_G1_scalarMul.js
var bls12_381_G1_scalarMul = {
  name: "bls12_381_G1_scalarMul",
  forceCount: 0,
  nArgs: 2,
  cpuModel: (params) => makeArgSizesFirstCost(params.get(209), params.get(208)),
  memModel: (params) => makeArgSizesConstCost(params.get(210)),
  call: (args, _ctx) => {
    const [n, a] = asUplcValues(args);
    if (n?.kind != "int") {
      throw new Error(
        `expected UplcInt for first arg of bls12_381_G1_scalarMul`
      );
    }
    if (a?.kind != "bls12_381_G1_element") {
      throw new Error(
        `expected Bls12_381_G1_element for second arg of bls12_381_G1_scalarMul`
      );
    }
    return asCekValue(makeBls12_381_G1_element(projectedCurve1.scale(a.point, n.value)));
  }
};

// node_modules/@helios-lang/uplc/src/builtins/v3/bls12_381_G1_uncompress.js
var bls12_381_G1_uncompress = {
  name: "bls12_381_G1_uncompress",
  forceCount: 0,
  nArgs: 1,
  cpuModel: (params) => makeArgSizesConstCost(params.get(211)),
  memModel: (params) => makeArgSizesConstCost(params.get(212)),
  call: (args, _ctx) => {
    const [a] = asUplcValues(args);
    if (a?.kind != "bytes") {
      throw new Error(
        `expected UplcByteArray for first arg of bls12_381_G1_uncompress`
      );
    }
    const bytes = a.bytes;
    if (bytes.length != 48) {
      throw new Error(
        `expected ByteArray of length 48, got bytearray of length ${bytes.length}`
      );
    }
    return asCekValue(makeBls12_381_G1_element({ bytes: a.bytes }));
  }
};

// node_modules/@helios-lang/uplc/src/builtins/v3/bls12_381_G2_add.js
var bls12_381_G2_add = {
  name: "bls12_381_G2_add",
  forceCount: 0,
  nArgs: 2,
  cpuModel: (params) => makeArgSizesConstCost(params.get(213)),
  memModel: (params) => makeArgSizesConstCost(params.get(214)),
  call: (args, _ctx) => {
    const [a, b] = asUplcValues(args);
    if (a?.kind != "bls12_381_G2_element") {
      throw new Error(
        `expected Bls12_381_G2_element for first arg of bls12_381_G2_add`
      );
    }
    if (b?.kind != "bls12_381_G2_element") {
      throw new Error(
        `expected Bls12_381_G2_element for second arg of bls12_381_G2_add`
      );
    }
    const res = projectedCurve2.add(a.point, b.point);
    return asCekValue(makeBls12_381_G2_element(res));
  }
};

// node_modules/@helios-lang/uplc/src/builtins/v3/bls12_381_G2_compress.js
var bls12_381_G2_compress = {
  name: "bls12_381_G2_compress",
  forceCount: 0,
  nArgs: 1,
  cpuModel: (params) => makeArgSizesConstCost(params.get(215)),
  memModel: (params) => makeArgSizesConstCost(params.get(216)),
  call: (args, _ctx) => {
    const [a] = asUplcValues(args);
    if (a?.kind != "bls12_381_G2_element") {
      throw new Error(
        `expected Bls12_381_G2_element for first arg of bls12_381_G2_compress`
      );
    }
    return asCekValue(makeUplcByteArray(a.compress()));
  }
};

// node_modules/@helios-lang/uplc/src/builtins/v3/bls12_381_G2_equal.js
var bls12_381_G2_equal = {
  name: "bls12_381_G2_equal",
  forceCount: 0,
  nArgs: 2,
  cpuModel: (params) => makeArgSizesConstCost(params.get(217)),
  memModel: (params) => makeArgSizesConstCost(params.get(218)),
  call: (args, _ctx) => {
    const [a, b] = asUplcValues(args);
    if (a?.kind != "bls12_381_G2_element") {
      throw new Error(
        `expected Bls12_381_G2_element for first arg of bls12_381_G2_equal`
      );
    }
    if (b?.kind != "bls12_381_G2_element") {
      throw new Error(
        `expected Bls12_381_G2_element for second arg of bls12_381_G2_equal`
      );
    }
    const res = projectedCurve2.equals(a.point, b.point);
    return asCekValue(makeUplcBool(res));
  }
};

// node_modules/@helios-lang/uplc/src/builtins/v3/bls12_381_G2_hashToGroup.js
var bls12_381_G2_hashToGroup = {
  name: "bls12_381_G2_hashToGroup",
  forceCount: 0,
  nArgs: 2,
  cpuModel: (params) => makeArgSizesFirstCost(params.get(220), params.get(219)),
  memModel: (params) => makeArgSizesConstCost(params.get(221)),
  call: (args, _ctx) => {
    const [a, b] = asUplcValues(args);
    if (a?.kind != "bytes") {
      throw new Error(
        `expected UplcByteArray for first arg of bls12_381_G2_hashToGroup`
      );
    }
    if (b?.kind != "bytes") {
      throw new Error(
        `expected UplcByteArray for second arg of bls12_381_G2_hashToGroup`
      );
    }
    const point = hashToG2(a.bytes, b.bytes);
    return asCekValue(makeBls12_381_G2_element(point));
  }
};

// node_modules/@helios-lang/uplc/src/builtins/v3/bls12_381_G2_neg.js
var bls12_381_G2_neg = {
  name: "bls12_381_G2_neg",
  forceCount: 0,
  nArgs: 1,
  cpuModel: (params) => makeArgSizesConstCost(params.get(222)),
  memModel: (params) => makeArgSizesConstCost(params.get(223)),
  call: (args, _ctx) => {
    const [a] = asUplcValues(args);
    if (a?.kind != "bls12_381_G2_element") {
      throw new Error(
        `expected Bls12_381_G2_element for first arg of bls12_381_G2_neg`
      );
    }
    return asCekValue(makeBls12_381_G2_element(projectedCurve2.negate(a.point)));
  }
};

// node_modules/@helios-lang/uplc/src/builtins/v3/bls12_381_G2_scalarMul.js
var bls12_381_G2_scalarMul = {
  name: "bls12_381_G2_scalarMul",
  forceCount: 0,
  nArgs: 2,
  cpuModel: (params) => makeArgSizesFirstCost(params.get(225), params.get(224)),
  memModel: (params) => makeArgSizesConstCost(params.get(226)),
  call: (args, _ctx) => {
    const [n, a] = asUplcValues(args);
    if (n?.kind != "int") {
      throw new Error(
        `expected UplcInt for first arg of bls12_381_G2_scalarMul`
      );
    }
    if (a?.kind != "bls12_381_G2_element") {
      throw new Error(
        `expected Bls12_381_G2_element for second arg of bls12_381_G2_scalarMul`
      );
    }
    return asCekValue(makeBls12_381_G2_element(projectedCurve2.scale(a.point, n.value)));
  }
};

// node_modules/@helios-lang/uplc/src/builtins/v3/bls12_381_G2_uncompress.js
var bls12_381_G2_uncompress = {
  name: "bls12_381_G2_uncompress",
  forceCount: 0,
  nArgs: 1,
  cpuModel: (params) => makeArgSizesConstCost(params.get(227)),
  memModel: (params) => makeArgSizesConstCost(params.get(228)),
  call: (args, _ctx) => {
    const [a] = asUplcValues(args);
    if (a?.kind != "bytes") {
      throw new Error(
        `expected UplcByteArray for first arg of bls12_381_G2_uncompress`
      );
    }
    const bytes = a.bytes;
    if (bytes.length != 96) {
      throw new Error(
        `expected ByteArray of length 96, got bytearray of length ${bytes.length}`
      );
    }
    return asCekValue(makeBls12_381_G2_element({ bytes: a.bytes }));
  }
};

// node_modules/@helios-lang/uplc/src/builtins/v3/bls12_381_finalVerify.js
var bls12_381_finalVerify = {
  name: "bls12_381_finalVerify",
  forceCount: 0,
  nArgs: 2,
  cpuModel: (params) => makeArgSizesConstCost(params.get(229)),
  memModel: (params) => makeArgSizesConstCost(params.get(230)),
  call: (args, _ctx) => {
    const [a, b] = asUplcValues(args);
    if (a?.kind != "bls12_381_mlresult") {
      throw new Error(
        `expected Bls12_381_MlResult for first arg of bls12_381_finalVerify`
      );
    }
    if (b?.kind != "bls12_381_mlresult") {
      throw new Error(
        `expected Bls12_381_MlResult for second arg of bls12_381_finalVerify`
      );
    }
    const res = finalVerify(a.element, b.element);
    return asCekValue(makeUplcBool(res));
  }
};

// node_modules/@helios-lang/uplc/src/builtins/v3/bls12_381_millerLoop.js
var bls12_381_millerLoop = {
  name: "bls12_381_millerLoop",
  forceCount: 0,
  nArgs: 2,
  cpuModel: (params) => makeArgSizesConstCost(params.get(231)),
  memModel: (params) => makeArgSizesConstCost(params.get(232)),
  call: (args, _ctx) => {
    const [a, b] = asUplcValues(args);
    if (a?.kind != "bls12_381_G1_element") {
      throw new Error(
        `expected Bls12_381_G1_element for first arg of bls12_381_millerLoop`
      );
    }
    if (b?.kind != "bls12_381_G2_element") {
      throw new Error(
        `expected Bls12_381_G2_element for second arg of bls12_381_millerLoop`
      );
    }
    const elem = millerLoop(projectedCurve1.toAffine(a.point), projectedCurve2.toAffine(b.point));
    return asCekValue(makeBls12_381_MlResult(elem));
  }
};

// node_modules/@helios-lang/uplc/src/builtins/v3/bls12_381_mulMlResult.js
var bls12_381_mulMlResult = {
  name: "bls12_381_mulMlResult",
  forceCount: 0,
  nArgs: 2,
  cpuModel: (params) => makeArgSizesConstCost(params.get(233)),
  memModel: (params) => makeArgSizesConstCost(params.get(234)),
  call: (args, _ctx) => {
    const [a, b] = asUplcValues(args);
    if (a?.kind != "bls12_381_mlresult") {
      throw new Error(
        `expected Bls12_381_MlResult for first arg of bls12_381_mulMlResult`
      );
    }
    if (b?.kind != "bls12_381_mlresult") {
      throw new Error(
        `expected Bls12_381_MlResult for second arg of bls12_381_mulMlResult`
      );
    }
    const res = F12.multiply(a.element, b.element);
    return asCekValue(makeBls12_381_MlResult(res));
  }
};

// node_modules/@helios-lang/uplc/src/builtins/v3/byteStringToInteger.js
var byteStringToInteger = {
  name: "byteStringToInteger",
  forceCount: 0,
  nArgs: 2,
  cpuModel: (params) => makeArgSizesQuadYCost({
    c0: params.get(246),
    c1: params.get(247),
    c2: params.get(248)
  }),
  memModel: (params) => makeArgSizesSecondCost(params.get(250), params.get(249)),
  call: (args, _ctx) => {
    const [a, b] = asUplcValues(args);
    if (a?.kind != "bool") {
      throw new Error(
        `expected UplcBool for first arg of byteStringToInteger`
      );
    }
    if (b?.kind != "bytes") {
      throw new Error(
        `expected UplcByteArray for second arg of byteStringToInteger`
      );
    }
    const res = a.value ? decodeIntBE(b.bytes) : decodeIntLE(b.bytes);
    return asCekValue(makeUplcInt(res));
  }
};

// node_modules/@helios-lang/uplc/src/builtins/v3/divideInteger.js
var divideInteger2 = {
  ...divideInteger,
  cpuModel: (params) => makeArgSizesQuadXYCost(params.get(49), params.get(56), {
    c00: params.get(50),
    c01: params.get(51),
    c02: params.get(52),
    c10: params.get(53),
    c11: params.get(54),
    c20: params.get(55)
  }),
  memModel: (params) => makeArgSizesDiffCost(params.get(59), params.get(57), params.get(58))
};

// node_modules/@helios-lang/uplc/src/builtins/v3/encodeUtf8.js
var encodeUtf83 = {
  ...encodeUtf82,
  cpuModel: (params) => makeArgSizesFirstCost(params.get(61), params.get(60)),
  memModel: (params) => makeArgSizesFirstCost(params.get(63), params.get(62))
};

// node_modules/@helios-lang/uplc/src/builtins/v3/equalsByteString.js
var equalsByteString2 = {
  ...equalsByteString,
  cpuModel: (params) => makeArgSizesDiagCost(params.get(66), params.get(65), params.get(64)),
  memModel: (params) => makeArgSizesConstCost(params.get(67))
};

// node_modules/@helios-lang/uplc/src/builtins/v3/equalsData.js
var equalsData2 = {
  ...equalsData,
  cpuModel: (params) => makeArgSizesMinCost(params.get(69), params.get(68)),
  memModel: (params) => makeArgSizesConstCost(params.get(70))
};

// node_modules/@helios-lang/uplc/src/builtins/v3/equalsInteger.js
var equalsInteger2 = {
  ...equalsInteger,
  cpuModel: (params) => makeArgSizesMinCost(params.get(72), params.get(71)),
  memModel: (params) => makeArgSizesConstCost(params.get(73))
};

// node_modules/@helios-lang/uplc/src/builtins/v3/equalsString.js
var equalsString2 = {
  ...equalsString,
  cpuModel: (params) => makeArgSizesDiagCost(params.get(76), params.get(75), params.get(74)),
  memModel: (params) => makeArgSizesConstCost(params.get(77))
};

// node_modules/@helios-lang/uplc/src/builtins/v3/fstPair.js
var fstPair2 = {
  ...fstPair,
  cpuModel: (params) => makeArgSizesConstCost(params.get(78)),
  memModel: (params) => makeArgSizesConstCost(params.get(79))
};

// node_modules/@helios-lang/uplc/src/builtins/v3/headList.js
var headList2 = {
  ...headList,
  cpuModel: (params) => makeArgSizesConstCost(params.get(80)),
  memModel: (params) => makeArgSizesConstCost(params.get(81))
};

// node_modules/@helios-lang/uplc/src/builtins/v3/iData.js
var iData2 = {
  ...iData,
  cpuModel: (params) => makeArgSizesConstCost(params.get(82)),
  memModel: (params) => makeArgSizesConstCost(params.get(83))
};

// node_modules/@helios-lang/uplc/src/builtins/v3/ifThenElse.js
var ifThenElse2 = {
  ...ifThenElse,
  cpuModel: (params) => makeArgSizesConstCost(params.get(84)),
  memModel: (params) => makeArgSizesConstCost(params.get(85))
};

// node_modules/@helios-lang/uplc/src/builtins/v3/indexByteString.js
var indexByteString2 = {
  ...indexByteString,
  cpuModel: (params) => makeArgSizesConstCost(params.get(86)),
  memModel: (params) => makeArgSizesConstCost(params.get(87))
};

// node_modules/@helios-lang/uplc/src/builtins/v3/integerToByteString.js
var integerToByteString = {
  name: "integerToByteString",
  forceCount: 0,
  nArgs: 3,
  cpuModel: (params) => makeArgSizesQuadZCost({
    c0: params.get(241),
    c1: params.get(242),
    c2: params.get(243)
  }),
  memModel: (params) => makeArgSizesLiteralYOrLinearZCost(params.get(245), params.get(244)),
  call: (args, _ctx) => {
    const [a, b, c] = asUplcValues(args);
    if (a?.kind != "bool") {
      throw new Error(
        `expected UplcBool for first arg of integerToByteString`
      );
    }
    if (b?.kind != "int") {
      throw new Error(
        `expected UplcInt for second arg of integerToByteString`
      );
    }
    if (c?.kind != "int") {
      throw new Error(
        `expected UplcInt for third arg of integerToByteString`
      );
    }
    const w = Number(b.value);
    if (w < 0 || w >= 8192) {
      throw new Error(
        `second arg of integerToByteString out of range, expected w >= 0 && w < 8192 `
      );
    }
    if (c.value < 0) {
      throw new Error(
        `third arg of integerToByteString is negative (got ${c.value})`
      );
    }
    let bytes = encodeIntBE(c.value);
    encodeIntLE32;
    if (a.value) {
      if (w != 0 && bytes.length != w) {
        if (bytes.length > w) {
          throw new Error(
            `result of integerToByteString doesn't fit in ${w} bytes (need at least ${bytes.length} bytes)`
          );
        } else {
          bytes = prepadBytes(bytes, w);
        }
      }
    } else {
      bytes.reverse();
      if (w != 0 && bytes.length != w) {
        if (bytes.length > w) {
          throw new Error(
            `result of integerToByteString doesn't fit in ${w} bytes (need at least ${bytes.length} bytes)`
          );
        } else {
          bytes = padBytes(bytes, w);
        }
      }
    }
    return asCekValue(makeUplcByteArray(bytes));
  }
};

// node_modules/@helios-lang/uplc/src/builtins/v3/keccak_256.js
var keccak_2562 = {
  name: "keccak_256",
  forceCount: 0,
  nArgs: 1,
  cpuModel: (params) => makeArgSizesFirstCost(params.get(236), params.get(235)),
  memModel: (params) => makeArgSizesConstCost(params.get(237)),
  call: (args, _ctx) => {
    const [a] = asUplcValues(args);
    if (a?.kind != "bytes") {
      throw new Error(
        `expected a byte array for the first argument of keccak_256, got ${a?.toString()}`
      );
    }
    return asCekValue(makeUplcByteArray(keccak_256(a.bytes)));
  }
};

// node_modules/@helios-lang/uplc/src/builtins/v3/lengthOfByteString.js
var lengthOfByteString2 = {
  ...lengthOfByteString,
  cpuModel: (params) => makeArgSizesConstCost(params.get(88)),
  memModel: (params) => makeArgSizesConstCost(params.get(89))
};

// node_modules/@helios-lang/uplc/src/builtins/v3/lessThanByteString.js
var lessThanByteString2 = {
  ...lessThanByteString,
  cpuModel: (params) => makeArgSizesMinCost(params.get(91), params.get(90)),
  memModel: (params) => makeArgSizesConstCost(params.get(92))
};

// node_modules/@helios-lang/uplc/src/builtins/v3/lessThanEqualsByteString.js
var lessThanEqualsByteString2 = {
  ...lessThanEqualsByteString,
  cpuModel: (params) => makeArgSizesMinCost(params.get(94), params.get(93)),
  memModel: (params) => makeArgSizesConstCost(params.get(95))
};

// node_modules/@helios-lang/uplc/src/builtins/v3/lessThanEqualsInteger.js
var lessThanEqualsInteger2 = {
  ...lessThanEqualsInteger,
  cpuModel: (params) => makeArgSizesMinCost(params.get(97), params.get(96)),
  memModel: (params) => makeArgSizesConstCost(params.get(98))
};

// node_modules/@helios-lang/uplc/src/builtins/v3/lessThanInteger.js
var lessThanInteger2 = {
  ...lessThanInteger,
  cpuModel: (params) => makeArgSizesMinCost(params.get(100), params.get(99)),
  memModel: (params) => makeArgSizesConstCost(params.get(101))
};

// node_modules/@helios-lang/uplc/src/builtins/v3/listData.js
var listData2 = {
  ...listData,
  cpuModel: (params) => makeArgSizesConstCost(params.get(102)),
  memModel: (params) => makeArgSizesConstCost(params.get(103))
};

// node_modules/@helios-lang/uplc/src/builtins/v3/mapData.js
var mapData2 = {
  ...mapData,
  cpuModel: (params) => makeArgSizesConstCost(params.get(104)),
  memModel: (params) => makeArgSizesConstCost(params.get(105))
};

// node_modules/@helios-lang/uplc/src/builtins/v3/mkCons.js
var mkCons2 = {
  ...mkCons,
  cpuModel: (params) => makeArgSizesConstCost(params.get(106)),
  memModel: (params) => makeArgSizesConstCost(params.get(107))
};

// node_modules/@helios-lang/uplc/src/builtins/v3/mkNilData.js
var mkNilData2 = {
  ...mkNilData,
  cpuModel: (params) => makeArgSizesConstCost(params.get(108)),
  memModel: (params) => makeArgSizesConstCost(params.get(109))
};

// node_modules/@helios-lang/uplc/src/builtins/v3/mkNilPairData.js
var mkNilPairData2 = {
  ...mkNilPairData,
  cpuModel: (params) => makeArgSizesConstCost(params.get(110)),
  memModel: (params) => makeArgSizesConstCost(params.get(111))
};

// node_modules/@helios-lang/uplc/src/builtins/v3/mkPairData.js
var mkPairData2 = {
  ...mkPairData,
  cpuModel: (params) => makeArgSizesConstCost(params.get(112)),
  memModel: (params) => makeArgSizesConstCost(params.get(113))
};

// node_modules/@helios-lang/uplc/src/builtins/v3/modInteger.js
var modInteger2 = {
  ...modInteger,
  cpuModel: (params) => makeArgSizesQuadXYCost(params.get(114), params.get(121), {
    c00: params.get(115),
    c01: params.get(116),
    c02: params.get(117),
    c10: params.get(118),
    c11: params.get(119),
    c20: params.get(120)
  }),
  memModel: (params) => makeArgSizesSecondCost(params.get(123), params.get(122))
};

// node_modules/@helios-lang/uplc/src/builtins/v3/multiplyInteger.js
var multiplyInteger2 = {
  ...multiplyInteger,
  cpuModel: (params) => makeArgSizesSumCost(params.get(125), params.get(124)),
  memModel: (params) => makeArgSizesSumCost(params.get(127), params.get(126))
};

// node_modules/@helios-lang/uplc/src/builtins/v3/nullList.js
var nullList2 = {
  ...nullList,
  cpuModel: (params) => makeArgSizesConstCost(params.get(128)),
  memModel: (params) => makeArgSizesConstCost(params.get(129))
};

// node_modules/@helios-lang/uplc/src/builtins/v3/quotientInteger.js
var quotientInteger2 = {
  ...quotientInteger,
  cpuModel: (params) => makeArgSizesQuadXYCost(params.get(130), params.get(137), {
    c00: params.get(131),
    c01: params.get(132),
    c02: params.get(133),
    c10: params.get(134),
    c11: params.get(135),
    c20: params.get(136)
  }),
  memModel: (params) => makeArgSizesDiffCost(params.get(140), params.get(138), params.get(139))
};

// node_modules/@helios-lang/uplc/src/builtins/v3/remainderInteger.js
var remainderInteger2 = {
  ...remainderInteger,
  cpuModel: (params) => makeArgSizesQuadXYCost(params.get(141), params.get(148), {
    c00: params.get(142),
    c01: params.get(143),
    c02: params.get(144),
    c10: params.get(145),
    c11: params.get(146),
    c20: params.get(147)
  }),
  memModel: (params) => makeArgSizesSecondCost(params.get(150), params.get(149))
};

// node_modules/@helios-lang/uplc/src/builtins/v3/serialiseData.js
var serialiseData2 = {
  ...serialiseData,
  cpuModel: (params) => makeArgSizesFirstCost(params.get(152), params.get(151)),
  memModel: (params) => makeArgSizesFirstCost(params.get(154), params.get(153))
};

// node_modules/@helios-lang/uplc/src/builtins/v3/sha2_256.js
var sha2_2564 = {
  ...sha2_2562,
  cpuModel: (params) => makeArgSizesFirstCost(params.get(156), params.get(155)),
  memModel: (params) => makeArgSizesConstCost(params.get(157))
};

// node_modules/@helios-lang/uplc/src/builtins/v3/sha3_256.js
var sha3_2564 = {
  ...sha3_2562,
  cpuModel: (params) => makeArgSizesFirstCost(params.get(159), params.get(158)),
  memModel: (params) => makeArgSizesConstCost(params.get(160))
};

// node_modules/@helios-lang/uplc/src/builtins/v3/sliceByteString.js
var sliceByteString3 = {
  ...sliceByteString,
  cpuModel: (params) => makeArgSizesThirdCost(params.get(162), params.get(161)),
  memModel: (params) => makeArgSizesThirdCost(params.get(164), params.get(163))
};

// node_modules/@helios-lang/uplc/src/builtins/v3/sndPair.js
var sndPair3 = {
  ...sndPair,
  cpuModel: (params) => makeArgSizesConstCost(params.get(165)),
  memModel: (params) => makeArgSizesConstCost(params.get(166))
};

// node_modules/@helios-lang/uplc/src/builtins/v3/subtractInteger.js
var subtractInteger3 = {
  ...subtractInteger,
  cpuModel: (params) => makeArgSizesMaxCost(params.get(168), params.get(167)),
  memModel: (params) => makeArgSizesMaxCost(params.get(170), params.get(169))
};

// node_modules/@helios-lang/uplc/src/builtins/v3/tailList.js
var tailList3 = {
  ...tailList,
  cpuModel: (params) => makeArgSizesConstCost(params.get(171)),
  memModel: (params) => makeArgSizesConstCost(params.get(172))
};

// node_modules/@helios-lang/uplc/src/builtins/v3/trace.js
var trace3 = {
  ...trace,
  cpuModel: (params) => makeArgSizesConstCost(params.get(173)),
  memModel: (params) => makeArgSizesConstCost(params.get(174))
};

// node_modules/@helios-lang/uplc/src/builtins/v3/unBData.js
var unBData3 = {
  ...unBData,
  cpuModel: (params) => makeArgSizesConstCost(params.get(175)),
  memModel: (params) => makeArgSizesConstCost(params.get(176))
};

// node_modules/@helios-lang/uplc/src/builtins/v3/unConstrData.js
var unConstrData3 = {
  ...unConstrData,
  cpuModel: (params) => makeArgSizesConstCost(params.get(177)),
  memModel: (params) => makeArgSizesConstCost(params.get(178))
};

// node_modules/@helios-lang/uplc/src/builtins/v3/unIData.js
var unIData3 = {
  ...unIData,
  cpuModel: (params) => makeArgSizesConstCost(params.get(179)),
  memModel: (params) => makeArgSizesConstCost(params.get(180))
};

// node_modules/@helios-lang/uplc/src/builtins/v3/unListData.js
var unListData3 = {
  ...unListData,
  cpuModel: (params) => makeArgSizesConstCost(params.get(181)),
  memModel: (params) => makeArgSizesConstCost(params.get(182))
};

// node_modules/@helios-lang/uplc/src/builtins/v3/unMapData.js
var unMapData3 = {
  ...unMapData,
  cpuModel: (params) => makeArgSizesConstCost(params.get(183)),
  memModel: (params) => makeArgSizesConstCost(params.get(184))
};

// node_modules/@helios-lang/uplc/src/builtins/v3/verifyEcdsaSecp256k1Signature.js
var verifyEcdsaSecp256k1Signature2 = {
  ...verifyEcdsaSecp256k1Signature,
  cpuModel: (params) => makeArgSizesConstCost(params.get(185)),
  memModel: (params) => makeArgSizesConstCost(params.get(186))
};

// node_modules/@helios-lang/uplc/src/builtins/v3/verifyEd25519Signature.js
var verifyEd25519Signature3 = {
  ...verifyEd25519Signature,
  cpuModel: (params) => makeArgSizesThirdCost(params.get(188), params.get(187)),
  memModel: (params) => makeArgSizesConstCost(params.get(189))
};

// node_modules/@helios-lang/uplc/src/builtins/v3/verifySchnorrSecp256k1Signature.js
var verifySchnorrSecp256k1Signature2 = {
  ...verifySchnorrSecp256k1Signature,
  cpuModel: (params) => makeArgSizesThirdCost(params.get(191), params.get(190)),
  memModel: (params) => makeArgSizesConstCost(params.get(192))
};

// node_modules/@helios-lang/uplc/src/builtins/v3/index.js
var builtinsV3 = [
  addInteger,
  // 0
  subtractInteger3,
  // 1
  multiplyInteger2,
  // 2
  divideInteger2,
  // 3
  quotientInteger2,
  // 4
  remainderInteger2,
  // 5
  modInteger2,
  // 6
  equalsInteger2,
  // 7
  lessThanInteger2,
  // 8
  lessThanEqualsInteger2,
  // 9
  appendByteString,
  // 10
  consByteString,
  // 11
  sliceByteString3,
  // 12
  lengthOfByteString2,
  // 13
  indexByteString2,
  // 14
  equalsByteString2,
  // 15
  lessThanByteString2,
  // 16
  lessThanEqualsByteString2,
  // 17
  sha2_2564,
  // 18
  sha3_2564,
  // 19
  blake2b_256,
  // 20
  verifyEd25519Signature3,
  // 21
  appendStringV1,
  // 22
  equalsString2,
  // 23
  encodeUtf83,
  // 24
  decodeUtf82,
  // 25
  ifThenElse2,
  // 26
  chooseUnit,
  // 27
  trace3,
  // 28
  fstPair2,
  // 29
  sndPair3,
  // 30
  chooseList,
  // 31
  mkCons2,
  // 32
  headList2,
  // 33
  tailList3,
  // 34
  nullList2,
  // 35
  chooseData,
  // 36
  constrData,
  // 37
  mapData2,
  // 38
  listData2,
  // 39
  iData2,
  // 40
  bData,
  // 41
  unConstrData3,
  // 42
  unMapData3,
  // 43
  unListData3,
  // 44
  unIData3,
  // 45
  unBData3,
  // 46
  equalsData2,
  // 47
  mkPairData2,
  // 48
  mkNilData2,
  // 49
  mkNilPairData2,
  // 50
  serialiseData2,
  // 51
  verifyEcdsaSecp256k1Signature2,
  // 52
  verifySchnorrSecp256k1Signature2,
  // 53
  bls12_381_G1_add,
  // 54
  bls12_381_G1_neg,
  // 55
  bls12_381_G1_scalarMul,
  // 56
  bls12_381_G1_equal,
  // 57
  bls12_381_G1_compress,
  // 58
  bls12_381_G1_uncompress,
  // 59
  bls12_381_G1_hashToGroup,
  // 60
  bls12_381_G2_add,
  // 61
  bls12_381_G2_neg,
  // 62
  bls12_381_G2_scalarMul,
  // 63
  bls12_381_G2_equal,
  // 64
  bls12_381_G2_compress,
  // 65
  bls12_381_G2_uncompress,
  // 66
  bls12_381_G2_hashToGroup,
  // 67
  bls12_381_millerLoop,
  // 68
  bls12_381_mulMlResult,
  // 69
  bls12_381_finalVerify,
  // 70
  keccak_2562,
  // 71
  blake2b_224,
  // 72
  integerToByteString,
  // 73
  byteStringToInteger
  // 74
];
var builtinsV3Map = new Map(builtinsV3.map((bi) => [bi.name, bi]));

// node_modules/@helios-lang/uplc/src/cek/CekValue.js
function stringifyNonUplcValue(value, simplify = false) {
  if ("value" in value) {
    return value.value;
  } else if ("delay" in value) {
    if (simplify) {
      return "<fn>";
    } else {
      return `(delay ${value.delay.term.toString()})`;
    }
  } else if ("builtin" in value) {
    return value.builtin.name;
  } else {
    const props = value.lambda;
    if (simplify) {
      return "<fn>";
    } else {
      return `(lam ${props.argName ? `${props.argName} ` : ""}${props.term.toString()})`;
    }
  }
}
function stringifyCekValue(value, simplify = false) {
  const s = stringifyNonUplcValue(value, simplify);
  if (typeof s == "string") {
    return s;
  } else {
    return s.toString();
  }
}

// node_modules/@helios-lang/uplc/src/cek/CekMachine.js
var CekMachine = class {
  /**
   * @readonly
   * @type {Builtin[]}
   */
  builtins;
  /**
   * @readonly
   * @type {CostTracker}
   */
  cost;
  /**
   * @private
   * @readonly
   * @type {CekFrame[]}
   */
  _frames;
  /**
   * @private
   * @type {CekState}
   */
  _state;
  /**
   * @private
   * @type {{message: string, site?: Site}[]}     *
   */
  _logs;
  /**
   * @type {UplcLogger | undefined}
   */
  diagnostics;
  /**
   * Initializes in computing state
   * @param {CekTerm} term
   * @param {Builtin[]} builtins
   * @param {CostModel} costModel
   * @param {UplcLogger} [diagnostics]
   */
  constructor(term, builtins, costModel, diagnostics) {
    this.builtins = builtins;
    this.cost = makeCostTracker(costModel);
    this._frames = [];
    this._logs = [];
    this.diagnostics = diagnostics;
    this._state = {
      computing: {
        term,
        stack: {
          values: [],
          callSites: []
        }
      }
    };
  }
  /**
   * @returns {string | undefined}
   */
  popLastMessage() {
    return this._logs.pop()?.message;
  }
  /**
   * @param {number} id
   * @returns {Builtin | undefined}
   */
  getBuiltin(id) {
    return this.builtins[id];
  }
  /**
   * @returns {CekResult}
   */
  eval() {
    this.cost.incrStartupCost();
    while (true) {
      if ("computing" in this._state) {
        const { term, stack } = this._state.computing;
        const { state: newState, frame: newFrame } = term.compute(
          stack,
          this
        );
        this._state = newState;
        if (newFrame) {
          this._frames.push(newFrame);
        }
      } else if ("reducing" in this._state) {
        const f = this._frames.pop();
        if (f) {
          const { state: newState, frame: newFrame } = f.reduce(
            this._state.reducing,
            this
          );
          this._state = newState;
          if (newFrame) {
            this._frames.push(newFrame);
          }
        } else {
          return this.returnValue(
            stringifyNonUplcValue(this._state.reducing)
          );
        }
      } else if ("error" in this._state) {
        return this.returnError(this._state.error);
      }
    }
  }
  /**
   * @private
   * @param {{message: string, stack: CekStack}} err
   * @returns {CekResult}
   */
  returnError(err) {
    return {
      result: {
        left: {
          error: err.message,
          callSites: err.stack.callSites
        }
      },
      cost: {
        mem: this.cost.mem,
        cpu: this.cost.cpu
      },
      logs: this._logs,
      breakdown: this.cost.breakdown
    };
  }
  /**
   * @private
   * @param {string | UplcValue} value
   * @returns {CekResult}
   */
  returnValue(value) {
    return {
      result: {
        right: value
      },
      cost: {
        mem: this.cost.mem,
        cpu: this.cost.cpu
      },
      logs: this._logs,
      breakdown: this.cost.breakdown
    };
  }
  /**
   * @param {string} message
   * @param {Site | undefined} site
   */
  print(message, site = void 0) {
    this._logs.push({ message, site: site ?? void 0 });
    this.diagnostics?.logPrint(message, site);
  }
};

// node_modules/@helios-lang/uplc/src/cek/CallSiteInfo.js
function isEmptyCallSiteInfo(info) {
  return !info || !info.site && !info.functionName && !info.arguments;
}
function isNonEmptyCallSiteInfo(info) {
  return !isEmptyCallSiteInfo(info);
}

// node_modules/@helios-lang/uplc/src/cek/CekStack.js
function pushStackCallSite(stack, callSite) {
  if (isNonEmptyCallSiteInfo(callSite)) {
    return {
      values: stack.values,
      callSites: stack.callSites.concat([callSite])
    };
  } else {
    return stack;
  }
}
function pushStackCallSites(stack, ...callSites) {
  return {
    values: stack.values,
    callSites: stack.callSites.concat(
      callSites.filter(isNonEmptyCallSiteInfo)
    )
  };
}
function pushStackValueAndCallSite(stack, value, callSite) {
  return {
    values: stack.values.concat([value]),
    callSites: stack.callSites.concat(
      isNonEmptyCallSiteInfo(callSite) ? [callSite] : []
    )
  };
}
function mixStacks(stackWithValues, stackWithCallSites) {
  return {
    values: stackWithValues.values,
    callSites: stackWithCallSites.callSites
  };
}
function getLastSelfValue(stack) {
  const last = stack.values[stack.values.length - 1];
  if (last?.name == "self") {
    return last;
  } else {
    return void 0;
  }
}

// node_modules/@helios-lang/uplc/src/cek/ForceFrame.js
function makeForceFrame(stack, callSite) {
  return new ForceFrameImpl(stack, callSite);
}
var ForceFrameImpl = class {
  /**
   * Used for the parent callsites
   * @readonly
   * @type {CekStack}
   */
  stack;
  /**
   * @private
   * @readonly
   * @type {Site | undefined}
   */
  _callSite;
  /**
   * @param {CekStack} stack
   * @param {Site | undefined} callSite
   */
  constructor(stack, callSite) {
    this.stack = stack;
    this._callSite = callSite;
  }
  /**
   * @param {CekValue} value
   * @param {CekContext} ctx
   * @returns {CekStateChange}
   */
  reduce(value, ctx) {
    if ("delay" in value) {
      const delay = value.delay;
      const lastSelfValue = getLastSelfValue(delay.stack);
      return {
        state: {
          computing: {
            term: delay.term,
            stack: mixStacks(
              delay.stack,
              pushStackCallSite(this.stack, {
                site: this._callSite ?? void 0,
                functionName: value.name,
                arguments: lastSelfValue ? [lastSelfValue] : void 0
              })
            )
          }
        }
      };
    } else if ("builtin" in value) {
      const b = ctx.getBuiltin(value.builtin.id);
      if (!b) {
        return {
          state: {
            error: {
              message: `builtin ${value.builtin.id} not found`,
              stack: this.stack
            }
          }
        };
      } else if (value.builtin.forceCount >= b.forceCount) {
        return {
          state: {
            error: {
              message: `too many forces for builtin ${b.name}, ${value.builtin.forceCount + 1} > ${b.forceCount}`,
              stack: this.stack
            }
          }
        };
      } else {
        return {
          state: {
            reducing: {
              builtin: {
                ...value.builtin,
                forceCount: value.builtin.forceCount + 1
              }
            }
          }
        };
      }
    } else {
      return {
        state: {
          error: {
            message: "expected delayed or builtin value for force",
            stack: this.stack
          }
        }
      };
    }
  }
};

// node_modules/@helios-lang/uplc/src/cek/BuiltinCallFrame.js
function makeBuiltinCallFrame(id, name, args, stack, callSite) {
  return new BuiltinCallFrameImpl(id, name, args, stack, callSite);
}
var BuiltinCallFrameImpl = class {
  /**
   * @readonly
   * @type {number}
   */
  id;
  /**
   * @readonly
   * @type {string}
   */
  name;
  /**
   * @readonly
   * @type {CekValue[]}
   */
  args;
  /**
   * @readonly
   * @type {CekStack}
   */
  stack;
  /**
   * @private
   * @readonly
   * @type {Site | undefined}
   */
  _callSite;
  /**
   * @param {number} id
   * @param {string} name
   * @param {CekValue[]} args
   * @param {CekStack} stack
   * @param {Site | undefined} callSite
   */
  constructor(id, name, args, stack, callSite) {
    this.id = id;
    this.name = name;
    this.args = args;
    this.stack = stack;
    this._callSite = callSite;
  }
  /**
   * @param {CekValue} value
   * @param {CekContext} ctx
   * @returns {CekStateChange}
   */
  reduce(value, ctx) {
    const b = ctx.getBuiltin(this.id);
    if (!b) {
      return {
        state: {
          error: {
            message: `builtin ${this.name} (${this.id}) not found`,
            stack: this.stack
          }
        }
      };
    } else if (this.args.length < b.nArgs - 1) {
      return {
        state: {
          reducing: {
            builtin: {
              id: this.id,
              name: this.name,
              forceCount: b.forceCount,
              args: this.args.concat([value])
            }
          }
        }
      };
    } else {
      const args = this.args.concat([value]);
      ctx.cost.incrArgSizesCost(
        b.name,
        args.map((a) => {
          if ("value" in a) {
            return BigInt(a.value.memSize);
          } else {
            return 1n;
          }
        })
      );
      const callSites = args.map((a, i) => {
        if (i == args.length - 1) {
          return {
            site: this._callSite,
            functionName: b.name,
            argument: a
          };
        } else {
          return {
            argument: a
          };
        }
      });
      try {
        return {
          state: {
            reducing: b.call(args, {
              print: (message) => {
                ctx.print(message, this._callSite);
              }
            })
          }
        };
      } catch (e) {
        return {
          state: {
            error: {
              message: e.message,
              stack: pushStackCallSites(this.stack, ...callSites)
            }
          }
        };
      }
    }
  }
};

// node_modules/@helios-lang/uplc/src/cek/LambdaCallFrame.js
function makeLambdaCallFrame(term, stack, info = {}) {
  return new LambdaCallFrameImpl(term, stack, info);
}
var LambdaCallFrameImpl = class {
  /**
   * @readonly
   * @type {CekTerm}
   */
  term;
  /**
   * @readonly
   * @type {CekStack}
   */
  stack;
  /**
   * @private
   * @readonly
   * @type {LambdaCallFrameInfo}
   */
  _info;
  /**
   * @param {CekTerm} term - function body
   * @param {CekStack} stack
   * @param {LambdaCallFrameInfo} info
   */
  constructor(term, stack, info = {}) {
    this.term = term;
    this.stack = stack;
    this._info = info;
  }
  /**
   * @param {CekValue} value - arg value
   * @returns {CekStateChange}
   */
  reduce(value) {
    if (this._info.argName) {
      value = {
        ...value,
        name: this._info.argName
      };
    }
    const lastSelfValue = getLastSelfValue(this.stack);
    const callSite = {
      site: this._info.callSite ?? void 0,
      functionName: this._info.name ?? void 0,
      arguments: lastSelfValue ? [lastSelfValue, value] : [value]
    };
    return {
      state: {
        computing: {
          term: this.term,
          stack: pushStackValueAndCallSite(
            this.stack,
            value,
            callSite
          )
        }
      }
    };
  }
};

// node_modules/@helios-lang/uplc/src/cek/PreCallFrame.js
function makePreCallFrame(arg, stack, callSite) {
  return new PreCallFrameImpl(arg, stack, callSite);
}
var PreCallFrameImpl = class {
  /**
   * @private
   * @readonly
   * @type {CekTerm}
   */
  _arg;
  /**
   * @private
   * @readonly
   * @type {CekStack}
   */
  _stack;
  /**
   * @private
   * @readonly
   * @type {Site | undefined}
   */
  _callSite;
  /**
   * @param {CekTerm} arg
   * @param {CekStack} stack
   * @param {Site | undefined} callSite
   */
  constructor(arg, stack, callSite) {
    this._arg = arg;
    this._stack = stack;
    this._callSite = callSite;
  }
  /**
   * @param {CekValue} value - fn value
   * @param {CekContext} ctx
   * @returns {CekStateChange}
   */
  reduce(value, ctx) {
    if ("lambda" in value) {
      return {
        state: {
          computing: {
            term: this._arg,
            stack: this._stack
          }
        },
        frame: makeLambdaCallFrame(
          value.lambda.term,
          mixStacks(value.lambda.stack, this._stack),
          {
            callSite: this._callSite,
            name: value.name,
            argName: value.lambda.argName
          }
        )
      };
    } else if ("builtin" in value) {
      const b = ctx.getBuiltin(value.builtin.id);
      if (!b) {
        return {
          state: {
            error: {
              message: `builtin ${value.builtin.id} not found`,
              stack: this._stack
            }
          }
        };
      } else if (b.forceCount > value.builtin.forceCount) {
        return {
          state: {
            error: {
              message: `insufficient forces applied to ${b.name}, ${value.builtin.forceCount} < ${b.forceCount}`,
              stack: this._stack
            }
          }
        };
      } else {
        return {
          state: {
            computing: {
              term: this._arg,
              stack: this._stack
            }
          },
          frame: makeBuiltinCallFrame(
            value.builtin.id,
            value.builtin.name,
            value.builtin.args,
            this._stack,
            this._callSite
          )
        };
      }
    } else {
      return {
        state: {
          error: {
            message: `can only call lambda or builtin terms`,
            stack: this._stack
          }
        }
      };
    }
  }
};

// node_modules/@helios-lang/uplc/src/cek/UplcRuntimeError.js
var UplcRuntimeError = class extends Error {
  /**
   * @readonly
   * @type {CallSiteInfo[]}
   */
  frames;
  /**
   * @param {string} message
   * @param {CallSiteInfo[]} callSites
   */
  constructor(message, callSites = []) {
    super(message);
    this.frames = callSites;
    Object.defineProperty(this, "frames", {
      enumerable: false,
      writable: true,
      configurable: false
    });
    prepareHeliosStackTrace(this, callSites);
  }
};
function prepareHeliosStackTrace(err, callSites) {
  if (callSites.length == 0) {
    return;
  }
  const jsStackLines = err.stack?.split("\n") ?? [];
  const isFirefox = jsStackLines?.[0]?.includes("@");
  const stackIncludesMessage = jsStackLines?.[0] == `Error: ${err.message}`;
  const indent = isFirefox ? "" : stackIncludesMessage ? /^\s*/.exec(jsStackLines?.[1] ?? "") : jsStackLines?.[0] ?? "";
  const lines = [];
  let unhandledArgs = [];
  let parentFunctionName = void 0;
  for (let cs of callSites) {
    if (cs.site) {
      const allArguments = unhandledArgs.filter(
        (a) => !!a.name && !a.name.startsWith("__")
      );
      const sitePart = [`${cs.site.toString()}`];
      const varsPart = allArguments.length > 0 ? [
        `[${allArguments.map((a) => `${a.name}=${stringifyCekValue(a, true)}`).join(", ")}]`
      ] : [];
      const atPart = parentFunctionName ? [`at ${parentFunctionName}`] : [`at <anonymous>`];
      if (isFirefox) {
        lines.push(
          `<helios>@${atPart.concat(varsPart).concat(sitePart).join(", ")}:0`
        );
      } else {
        const fileNameHasExt = cs.site.file.endsWith(".hl") || cs.site.file.endsWith(".helios");
        lines.push(
          indent + atPart.concat(
            [fileNameHasExt ? "(" : "(helios:"].concat(sitePart).concat([")"]).join("")
          ).concat(varsPart).join(" ")
        );
      }
      unhandledArgs = cs.arguments ? cs.arguments.slice() : [];
    } else if (cs.arguments) {
      unhandledArgs = unhandledArgs.concat(cs.arguments);
    }
    parentFunctionName = cs.functionName;
  }
  lines.reverse();
  if (stackIncludesMessage) {
    err.stack = [jsStackLines[0]].concat(lines).concat(jsStackLines.slice(1)).join("\n");
  } else {
    err.stack = lines.concat(jsStackLines.slice(0)).join("\n");
  }
}

// node_modules/@helios-lang/type-utils/src/generic.js
function expect3(...args) {
  if (args.length == 1) {
    const [check4] = args;
    return (input, msg = void 0) => {
      return expect3(input, check4, msg);
    };
  } else {
    const [input, check4, msg] = args;
    let reason = void 0;
    if (check4(input, (r) => {
      reason = r;
    })) {
      return input;
    } else {
      throw new TypeError(msg ?? reason);
    }
  }
}

// node_modules/@helios-lang/type-utils/src/string.js
function isString4(input, onFalse = void 0) {
  if (typeof input == "string") {
    return true;
  } else {
    if (onFalse) {
      onFalse(`not a string`);
    }
    return false;
  }
}

// node_modules/@helios-lang/type-utils/src/array.js
function isArray3(...args) {
  if (args.length == 1) {
    const [checkItem] = args;
    return (input, msg = void 0) => {
      return isArray3(input, checkItem, msg);
    };
  } else {
    const [input, checkItem, onFalse] = args;
    if (Array.isArray(input)) {
      if (input.some(
        (input2, i) => !checkItem(
          input2,
          onFalse ? (r) => onFalse(`[${i}]: ${r}`) : void 0
        )
      )) {
        return false;
      } else {
        return true;
      }
    } else {
      if (onFalse) {
        onFalse("not an array");
      }
      return false;
    }
  }
}
function isStringArray3(input, onFalse = void 0) {
  return isArray3(input, isString4, onFalse);
}

// node_modules/@helios-lang/type-utils/src/either.js
function isLeft3(either) {
  return "left" in either;
}

// node_modules/@helios-lang/type-utils/src/json.js
var JSONSafe3 = {
  parse: JSON.parse,
  stringify: JSON.stringify
};

// node_modules/@helios-lang/type-utils/src/object.js
function isObject4(...args) {
  if (args.length == 1) {
    const [checkProperties] = args;
    return (input, onFalse = void 0) => {
      return isObject4(input, checkProperties, onFalse);
    };
  } else {
    const [input, checkProperties, onFalse] = args;
    if (!(input instanceof Object)) {
      if (onFalse) {
        onFalse("not an object");
      }
      return false;
    } else {
      for (let key in checkProperties) {
        const checkProp = checkProperties[key];
        if (!(key in input)) {
          if (onFalse) {
            onFalse(`property ${key} not defined`);
          }
          return false;
        }
        if (!checkProp(
          /** @type {any} */
          input[key],
          onFalse ? (r) => onFalse(`.${key}: ${r}`) : void 0
        )) {
          return false;
        }
      }
      return true;
    }
  }
}

// node_modules/@helios-lang/type-utils/src/option.js
function expectDefined(x, msg = void 0) {
  if (x !== null && x !== void 0) {
    return x;
  } else {
    throw new TypeError(msg ?? `expected Option.some, got None`);
  }
}

// node_modules/@helios-lang/uplc/src/terms/UplcBuiltin.js
var UPLC_BUILTIN_TAG = 7;
function makeUplcBuiltin(args) {
  return new UplcBuiltinImpl(args.id, args.name, args.site);
}
function decodeUplcBuiltinFromFlat(reader, builtins) {
  let id = reader.readBuiltinId();
  return makeUplcBuiltin({ id, name: expectDefined(builtins[id]).name });
}
var UplcBuiltinImpl = class {
  /**
   * ID of the builtin
   * @readonly
   * @type {number}
   */
  id;
  /**
   * Name of the builtin
   * Note: though is redundant information, it is much easier to keep track of this here for debugging purposes
   * @readonly
   * @type {string}
   */
  name;
  /**
   * Optional source-map site
   * Mutable so that SourceMap application is easier
   * @type {Site | undefined}
   */
  site;
  /**
   * @param {IntLike} id
   * @param {string} name
   * @param {Site | undefined} site
   */
  constructor(id, name, site = void 0) {
    this.id = toInt(id);
    this.name = name;
    this.site = site;
  }
  /**
   * @type {UplcTerm[]}
   */
  get children() {
    return [];
  }
  /**
   * @type {"builtin"}
   */
  get kind() {
    return "builtin";
  }
  /**
   * @returns {string}
   */
  toString() {
    return `(builtin ${this.id.toString()})`;
  }
  /**
   * @param {FlatWriter} w
   */
  toFlat(w) {
    w.writeTermTag(UPLC_BUILTIN_TAG);
    w.writeBuiltinId(this.id);
  }
  /**
   * @param {CekStack} stack
   * @param {CekContext} ctx
   * @returns {CekStateChange}
   */
  compute(stack, ctx) {
    ctx.cost.incrBuiltinCost();
    return {
      state: {
        reducing: {
          builtin: {
            id: this.id,
            name: this.name,
            forceCount: 0,
            args: []
          }
        }
      }
    };
  }
};

// node_modules/@helios-lang/uplc/src/terms/UplcCall.js
var UPLC_CALL_TAG = 3;
function makeUplcCall(props) {
  if ("arg" in props) {
    return new UplcCallImpl(props.fn, props.arg, props.site);
  } else {
    const site = props.site;
    let expr = new UplcCallImpl(props.fn, props.args[0], site);
    props.args.slice(1).forEach((arg) => {
      expr = new UplcCallImpl(expr, arg, site);
    });
    return expr;
  }
}
function decodeUplcCallFromFlat(r) {
  return makeUplcCall({ fn: r.readExpr(), arg: r.readExpr() });
}
var UplcCallImpl = class {
  /**
   * @readonly
   * @type {UplcTerm}
   */
  fn;
  /**
   * @readonly
   * @type {UplcTerm}
   */
  arg;
  /**
   * Optional source-map site
   * Mutable so that SourceMap application is easier
   * @type {Site | undefined}
   */
  site;
  /**
   * @param {UplcTerm} fn
   * @param {UplcTerm} arg
   * @param {Site | undefined} site
   */
  constructor(fn, arg, site = void 0) {
    this.fn = fn;
    this.arg = arg;
    this.site = site;
  }
  /**
   * @type {UplcTerm[]}
   */
  get children() {
    return [this.fn, this.arg];
  }
  /**
   * @type {"call"}
   */
  get kind() {
    return "call";
  }
  /**
   * @param {CekStack} stack
   * @param {CekContext} ctx
   * @returns {CekStateChange}
   */
  compute(stack, ctx) {
    ctx.cost.incrCallCost();
    return {
      state: {
        computing: {
          term: this.fn,
          stack
        }
      },
      frame: makePreCallFrame(this.arg, stack, this.site)
    };
  }
  /**
   * @param {FlatWriter} w
   */
  toFlat(w) {
    w.writeTermTag(UPLC_CALL_TAG);
    this.fn.toFlat(w);
    this.arg.toFlat(w);
  }
  /**
   * @returns {string}
   */
  toString() {
    return `[${this.fn.toString()} ${this.arg.toString()}]`;
  }
};

// node_modules/@helios-lang/uplc/src/terms/UplcConst.js
var UPLC_CONST_TAG = 4;
function makeUplcConst(props) {
  return new UplcConstImpl(props.value, props.site);
}
function decodeUplcConstFromFlat(r) {
  const value = r.readValue();
  return makeUplcConst({ value });
}
var UplcConstImpl = class _UplcConstImpl {
  /**
   * @readonly
   * @type {UplcValue}
   */
  value;
  /**
   * Optional source-map site
   * Mutable so that SourceMap application is easier
   * @type {Site | undefined}
   */
  site;
  /**
   * @param {UplcValue} value
   * @param {Site | undefined} site
   */
  constructor(value, site = void 0) {
    this.value = value;
    this.site = site;
    if (value.kind == "int" && !value.signed) {
      throw new Error("UplcConst(UplcInt) must be signed");
    }
  }
  /**
   * @type {UplcTerm[]}
   */
  get children() {
    return [];
  }
  /**
   * @type {"const"}
   */
  get kind() {
    return "const";
  }
  /**
   * @type {number}
   */
  get flatSize() {
    return 4 + this.value.flatSize;
  }
  /**
   * @type {UplcTerm}
   */
  get serializableTerm() {
    const v = this.value;
    if (v.kind == "bls12_381_G1_element") {
      const builtinName = "bls12_381_G1_uncompress";
      return makeUplcCall({
        fn: makeUplcBuiltin({
          id: builtinsV3.findIndex((bi) => bi.name == builtinName),
          name: builtinName
        }),
        arg: new _UplcConstImpl(makeUplcByteArray(v.compress())),
        site: this.site
      });
    } else if (v.kind == "bls12_381_G2_element") {
      const builtinName = "bls12_381_G2_uncompress";
      return makeUplcCall({
        fn: makeUplcBuiltin({
          id: builtinsV3.findIndex((bi) => bi.name == builtinName),
          name: builtinName
        }),
        arg: new _UplcConstImpl(makeUplcByteArray(v.compress())),
        site: this.site
      });
    } else {
      return this;
    }
  }
  /**
   *
   * @param {CekStack} stack
   * @param {CekContext} ctx
   * @returns {CekStateChange}
   */
  compute(stack, ctx) {
    ctx.cost.incrConstCost();
    return {
      state: {
        reducing: {
          value: this.value
        }
      }
    };
  }
  /**
   * @param {FlatWriter} w
   */
  toFlat(w) {
    const v = this.value;
    if (v.kind == "bls12_381_G1_element" || v.kind == "bls12_381_G2_element") {
      const t = this.serializableTerm;
      t.toFlat(w);
    } else if (v.kind == "bls12_381_mlresult") {
      throw new Error("Bls12_381_MlResult can't be serialized");
    } else {
      w.writeTermTag(UPLC_CONST_TAG);
      w.writeTypeBits(v.type.typeBits);
      v.toFlat(w);
    }
  }
  /**
   * @returns {string}
   */
  toString() {
    return `(con ${this.value.type.toString()} ${this.value.toString()})`;
  }
};

// node_modules/@helios-lang/uplc/src/terms/UplcDelay.js
var UPLC_DELAY_TAG = 1;
function makeUplcDelay(props) {
  return new UplcDelayImpl(props.arg, props.site);
}
function decodeUplcDelayFromFlat(r) {
  const arg = r.readExpr();
  return makeUplcDelay({ arg });
}
var UplcDelayImpl = class {
  /**
   * @readonly
   * @type {UplcTerm}
   */
  arg;
  /**
   * Optional source-map site
   * Mutable so that SourceMap application is easier
   * @type {Site | undefined}
   */
  site;
  /**
   * @param {UplcTerm} arg
   * @param {Site | undefined} site
   */
  constructor(arg, site = void 0) {
    this.arg = arg;
    this.site = site;
  }
  /**
   * @type {UplcTerm[]}
   */
  get children() {
    return [this.arg];
  }
  /**
   * @type {"delay"}
   */
  get kind() {
    return "delay";
  }
  /**
   * @param {CekStack} stack
   * @param {CekContext} ctx
   * @returns {CekStateChange}
   */
  compute(stack, ctx) {
    ctx.cost.incrDelayCost();
    return {
      state: {
        reducing: {
          name: this.site?.alias,
          delay: {
            term: this.arg,
            stack
          }
        }
      }
    };
  }
  /**
   * @param {FlatWriter} w
   */
  toFlat(w) {
    w.writeTermTag(UPLC_DELAY_TAG);
    this.arg.toFlat(w);
  }
  /**
   * @returns {string}
   */
  toString() {
    return `(delay ${this.arg.toString()})`;
  }
};

// node_modules/@helios-lang/uplc/src/terms/UplcError.js
var UPLC_ERROR_TAG = 6;
function makeUplcError(props = {}) {
  return new UplcErrorImpl(props.site);
}
var UplcErrorImpl = class {
  /**
   * Optional source-map site
   * Mutable so that SourceMap application is easier
   * @type {Site | undefined}
   */
  site;
  /**
   * @param {Site | undefined} site
   */
  constructor(site = void 0) {
    this.site = site;
  }
  /**
   * @type {UplcTerm[]}
   */
  get children() {
    return [];
  }
  /**
   * @type {"error"}
   */
  get kind() {
    return "error";
  }
  /**
   * @param {CekStack} stack
   * @param {CekContext} ctx
   * @returns {CekStateChange}
   */
  compute(stack, ctx) {
    return {
      state: {
        error: {
          message: ctx.popLastMessage() ?? "",
          stack
        }
      }
    };
  }
  /**
   * @param {FlatWriter} w
   */
  toFlat(w) {
    w.writeTermTag(UPLC_ERROR_TAG);
  }
  /**
   * @returns {string}
   */
  toString() {
    return "(error)";
  }
};

// node_modules/@helios-lang/uplc/src/terms/UplcForce.js
var UPLC_FORCE_TAG = 5;
function makeUplcForce(props) {
  return new UplcForceImpl(props.arg, props.site);
}
function decodeUplcForceFromFlat(r) {
  const arg = r.readExpr();
  return makeUplcForce({ arg });
}
var UplcForceImpl = class {
  /**
   * @readonly
   * @type {UplcTerm}
   */
  arg;
  /**
   * Optional source-map site
   * Mutable so that SourceMap application is easier
   * @type {Site | undefined}
   */
  site;
  /**
   * @param {UplcTerm} arg
   * @param {Site | undefined} site
   */
  constructor(arg, site = void 0) {
    this.arg = arg;
    this.site = site;
  }
  /**
   * @type {UplcTerm[]}
   */
  get children() {
    return [this.arg];
  }
  /**
   * @type {"force"}
   */
  get kind() {
    return "force";
  }
  /**
   *
   * @param {CekStack} stack
   * @param {CekContext} ctx
   * @returns {CekStateChange}
   */
  compute(stack, ctx) {
    ctx.cost.incrForceCost();
    return {
      state: {
        computing: {
          term: this.arg,
          stack
        }
      },
      frame: makeForceFrame(stack, this.site)
    };
  }
  /**
   * @param {FlatWriter} w
   */
  toFlat(w) {
    w.writeTermTag(UPLC_FORCE_TAG);
    this.arg.toFlat(w);
  }
  /**
   * @returns {string}
   */
  toString() {
    return `(force ${this.arg.toString()})`;
  }
};

// node_modules/@helios-lang/uplc/src/terms/UplcLambda.js
var UPLC_LAMBDA_TAG = 2;
function makeUplcLambda(props) {
  return new UplcLambdaImpl(props.body, props.argName, props.site);
}
function decodeUplcLambdaFromFlat(r) {
  const expr = r.readExpr();
  return makeUplcLambda({ body: expr });
}
var UplcLambdaImpl = class {
  /**
   * @readonly
   * @type {UplcTerm}
   */
  expr;
  /**
   * Mutable so that SourceMap application is easier
   * @readwrite
   * @type {string | undefined}
   */
  argName;
  /**
   * Optional source-map site
   * Mutable so that SourceMap application is easier
   * @type {Site | undefined}
   */
  site;
  /**
   * @param {UplcTerm} expr
   * @param {string | undefined} argName
   * @param {Site | undefined} site
   */
  constructor(expr, argName = void 0, site = void 0) {
    this.expr = expr;
    this.argName = argName;
    this.site = site;
  }
  /**
   * @type {UplcTerm[]}
   */
  get children() {
    return [this.expr];
  }
  /**
   * @type {"lambda"}
   */
  get kind() {
    return "lambda";
  }
  /**
   * @param {CekStack} stack
   * @param {CekContext} ctx
   * @returns {CekStateChange}
   */
  compute(stack, ctx) {
    ctx.cost.incrLambdaCost();
    return {
      state: {
        reducing: {
          name: this.site?.alias,
          lambda: {
            term: this.expr,
            argName: this.argName ?? void 0,
            stack
          }
        }
      }
    };
  }
  /**
   * @param {FlatWriter} w
   */
  toFlat(w) {
    w.writeTermTag(UPLC_LAMBDA_TAG);
    this.expr.toFlat(w);
  }
  /**
   * Returns string with unicode lambda symbol
   * @returns {string}
   */
  toString() {
    return `(lam ${this.argName ? `${this.argName} ` : ""}${this.expr.toString()})`;
  }
};

// node_modules/@helios-lang/uplc/src/terms/UplcVar.js
var UPLC_VAR_TAG = 0;
function makeUplcVar(props) {
  return new UplcVarImpl(props.index, props.name, props.site);
}
function decodeUplcVarFromFlat(r) {
  const index = r.readInt();
  return makeUplcVar({ index: Number(index) });
}
var UplcVarImpl = class {
  /**
   * @readonly
   * @type {number}
   */
  index;
  /**
   * Only used for debugging
   * @readonly
   * @type {string | undefined}
   */
  name;
  /**
   * Optional source-map site
   * Mutable so that SourceMap application is easier
   * @type {Site | undefined}
   */
  site;
  /**
   * @param {number} index
   * @param {string | undefined} name
   * @param {Site | undefined} site
   */
  constructor(index, name = void 0, site = void 0) {
    this.index = index;
    this.name = name;
    this.site = site;
  }
  /**
   * @type {UplcTerm[]}
   */
  get children() {
    return [];
  }
  /**
   * @type {"var"}
   */
  get kind() {
    return "var";
  }
  /**
   * @param {CekStack} stack
   * @param {CekContext} ctx
   * @returns {CekStateChange}
   */
  compute(stack, ctx) {
    ctx.cost.incrVarCost();
    const i = stack.values.length - this.index;
    const v = stack.values[i];
    if (!v) {
      throw new Error(
        `${i} ${this.index} out of stack range (stack has ${stack.values.length} values)`
      );
    }
    return {
      state: {
        reducing: v
      }
    };
  }
  /**
   * @param {FlatWriter} w
   */
  toFlat(w) {
    w.writeTermTag(UPLC_VAR_TAG);
    w.writeInt(BigInt(this.index));
  }
  /**
   * @returns {string}
   */
  toString() {
    if (this.name) {
      return this.name;
    } else {
      return `x${this.index}`;
    }
  }
};

// node_modules/@helios-lang/uplc/src/terms/decode.js
function decodeTerm(r, builtins) {
  const tag = r.readTag();
  switch (tag) {
    case UPLC_VAR_TAG:
      return decodeUplcVarFromFlat(r);
    case UPLC_DELAY_TAG:
      return decodeUplcDelayFromFlat(r);
    case UPLC_LAMBDA_TAG:
      return decodeUplcLambdaFromFlat(r);
    case UPLC_CALL_TAG:
      return decodeUplcCallFromFlat(r);
    // aka function application
    case UPLC_CONST_TAG:
      return decodeUplcConstFromFlat(r);
    case UPLC_FORCE_TAG:
      return decodeUplcForceFromFlat(r);
    case UPLC_ERROR_TAG:
      return makeUplcError();
    case UPLC_BUILTIN_TAG:
      return decodeUplcBuiltinFromFlat(r, builtins);
    default:
      throw new Error("term tag " + tag.toString() + " unhandled");
  }
}

// node_modules/@helios-lang/uplc/src/terms/UplcReader.js
function makeUplcReader(args) {
  return new UplcReaderImpl(args.bytes, args.builtins);
}
var UplcReaderImpl = class {
  /**
   * this.builtins is used to get the name of a builtin using only its id
   * @readonly
   * @type {Builtin[]}
   */
  builtins;
  /**
   * @private
   * @readonly
   * @type {FlatReader}
   */
  _reader;
  /**
   * @param {number[] | Uint8Array} bytes
   * @param {Builtin[]} builtins
   */
  constructor(bytes, builtins) {
    this.builtins = builtins;
    this._reader = makeFlatReader({
      bytes,
      readExpr: (r) => decodeTerm(r, builtins),
      dispatchValueReader
    });
  }
  /**
   * @returns {boolean}
   */
  readBool() {
    return this._reader.readBool();
  }
  /**
   * @returns {number}
   */
  readBuiltinId() {
    return this._reader.readBuiltinId();
  }
  /**
   * @returns {number[]}
   */
  readBytes() {
    return this._reader.readBytes();
  }
  /**
   * @returns {UplcTerm}
   */
  readExpr() {
    return this._reader.readExpr();
  }
  /**
   * @returns {bigint}
   */
  readInt() {
    return this._reader.readInt();
  }
  /**
   * @returns {number}
   */
  readTag() {
    return this._reader.readTag();
  }
  /**
   * Reads a Plutus-core list with a specified size per element
   * Calls itself recursively until the end of the list is reached
   * @param {number} elemSize
   * @returns {number[]}
   */
  readLinkedList(elemSize) {
    return this._reader.readLinkedList(elemSize);
  }
  /**
   * @returns {UplcValue}
   */
  readValue() {
    return this._reader.readValue();
  }
};

// node_modules/@helios-lang/uplc/src/terms/ops.js
function apply(expr, args) {
  for (let arg of args) {
    expr = makeUplcCall({ fn: expr, arg: makeUplcConst({ value: arg }) });
  }
  return expr;
}
function traverse(root, callbacks) {
  let terms = [root];
  let term = terms.pop();
  let index = 0;
  while (term) {
    if (callbacks.anyTerm) {
      callbacks.anyTerm(term, index);
    }
    switch (term.kind) {
      case "builtin":
        if (callbacks.builtinTerm) {
          callbacks.builtinTerm(term, index);
        }
        break;
      case "call":
        if (callbacks.callTerm) {
          callbacks.callTerm(term, index);
        }
        break;
      case "const":
        if (callbacks.constTerm) {
          callbacks.constTerm(term, index);
        }
        break;
      case "delay":
        if (callbacks.delayTerm) {
          callbacks.delayTerm(term, index);
        }
        break;
      case "error":
        if (callbacks.errorTerm) {
          callbacks.errorTerm(term, index);
        }
        break;
      case "force":
        if (callbacks.forceTerm) {
          callbacks.forceTerm(term, index);
        }
        break;
      case "lambda":
        if (callbacks.lambdaTerm) {
          callbacks.lambdaTerm(term, index);
        }
        break;
      case "var":
        if (callbacks.varTerm) {
          callbacks.varTerm(term, index);
        }
        break;
      default:
        throw new Error(
          `unexpected UplcTerm kind "${/** @type {any} */
          term.kind}"`
        );
    }
    terms = terms.concat(term.children.slice().reverse());
    term = terms.pop();
    index++;
  }
}

// node_modules/@helios-lang/uplc/src/program/UplcProgram.js
function decodeCborProgram(bytes, expectedUplcVersion, builtins) {
  const stream = makeByteStream({ bytes });
  if (!isBytes(stream)) {
    throw new Error("unexpected");
  }
  let scriptBytes = decodeBytes(stream);
  if (isBytes(scriptBytes)) {
    scriptBytes = decodeBytes(scriptBytes);
  }
  return decodeFlatProgram(scriptBytes, expectedUplcVersion, builtins);
}
function encodeCborProgram(expr, uplcVersion) {
  return encodeBytes(encodeBytes(encodeFlatProgram(expr, uplcVersion)));
}
function encodeFlatProgram(expr, uplcVersion) {
  const w = makeFlatWriter();
  uplcVersion.split(".").forEach((v) => w.writeInt(BigInt(v)));
  expr.toFlat(w);
  return w.finalize();
}
function decodeFlatProgram(bytes, expectedUplcVersion, builtins) {
  const r = makeUplcReader({ bytes, builtins });
  const version = `${r.readInt()}.${r.readInt()}.${r.readInt()}`;
  if (version != expectedUplcVersion) {
    throw new Error(
      `uplc version mismatch, expected ${expectedUplcVersion}, got ${version}`
    );
  }
  const root = r.readExpr();
  return root;
}
function evalProgram(builtins, expr, args, { costModel, logOptions }) {
  if (args) {
    if (args.length == 0) {
      expr = makeUplcForce({ arg: expr });
    } else {
      for (let arg of args) {
        expr = makeUplcCall({
          fn: expr,
          arg: makeUplcConst({ value: arg })
        });
      }
    }
  }
  const machine = new CekMachine(expr, builtins, costModel, logOptions);
  return machine.eval();
}
function hashProgram(program) {
  const innerBytes = encodeBytes(program.toFlat());
  innerBytes.unshift(program.plutusVersionTag);
  return blake2b(innerBytes, 28);
}

// node_modules/@helios-lang/uplc/src/program/UplcSourceMap.js
function makeUplcSourceMap(props) {
  if ("term" in props) {
    return extractUplcSourceMap(props.term);
  } else {
    return new UplcSourceMapImpl(props);
  }
}
function deserializeUplcSourceMap(raw) {
  const rawObj = typeof raw == "string" ? JSONSafe3.parse(raw) : raw;
  const obj = expect3(
    isObject4({
      sourceNames: isStringArray3,
      indices: isString4
    })
  )(rawObj);
  return makeUplcSourceMap({
    sourceNames: obj.sourceNames,
    indices: decodeList(obj.indices, decodeInt).map((i) => Number(i)),
    variableNames: "variableNames" in obj && isString4(obj.variableNames) ? decodeMap(obj.variableNames, decodeInt, decodeString).map(
      ([key, value]) => [Number(key), value]
    ) : [],
    termDescriptions: "termDescriptions" in obj && isString4(obj.termDescriptions) ? decodeMap(obj.termDescriptions, decodeInt, decodeString).map(
      ([key, value]) => [Number(key), value]
    ) : []
  });
}
function extractUplcSourceMap(root) {
  const sourceNames = [];
  const indices = [];
  const variableNames = [];
  const termDescriptions = [];
  traverse(root, {
    anyTerm: (term, i) => {
      const site = term.site;
      if (site) {
        if (!isDummySite(site)) {
          const sn = site.file;
          let j = sourceNames.indexOf(sn);
          if (j == -1) {
            j = sourceNames.length;
            sourceNames.push(sn);
          }
          indices.push([i, j, site.line, site.column]);
        }
        if (site.alias) {
          termDescriptions.push([i, site.alias]);
        }
      }
    },
    lambdaTerm: (term, i) => {
      const name = term.argName;
      if (name) {
        variableNames.push([i, name]);
      }
    }
  });
  return makeUplcSourceMap({
    sourceNames,
    indices: indices.flat(),
    variableNames,
    termDescriptions
  });
}
var UplcSourceMapImpl = class {
  /**
   * Eg. file names or helios header names
   * @private
   * @readonly
   * @type {string[]}
   */
  sourceNames;
  /**
   * Tuples of 4 indices
   *   - First index in each tuple is the uplc term 'preorder' index
   *   - Second index in each tuple is the source index (i.e. index in `this.sourceNames`)
   *   - Third index in each tuple is the line number (0-based)
   *   - Fourth index in each tuple is the column number (0-based)
   * @private
   * @readonly
   * @type {number[]}
   */
  indices;
  /**
   * Tuple of uplc lambda term index and variable name
   * @private
   * @readonly
   * @type {[number, string][]}
   */
  variableNames;
  /**
   * Tuple of uplc term index and description string
   * @private
   * @readonly
   * @type {[number, string][]}
   */
  termDescriptions;
  /**
   * @param {UplcSourceMapProps} props
   */
  constructor({
    sourceNames,
    indices,
    variableNames = [],
    termDescriptions = []
  }) {
    this.sourceNames = sourceNames;
    this.indices = indices;
    this.variableNames = variableNames;
    this.termDescriptions = termDescriptions;
  }
  /**
   * @param {UplcTerm} root - mutated in-place
   * @returns {void}
   */
  apply(root) {
    let indicesPos = 0;
    let variableNamesPos = 0;
    let termDescriptionsPos = 0;
    traverse(root, {
      anyTerm: (term, i) => {
        while (this.indices[indicesPos] < i) {
          indicesPos += 4;
        }
        if (this.indices[indicesPos] == i) {
          const [sourceId, line, column] = this.indices.slice(
            indicesPos + 1,
            indicesPos + 4
          );
          const sn = this.sourceNames[sourceId];
          term.site = makeTokenSite({
            file: sn,
            startLine: line,
            startColumn: column
          });
        }
        while (this.termDescriptions[termDescriptionsPos]?.[0] < i) {
          termDescriptionsPos += 1;
        }
        if (this.termDescriptions[termDescriptionsPos]?.[0] == i) {
          const description = this.termDescriptions[termDescriptionsPos][1];
          if (term.site) {
            term.site = term.site.withAlias(description);
          } else {
            term.site = makeDummySite().withAlias(description);
          }
        }
      },
      lambdaTerm: (term, i) => {
        while (this.variableNames[variableNamesPos]?.[0] < i) {
          variableNamesPos += 1;
        }
        if (this.variableNames[variableNamesPos]?.[0] == i) {
          const name = this.variableNames[variableNamesPos][1];
          term.argName = name;
        }
      }
    });
  }
  /**
   * @returns {UplcSourceMapJsonSafe}
   */
  toJsonSafe() {
    return {
      sourceNames: this.sourceNames,
      indices: bytesToHex(
        encodeList(this.indices.map((i) => encodeInt(i)))
      ),
      variableNames: this.variableNames.length > 0 ? bytesToHex(
        encodeMap(
          this.variableNames.map(([key, value]) => {
            return [encodeInt(key), encodeString(value)];
          })
        )
      ) : void 0,
      termDescriptions: this.termDescriptions.length > 0 ? bytesToHex(
        encodeMap(
          this.termDescriptions.map(([key, value]) => {
            return [encodeInt(key), encodeString(value)];
          })
        )
      ) : void 0
    };
  }
};

// node_modules/@helios-lang/uplc/src/program/UplcProgramV1.js
var PLUTUS_VERSION = "PlutusScriptV1";
var PLUTUS_VERSION_TAG = 1;
var UPLC_VERSION = "1.0.0";
function decodeUplcProgramV1FromCbor(bytes, options = {}) {
  return new UplcProgramV1Impl(
    decodeCborProgram(bytes, UPLC_VERSION, builtinsV1),
    options
  );
}
var UplcProgramV1Impl = class _UplcProgramV1Impl {
  /**
   * @readonly
   * @type {UplcTerm}
   */
  root;
  /**
   * @readonly
   * @type {UplcProgramV1 | undefined}
   */
  alt;
  /**
   * @private
   * @readonly
   * @type {((() => string) | string) | undefined}
   */
  _ir;
  /**
   * Cached hash
   * @private
   * @type {number[] | undefined}
   */
  _hash;
  /**
   * @param {UplcTerm} root
   * @param {UplcProgramV1Options} options
   */
  constructor(root, options = {}) {
    this.root = root;
    this.alt = options.alt;
    this._ir = options.ir;
    this._hash = void 0;
    if (options.sourceMap) {
      deserializeUplcSourceMap(options.sourceMap).apply(this.root);
    }
  }
  /**
   * @type {string | undefined}
   */
  get ir() {
    if (this._ir) {
      if (typeof this._ir == "string") {
        return this._ir;
      } else {
        return this._ir();
      }
    } else {
      return void 0;
    }
  }
  /**
   * Script version, determines the available builtins and the shape of the ScriptContext
   * @type {PlutusVersionV1}
   */
  get plutusVersion() {
    return PLUTUS_VERSION;
  }
  /**
   * Script version tag, shorthand for the plutus version, used in (de)serialization
   * @type {typeof PLUTUS_VERSION_TAG}
   */
  get plutusVersionTag() {
    return PLUTUS_VERSION_TAG;
  }
  /**
   * UPLC version, determines UPLC semantics and term types
   * Note: though it makes sense for the team maintaining the Plutus repo
   *   for this to be distinct version, each HFC combines a potentially
   *   new uplcVersion with a new script version, so from a client perspective
   *   it only makes sense to track a single version change
   *   (ie. Plutus V1 vs Plutus V2 vs Plutus V3)
   * @type {typeof UPLC_VERSION}
   */
  get uplcVersion() {
    return UPLC_VERSION;
  }
  /**
   * Wrap the top-level term with consecutive UplcCall (not exported) terms.
   *
   * Returns a new UplcProgramV1 instance, leaving the original untouched.
   * @param {UplcValue[]} args
   * @returns {UplcProgramV1Impl} - a new UplcProgram instance
   */
  apply(args) {
    const alt = this.alt ? this.alt.apply(args) : void 0;
    return new _UplcProgramV1Impl(apply(this.root, args), { alt });
  }
  /**
   * @param {UplcValue[] | undefined} args - if None, eval the root term without any applications, if empy: apply a force to the root term
   * @param {object} [options]
   * @param {UplcLogger} [options.logOptions]
   * @param {number[]} [options.costModelParams]
   * @returns {CekResult}
   */
  eval(args, options = {}) {
    const { logOptions, costModelParams = DEFAULT_COST_MODEL_PARAMS_V1() } = options;
    const costModel = makeCostModel(
      makeCostModelParamsProxy(costModelParams),
      builtinsV1
    );
    return evalProgram(builtinsV1, this.root, args, {
      costModel,
      logOptions
    });
  }
  /**
   * @returns {number[]} - 28 byte hash
   */
  hash() {
    if (!this._hash) {
      this._hash = hashProgram(this);
    }
    return this._hash;
  }
  /**
   * Returns the Cbor encoding of a script (flat bytes wrapped twice in Cbor bytearray).
   * @returns {number[]}
   */
  toCbor() {
    return encodeCborProgram(this.root, UPLC_VERSION);
  }
  /**
   * @returns {number[]}
   */
  toFlat() {
    return encodeFlatProgram(this.root, UPLC_VERSION);
  }
  /**
   * @returns {string}
   */
  toString() {
    return this.root.toString();
  }
  /**
   * @param {UplcProgramV1} alt
   * @returns {UplcProgramV1}
   */
  withAlt(alt) {
    return new _UplcProgramV1Impl(this.root, { alt, ir: this._ir });
  }
};

// node_modules/@helios-lang/uplc/src/program/UplcProgramV2.js
var PLUTUS_VERSION2 = "PlutusScriptV2";
var PLUTUS_VERSION_TAG2 = 2;
var UPLC_VERSION2 = "1.0.0";
function decodeUplcProgramV2FromCbor(bytes, options = {}) {
  return new UplcProgramV2Impl(
    decodeCborProgram(bytes, UPLC_VERSION2, builtinsV2),
    options
  );
}
var UplcProgramV2Impl = class _UplcProgramV2Impl {
  /**
   * @readonly
   * @type {UplcTerm}
   */
  root;
  /**
   * @readonly
   * @type {UplcProgramV2 | undefined}
   */
  alt;
  /**
   * @private
   * @readonly
   * @type {((() => string) | string) | undefined}
   */
  _ir;
  /**
   * Cached hash
   * @private
   * @type {number[] | undefined}
   */
  _hash;
  /**
   * @param {UplcTerm} root
   * @param {UplcProgramV2Options} options
   */
  constructor(root, options) {
    this.root = root;
    this.alt = options.alt;
    this._ir = options.ir;
    this._hash = void 0;
    if (options.sourceMap) {
      deserializeUplcSourceMap(options.sourceMap).apply(this.root);
    }
  }
  /**
   * @type {string | undefined}
   */
  get ir() {
    if (this._ir) {
      if (typeof this._ir == "string") {
        return this._ir;
      } else {
        return this._ir();
      }
    } else {
      return void 0;
    }
  }
  /**
   * @type {PlutusVersionV2}
   */
  get plutusVersion() {
    return PLUTUS_VERSION2;
  }
  /**
   * @type {typeof PLUTUS_VERSION_TAG}
   */
  get plutusVersionTag() {
    return PLUTUS_VERSION_TAG2;
  }
  /**
   * @type {typeof UPLC_VERSION}
   */
  get uplcVersion() {
    return UPLC_VERSION2;
  }
  /**
   * Wrap the top-level term with consecutive UplcCall (not exported) terms.
   *
   * Returns a new UplcProgramV2 instance, leaving the original untouched.
   * @param {UplcValue[]} args
   * @returns {UplcProgramV2} - a new UplcProgram instance
   */
  apply(args) {
    const alt = this.alt ? this.alt.apply(args) : void 0;
    return new _UplcProgramV2Impl(apply(this.root, args), { alt });
  }
  /**
   * @param {UplcValue[] | undefined} args - if None, eval the root term without any applications, if empy: apply a force to the root term
   * @param {object} [options]
   * @param {UplcLogger} [options.logOptions]
   * @param {number[]} [options.costModelParams]
   * @returns {CekResult}
   */
  eval(args, options = {}) {
    const { logOptions, costModelParams = DEFAULT_COST_MODEL_PARAMS_V2() } = options;
    const costModel = makeCostModel(
      makeCostModelParamsProxy(costModelParams),
      builtinsV2
    );
    return evalProgram(builtinsV2, this.root, args, {
      costModel,
      logOptions
    });
  }
  /**
   * @returns {number[]} - 28 byte hash
   */
  hash() {
    if (!this._hash) {
      this._hash = hashProgram(this);
    }
    return this._hash;
  }
  /**
   * Returns the Cbor encoding of a script (flat bytes wrapped twice in Cbor bytearray).
   * @returns {number[]}
   */
  toCbor() {
    return encodeCborProgram(this.root, UPLC_VERSION2);
  }
  /**
   * @returns {number[]}
   */
  toFlat() {
    return encodeFlatProgram(this.root, UPLC_VERSION2);
  }
  /**
   * @returns {string}
   */
  toString() {
    return this.root.toString();
  }
  /**
   * @param {UplcProgramV2} alt
   * @returns {UplcProgramV2}
   */
  withAlt(alt) {
    return new _UplcProgramV2Impl(this.root, { alt, ir: this._ir });
  }
};

// node_modules/@helios-lang/ledger/src/hashes/DatumHash.js
function decodeDatumHash(bytes) {
  return new DatumHashImpl(decodeBytes(bytes));
}
function hashDatum(data) {
  return new DatumHashImpl(blake2b(data.toCbor()));
}
var DatumHashImpl = class {
  /**
   * @readonly
   * @type {number[]}
   */
  bytes;
  /**
   * @param {BytesLike} bytes
   */
  constructor(bytes) {
    this.bytes = toBytes(bytes);
    if (this.bytes.length != 32) {
      throw new Error(
        `expected 32 bytes for DatumHash, got ${this.bytes.length} bytes`
      );
    }
  }
  /**
   * @type {"DatumHash"}
   */
  get kind() {
    return "DatumHash";
  }
  /**
   * @returns {string}
   */
  dump() {
    return bytesToHex(this.bytes);
  }
  /**
   * @param {DatumHash} other
   */
  isEqual(other) {
    return equalsBytes(this.bytes, other.bytes);
  }
  /**
   * @returns {number[]}
   */
  toCbor() {
    return encodeBytes(this.bytes);
  }
  /**
   * @returns {string}
   */
  toHex() {
    return bytesToHex(this.bytes);
  }
  /**
   * Hexadecimal representation.
   * @returns {string}
   */
  toString() {
    return this.toHex();
  }
  /**
   * @returns {ByteArrayData}
   */
  toUplcData() {
    return makeByteArrayData(this.bytes);
  }
};

// node_modules/@helios-lang/ledger/src/hashes/MintingPolicyHash.js
function makeMintingPolicyHash(hash4, context = void 0) {
  if (typeof hash4 == "string" || Array.isArray(hash4)) {
    return new MintingPolicyHashImpl(hash4, context);
  } else if (typeof hash4 == "object" && "kind" in hash4 && hash4.kind == "MintingPolicyHash") {
    if (context === void 0) {
      return (
        /** @type {any} */
        hash4
      );
    } else {
      return new MintingPolicyHashImpl(hash4.bytes, context);
    }
  } else {
    return new MintingPolicyHashImpl(hash4, context);
  }
}
function compareMintingPolicyHashes(a, b) {
  return compareBytes(a.bytes, b.bytes);
}
function decodeMintingPolicyHash(bytes) {
  return makeMintingPolicyHash(decodeBytes(bytes));
}
var MintingPolicyHashImpl = class {
  /**
   * @readonly
   * @type {number[]}
   */
  bytes;
  /**
   * @readonly
   * @type {C}
   */
  context;
  /**
   * @param {BytesLike} bytes
   * @param {C} context
   */
  constructor(bytes, context = (
    /** @type {any} */
    void 0
  )) {
    this.bytes = toBytes(bytes);
    this.context = context;
    if (!(this.bytes.length == 28 || this.bytes.length == 0)) {
      throw new Error(
        `expected 0 or 28 bytes for MintingPolicyHash, got ${this.bytes.length}`
      );
    }
  }
  /**
   * @type {"MintingPolicyHash"}
   */
  get kind() {
    return "MintingPolicyHash";
  }
  /**
   * @param {MintingPolicyHash} other
   * @returns {boolean}
   */
  isEqual(other) {
    return equalsBytes(this.bytes, other.bytes);
  }
  /**
   * @returns {string}
   */
  toBech32() {
    return encodeBech32("asset", blake2b(this.bytes, 20));
  }
  /**
   * @returns {number[]}
   */
  toCbor() {
    return encodeBytes(this.bytes);
  }
  /**
   * @returns {string}
   */
  toHex() {
    return bytesToHex(this.bytes);
  }
  /**
   * @returns {string}
   */
  toString() {
    return this.toHex();
  }
  /**
   * @returns {ByteArrayData}
   */
  toUplcData() {
    return makeByteArrayData(this.bytes);
  }
};

// node_modules/@helios-lang/ledger/src/hashes/PubKeyHash.js
function makePubKeyHash(arg) {
  if (typeof arg == "string") {
    return new PubKeyHashImpl(arg);
  } else if ("kind" in arg) {
    if (arg.kind != "PubKeyHash") {
      throw new Error("not a PubKeyHash");
    }
    return arg;
  } else {
    return new PubKeyHashImpl(arg);
  }
}
function decodePubKeyHash(bytes) {
  return new PubKeyHashImpl(decodeBytes(bytes));
}
var PubKeyHashImpl = class {
  /**
   * @readonly
   * @type {number[]}
   */
  bytes;
  /**
   * @param {Exclude<PubKeyHashLike, PubKeyHash>} bytes
   */
  constructor(bytes) {
    this.bytes = toBytes(bytes);
    if (this.bytes.length != 28) {
      throw new Error(
        `expected 28 bytes for PubKeyHash, got ${this.bytes.length}`
      );
    }
  }
  /**
   * @type {"PubKeyHash"}
   */
  get kind() {
    return "PubKeyHash";
  }
  /**
   * Diagnostic representation
   * @returns {string}
   */
  dump() {
    return this.toHex();
  }
  /**
   * @param {PubKeyHash} other
   * @returns {boolean}
   */
  isEqual(other) {
    return equalsBytes(this.bytes, other.bytes);
  }
  /**
   * @returns {number[]}
   */
  toCbor() {
    return encodeBytes(this.bytes);
  }
  /**
   * @returns {string}
   */
  toHex() {
    return bytesToHex(this.bytes);
  }
  /**
   * Hexadecimal representation.
   * @returns {string}
   */
  toString() {
    return this.toHex();
  }
  /**
   * @returns {ByteArrayData}
   */
  toUplcData() {
    return makeByteArrayData(this.bytes);
  }
};

// node_modules/@helios-lang/ledger/src/hashes/StakingValidatorHash.js
function makeStakingValidatorHash(hash4, context = void 0) {
  if (typeof hash4 == "string" || Array.isArray(hash4)) {
    return new StakingValidatorHashImpl(hash4, context);
  } else if (typeof hash4 == "object" && "kind" in hash4 && hash4.kind == "StakingValidatorHash") {
    if (context === void 0) {
      return (
        /** @type {any} */
        hash4
      );
    } else {
      return new StakingValidatorHashImpl(hash4.bytes, context);
    }
  } else {
    return new StakingValidatorHashImpl(hash4, context);
  }
}
function decodeStakingValidatorHash(bytes) {
  return makeStakingValidatorHash(decodeBytes(bytes));
}
var StakingValidatorHashImpl = class {
  /**
   * @readonly
   * @type {number[]}
   */
  bytes;
  /**
   * @readonly
   * @type {C}
   */
  context;
  /**
   * @param {BytesLike} bytes
   * @param {C} context
   */
  constructor(bytes, context = (
    /** @type {any} */
    void 0
  )) {
    this.bytes = toBytes(bytes);
    this.context = context;
    if (this.bytes.length != 28) {
      throw new Error(
        `expected 28 bytes for StakingValidatorHash, got ${this.bytes.length}`
      );
    }
  }
  /**
   * @type {"StakingValidatorHash"}
   */
  get kind() {
    return "StakingValidatorHash";
  }
  /**
   * @param {StakingValidatorHash} other
   * @returns {boolean}
   */
  isEqual(other) {
    return equalsBytes(this.bytes, other.bytes);
  }
  /**
   * @returns {number[]}
   */
  toCbor() {
    return encodeBytes(this.bytes);
  }
  /**
   * @returns {string}
   */
  toHex() {
    return bytesToHex(this.bytes);
  }
  /**
   * @returns {string}
   */
  toString() {
    return this.toHex();
  }
  /**
   * @returns {ByteArrayData}
   */
  toUplcData() {
    return makeByteArrayData(this.bytes);
  }
};

// node_modules/@helios-lang/ledger/src/hashes/TxId.js
function makeDummyTxId(seed = -1) {
  if (seed == -1) {
    return new TxIdImpl(new Array(32).fill(255));
  } else {
    return new TxIdImpl(dummyBytes(32, seed));
  }
}
function makeTxId(arg) {
  if (typeof arg == "object" && "kind" in arg && arg.kind == "TxId") {
    return arg;
  } else {
    return new TxIdImpl(arg);
  }
}
function decodeTxId(bytes) {
  return new TxIdImpl(decodeBytes(bytes));
}
var TxIdImpl = class {
  /**
   * @readonly
   * @type {number[]}
   */
  bytes;
  /**
   * @param {BytesLike} bytes
   */
  constructor(bytes) {
    this.bytes = toBytes(bytes);
    if (this.bytes.length != 32) {
      throw new Error(
        `expected 32 bytes for TxId, got ${this.bytes.length}`
      );
    }
  }
  /**
   * @type {"TxId"}
   */
  get kind() {
    return "TxId";
  }
  /**
   * @param {TxId} other
   * @returns {boolean}
   */
  isEqual(other) {
    return compareBytes(this.bytes, other.bytes) == 0;
  }
  /**
   * @returns {string}
   */
  toHex() {
    return bytesToHex(this.bytes);
  }
  /**
   * Hexadecimal representation.
   * @returns {string}
   */
  toString() {
    return this.toHex();
  }
  /**
   * @returns {number[]}
   */
  toCbor() {
    return encodeBytes(this.bytes);
  }
  /**
   * @returns {ConstrData}
   */
  toUplcData() {
    return makeConstrData(0, [makeByteArrayData(this.bytes)]);
  }
};

// node_modules/@helios-lang/ledger/src/hashes/ValidatorHash.js
function makeValidatorHash(hash4, context = void 0) {
  if (typeof hash4 == "string" || Array.isArray(hash4)) {
    return new ValidatorHashImpl(hash4, context);
  } else if (typeof hash4 == "object" && "kind" in hash4 && hash4.kind == "ValidatorHash") {
    if (context === void 0) {
      return (
        /** @type {any} */
        hash4
      );
    } else {
      return new ValidatorHashImpl(hash4.bytes, context);
    }
  } else {
    return new ValidatorHashImpl(hash4, context);
  }
}
var ValidatorHashImpl = class {
  /**
   * @readonly
   * @type {number[]}
   */
  bytes;
  /**
   * @readonly
   * @type {C}
   */
  context;
  /**
   * @param {BytesLike} bytes
   * @param {C | undefined} context
   */
  constructor(bytes, context = void 0) {
    this.bytes = toBytes(bytes);
    this.context = /** @type {any} */
    context;
    if (this.bytes.length != 28) {
      throw new Error(
        `expected 28 bytes for ValidatorHash, got ${this.bytes.length}`
      );
    }
  }
  /**
   * @type {"ValidatorHash"}
   */
  get kind() {
    return "ValidatorHash";
  }
  /**
   * @param {ValidatorHash} other
   * @returns {boolean}
   */
  isEqual(other) {
    return equalsBytes(this.bytes, other.bytes);
  }
  /**
   * @returns {number[]}
   */
  toCbor() {
    return encodeBytes(this.bytes);
  }
  /**
   * @returns {string}
   */
  toHex() {
    return bytesToHex(this.bytes);
  }
  /**
   * @returns {string}
   */
  toString() {
    return this.toHex();
  }
  /**
   * @returns {ByteArrayData}
   */
  toUplcData() {
    return makeByteArrayData(this.bytes);
  }
};

// node_modules/@helios-lang/ledger/src/address/StakingCredential.js
function convertStakingCredentialToUplcData(hash4) {
  return makeConstrData(0, [
    makeConstrData(hash4.kind == "StakingValidatorHash" ? 1 : 0, [
      hash4.toUplcData()
    ])
  ]);
}
function decodeStakingCredential(bytes) {
  const stream = makeByteStream({ bytes });
  const [tag, decodeItem] = decodeTagged(stream);
  switch (tag) {
    case 0:
      return decodeItem(decodePubKeyHash);
    case 1:
      return decodeItem(decodeStakingValidatorHash);
    default:
      throw new Error(
        `expected 0 or 1 StakingCredential cbor tag, got ${tag}`
      );
  }
}
function encodeStakingCredential(hash4) {
  return encodeTuple([
    encodeInt(hash4.kind == "PubKeyHash" ? 0 : 1),
    hash4.toCbor()
  ]);
}

// node_modules/@helios-lang/ledger/src/address/ShelleyAddress.js
function makeShelleyAddress(...args) {
  if (args.length == 1) {
    const arg = args[0];
    if (typeof arg == "string") {
      let [prefix, bytes] = decodeBech32(arg);
      let result = decodeShelleyAddress(bytes);
      if (prefix != result.bech32Prefix) {
        throw new Error("invalid Address prefix");
      }
      return (
        /** @type {any} */
        result
      );
    } else if (typeof arg == "object" && "kind" in arg && arg.kind == "Address") {
      return (
        /** @type {any} */
        arg
      );
    } else {
      return (
        /** @type {any} */
        decodeShelleyAddress(arg)
      );
    }
  } else if (args.length == 2) {
    return new ShelleyAddressImpl(args[0], args[1], void 0);
  } else if (args.length == 3) {
    return new ShelleyAddressImpl(args[0], args[1], args[2]);
  } else {
    throw new Error("invalid makeShelleyAddress args");
  }
}
function decodeShelleyAddress(bytes) {
  const innerBytes = isBytes(bytes) ? decodeBytes(bytes) : toBytes(bytes);
  const head = innerBytes[0];
  const mainnet = (head & 15) != 0;
  const type = head & 240;
  const firstPart = () => {
    return innerBytes.slice(1, 29);
  };
  const secondPart = () => {
    return innerBytes.slice(29, 57);
  };
  switch (type) {
    case 0:
      return makeShelleyAddress(
        mainnet,
        makePubKeyHash(firstPart()),
        makePubKeyHash(secondPart())
      );
    case 16:
      return makeShelleyAddress(
        mainnet,
        makeValidatorHash(firstPart()),
        makePubKeyHash(secondPart())
      );
    case 32:
      return makeShelleyAddress(
        mainnet,
        makePubKeyHash(firstPart()),
        makeStakingValidatorHash(secondPart())
      );
    case 48:
      return makeShelleyAddress(
        mainnet,
        makeValidatorHash(firstPart()),
        makePubKeyHash(secondPart())
      );
    case 96:
      return makeShelleyAddress(mainnet, makePubKeyHash(firstPart()));
    case 112:
      return makeShelleyAddress(mainnet, makeValidatorHash(firstPart()));
    default:
      throw new Error(`invalid Shelley Address header ${head}`);
  }
}
var ShelleyAddressImpl = class _ShelleyAddressImpl {
  /**
   * @readonly
   * @type {boolean}
   */
  mainnet;
  /**
   * @readonly
   * @type {SC}
   */
  spendingCredential;
  /**
   * @readonly
   * @type {StakingCredential | undefined}
   */
  stakingCredential;
  /**
   * @param {boolean} mainnet
   * @param {SC} spendingCredential
   * @param {StakingCredential | undefined} stakingCredential
   */
  constructor(mainnet, spendingCredential, stakingCredential = void 0) {
    this.mainnet = mainnet;
    this.spendingCredential = spendingCredential;
    this.stakingCredential = stakingCredential;
  }
  /**
   * @type {number[]}
   */
  get bytes() {
    if (this.stakingCredential) {
      if (this.spendingCredential.kind == "PubKeyHash") {
        if (this.stakingCredential.kind == "PubKeyHash") {
          return [this.mainnet ? 1 : 0].concat(this.spendingCredential.bytes).concat(this.stakingCredential.bytes);
        } else {
          return [this.mainnet ? 33 : 32].concat(this.spendingCredential.bytes).concat(this.stakingCredential.bytes);
        }
      } else {
        if (this.stakingCredential.kind == "PubKeyHash") {
          return [this.mainnet ? 17 : 16].concat(this.spendingCredential.bytes).concat(this.stakingCredential.bytes);
        } else {
          return [this.mainnet ? 49 : 48].concat(this.spendingCredential.bytes).concat(this.stakingCredential.bytes);
        }
      }
    } else if (this.spendingCredential.kind == "PubKeyHash") {
      return [this.mainnet ? 97 : 96].concat(
        this.spendingCredential.bytes
      );
    } else {
      return [this.mainnet ? 113 : 112].concat(
        this.spendingCredential.bytes
      );
    }
  }
  /**
   * @type {"Address"}
   */
  get kind() {
    return "Address";
  }
  /**
   * @type {"Shelley"}
   */
  get era() {
    return "Shelley";
  }
  /**
   * @type {"addr" | "addr_test"}
   */
  get bech32Prefix() {
    return this.mainnet ? "addr" : "addr_test";
  }
  /**
   * @returns {ShelleyAddress<SC>}
   */
  copy() {
    return new _ShelleyAddressImpl(
      this.mainnet,
      this.spendingCredential,
      this.stakingCredential
    );
  }
  /**
   * @returns {object}
   */
  dump() {
    return {
      hex: this.toHex(),
      bech32: this.toBech32()
    };
  }
  /**
   * @param {Address} other
   * @returns {boolean}
   */
  isEqual(other) {
    if (other.era == "Shelley" && this.mainnet == other.mainnet) {
      if (this.spendingCredential.kind == "PubKeyHash" && other.spendingCredential.kind == "PubKeyHash") {
        if (!this.spendingCredential.isEqual(other.spendingCredential)) {
          return false;
        }
      } else if (this.spendingCredential.kind == "ValidatorHash" && other.spendingCredential.kind == "ValidatorHash") {
        if (!this.spendingCredential.isEqual(other.spendingCredential)) {
          return false;
        }
      } else {
        return false;
      }
      if (this.stakingCredential === void 0) {
        return other.stakingCredential === void 0;
      } else if (this.stakingCredential.kind == "PubKeyHash" && other.stakingCredential?.kind == "PubKeyHash") {
        return this.stakingCredential.isEqual(other.stakingCredential);
      } else if (this.stakingCredential.kind == "StakingValidatorHash" && other.stakingCredential?.kind == "StakingValidatorHash") {
        return this.stakingCredential.isEqual(other.stakingCredential);
      } else {
        return false;
      }
    }
    return false;
  }
  /**
   * Converts an `Address` into its Bech32 representation.
   * @returns {string}
   */
  toBech32() {
    return encodeBech32(this.bech32Prefix, this.bytes);
  }
  /**
   * Converts an `Address` into its CBOR representation.
   * @returns {number[]}
   */
  toCbor() {
    return encodeBytes(this.bytes);
  }
  /**
   * Converts a `Address` into its hexadecimal representation.
   * @returns {string}
   */
  toHex() {
    return bytesToHex(this.bytes);
  }
  /**
   * @returns {string}
   */
  toString() {
    return this.toBech32();
  }
  /**
   * @returns {UplcData}
   */
  toUplcData() {
    return makeConstrData(0, [
      this.spendingCredential.toUplcData(),
      wrapUplcDataOption(
        this.stakingCredential ? convertStakingCredentialToUplcData(this.stakingCredential) : void 0
      )
    ]);
  }
};

// node_modules/@helios-lang/ledger/src/address/Address.js
var makeAddress = makeShelleyAddress;

// node_modules/@helios-lang/ledger/src/address/StakingAddress.js
function makeStakingAddress(...args) {
  if (args.length == 1) {
    return (
      /** @type {any} */
      parseStakingAddress(args[0])
    );
  } else {
    return new StakingAddressImpl(args[0], args[1]);
  }
}
function parseStakingAddress(str) {
  const [prefix, bytes] = decodeBech32(str);
  const result = decodeStakingAddress(bytes);
  if (prefix != result.bech32Prefix) {
    throw new Error("invalid StakingAddress prefix");
  }
  return result;
}
function decodeStakingAddress(bytes) {
  const innerBytes = isBytes(bytes) ? decodeBytes(bytes) : toBytes(bytes);
  const head = innerBytes[0];
  const mainnet = (head & 15) != 0;
  const type = head & 240;
  const hashBytes = innerBytes.slice(1, 29);
  switch (type) {
    case 224:
      return makeStakingAddress(mainnet, makePubKeyHash(hashBytes));
    case 240:
      return makeStakingAddress(
        mainnet,
        makeStakingValidatorHash(hashBytes)
      );
    default:
      throw new Error(`invalid Staking Address header ${head}`);
  }
}
function compareStakingAddresses(a, b) {
  return compareBytes(a.stakingCredential.bytes, b.stakingCredential.bytes);
}
var StakingAddressImpl = class {
  /**
   * @readonly
   * @type {boolean}
   */
  mainnet;
  /**
   * @readonly
   * @type {SC}
   */
  stakingCredential;
  /**
   * @param {boolean} mainnet
   * @param {SC} stakingCredential
   */
  constructor(mainnet, stakingCredential) {
    this.mainnet = mainnet;
    this.stakingCredential = stakingCredential;
  }
  /**
   * @type {"StakingAddress"}
   */
  get kind() {
    return "StakingAddress";
  }
  /**
   * @type {"stake" | "stake_test"}
   */
  get bech32Prefix() {
    return this.mainnet ? "stake" : "stake_test";
  }
  get bytes() {
    if (this.stakingCredential.kind == "PubKeyHash") {
      return [this.mainnet ? 225 : 224].concat(
        this.stakingCredential.bytes
      );
    } else {
      return [this.mainnet ? 241 : 240].concat(
        this.stakingCredential.bytes
      );
    }
  }
  /**
   * @param {StakingAddress} other
   * @returns {boolean}
   */
  isEqual(other) {
    return equalsBytes(this.bytes, other.bytes);
  }
  /**
   * Converts a `StakingAddress` into its Bech32 representation.
   * @returns {string}
   */
  toBech32() {
    return encodeBech32(this.bech32Prefix, this.bytes);
  }
  /**
   * Converts a `StakingAddress` into its CBOR representation.
   * @returns {number[]}
   */
  toCbor() {
    return encodeBytes(this.bytes);
  }
  /**
   * Converts a `StakingAddress` into its hexadecimal representation.
   * @returns {string}
   */
  toHex() {
    return bytesToHex(this.bytes);
  }
  /**
   * @returns {ConstrData}
   */
  toUplcData() {
    return convertStakingCredentialToUplcData(this.stakingCredential);
  }
};

// node_modules/@helios-lang/ledger/src/money/AssetClass.js
function makeAssetClass(...args) {
  if (args.length == 2) {
    return new AssetClassImpl(args[0], toBytes(args[1]));
  } else {
    const arg = args[0];
    if (typeof arg == "object" && "kind" in arg && arg.kind == "AssetClass") {
      return (
        /** @type {any} */
        arg
      );
    } else if (typeof arg == "string") {
      return (
        /** @type {any} */
        parseAssetClass(arg)
      );
    } else if (Array.isArray(arg)) {
      return (
        /** @type {any} */
        new AssetClassImpl(
          makeMintingPolicyHash(arg[0]),
          toBytes(arg[1])
        )
      );
    } else {
      return (
        /** @type {any} */
        new AssetClassImpl(
          makeMintingPolicyHash(arg.mph),
          toBytes(arg.tokenName)
        )
      );
    }
  }
}
function parseAssetClass(s) {
  const parts = s.split(".");
  if (parts.length != 2) {
    throw new Error(
      `expected <mph>.<tokenName> in hex encoded AssetClass, got ${s}`
    );
  }
  return new AssetClassImpl(
    makeMintingPolicyHash(parts[0]),
    toBytes(parts[1])
  );
}
function compareAssetClasses(a, b) {
  const i = compareMintingPolicyHashes(a.mph, b.mph);
  if (i != 0) {
    return i;
  }
  return compareBytes(a.tokenName, b.tokenName);
}
var AssetClassImpl = class {
  /**
   * @readonly
   * @type {MintingPolicyHash<C>}
   */
  mph;
  /**
   * @readonly
   * @type {number[]}
   */
  tokenName;
  /**
   * @param {MintingPolicyHash<C>} mph
   * @param {number[]} tokenName
   */
  constructor(mph, tokenName) {
    this.mph = mph;
    this.tokenName = tokenName;
  }
  /**
   * @type {"AssetClass"}
   */
  get kind() {
    return "AssetClass";
  }
  /**
   * @param {AssetClass} other
   * @returns {boolean}
   */
  isEqual(other) {
    return this.mph.isEqual(other.mph) && equalsBytes(this.tokenName, other.tokenName);
  }
  /**
   * @param {AssetClass} other
   * @returns {boolean}
   */
  isGreaterThan(other) {
    return compareAssetClasses(this, other) > 0;
  }
  /**
   * Converts an `AssetClass` instance into its CBOR representation.
   * @returns {number[]}
   */
  toCbor() {
    return encodeConstr(0, [this.mph.toCbor(), encodeBytes(this.tokenName)]);
  }
  /**
   * Cip14 fingerprint
   * This involves a hash, so you can't use a fingerprint to calculate the underlying policy/tokenName.
   * @returns {string}
   */
  toFingerprint() {
    return encodeBech32(
      "asset",
      blake2b(this.mph.bytes.concat(this.tokenName), 20)
    );
  }
  /**
   * @returns {string}
   */
  toString() {
    return `${this.mph.toHex()}.${bytesToHex(this.tokenName)}`;
  }
  /**
   * Used when generating script contexts for running programs
   * @returns {ConstrData}
   */
  toUplcData() {
    return makeConstrData(0, [
      this.mph.toUplcData(),
      makeByteArrayData(this.tokenName)
    ]);
  }
};
var ADA = parseAssetClass(".");

// node_modules/@helios-lang/ledger/src/money/Assets.js
var CIP68_PREFIXES = ["000643b0", "000de140", "0014df10", "001BC280"];
function makeAssets(arg = []) {
  if (typeof arg == "object" && "kind" in arg && arg.kind == "Assets") {
    return (
      /** @type {any} */
      arg
    );
  } else {
    const assets = (Array.isArray(arg) ? arg : Object.entries(arg)).map(
      ([mphOrAssetClass, tokensOrQty]) => {
        if (typeof tokensOrQty == "number" || typeof tokensOrQty == "bigint" || typeof tokensOrQty == "string") {
          const qty = BigInt(tokensOrQty);
          const assetClass = makeAssetClass(mphOrAssetClass);
          const entry = [
            assetClass.mph,
            [[assetClass.tokenName, qty]]
          ];
          return entry;
        } else {
          const mph = mphOrAssetClass;
          const tokens = tokensOrQty;
          const entry = [
            makeMintingPolicyHash(mph),
            (Array.isArray(tokens) ? tokens : Object.entries(tokens)).map(([tokenName, qty]) => [
              toBytes(tokenName),
              BigInt(qty)
            ])
          ];
          return entry;
        }
      }
    );
    return (
      /** @type {any} */
      new AssetsImpl(assets)
    );
  }
}
function decodeAssets(bytes) {
  const stream = makeByteStream({ bytes });
  return new AssetsImpl(
    decodeMap(
      stream,
      decodeMintingPolicyHash,
      (innerBytes) => decodeMap(innerBytes, decodeBytes, decodeInt)
    )
  );
}
var AssetsImpl = class {
  /**
   * @type {[MintingPolicyHash, [number[], bigint][]][]}
   */
  assets;
  /**
   * @param {[MintingPolicyHash, [number[], bigint][]][]} assets
   */
  constructor(assets) {
    this.assets = assets;
    this.normalize();
  }
  /**
   * @type {"Assets"}
   */
  get kind() {
    return "Assets";
  }
  /**
   * @type {AssetClass[]}
   */
  get assetClasses() {
    const assetClasses = [];
    for (let [mph, tokens] of this.assets) {
      for (let [tokenName] of tokens) {
        assetClasses.push(makeAssetClass(mph, tokenName));
      }
    }
    return assetClasses;
  }
  /**
   * @param {Assets} other
   * @returns {Assets}
   */
  add(other) {
    return this.applyBinOp(other, (a, b) => a + b);
  }
  /**
   * @param {AssetClassLike} assetClass
   * @param {IntLike} qty
   * @returns {void}
   */
  addAssetClassQuantity(assetClass, qty) {
    const ac = makeAssetClass(assetClass);
    this.addPolicyTokenQuantity(ac.mph, ac.tokenName, qty);
  }
  /**
   * @param {MintingPolicyHashLike} policy
   * @param {BytesLike} tokenName
   * @param {IntLike} qty
   */
  addPolicyTokenQuantity(policy, tokenName, qty) {
    const mph = makeMintingPolicyHash(policy);
    const tokenNameBytes = toBytes(tokenName);
    const qty_ = BigInt(qty);
    if (qty == 0n) {
      return;
    }
    const entry = this.assets.find((asset) => mph.isEqual(asset[0]));
    if (entry) {
      const token = entry[1].find(
        (pair) => compareBytes(pair[0], tokenNameBytes) == 0
      );
      if (token) {
        token[1] += qty_;
      } else {
        entry[1].push([tokenNameBytes, qty_]);
      }
    } else {
      this.assets.push([mph, [[tokenNameBytes, qty_]]]);
    }
    this.removeZeroes();
  }
  /**
   * Mutates 'this'.
   * Throws error if mph is already contained in 'this'.
   * @param {MintingPolicyHashLike} mph
   * @param {[BytesLike, IntLike][]} tokens
   */
  addPolicyTokens(mph, tokens) {
    const mph_ = makeMintingPolicyHash(mph);
    for (let asset of this.assets) {
      if (asset[0].isEqual(mph_)) {
        throw new Error(`MultiAsset already contains ${mph_.toHex()}`);
      }
    }
    this.assets.push([
      mph_,
      tokens.map(([tokenName, qty]) => [toBytes(tokenName), BigInt(qty)])
    ]);
    this.sort();
  }
  /**
   * @private
   * @param {Assets} other
   * @param {(a: bigint, b: bigint) => bigint} op
   * @returns {Assets}
   */
  applyBinOp(other, op) {
    let res = makeAssets();
    for (let [mph, tokens] of this.assets) {
      for (let [tokenName, quantity] of tokens) {
        res.addPolicyTokenQuantity(mph, tokenName, op(quantity, 0n));
      }
    }
    for (let [mph, tokens] of other.assets) {
      for (let [tokenName, quantity] of tokens) {
        res.addPolicyTokenQuantity(mph, tokenName, op(0n, quantity));
      }
    }
    return res;
  }
  /**
   * Throws an error if any contained quantity <= 0n
   */
  assertAllPositive() {
    if (!this.isAllPositive()) {
      throw new Error("non-positive token amounts detected");
    }
  }
  assertSorted() {
    this.assets.forEach((b, i) => {
      if (i > 0) {
        const a = this.assets[i - 1];
        if (compareMintingPolicyHashes(a[0], b[0]) >= 0) {
          throw new Error(
            `assets not sorted (${a[0].toHex()} vs ${b[0].toHex()})`
          );
        }
        b[1].forEach((bb, j) => {
          if (j > 0) {
            const aa = b[1][j - 1];
            if (compareBytes(aa[0], bb[0], true) >= 0) {
              throw new Error("tokens not sorted");
            }
          }
        });
      }
    });
  }
  /**
   * @returns {number}
   */
  countTokens() {
    return this.assets.reduce(
      (prev, [_mph, tokens]) => prev + tokens.length,
      0
    );
  }
  /**
   * @returns {Assets}
   */
  copy() {
    return makeAssets(this.assets.slice());
  }
  /**
   * @returns {object}
   */
  dump() {
    return Object.fromEntries(
      this.assets.map(([mph, tokens]) => [
        mph.toHex(),
        Object.fromEntries(
          tokens.map(([tokenName, qty]) => {
            const hasCip68Prefix = CIP68_PREFIXES.includes(
              bytesToHex(tokenName.slice(0, 4))
            );
            return [
              bytesToHex(tokenName),
              {
                name: hasCip68Prefix ? decodeUtf8(tokenName.slice(4)) : isValidUtf8(tokenName) ? decodeUtf8(tokenName) : void 0,
                quantity: qty.toString()
              }
            ];
          })
        )
      ])
    );
  }
  /**
   * Returns 0n if not found
   * @param {AssetClassLike} assetClass
   * @returns {bigint}
   */
  getAssetClassQuantity(assetClass) {
    const ac = makeAssetClass(assetClass);
    return this.getPolicyTokenQuantity(ac.mph, ac.tokenName);
  }
  /**
   * Returns 0n if not found
   * @param {MintingPolicyHashLike} policy
   * @param {BytesLike} tokenName
   * @returns {bigint}
   */
  getPolicyTokenQuantity(policy, tokenName) {
    const mph = makeMintingPolicyHash(policy);
    const tokenNameBytes = toBytes(tokenName);
    const entry = this.assets.find((asset) => mph.isEqual(asset[0]));
    if (entry) {
      const token = entry[1].find(
        (pair) => compareBytes(pair[0], tokenNameBytes) == 0
      );
      return token ? token[1] : 0n;
    } else {
      return 0n;
    }
  }
  /**
   * Returns a list of all the minting policies.
   * @returns {MintingPolicyHash[]}
   */
  getPolicies() {
    return this.assets.map(([mph, _tokens]) => mph);
  }
  /**
   * Returns empty if mph not found
   * @param {MintingPolicyHashLike} policy
   * @returns {[number[], bigint][]}
   */
  getPolicyTokens(policy) {
    const mph = makeMintingPolicyHash(policy);
    const entry = this.assets.find((entry2) => entry2[0].isEqual(mph));
    return entry ? entry[1] : [];
  }
  /**
   * Returns an empty array if policy isn't found
   * @param {MintingPolicyHashLike} policy
   * @returns {number[][]}
   */
  getPolicyTokenNames(policy) {
    const mph = makeMintingPolicyHash(policy);
    for (let [otherMph, tokens] of this.assets) {
      if (otherMph.isEqual(mph)) {
        return tokens.map(([tokenName, _qty]) => tokenName);
      }
    }
    return [];
  }
  /**
   * @param {AssetClassLike} assetClass
   * @returns {boolean}
   */
  hasAssetClass(assetClass) {
    const ac = makeAssetClass(assetClass);
    return this.hasPolicyToken(ac.mph, ac.tokenName);
  }
  /**
   * @param {MintingPolicyHashLike} policy
   * @param {BytesLike} tokenName
   * @returns {boolean}
   */
  hasPolicyToken(policy, tokenName) {
    const mph = makeMintingPolicyHash(policy);
    const tokenNameBytes = toBytes(tokenName);
    const entry = this.assets.find((asset) => mph.isEqual(asset[0]));
    if (entry) {
      return entry[1].findIndex(
        (pair) => compareBytes(pair[0], tokenNameBytes) == 0
      ) != -1;
    } else {
      return false;
    }
  }
  /**
   * @returns {boolean}
   */
  isAllPositive() {
    for (let [_mph, tokens] of this.assets) {
      for (let [_tokenName, qty] of tokens) {
        if (qty < 0n) {
          return false;
        } else if (qty == 0n) {
          throw new Error("unexpected");
        }
      }
    }
    return true;
  }
  /**
   * @param {Assets} other
   * @returns {boolean}
   */
  isEqual(other) {
    for (let [mph, tokens] of this.assets) {
      for (let [tokenName, qty] of tokens) {
        if (qty != other.getPolicyTokenQuantity(mph, tokenName)) {
          return false;
        }
      }
    }
    for (let [mph, tokens] of other.assets) {
      for (let [tokenName, qty] of tokens) {
        if (qty != this.getPolicyTokenQuantity(mph, tokenName)) {
          return false;
        }
      }
    }
    return true;
  }
  /**
   * @param {Assets} other
   * @returns {boolean}
   */
  isGreaterOrEqual(other) {
    if (this.isZero()) {
      return other.isZero();
    }
    if (this.assets.some(
      ([mph, tokens]) => tokens.some(
        ([tokenName, qty]) => qty < other.getPolicyTokenQuantity(mph, tokenName)
      )
    )) {
      return false;
    }
    if (other.assets.some(
      ([mph, tokens]) => tokens.some(
        ([tokenName]) => !this.hasPolicyToken(mph, tokenName)
      )
    )) {
      return false;
    }
    return true;
  }
  /**
   * Strict gt, if other contains assets this one doesn't contain => return false
   * @param {Assets} other
   * @returns {boolean}
   */
  isGreaterThan(other) {
    if (this.isZero()) {
      return false;
    }
    if (this.assets.some(
      ([mph, tokens]) => tokens.some(
        ([tokenName, qty]) => qty <= other.getPolicyTokenQuantity(mph, tokenName)
      )
    )) {
      return false;
    }
    if (other.assets.some(
      ([mph, tokens]) => tokens.some(
        ([tokenName]) => !this.hasPolicyToken(mph, tokenName)
      )
    )) {
      return false;
    }
    return true;
  }
  /**
   * @returns {boolean}
   */
  isZero() {
    return this.assets.length == 0;
  }
  /**
   * @param {IntLike} scalar
   * @returns {Assets}
   */
  multiply(scalar) {
    const s = BigInt(scalar);
    return makeAssets(
      this.assets.map(([mph, tokens]) => {
        return (
          /** @type {[MintingPolicyHash, [number[], bigint][]]} */
          [
            mph,
            tokens.map(([token, qty]) => [token, qty * s])
          ]
        );
      })
    );
  }
  /**
   * Removes zeroes and merges duplicates.
   * In-place algorithm.
   * Keeps the same order as much as possible.
   */
  normalize() {
    const assets = /* @__PURE__ */ new Map();
    for (let [mph, tokens] of this.assets) {
      let outerPrev = assets.get(mph.toHex());
      if (!outerPrev) {
        outerPrev = /* @__PURE__ */ new Map();
      }
      for (let [tokenName, qty] of tokens) {
        let innerPrev = outerPrev.get(bytesToHex(tokenName));
        if (!innerPrev) {
          innerPrev = 0n;
        }
        innerPrev += qty;
        outerPrev.set(bytesToHex(tokenName), innerPrev);
      }
      assets.set(mph.toHex(), outerPrev);
    }
    const entries = Array.from(assets.entries());
    this.assets = entries.map(([rawMph, rawTokens]) => {
      const tokens = Array.from(rawTokens.entries());
      return [
        makeMintingPolicyHash(rawMph),
        tokens.map(([rawTokenName, rawQty]) => [
          toBytes(rawTokenName),
          rawQty
        ])
      ];
    });
  }
  /**
   * Mutates 'this'
   */
  removeZeroes() {
    for (let asset of this.assets) {
      asset[1] = asset[1].filter((token) => token[1] != 0n);
    }
    this.assets = this.assets.filter((asset) => asset[1].length != 0);
  }
  /**
   * Makes sure minting policies are in correct order, and for each minting policy make sure the tokens are in the correct order
   * Mutates 'this'
   */
  sort() {
    this.assets.sort(([a], [b]) => {
      return compareMintingPolicyHashes(a, b);
    });
    this.assets.forEach(([_mph, tokens]) => {
      tokens.sort(([a], [b]) => {
        return compareBytes(a, b, true);
      });
    });
  }
  /**
   * @param {Assets} other
   * @returns {Assets}
   */
  subtract(other) {
    return this.applyBinOp(other, (a, b) => a - b);
  }
  /**
   * @returns {number[]}
   */
  toCbor() {
    return encodeMap(
      this.assets.map(([mph, tokens]) => {
        return [
          mph.toCbor(),
          encodeMap(
            tokens.map(([tokenName, qty]) => [
              encodeBytes(tokenName),
              encodeInt(qty)
            ])
          )
        ];
      })
    );
  }
  /**
   * Used when generating script contexts for running programs
   * @returns {MapData}
   */
  toUplcData() {
    return makeMapData(
      this.assets.map(([mph, tokens]) => [
        mph.toUplcData(),
        makeMapData(
          tokens.map(([tokenName, qty]) => [
            makeByteArrayData(tokenName),
            makeIntData(qty)
          ])
        )
      ])
    );
  }
};

// node_modules/@helios-lang/ledger/src/money/Value.js
function makeValue(...args) {
  if (args.length == 2) {
    const [a, b] = args;
    if (typeof a == "number" || typeof a == "bigint") {
      return new ValueImpl(
        a,
        /** @type {any} */
        b
      );
    } else {
      return new ValueImpl(0n, makeAssets([[
        a,
        /** @type {any} */
        b
      ]]));
    }
  } else if (args.length == 3) {
    return new ValueImpl(0n, makeAssets([[args[0], [[args[1], args[2]]]]]));
  } else if (args.length == 1) {
    const arg = args[0];
    if (typeof arg == "number" || typeof arg == "bigint") {
      return new ValueImpl(arg);
    } else if (typeof arg == "object" && "kind" in arg && arg.kind == "Value") {
      return arg.copy();
    } else if (Array.isArray(arg)) {
      return new ValueImpl(arg[0], arg[1]);
    } else if (typeof arg == "object" && "lovelace" in arg) {
      return new ValueImpl(arg.lovelace, arg.assets);
    } else {
      throw new Error(`unhandled makeValue() argument ${arg}`);
    }
  } else {
    throw new Error("invalid number of arguments");
  }
}
function decodeValue(bytes) {
  const stream = makeByteStream({ bytes });
  if (isTuple2(bytes)) {
    const [lovelace, assets] = decodeTuple(stream, [
      decodeInt,
      decodeAssets
    ]);
    return makeValue(lovelace, assets);
  } else {
    return makeValue(decodeInt(stream));
  }
}
var ValueImpl = class {
  /**
   * Mutatable which is useful in case of tx balancing
   * @type {bigint}
   */
  lovelace;
  /**
   * @type {Assets}
   */
  assets;
  /**
   * @param {IntLike} lovelace
   * @param {AssetsLike} assets
   */
  constructor(lovelace = 0n, assets = []) {
    this.lovelace = BigInt(lovelace);
    this.assets = makeAssets(assets);
  }
  /**
   * @type {"Value"}
   */
  get kind() {
    return "Value";
  }
  /**
   * Only include AssetClass.ADA if lovelace != 0n
   * @type {AssetClass[]}
   */
  get assetClasses() {
    return (this.lovelace == 0n ? [] : [ADA]).concat(
      this.assets.assetClasses
    );
  }
  /**
   * Adds two `Value` instances together. Returns a new `Value` instance.
   * @param {Value} other
   * @returns {Value}
   */
  add(other) {
    return makeValue(
      this.lovelace + other.lovelace,
      this.assets.add(other.assets)
    );
  }
  /**
   * Throws an error if any of the `Value` entries is negative.
   *
   * Used when building transactions because transactions can't contain negative values.
   * @returns {Value} - returns this
   */
  assertAllPositive() {
    if (this.lovelace < 0n) {
      throw new Error("negative lovelace");
    }
    this.assets.assertAllPositive();
    return this;
  }
  /**
   * Deep copy
   * @returns {Value}
   */
  copy() {
    return makeValue(this.lovelace, this.assets.copy());
  }
  /**
   * @returns {object}
   */
  dump() {
    return {
      lovelace: this.lovelace.toString(),
      assets: this.assets.dump()
    };
  }
  /**
   * Checks if two `Value` instances are equal (`Assets` need to be in the same order).
   * @param {Value} other
   * @returns {boolean}
   */
  isEqual(other) {
    return this.lovelace == other.lovelace && this.assets.isEqual(other.assets);
  }
  /**
   * Checks if a `Value` instance is strictly greater or equal to another `Value` instance. Returns false if any asset is missing.
   * @param {Value} other
   * @returns {boolean}
   */
  isGreaterOrEqual(other) {
    return this.lovelace >= other.lovelace && this.assets.isGreaterOrEqual(other.assets);
  }
  /**
   * Checks if a `Value` instance is strictly greater than another `Value` instance. Returns false if any asset is missing.
   * @param {Value} other
   * @returns {boolean}
   */
  isGreaterThan(other) {
    return this.lovelace > other.lovelace && this.assets.isGreaterThan(other.assets);
  }
  /**
   * Multiplies a `Value` by a whole number.
   * @param {IntLike} scalar
   * @returns {Value}
   */
  multiply(scalar) {
    const s = BigInt(scalar);
    return makeValue(this.lovelace * s, this.assets.multiply(s));
  }
  /**
   * Substracts one `Value` instance from another. Returns a new `Value` instance.
   * @param {Value} other
   * @returns {Value}
   */
  subtract(other) {
    return makeValue(
      this.lovelace - other.lovelace,
      this.assets.subtract(other.assets)
    );
  }
  /**
   * @returns {number[]}
   */
  toCbor() {
    if (this.assets.isZero()) {
      return encodeInt(this.lovelace);
    } else {
      return encodeTuple([encodeInt(this.lovelace), this.assets.toCbor()]);
    }
  }
  /**
   * Used when building script context
   * @param {boolean} isInScriptContext
   * @returns {MapData}
   */
  toUplcData(isInScriptContext = false) {
    const map = this.assets.toUplcData();
    if (this.lovelace != 0n || isInScriptContext) {
      map.items.unshift([
        makeByteArrayData([]),
        makeMapData([
          [makeByteArrayData([]), makeIntData(this.lovelace)]
        ])
      ]);
    }
    return map;
  }
};

// node_modules/@helios-lang/ledger/src/native/AfterScript.js
function makeAfterScript(slot) {
  const s = toInt(slot);
  return new AfterScriptImpl(s);
}
var AfterScriptImpl = class {
  /**
   * @readonly
   * @type {number}
   */
  slot;
  /**
   * @param {number} slot
   */
  constructor(slot) {
    this.slot = slot;
  }
  /**
   * @type {"After"}
   */
  get kind() {
    return "After";
  }
  /**
   * @param {NativeContext} ctx
   * @returns {boolean}
   */
  eval(ctx) {
    return ctx.isAfter(this.slot);
  }
  /**
   * @returns {number[]}
   */
  toCbor() {
    return encodeTuple([encodeInt(4), encodeInt(this.slot)]);
  }
  /**
   * @returns {AfterScriptJsonSafe}
   */
  toJsonSafe() {
    return {
      type: "after",
      slot: this.slot
    };
  }
};

// node_modules/@helios-lang/ledger/src/native/AllScript.js
function makeAllScript(scripts) {
  return new AllScriptImpl(scripts);
}
var AllScriptImpl = class {
  /**
   * @readonly
   * @type {NativeScript[]}
   */
  scripts;
  /**
   *
   * @param {NativeScript[]} scripts
   */
  constructor(scripts) {
    this.scripts = scripts;
  }
  /**
   * @type {"All"}
   */
  get kind() {
    return "All";
  }
  /**
   * @param {NativeContext} ctx
   * @returns {boolean}
   */
  eval(ctx) {
    return this.scripts.every((s) => s.eval(ctx));
  }
  /**
   * @returns {number[]}
   */
  toCbor() {
    return encodeTuple([encodeInt(1), encodeDefList(this.scripts)]);
  }
  /**
   * @returns {AllScriptJsonSafe}
   */
  toJsonSafe() {
    return {
      type: "all",
      scripts: this.scripts.map((s) => s.toJsonSafe())
    };
  }
};

// node_modules/@helios-lang/ledger/src/native/AnyScript.js
function makeAnyScript(scripts) {
  return new AnyScriptImpl(scripts);
}
var AnyScriptImpl = class {
  /**
   * @readonly
   * @type {NativeScript[]}
   */
  scripts;
  /**
   *
   * @param {NativeScript[]} scripts
   */
  constructor(scripts) {
    this.scripts = scripts;
  }
  /**
   * @type {"Any"}
   */
  get kind() {
    return "Any";
  }
  /**
   * @param {NativeContext} ctx
   * @returns {boolean}
   */
  eval(ctx) {
    return this.scripts.some((s) => s.eval(ctx));
  }
  /**
   * @returns {number[]}
   */
  toCbor() {
    return encodeTuple([encodeInt(2), encodeDefList(this.scripts)]);
  }
  /**
   * @returns {AnyScriptJsonSafe}
   */
  toJsonSafe() {
    return {
      type: "any",
      scripts: this.scripts.map((s) => s.toJsonSafe())
    };
  }
};

// node_modules/@helios-lang/ledger/src/native/AtLeastScript.js
function makeAtLeastScript(nRequired, scripts) {
  const n = scripts.length;
  const nr = toInt(nRequired);
  if (nr < 1 || nr > n) {
    throw new Error(
      `nRequired (${nr}) out of bounds, must be >= 1 and <= scripts.length (${n})`
    );
  }
  return new AtLeastScriptImpl(nr, scripts);
}
var AtLeastScriptImpl = class {
  /**
   * @readonly
   * @type {number}
   */
  nRequired;
  /**
   * @readonly
   * @type {NativeScript[]}
   */
  scripts;
  /**
   * @param {number} nRequired
   * @param {NativeScript[]} scripts
   */
  constructor(nRequired, scripts) {
    this.scripts = scripts;
    this.nRequired = nRequired;
  }
  /**
   * @type {"AtLeast"}
   */
  get kind() {
    return "AtLeast";
  }
  /**
   * @param {NativeContext} ctx
   * @returns {boolean}
   */
  eval(ctx) {
    const n = this.scripts.reduce((count, s) => {
      if (s.eval(ctx)) {
        return count + 1;
      } else {
        return count;
      }
    }, 0);
    return n >= this.nRequired;
  }
  /**
   * @returns {number[]}
   */
  toCbor() {
    return encodeTuple([
      encodeInt(3),
      encodeInt(this.nRequired),
      encodeDefList(this.scripts)
    ]);
  }
  /**
   * @returns {AtLeastScriptJsonSafe}
   */
  toJsonSafe() {
    return {
      type: "atLeast",
      required: this.nRequired,
      scripts: this.scripts.map((s) => s.toJsonSafe())
    };
  }
};

// node_modules/@helios-lang/ledger/src/native/BeforeScript.js
function makeBeforeScript(slot) {
  const s = toInt(slot);
  return new BeforeScriptImpl(s);
}
var BeforeScriptImpl = class {
  /**
   * @readonly
   * @type {number}
   */
  slot;
  /**
   * @param {number} slot
   */
  constructor(slot) {
    this.slot = slot;
  }
  /**
   * @type {"Before"}
   */
  get kind() {
    return "Before";
  }
  /**
   * @param {NativeContext} ctx
   * @returns {boolean}
   */
  eval(ctx) {
    return ctx.isBefore(this.slot);
  }
  /**
   * @returns {number[]}
   */
  toCbor() {
    return encodeTuple([encodeInt(5), encodeInt(this.slot)]);
  }
  /**
   * @returns {BeforeScriptJsonSafe}
   */
  toJsonSafe() {
    return {
      type: "before",
      slot: this.slot
    };
  }
};

// node_modules/@helios-lang/ledger/src/native/SigScript.js
function makeSigScript(hash4) {
  return new SigScriptImpl(hash4);
}
var SigScriptImpl = class {
  /**
   * @readonly
   * @type {PubKeyHash}
   */
  hash;
  /**
   * @param {PubKeyHashLike} hash
   */
  constructor(hash4) {
    this.hash = makePubKeyHash(hash4);
  }
  /**
   * @type {"Sig"}
   */
  get kind() {
    return "Sig";
  }
  /**
   * @param {NativeContext} ctx
   * @returns {boolean}
   */
  eval(ctx) {
    return ctx.isSignedBy(this.hash);
  }
  /**
   * @returns {number[]}
   */
  toCbor() {
    return encodeTuple([encodeInt(0), this.hash.toCbor()]);
  }
  /**
   * @returns {object}
   */
  toJsonSafe() {
    return {
      type: "sig",
      keyHash: this.hash.toHex()
    };
  }
};

// node_modules/@helios-lang/ledger/src/native/NativeScript.js
function decodeNativeScript(bytes) {
  const stream = makeByteStream({ bytes });
  if (stream.peekOne() == 0) {
    stream.shiftOne();
  }
  const [tag, decodeItem] = decodeTagged(stream);
  switch (tag) {
    case 0:
      return makeSigScript(decodeItem(decodePubKeyHash));
    case 1:
      return makeAllScript(
        decodeItem((s) => decodeList(s, decodeNativeScript))
      );
    case 2:
      return makeAnyScript(
        decodeItem((s) => decodeList(s, decodeNativeScript))
      );
    case 3:
      return makeAtLeastScript(
        decodeItem(decodeInt),
        decodeItem((s) => decodeList(s, decodeNativeScript))
      );
    case 4:
      return makeAfterScript(decodeItem(decodeInt));
    case 5:
      return makeBeforeScript(decodeItem(decodeInt));
    default:
      throw new Error(`unexpected NativeScript tag ${tag}`);
  }
}
function hashNativeScript(nativeScript) {
  const bytes = nativeScript.toCbor();
  bytes.unshift(0);
  return blake2b(bytes, 28);
}

// node_modules/@helios-lang/ledger/src/params/costmodel.js
var COST_MODEL_PARAM_NAMES_V1 = [
  "addInteger-cpu-arguments-intercept",
  "addInteger-cpu-arguments-slope",
  "addInteger-memory-arguments-intercept",
  "addInteger-memory-arguments-slope",
  "appendByteString-cpu-arguments-intercept",
  "appendByteString-cpu-arguments-slope",
  "appendByteString-memory-arguments-intercept",
  "appendByteString-memory-arguments-slope",
  "appendString-cpu-arguments-intercept",
  "appendString-cpu-arguments-slope",
  "appendString-memory-arguments-intercept",
  "appendString-memory-arguments-slope",
  "bData-cpu-arguments",
  "bData-memory-arguments",
  "blake2b_256-cpu-arguments-intercept",
  "blake2b_256-cpu-arguments-slope",
  "blake2b_256-memory-arguments",
  "cekApplyCost-exBudgetCPU",
  "cekApplyCost-exBudgetMemory",
  "cekBuiltinCost-exBudgetCPU",
  "cekBuiltinCost-exBudgetMemory",
  "cekConstCost-exBudgetCPU",
  "cekConstCost-exBudgetMemory",
  "cekDelayCost-exBudgetCPU",
  "cekDelayCost-exBudgetMemory",
  "cekForceCost-exBudgetCPU",
  "cekForceCost-exBudgetMemory",
  "cekLamCost-exBudgetCPU",
  "cekLamCost-exBudgetMemory",
  "cekStartupCost-exBudgetCPU",
  "cekStartupCost-exBudgetMemory",
  "cekVarCost-exBudgetCPU",
  "cekVarCost-exBudgetMemory",
  "chooseData-cpu-arguments",
  "chooseData-memory-arguments",
  "chooseList-cpu-arguments",
  "chooseList-memory-arguments",
  "chooseUnit-cpu-arguments",
  "chooseUnit-memory-arguments",
  "consByteString-cpu-arguments-intercept",
  "consByteString-cpu-arguments-slope",
  "consByteString-memory-arguments-intercept",
  "consByteString-memory-arguments-slope",
  "constrData-cpu-arguments",
  "constrData-memory-arguments",
  "decodeUtf8-cpu-arguments-intercept",
  "decodeUtf8-cpu-arguments-slope",
  "decodeUtf8-memory-arguments-intercept",
  "decodeUtf8-memory-arguments-slope",
  "divideInteger-cpu-arguments-constant",
  "divideInteger-cpu-arguments-model-arguments-intercept",
  "divideInteger-cpu-arguments-model-arguments-slope",
  "divideInteger-memory-arguments-intercept",
  "divideInteger-memory-arguments-minimum",
  "divideInteger-memory-arguments-slope",
  "encodeUtf8-cpu-arguments-intercept",
  "encodeUtf8-cpu-arguments-slope",
  "encodeUtf8-memory-arguments-intercept",
  "encodeUtf8-memory-arguments-slope",
  "equalsByteString-cpu-arguments-constant",
  "equalsByteString-cpu-arguments-intercept",
  "equalsByteString-cpu-arguments-slope",
  "equalsByteString-memory-arguments",
  "equalsData-cpu-arguments-intercept",
  "equalsData-cpu-arguments-slope",
  "equalsData-memory-arguments",
  "equalsInteger-cpu-arguments-intercept",
  "equalsInteger-cpu-arguments-slope",
  "equalsInteger-memory-arguments",
  "equalsString-cpu-arguments-constant",
  "equalsString-cpu-arguments-intercept",
  "equalsString-cpu-arguments-slope",
  "equalsString-memory-arguments",
  "fstPair-cpu-arguments",
  "fstPair-memory-arguments",
  "headList-cpu-arguments",
  "headList-memory-arguments",
  "iData-cpu-arguments",
  "iData-memory-arguments",
  "ifThenElse-cpu-arguments",
  "ifThenElse-memory-arguments",
  "indexByteString-cpu-arguments",
  "indexByteString-memory-arguments",
  "lengthOfByteString-cpu-arguments",
  "lengthOfByteString-memory-arguments",
  "lessThanByteString-cpu-arguments-intercept",
  "lessThanByteString-cpu-arguments-slope",
  "lessThanByteString-memory-arguments",
  "lessThanEqualsByteString-cpu-arguments-intercept",
  "lessThanEqualsByteString-cpu-arguments-slope",
  "lessThanEqualsByteString-memory-arguments",
  "lessThanEqualsInteger-cpu-arguments-intercept",
  "lessThanEqualsInteger-cpu-arguments-slope",
  "lessThanEqualsInteger-memory-arguments",
  "lessThanInteger-cpu-arguments-intercept",
  "lessThanInteger-cpu-arguments-slope",
  "lessThanInteger-memory-arguments",
  "listData-cpu-arguments",
  "listData-memory-arguments",
  "mapData-cpu-arguments",
  "mapData-memory-arguments",
  "mkCons-cpu-arguments",
  "mkCons-memory-arguments",
  "mkNilData-cpu-arguments",
  "mkNilData-memory-arguments",
  "mkNilPairData-cpu-arguments",
  "mkNilPairData-memory-arguments",
  "mkPairData-cpu-arguments",
  "mkPairData-memory-arguments",
  "modInteger-cpu-arguments-constant",
  "modInteger-cpu-arguments-model-arguments-intercept",
  "modInteger-cpu-arguments-model-arguments-slope",
  "modInteger-memory-arguments-intercept",
  "modInteger-memory-arguments-minimum",
  "modInteger-memory-arguments-slope",
  "multiplyInteger-cpu-arguments-intercept",
  "multiplyInteger-cpu-arguments-slope",
  "multiplyInteger-memory-arguments-intercept",
  "multiplyInteger-memory-arguments-slope",
  "nullList-cpu-arguments",
  "nullList-memory-arguments",
  "quotientInteger-cpu-arguments-constant",
  "quotientInteger-cpu-arguments-model-arguments-intercept",
  "quotientInteger-cpu-arguments-model-arguments-slope",
  "quotientInteger-memory-arguments-intercept",
  "quotientInteger-memory-arguments-minimum",
  "quotientInteger-memory-arguments-slope",
  "remainderInteger-cpu-arguments-constant",
  "remainderInteger-cpu-arguments-model-arguments-intercept",
  "remainderInteger-cpu-arguments-model-arguments-slope",
  "remainderInteger-memory-arguments-intercept",
  "remainderInteger-memory-arguments-minimum",
  "remainderInteger-memory-arguments-slope",
  "sha2_256-cpu-arguments-intercept",
  "sha2_256-cpu-arguments-slope",
  "sha2_256-memory-arguments",
  "sha3_256-cpu-arguments-intercept",
  "sha3_256-cpu-arguments-slope",
  "sha3_256-memory-arguments",
  "sliceByteString-cpu-arguments-intercept",
  "sliceByteString-cpu-arguments-slope",
  "sliceByteString-memory-arguments-intercept",
  "sliceByteString-memory-arguments-slope",
  "sndPair-cpu-arguments",
  "sndPair-memory-arguments",
  "subtractInteger-cpu-arguments-intercept",
  "subtractInteger-cpu-arguments-slope",
  "subtractInteger-memory-arguments-intercept",
  "subtractInteger-memory-arguments-slope",
  "tailList-cpu-arguments",
  "tailList-memory-arguments",
  "trace-cpu-arguments",
  "trace-memory-arguments",
  "unBData-cpu-arguments",
  "unBData-memory-arguments",
  "unConstrData-cpu-arguments",
  "unConstrData-memory-arguments",
  "unIData-cpu-arguments",
  "unIData-memory-arguments",
  "unListData-cpu-arguments",
  "unListData-memory-arguments",
  "unMapData-cpu-arguments",
  "unMapData-memory-arguments",
  "verifyEd25519Signature-cpu-arguments-intercept",
  "verifyEd25519Signature-cpu-arguments-slope",
  "verifyEd25519Signature-memory-arguments"
];
var COST_MODEL_PARAM_NAMES_V2 = COST_MODEL_PARAM_NAMES_V1.slice(0, 133).concat([
  "serialiseData-cpu-arguments-intercept",
  "serialiseData-cpu-arguments-slope",
  "serialiseData-memory-arguments-intercept",
  "serialiseData-memory-arguments-slope"
]).concat(COST_MODEL_PARAM_NAMES_V1.slice(137, 167)).concat([
  "verifyEcdsaSecp256k1Signature-cpu-arguments",
  "verifyEcdsaSecp256k1Signature-memory-arguments",
  "verifyEd25519Signature-cpu-arguments-intercept",
  "verifyEd25519Signature-cpu-arguments-slope",
  "verifyEd25519Signature-memory-arguments",
  "verifySchnorrSecp256k1Signature-cpu-arguments-intercept",
  "verifySchnorrSecp256k1Signature-cpu-arguments-slope",
  "verifySchnorrSecp256k1Signature-memory-arguments "
]);

// node_modules/@helios-lang/ledger/src/params/NetworkParamsHelper.js
function makeNetworkParamsHelper(params) {
  return new NetworkParamsHelperImpl(params);
}
var NetworkParamsHelperImpl = class {
  /**
   * @readonly
   * @type {T}
   */
  params;
  /**
   * @param {T} params
   */
  constructor(params) {
    this.params = params;
  }
  /**
   * @type {number[]}
   */
  get costModelParamsV1() {
    return expectDefined(
      this.params?.costModelParamsV1,
      "'networkParams.costModelParamsV1' undefined"
    );
  }
  /**
   * @type {number[]}
   */
  get costModelParamsV2() {
    return expectDefined(
      this.params?.costModelParamsV2,
      "'networkParams.costModelParamsV2' undefined"
    );
  }
  /**
   * @type {number[]}
   */
  get costModelParamsV3() {
    return expectDefined(
      this.params?.costModelParamsV3,
      "'networkParams.costModelParamsV3' undefined"
    );
  }
  /**
   * @type {[number, number]} - a + b*txSize
   */
  get txFeeParams() {
    return [
      expectDefined(
        this.params?.txFeeFixed,
        "'networkParams.txFeeFixed' undefined"
      ),
      expectDefined(
        this.params?.txFeePerByte,
        "'networkParams.txFeePerByte' undefined"
      )
    ];
  }
  /**
   * @type {[number, number]} - [memPrice, cpuPrice]
   */
  get exFeeParams() {
    return [
      expectDefined(
        this.params?.exMemFeePerUnit,
        "'networkParams.exMemFeePerUnit' undefined"
      ),
      expectDefined(
        this.params?.exCpuFeePerUnit,
        "'networkParams.exCpuFeePerUnit' undefined"
      )
    ];
  }
  /**
   * @type {number}
   */
  get refScriptsFeePerByte() {
    return expectDefined(
      this.params?.refScriptsFeePerByte,
      "'networkParams.refScriptsFeePerByte' undefined"
    );
  }
  /**
   * @type {number}
   */
  get lovelacePerUtxoByte() {
    return expectDefined(
      this.params?.utxoDepositPerByte,
      "'networkParams.utxoDepositPerByte' undefined"
    );
  }
  /**
   * @type {number}
   */
  get minCollateralPct() {
    return expectDefined(
      this.params?.collateralPercentage,
      "'networkParams.collateralPercentage' undefined"
    );
  }
  /**
   * @type {number}
   */
  get maxCollateralInputs() {
    return expectDefined(
      this.params?.maxCollateralInputs,
      "'networkParams.maxCollateralInputs' undefined"
    );
  }
  /**
   * @type {[number, number]} - [mem, cpu]
   */
  get maxTxExecutionBudget() {
    return [
      expectDefined(
        this.params?.maxTxExMem,
        "'networkParams.maxTxExMem' undefined"
      ),
      expectDefined(
        this.params?.maxTxExCpu,
        "'networkParams.maxTxExCpu' undefined"
      )
    ];
  }
  /**
   * Tx balancing picks additional inputs by starting from maxTxFee.
   * This is done because the order of the inputs can have a huge impact on the tx fee, so the order must be known before balancing.
   * If there aren't enough inputs to cover the maxTxFee and the min deposits of newly created UTxOs, the balancing will fail.
   * TODO: make this private once we are in Conway era, because this should always take into account the cost of ref scripts
   * @type {bigint}
   */
  get maxTxFee() {
    const [a, b] = this.txFeeParams;
    const [feePerMem, feePerCpu] = this.exFeeParams;
    const [maxMem, maxCpu] = this.maxTxExecutionBudget;
    return BigInt(a) + BigInt(Math.ceil(b * this.maxTxSize)) + BigInt(Math.ceil(feePerMem * maxMem)) + BigInt(Math.ceil(feePerCpu * maxCpu));
  }
  /**
   * @param {bigint} refScriptsSize
   * @returns {bigint}
   */
  calcMaxConwayTxFee(refScriptsSize) {
    const f = this.maxTxFee;
    return f + refScriptsSize * BigInt(this.refScriptsFeePerByte);
  }
  /**
   * @type {number}
   */
  get maxTxSize() {
    return expectDefined(
      this.params?.maxTxSize,
      "'networkParams.maxTxSize' undefined"
    );
  }
  /**
   * @type {number}
   */
  get secondsPerSlot() {
    return expectDefined(
      this.params?.secondsPerSlot,
      "'networkParams.secondsPerSlot' undefined"
    );
  }
  /**
   * @type {bigint}
   */
  get stakeAddressDeposit() {
    return BigInt(
      expectDefined(
        this.params?.stakeAddrDeposit,
        "'networkParams.stakeAddrDeposit' undefined"
      )
    );
  }
  /**
   * @type {number}
   */
  get latestTipSlot() {
    return expectDefined(
      this.params?.refTipSlot,
      "'networkParams.refTipSlot' undefined"
    );
  }
  /**
   * @type {number}
   */
  get latestTipTime() {
    return expectDefined(
      this.params?.refTipTime,
      "'networkParams.refTipTime' undefined"
    );
  }
  /**
   * Calculates the time (in milliseconds in 01/01/1970) associated with a given slot number.
   * @param {IntLike} slot
   * @returns {number}
   */
  slotToTime(slot) {
    const slotDiff = toInt(slot) - this.latestTipSlot;
    return this.latestTipTime + slotDiff * this.secondsPerSlot * 1e3;
  }
  /**
   * Calculates the slot number associated with a given time. Time is specified as milliseconds since 01/01/1970.
   * @param {IntLike} time Milliseconds since 1970
   * @returns {number}
   */
  timeToSlot(time) {
    const timeDiff = toInt(time) - this.latestTipTime;
    return this.latestTipSlot + Math.round(timeDiff / (1e3 * this.secondsPerSlot));
  }
};

// node_modules/@helios-lang/ledger/src/signature/PubKey.js
function makePubKey(arg) {
  if (typeof arg == "object" && "kind" in arg && arg.kind == "PubKey") {
    return arg;
  } else {
    return new PubKeyImpl(arg);
  }
}
function makeDummyPubKey(seed = 0) {
  return new PubKeyImpl(dummyBytes(32, seed));
}
function decodePubKey(bytes) {
  return new PubKeyImpl(decodeBytes(bytes));
}
var PubKeyImpl = class {
  /**
   * @readonly
   * @type {number[]}
   */
  bytes;
  /**
   * @param {BytesLike} props
   */
  constructor(props) {
    this.bytes = toBytes(props);
    if (this.bytes.length != 32) {
      throw new Error(`expected 32 for PubKey, got ${this.bytes.length}`);
    }
  }
  /**
   * @type {"PubKey"}
   */
  get kind() {
    return "PubKey";
  }
  /**
   * @returns {string}
   */
  dump() {
    return this.toHex();
  }
  /**
   * @returns {boolean}
   */
  isDummy() {
    return this.bytes.every((b) => b == 0);
  }
  /**
   * @returns {number[]}
   */
  toCbor() {
    return encodeBytes(this.bytes);
  }
  /**
   * @returns {PubKeyHash}
   */
  hash() {
    return makePubKeyHash(blake2b(this.bytes, 28));
  }
  /**
   * Hexadecimal representation.
   * @returns {string}
   */
  toHex() {
    return bytesToHex(this.bytes);
  }
  /**
   * @returns {ByteArrayData}
   */
  toUplcData() {
    return makeByteArrayData(this.bytes);
  }
};

// node_modules/@helios-lang/ledger/src/signature/Signature.js
function makeSignature(pubKey, bytes) {
  return new SignatureImpl(pubKey, bytes);
}
function makeDummySignature(seed = 0) {
  return new SignatureImpl(makeDummyPubKey(seed), dummyBytes(64, seed));
}
function decodeSignature2(bytes) {
  const stream = makeByteStream({ bytes });
  const [pubKey, signatureBytes] = decodeTuple(stream, [
    decodePubKey,
    decodeBytes
  ]);
  return new SignatureImpl(pubKey, signatureBytes);
}
var SignatureImpl = class {
  /**
   * @readonly
   * @type {PubKey}
   */
  pubKey;
  /**
   * @readonly
   * @type {number[]}
   */
  bytes;
  /**
   * @param {PubKeyLike} pubKey
   * @param {BytesLike} bytes
   */
  constructor(pubKey, bytes) {
    this.pubKey = makePubKey(pubKey);
    this.bytes = toBytes(bytes);
  }
  /**
   * @type {"Signature"}
   */
  get kind() {
    return "Signature";
  }
  /**
   * @type {PubKeyHash}
   */
  get pubKeyHash() {
    return this.pubKey.hash();
  }
  /**
   * Diagnostic representation
   * @returns {Object}
   */
  dump() {
    return {
      pubKey: this.pubKey.dump,
      pubKeyHash: this.pubKeyHash.dump(),
      signature: bytesToHex(this.bytes)
    };
  }
  /**
   * @returns {boolean}
   */
  isDummy() {
    return this.pubKey.isDummy() && this.bytes.every((b) => b == 0);
  }
  /**
   * @returns {number[]}
   */
  toCbor() {
    return encodeTuple([this.pubKey.toCbor(), encodeBytes(this.bytes)]);
  }
  /**
   * Throws error if incorrect
   * @param {number[]} msg
   * @returns {void}
   */
  verify(msg) {
    if (this.bytes === null) {
      throw new Error("signature can't be null");
    } else {
      if (this.pubKey === null) {
        throw new Error("pubKey can't be null");
      } else {
        if (!Ed25519.verify(this.bytes, msg, this.pubKey.bytes)) {
          throw new Error("incorrect signature");
        }
      }
    }
  }
};

// node_modules/@helios-lang/ledger/src/time/Time.js
function toTime(arg) {
  if (arg instanceof Date) {
    return arg.getTime();
  } else if (typeof arg == "bigint") {
    return Number(arg);
  } else if (arg == Number.POSITIVE_INFINITY || arg == Number.NEGATIVE_INFINITY) {
    return arg;
  } else if (Number.isNaN(arg)) {
    throw new Error("NaN");
  } else {
    return Math.round(arg);
  }
}

// node_modules/@helios-lang/ledger/src/time/TimeRange.js
function makeTimeRange(...args) {
  if (args.length == 1) {
    const arg = args[0];
    if (typeof arg == "object" && "kind" in arg && arg.kind == "TimeRange") {
      return arg;
    } else if (Array.isArray(arg)) {
      return new TimeRangeImpl(arg[0], arg[1]);
    } else {
      return new TimeRangeImpl(
        arg?.start ?? Number.NEGATIVE_INFINITY,
        arg?.end ?? Number.POSITIVE_INFINITY,
        {
          excludeStart: (
            /** @type {any} */
            arg?.excludeStart
          ),
          excludeEnd: (
            /** @type {any} */
            arg?.excludeEnd
          )
        }
      );
    }
  } else if (args.length == 2) {
    return new TimeRangeImpl(args[0], args[1]);
  } else if (args.length == 3) {
    return new TimeRangeImpl(args[0], args[1], args[2]);
  } else {
    throw new Error("invalid number of arguments for makeTimeRange");
  }
}
var TimeRangeImpl = class {
  /**
   * @readonly
   * @type {number}
   */
  start;
  /**
   * @readonly
   * @type {boolean}
   */
  includeStart;
  /**
   * @readonly
   * @type {number}
   */
  end;
  /**
   * @readonly
   * @type {boolean}
   */
  includeEnd;
  /**
   * @param {TimeLike} start - milliseconds since 1970
   * @param {TimeLike} end - milliseconds since 1970
   * @param {TimeRangeOptions} options
   */
  constructor(start, end, options = {}) {
    this.start = toTime(start);
    this.end = toTime(end);
    this.includeStart = !(options.excludeStart ?? false);
    this.includeEnd = !(options.excludeEnd ?? false);
  }
  /**
   * @type {"TimeRange"}
   */
  get kind() {
    return "TimeRange";
  }
  /**
   * @type {number | undefined}
   */
  get finiteStart() {
    if (this.start !== Number.NEGATIVE_INFINITY && this.start !== Number.POSITIVE_INFINITY) {
      return this.start;
    } else {
      return void 0;
    }
  }
  /**
   * @type {number | undefined}
   */
  get finiteEnd() {
    if (this.end !== Number.NEGATIVE_INFINITY && this.end !== Number.POSITIVE_INFINITY) {
      return this.end;
    } else {
      return void 0;
    }
  }
  /**
   * @returns {string}
   */
  toString() {
    if (this.end == Number.NEGATIVE_INFINITY || this.start == Number.POSITIVE_INFINITY) {
      return "<never>";
    } else {
      return [
        `${this.includeStart ? "[" : "("}${this.start == Number.NEGATIVE_INFINITY ? "-inf" : this.start.toString()}`,
        `${this.end == Number.POSITIVE_INFINITY ? "+inf" : this.end.toString()}${this.includeEnd ? "]" : ")"}`
      ].join(", ");
    }
  }
  /**
   * @returns {ConstrData}
   */
  toUplcData() {
    return makeConstrData(0, [
      makeConstrData(0, [
        encodeTimeRangeTimeData(this.start),
        boolToUplcData(this.includeStart)
      ]),
      makeConstrData(0, [
        encodeTimeRangeTimeData(this.end),
        boolToUplcData(this.includeEnd)
      ])
    ]);
  }
};
function encodeTimeRangeTimeData(t) {
  switch (t) {
    case Number.NEGATIVE_INFINITY:
      return makeConstrData(0, []);
    case Number.POSITIVE_INFINITY:
      return makeConstrData(2, []);
    default:
      return makeConstrData(1, [makeIntData(Math.round(t))]);
  }
}
var ALWAYS = new TimeRangeImpl(
  Number.NEGATIVE_INFINITY,
  Number.POSITIVE_INFINITY
);
var NEVER = new TimeRangeImpl(
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY
);

// node_modules/@helios-lang/ledger/src/pool/PoolMetadata.js
function decodePoolMetadata(bytes) {
  const stream = makeByteStream({ bytes });
  const [url, _hash] = decodeTuple(stream, [decodeString, decodeBytes]);
  return new PoolMetadataImpl(url);
}
var PoolMetadataImpl = class {
  /**
   * @param {string} url
   */
  constructor(url) {
    this.url = url;
  }
  /**
   * @type {"PoolMetadata"}
   */
  get kind() {
    return "PoolMetadata";
  }
  toCbor() {
    const urlBytes = encodeString(this.url);
    const hash4 = blake2b(urlBytes);
    return encodeTuple([urlBytes, encodeBytes(hash4)]);
  }
};

// node_modules/@helios-lang/ledger/src/pool/SingleAddrPoolRelay.js
function makeSingleAddrPoolRelay(props) {
  return new SingleAddrPoolRelayImpl(props.port, props.ipv4, props.ipv6);
}
var SingleAddrPoolRelayImpl = class {
  /**
   * @readonly
   * @type {number | undefined}
   */
  port;
  /**
   * @readonly
   * @type {number[] | undefined}
   */
  ipv4;
  /**
   * @readonly
   * @type {number[] | undefined}
   */
  ipv6;
  /**
   * @param {number | undefined} port
   * @param {number[] | undefined} ipv4
   * @param {number[] | undefined} ipv6
   */
  constructor(port, ipv4, ipv6) {
    this.port = port;
    this.ipv4 = ipv4;
    this.ipv6 = ipv6;
  }
  /**
   * @type {"SingleAddrPoolRelay"}
   */
  get kind() {
    return "SingleAddrPoolRelay";
  }
  /**
   * @returns {number[]}
   */
  toCbor() {
    return encodeTuple([
      encodeInt(0),
      this.port ? encodeInt(this.port) : encodeNull(),
      this.ipv4 ? encodeBytes(this.ipv4) : encodeNull(),
      this.ipv6 ? encodeBytes(this.ipv6) : encodeNull()
    ]);
  }
};

// node_modules/@helios-lang/ledger/src/pool/SingleNamePoolRelay.js
function makeSingleNamePoolRelay(record, port = void 0) {
  return new SingleNamePoolRelayImpl(record, port);
}
var SingleNamePoolRelayImpl = class {
  /**
   * @readonly
   * @type {string}
   */
  record;
  /**
   * @readonly
   * @type {number | undefined}
   */
  port;
  /**
   * @param {string} record
   * @param {number | undefined} port
   */
  constructor(record, port) {
    this.record = record;
    this.port = port;
  }
  /**
   * @type {"SingleNamePoolRelay"}
   */
  get kind() {
    return "SingleNamePoolRelay";
  }
  /**
   * @returns {number[]}
   */
  toCbor() {
    return encodeTuple([
      encodeInt(1),
      this.port ? encodeInt(this.port) : encodeNull(),
      encodeString(this.record)
    ]);
  }
};

// node_modules/@helios-lang/ledger/src/pool/MultiNamePoolRelay.js
function makeMultiNamePoolRelay(record) {
  return new MultiNamePoolRelayImpl(record);
}
var MultiNamePoolRelayImpl = class {
  /**
   * @readonly
   * @type {string}
   */
  record;
  /**
   * @param {string} record
   */
  constructor(record) {
    this.record = record;
  }
  /**
   * @type {"MultiNamePoolRelay"}
   */
  get kind() {
    return "MultiNamePoolRelay";
  }
  /**
   * @returns {number[]}
   */
  toCbor() {
    return encodeTuple([encodeInt(2), encodeString(this.record)]);
  }
};

// node_modules/@helios-lang/ledger/src/pool/PoolRelay.js
function decodePoolRelay(bytes) {
  const stream = makeByteStream({ bytes });
  const [tag, decodeItem] = decodeTagged(stream);
  switch (tag) {
    case 0: {
      const port = decodeItem(
        (stream2) => decodeNullOption(stream2, decodeInt)
      );
      const ipv4 = decodeItem(
        (stream2) => decodeNullOption(stream2, decodeBytes)
      );
      const ipv6 = decodeItem(
        (stream2) => decodeNullOption(stream2, decodeBytes)
      );
      return makeSingleAddrPoolRelay({
        port: port ? Number(port) : void 0,
        ipv4: ipv4 ?? void 0,
        ipv6: ipv6 ?? void 0
      });
    }
    case 1: {
      const port = decodeItem(
        (stream2) => decodeNullOption(stream2, decodeInt)
      );
      const record = decodeItem(decodeString);
      return makeSingleNamePoolRelay(
        record,
        port ? Number(port) : void 0
      );
    }
    case 2: {
      const record = decodeItem(decodeString);
      return makeMultiNamePoolRelay(record);
    }
    default:
      throw new Error(`expected 0, 1 or 2 PoolRelay CBOR tag, got ${tag}`);
  }
}

// node_modules/@helios-lang/ledger/src/pool/PoolParameters.js
function makePoolParameters(props) {
  return new PoolParametersImpl(props);
}
function decodePoolParameters(bytes) {
  const stream = makeByteStream({ bytes });
  const [
    id,
    vrf,
    pledge,
    cost,
    margin,
    rewardAccount,
    owners,
    relays,
    metadata
  ] = decodeTuple(stream, [
    decodePubKeyHash,
    decodePubKeyHash,
    decodeInt,
    decodeInt,
    decodeFloat322,
    decodeStakingAddress,
    (stream2) => decodeList(stream2, decodePubKeyHash),
    (stream2) => decodeList(stream2, decodePoolRelay),
    (stream2) => decodeNullOption(stream2, decodePoolMetadata)
  ]);
  return makePoolParameters({
    id,
    vrf,
    pledge,
    cost,
    margin,
    rewardAccount,
    owners,
    relays,
    metadata: metadata ?? void 0
  });
}
var PoolParametersImpl = class {
  /**
   * @readonly
   * @type {PubKeyHash}
   */
  id;
  /**
   * @readonly
   * @type {PubKeyHash}
   */
  vrf;
  /**
   * @readonly
   * @type {bigint}
   */
  pledge;
  /**
   * @readonly
   * @type {bigint}
   */
  cost;
  /**
   * @readonly
   * @type {number}
   */
  margin;
  /**
   * @readonly
   * @type {StakingAddress}
   */
  rewardAccount;
  /**
   * @readonly
   * @type {PubKeyHash[]}
   */
  owners;
  /**
   * @readonly
   * @type {PoolRelay[]}
   */
  relays;
  /**
   * @readonly
   * @type {PoolMetadata | undefined}
   */
  metadata;
  /**
   * @param {PoolParametersProps} props
   */
  constructor({
    id,
    vrf,
    pledge,
    cost,
    margin,
    rewardAccount,
    owners,
    relays,
    metadata
  }) {
    this.id = id;
    this.vrf = vrf;
    this.pledge = pledge;
    this.cost = cost;
    this.margin = margin;
    this.rewardAccount = rewardAccount;
    this.owners = owners;
    this.relays = relays;
    this.metadata = metadata;
  }
  /**
   * @returns {number[]}
   */
  toCbor() {
    return encodeTuple([
      this.id.toCbor(),
      this.vrf.toCbor(),
      encodeInt(this.pledge),
      encodeInt(this.cost),
      encodeFloat322(this.margin),
      // TODO: test this,
      this.rewardAccount.toCbor(),
      encodeList(this.owners),
      encodeList(this.relays),
      encodeNullOption(this.metadata)
    ]);
  }
};

// node_modules/@helios-lang/ledger/src/tx/RegistrationDCert.js
function makeRegistrationDCert(credential) {
  return new RegistrationDCertImpl(credential);
}
var RegistrationDCertImpl = class {
  /**
   * @readonly
   * @type {StakingCredential}
   */
  credential;
  /**
   * @param {StakingCredential} credential
   */
  constructor(credential) {
    this.credential = credential;
  }
  /**
   * @type {"RegistrationDCert"}
   */
  get kind() {
    return "RegistrationDCert";
  }
  /**
   * @type {0}
   */
  get tag() {
    return 0;
  }
  /**
   * @returns {object}
   */
  dump() {
    return {
      dcertType: "Register"
    };
  }
  /**
   * @returns {number[]}
   */
  toCbor() {
    return encodeTuple([
      encodeInt(0),
      encodeStakingCredential(this.credential)
    ]);
  }
  /**
   * @returns {ConstrData}
   */
  toUplcData() {
    return makeConstrData(0, [
      convertStakingCredentialToUplcData(this.credential)
    ]);
  }
};

// node_modules/@helios-lang/ledger/src/tx/DeregistrationDCert.js
function makeDeregistrationDCert(credential) {
  return new DeregistrationDCertImpl(credential);
}
var DeregistrationDCertImpl = class {
  /**
   * @readonly
   * @type {StakingCredential}
   */
  credential;
  /**
   * @param {StakingCredential} credential
   */
  constructor(credential) {
    this.credential = credential;
  }
  /**
   * @type {"DeregistrationDCert"}
   */
  get kind() {
    return "DeregistrationDCert";
  }
  /**
   * @type {1}
   */
  get tag() {
    return 1;
  }
  /**
   * @returns {object}
   */
  dump() {
    return {
      dcertType: "Deregister"
    };
  }
  /**
   * @returns {number[]}
   */
  toCbor() {
    return encodeTuple([
      encodeInt(1),
      encodeStakingCredential(this.credential)
    ]);
  }
  /**
   * @returns {ConstrData}
   */
  toUplcData() {
    return makeConstrData(1, [
      convertStakingCredentialToUplcData(this.credential)
    ]);
  }
};

// node_modules/@helios-lang/ledger/src/tx/DelegationDCert.js
function makeDelegationDCert(credential, poolId) {
  return new DelegationDCertImpl(credential, poolId);
}
var DelegationDCertImpl = class {
  /**
   * @readonly
   * @type {StakingCredential}
   */
  credential;
  /**
   * @readonly
   * @type {PubKeyHash}
   */
  poolId;
  /**
   * @param {StakingCredential} credential
   * @param {PubKeyHash} poolId
   */
  constructor(credential, poolId) {
    this.credential = credential;
    this.poolId = poolId;
  }
  /**
   * @type {"DelegationDCert"}
   */
  get kind() {
    return "DelegationDCert";
  }
  /**
   * @type {2}
   */
  get tag() {
    return 2;
  }
  /**
   * @returns {object}
   */
  dump() {
    return {
      dcertType: "Delegate"
    };
  }
  /**
   * @returns {number[]}
   */
  toCbor() {
    return encodeTuple([
      encodeInt(2),
      encodeStakingCredential(this.credential),
      this.poolId.toCbor()
    ]);
  }
  /**
   * @returns {ConstrData}
   */
  toUplcData() {
    return makeConstrData(2, [
      convertStakingCredentialToUplcData(this.credential),
      this.poolId.toUplcData()
    ]);
  }
};

// node_modules/@helios-lang/ledger/src/tx/RetirePoolDCert.js
function makeRetirePoolDCert(poolId, epoch) {
  return new RetirePoolDCertImpl(poolId, toInt(epoch));
}
var RetirePoolDCertImpl = class {
  /**
   * @readonly
   * @type {PubKeyHash}
   */
  poolId;
  /**
   * @readonly
   * @type {number}
   */
  epoch;
  /**
   * @param {PubKeyHash} poolId
   * @param {number} epoch
   */
  constructor(poolId, epoch) {
    this.poolId = poolId;
    this.epoch = epoch;
  }
  /**
   * @type {"RetirePoolDCert"}
   */
  get kind() {
    return "RetirePoolDCert";
  }
  /**
   * @type {4}
   */
  get tag() {
    return 4;
  }
  /**
   * @returns {object}
   */
  dump() {
    return {
      dcertType: "RetirePool"
    };
  }
  /**
   * @returns {number[]}
   */
  toCbor() {
    return encodeTuple([encodeInt(4), this.poolId, encodeInt(this.epoch)]);
  }
  /**
   * @returns {ConstrData}
   */
  toUplcData() {
    return makeConstrData(4, [
      this.poolId.toUplcData(),
      makeIntData(this.epoch)
    ]);
  }
};

// node_modules/@helios-lang/ledger/src/tx/RegisterPoolDCert.js
function makeRegisterPoolDCert(params) {
  return new RegisterPoolDCertImpl(params);
}
var RegisterPoolDCertImpl = class {
  /**
   * @readonly
   * @type {PoolParameters}
   */
  parameters;
  /**
   * @param {PoolParameters} parameters
   */
  constructor(parameters) {
    this.parameters = parameters;
  }
  /**
   * @type {"RegisterPoolDCert"}
   */
  get kind() {
    return "RegisterPoolDCert";
  }
  /**
   * @type {3}
   */
  get tag() {
    return 3;
  }
  /**
   * @returns {object}
   */
  dump() {
    return {
      dcertType: "RegisterPool"
    };
  }
  /**
   * @returns {number[]}
   */
  toCbor() {
    return encodeTuple([encodeInt(3), this.parameters.toCbor()]);
  }
  /**
   * @returns {ConstrData}
   */
  toUplcData() {
    return makeConstrData({
      tag: 3,
      fields: [
        this.parameters.id.toUplcData(),
        this.parameters.vrf.toUplcData()
      ]
    });
  }
};

// node_modules/@helios-lang/ledger/src/tx/DCert.js
function decodeDCert(bytes) {
  const stream = makeByteStream({ bytes });
  const [tag, decodeItem] = decodeTagged(stream);
  switch (tag) {
    case 0:
      return makeRegistrationDCert(decodeItem(decodeStakingCredential));
    case 1:
      return makeDeregistrationDCert(decodeItem(decodeStakingCredential));
    case 2:
      return makeDelegationDCert(
        decodeItem(decodeStakingCredential),
        decodeItem(decodePubKeyHash)
      );
    case 3:
      return makeRegisterPoolDCert(decodeItem(decodePoolParameters));
    case 4:
      return makeRetirePoolDCert(
        decodeItem(decodePubKeyHash),
        decodeItem(decodeInt)
      );
    default:
      throw new Error(`unhandled DCert type (tag: ${tag})`);
  }
}

// node_modules/@helios-lang/ledger/src/tx/CertifyingPurpose.js
function makeCertifyingPurpose(dcert) {
  return new CertifyingPurposeImpl(dcert);
}
var CertifyingPurposeImpl = class {
  /**
   * @readonly
   * @type {DCert}
   */
  dcert;
  /**
   * @param {DCert} dcert
   */
  constructor(dcert) {
    this.dcert = dcert;
  }
  /**
   * @type {"CertifyingPurpose"}
   */
  get kind() {
    return "CertifyingPurpose";
  }
  /**
   * @returns {ConstrData}
   */
  toUplcData() {
    return makeConstrData(3, [this.dcert.toUplcData()]);
  }
  /**
   * @param {UplcData} txData
   * @returns {UplcData}
   */
  toScriptContextUplcData(txData) {
    return makeConstrData(0, [txData, this.toUplcData()]);
  }
};

// node_modules/@helios-lang/ledger/src/tx/HashedTxOutputDatum.js
function makeHashedTxOutputDatum(arg) {
  if (arg.kind == "DatumHash") {
    return new HashedTxOutputDatumImpl(arg);
  } else {
    return new HashedTxOutputDatumImpl(hashDatum(arg), arg);
  }
}
var HashedTxOutputDatumImpl = class _HashedTxOutputDatumImpl {
  /**
   * @readonly
   * @type {DatumHash}
   */
  hash;
  /**
   * @readonly
   * @type {UplcData | undefined}
   */
  data;
  /**
   * @param {DatumHash} hash
   * @param {UplcData | undefined} data
   */
  constructor(hash4, data = void 0) {
    this.hash = hash4;
    this.data = data;
  }
  /**
   * @type {"HashedTxOutputDatum"}
   */
  get kind() {
    return "HashedTxOutputDatum";
  }
  /**
   * @returns {HashedTxOutputDatum}
   */
  copy() {
    return new _HashedTxOutputDatumImpl(this.hash, this.data);
  }
  /**
   * @returns {object}
   */
  dump() {
    return {
      hash: this.hash.dump(),
      cbor: this.data ? bytesToHex(this.data.toCbor()) : null,
      schema: this.data ? JSON.parse(this.data.toSchemaJson()) : null
    };
  }
  /**
   * @returns {number[]}
   */
  toCbor() {
    return encodeTuple([encodeInt(0n), this.hash.toCbor()]);
  }
  /**
   * Used by script context emulation
   * @returns {ConstrData}
   */
  toUplcData() {
    return makeConstrData(1, [this.hash.toUplcData()]);
  }
};

// node_modules/@helios-lang/ledger/src/tx/InlineTxOutputDatum.js
function makeInlineTxOutputDatum(data) {
  return new InlineTxOutputDatumImpl(data);
}
var InlineTxOutputDatumImpl = class _InlineTxOutputDatumImpl {
  /**
   * @readonly
   * @type {UplcData}
   */
  data;
  /**
   * @param {UplcData} data
   */
  constructor(data) {
    this.data = data;
  }
  /**
   * @type {"InlineTxOutputDatum"}
   */
  get kind() {
    return "InlineTxOutputDatum";
  }
  /**
   * @type {DatumHash}
   */
  get hash() {
    return hashDatum(this.data);
  }
  /**
   * @returns {InlineTxOutputDatum}
   */
  copy() {
    return new _InlineTxOutputDatumImpl(this.data);
  }
  /**
   * @returns {Object}
   */
  dump() {
    return {
      inlineCbor: bytesToHex(this.data.toCbor()),
      inlineSchema: JSON.parse(this.data.toSchemaJson())
    };
  }
  /**
   * @returns {number[]}
   */
  toCbor() {
    return encodeTuple([
      encodeInt(1n),
      encodeTag(24n).concat(encodeBytes(this.data.toCbor()))
    ]);
  }
  /**
   * Used by script context emulation
   * @returns {ConstrData}
   */
  toUplcData() {
    return makeConstrData(2, [this.data]);
  }
};

// node_modules/@helios-lang/ledger/src/tx/MintingPurpose.js
function makeMintingPurpose(policy) {
  return new MintingPurposeImpl(policy);
}
var MintingPurposeImpl = class {
  /**
   * @readonly
   * @type {MintingPolicyHash}
   */
  policy;
  /**
   * @param {MintingPolicyHash} policy
   */
  constructor(policy) {
    this.policy = policy;
  }
  /**
   * @type {"MintingPurpose"}
   */
  get kind() {
    return "MintingPurpose";
  }
  /**
   * @returns {ConstrData}
   */
  toUplcData() {
    return makeConstrData(0, [this.policy.toUplcData()]);
  }
  /**
   * @param {UplcData} txData
   * @returns {UplcData}
   */
  toScriptContextUplcData(txData) {
    return makeConstrData(0, [txData, this.toUplcData()]);
  }
};

// node_modules/@helios-lang/ledger/src/tx/RewardingPurpose.js
function makeRewardingPurpose(stakingCredential) {
  return new RewardingPurposeImpl(stakingCredential);
}
var RewardingPurposeImpl = class {
  /**
   * @readonly
   * @type {StakingCredential}
   */
  credential;
  /**
   * @param {StakingCredential} stakingCredential
   */
  constructor(stakingCredential) {
    this.credential = stakingCredential;
  }
  /**
   * @type {"RewardingPurpose"}
   */
  get kind() {
    return "RewardingPurpose";
  }
  /**
   * @returns {ConstrData}
   */
  toUplcData() {
    return makeConstrData(2, [
      convertStakingCredentialToUplcData(this.credential)
    ]);
  }
  /**
   * @param {UplcData} txData
   * @returns {UplcData}
   */
  toScriptContextUplcData(txData) {
    return makeConstrData(0, [txData, this.toUplcData()]);
  }
};

// node_modules/@helios-lang/ledger/src/tx/SpendingPurpose.js
function makeSpendingPurpose(utxoId) {
  return new SpendingPurposeImpl(utxoId);
}
var SpendingPurposeImpl = class {
  /**
   * @readonly
   * @type {TxOutputId}
   */
  utxoId;
  /**
   * @param {TxOutputId}  utxoId
   */
  constructor(utxoId) {
    this.utxoId = utxoId;
  }
  /**
   * @type {"SpendingPurpose"}
   */
  get kind() {
    return "SpendingPurpose";
  }
  /**
   * @returns {ConstrData}
   */
  toUplcData() {
    return makeConstrData(1, [this.utxoId.toUplcData()]);
  }
  /**
   * @param {UplcData} txData
   * @returns {UplcData}
   */
  toScriptContextUplcData(txData) {
    return makeConstrData(0, [txData, this.toUplcData()]);
  }
};

// node_modules/@helios-lang/ledger/src/tx/ScriptContextV2.js
function makeScriptContextV2(txInfo, purpose) {
  return new ScriptContextV2Impl(txInfo, purpose);
}
var ScriptContextV2Impl = class {
  /**
   * @readonly
   * @type {TxInfo}
   */
  txInfo;
  /**
   * @readonly
   * @type {ScriptPurpose}
   */
  purpose;
  /**
   * @param {TxInfo} txInfo
   * @param {ScriptPurpose} purpose
   */
  constructor(txInfo, purpose) {
    this.txInfo = txInfo;
    this.purpose = purpose;
  }
  /**
   * @type {"ScriptContextV2"}
   */
  get kind() {
    return "ScriptContextV2";
  }
  /**
   * @returns {UplcData}
   */
  toUplcData() {
    const inputs = this.txInfo.inputs;
    const refInputs = this.txInfo.refInputs ?? [];
    const outputs = this.txInfo.outputs;
    const fee = this.txInfo.fee ?? 0n;
    const minted = this.txInfo.minted ?? makeAssets([]);
    const dcerts = this.txInfo.dcerts ?? [];
    const withdrawals = this.txInfo.withdrawals ?? [];
    const validityTimerange = this.txInfo.validityTimerange ?? ALWAYS;
    const signers = this.txInfo.signers ?? [];
    const redeemers = this.txInfo.redeemers ?? [];
    const datums = this.txInfo.datums ?? [];
    const txId = this.txInfo.id ?? makeDummyTxId();
    const txData = makeConstrData(0, [
      makeListData(inputs.map((input) => input.toUplcData())),
      makeListData(refInputs.map((input) => input.toUplcData())),
      makeListData(outputs.map((output) => output.toUplcData())),
      makeValue(fee).toUplcData(),
      // NOTE: all other Value instances in ScriptContext contain some lovelace, but `minted` can never contain any lovelace, yet cardano-node always prepends 0 lovelace to the `minted` MapData
      makeValue(0n, minted).toUplcData(true),
      makeListData(dcerts.map((cert) => cert.toUplcData())),
      makeMapData(
        withdrawals.map(([sa, q]) => [sa.toUplcData(), makeIntData(q)])
      ),
      validityTimerange.toUplcData(),
      makeListData(signers.map((signer) => signer.toUplcData())),
      makeMapData(
        redeemers.map((redeemer) => {
          if (redeemer.kind == "TxMintingRedeemer") {
            return [
              makeMintingPurpose(
                minted.getPolicies()[redeemer.policyIndex]
              ).toUplcData(),
              redeemer.data
            ];
          } else if (redeemer.kind == "TxSpendingRedeemer") {
            return [
              makeSpendingPurpose(
                inputs[redeemer.inputIndex].id
              ).toUplcData(),
              redeemer.data
            ];
          } else if (redeemer.kind == "TxRewardingRedeemer") {
            return [
              makeRewardingPurpose(
                withdrawals[redeemer.withdrawalIndex][0].stakingCredential
              ).toUplcData(),
              redeemer.data
            ];
          } else if (redeemer.kind == "TxCertifyingRedeemer") {
            return [
              makeCertifyingPurpose(
                dcerts[redeemer.dcertIndex]
              ).toUplcData(),
              redeemer.data
            ];
          } else {
            throw new Error(`unhandled TxRedeemer kind`);
          }
        })
      ),
      makeMapData(datums.map((d) => [hashDatum(d).toUplcData(), d])),
      makeConstrData(0, [makeByteArrayData(txId.bytes)])
    ]);
    return makeConstrData(0, [txData, this.purpose.toUplcData()]);
  }
};

// node_modules/@helios-lang/ledger/src/tx/TxOutputDatum.js
function decodeTxOutputDatum(bytes) {
  const [type, decodeItem] = decodeTagged(bytes);
  switch (type) {
    case 0:
      return makeHashedTxOutputDatum(decodeItem(decodeDatumHash));
    case 1:
      return makeInlineTxOutputDatum(
        decodeItem((bytes2) => {
          const tag = decodeTag(bytes2);
          if (tag != 24n) {
            throw new Error(`expected 24 as tag, got ${tag}`);
          }
          return decodeUplcData(decodeBytes(bytes2));
        })
      );
    default:
      throw new Error(`unhandled TxOutputDatum type ${type}`);
  }
}

// node_modules/@helios-lang/ledger/src/tx/TxOutput.js
var DEFAULT_TX_OUTPUT_ENCODING_CONFIG = {
  strictBabbage: true
};
function decodeTxOutput(bytes) {
  const stream = makeByteStream({ bytes });
  if (isObject2(bytes)) {
    const {
      0: address,
      1: value,
      2: datum,
      3: refScriptBytes
    } = decodeObjectIKey(stream, {
      0: decodeShelleyAddress,
      1: decodeValue,
      2: decodeTxOutputDatum,
      3: (stream2) => {
        if (decodeTag(stream2) != 24n) {
          throw new Error("unexpected reference script tag");
        }
        return decodeBytes(stream2);
      }
    });
    if (!address || !value) {
      throw new Error("unexpected TxOutput encoding");
    }
    const refScript = (() => {
      if (refScriptBytes) {
        const [scriptType, decodeScript] = decodeTagged(refScriptBytes);
        switch (scriptType) {
          case 0:
            throw new Error("native refScript not handled");
          case 1:
            return decodeScript(
              (bs) => decodeUplcProgramV1FromCbor(bs)
            );
          case 2:
            return decodeScript(
              (bs) => decodeUplcProgramV2FromCbor(bs)
            );
          default:
            throw new Error(`unhandled scriptType ${scriptType}`);
        }
      } else {
        return void 0;
      }
    })();
    return new TxOutputImpl(address, value, datum, refScript, {
      strictBabbage: true
    });
  } else if (isTuple2(bytes)) {
    const [address, value, datumHash] = decodeTuple(
      bytes,
      [decodeShelleyAddress, decodeValue],
      [decodeDatumHash]
    );
    return new TxOutputImpl(
      address,
      value,
      datumHash ? makeHashedTxOutputDatum(datumHash) : void 0
    );
  } else {
    throw new Error("unexpected TxOutput encoding");
  }
}
var TxOutputImpl = class _TxOutputImpl {
  /**
   * Mutation is useful when correcting the quantity of lovelace in a utxo
   * @type {Address<SC>}
   */
  address;
  /**
   * Mutation is handy when correcting the quantity of lovelace in a utxo
   * @type {Value}
   */
  value;
  /**
   * Mutation is handy when correcting the quantity of lovelace in a utxo
   * @type {TxOutputDatum | undefined}
   */
  datum;
  /**
   * @type {UplcProgramV1 | UplcProgramV2 | undefined}
   */
  refScript;
  /**
   * @type {TxOutputEncodingConfig}
   */
  encodingConfig;
  /**
   * Constructs a `TxOutput` instance using an `Address`, a `Value`, an optional `Datum`, and optional `UplcProgram` reference script.
   * @param {Address<SC> | ShelleyAddressLike} address
   * @param {ValueLike} value
   * @param {TxOutputDatum | undefined} datum
   * @param {UplcProgramV1 | UplcProgramV2 | undefined} refScript - plutus v2 script for now
   */
  constructor(address, value, datum = void 0, refScript = void 0, encodingConfig = DEFAULT_TX_OUTPUT_ENCODING_CONFIG) {
    this.address = /** @type {any} */
    typeof address != "string" && "kind" in address && address.kind == "Address" ? address : makeAddress(address);
    this.value = makeValue(value);
    this.datum = datum;
    this.refScript = refScript;
    this.encodingConfig = encodingConfig;
  }
  /**
   * Deep copy of the TxInput so that Network interfaces don't allow accidental mutation of the underlying data
   * @returns {TxOutput<SC>}
   */
  copy() {
    return new _TxOutputImpl(
      this.address.era == "Byron" ? this.address : this.address.copy(),
      this.value.copy(),
      this.datum?.copy(),
      this.refScript,
      this.encodingConfig
    );
  }
  /**
   * @returns {object}
   */
  dump() {
    return {
      address: this.address.era == "Byron" ? this.address.toBase58() : this.address.dump(),
      value: this.value.dump(),
      datum: this.datum ? this.datum.dump() : null,
      refScript: this.refScript ? bytesToHex(this.refScript.toCbor()) : null
    };
  }
  /**
   * @returns {number[]}
   */
  toCbor() {
    if ((!this.datum || this.datum.kind == "HashedTxOutputDatum") && !this.refScript && !this.encodingConfig.strictBabbage) {
      const fields = [this.address.toCbor(), this.value.toCbor()];
      if (this.datum && this.datum.kind == "HashedTxOutputDatum") {
        fields.push(this.datum.hash.toCbor());
      }
      return encodeTuple(fields);
    } else {
      const object = /* @__PURE__ */ new Map();
      object.set(0, this.address.toCbor());
      object.set(1, this.value.toCbor());
      if (this.datum) {
        object.set(2, this.datum.toCbor());
      }
      if (this.refScript) {
        object.set(
          3,
          encodeTag(24n).concat(
            encodeBytes(
              encodeTuple([
                encodeInt(
                  BigInt(this.refScript.plutusVersionTag)
                ),
                this.refScript.toCbor()
              ])
            )
          )
        );
      }
      return encodeObjectIKey(object);
    }
  }
  /**
   * @returns {ConstrData}
   */
  toUplcData() {
    const address = this.address;
    if (address.era == "Byron") {
      throw new Error("not yet implemented");
    }
    return makeConstrData(0, [
      address.toUplcData(),
      this.value.toUplcData(),
      this.datum ? this.datum.toUplcData() : makeConstrData(0, []),
      wrapUplcDataOption(
        this.refScript ? makeByteArrayData(this.refScript.hash()) : void 0
      )
    ]);
  }
  /**
   * Each UTxO must contain some minimum quantity of lovelace to avoid that the blockchain is used for data storage.
   * @param {NetworkParams} params
   * @returns {bigint}
   */
  calcDeposit(params) {
    const helper = makeNetworkParamsHelper(params);
    const lovelacePerByte = helper.lovelacePerUtxoByte;
    const correctedSize = this.toCbor().length + 160;
    return BigInt(correctedSize) * BigInt(lovelacePerByte);
  }
  /**
   * Makes sure the `TxOutput` contains the minimum quantity of lovelace.
   * The network requires this to avoid the creation of unusable dust UTxOs.
   *
   * Optionally an update function can be specified that allows mutating the datum of the `TxOutput` to account for an increase of the lovelace quantity contained in the value.
   * @param {NetworkParams} params
   * @param {((output: TxOutput<SC>) => void) | undefined} updater
   */
  correctLovelace(params, updater = void 0) {
    let minLovelace = this.calcDeposit(params);
    while (this.value.lovelace < minLovelace) {
      this.value.lovelace = minLovelace;
      if (updater != null) {
        updater(this);
      }
      minLovelace = this.calcDeposit(params);
    }
  }
};

// node_modules/@helios-lang/ledger/src/tx/TxOutputId.js
function makeTxOutputId(...args) {
  if (args.length == 2) {
    return new TxOutputIdImpl(args[0], toInt(args[1]));
  } else {
    const arg = args[0];
    if (typeof arg == "object" && "kind" in arg && arg.kind == "TxOutputId") {
      return arg;
    } else if (typeof arg == "string") {
      return parseTxOutputId(arg);
    } else if (Array.isArray(arg)) {
      const n = arg.length;
      if (n != 2) {
        throw new Error(
          `expected two entries in arg array of TxOutputId, got ${n}`
        );
      }
      return new TxOutputIdImpl(makeTxId(arg[0]), toInt(arg[1]));
    } else if (typeof arg == "object" && "txId" in arg && "utxoIdx" in arg) {
      return new TxOutputIdImpl(makeTxId(arg.txId), toInt(arg.utxoIdx));
    } else {
      throw new Error(
        `unhandled TxOutputId.new arguments ${JSON.stringify(arg)}`
      );
    }
  }
}
function decodeTxOutputId(bytes) {
  const stream = makeByteStream({ bytes });
  const [txId, index] = decodeTuple(stream, [decodeTxId, decodeInt]);
  return new TxOutputIdImpl(txId, toInt(index));
}
function parseTxOutputId(str) {
  const parts = str.trim().split("#");
  if (parts.length != 2) {
    throw new Error(`expected <txId>#<utxoIdx>, got ${str}`);
  }
  const utxoIdx = parseInt(parts[1]);
  if (utxoIdx.toString() != parts[1]) {
    throw new Error(`bad utxoIdx in ${str}`);
  }
  return new TxOutputIdImpl(makeTxId(parts[0]), utxoIdx);
}
function compareTxOutputIds(a, b) {
  const res = compareBytes(a.txId.bytes, b.txId.bytes);
  if (res == 0) {
    return a.index - b.index;
  } else {
    return res;
  }
}
var TxOutputIdImpl = class {
  /**
   * @readonly
   * @type {TxId}
   */
  txId;
  /**
   * @readonly
   * @type {number}
   */
  index;
  /**
   * @param {TxId} txId
   * @param {number} index
   */
  constructor(txId, index) {
    this.txId = txId;
    this.index = index;
  }
  /**
   * @type {"TxOutputId"}
   */
  get kind() {
    return "TxOutputId";
  }
  /**
   * @param {TxOutputId} other
   * @returns {boolean}
   */
  isEqual(other) {
    return this.txId.isEqual(other.txId) && this.index == other.index;
  }
  /**
   * @returns {number[]}
   */
  toCbor() {
    return encodeTuple([this.txId.toCbor(), encodeInt(this.index)]);
  }
  /**
   * @returns {string}
   */
  toString() {
    return `${this.txId.toHex()}#${this.index.toString()}`;
  }
  /**
   * @returns {ConstrData}
   */
  toUplcData() {
    return makeConstrData(0, [
      this.txId.toUplcData(),
      makeIntData(this.index)
    ]);
  }
};

// node_modules/@helios-lang/ledger/src/tx/TxInput.js
function decodeTxInput(bytes) {
  const stream = makeByteStream({ bytes });
  if (decodeTupleLazy(stream.copy())(isBytes)) {
    const id = decodeTxOutputId(stream);
    return new TxInputImpl(id);
  } else if (decodeTupleLazy(stream.copy())(isTuple2)) {
    const [id, output] = decodeTuple(stream, [
      decodeTxOutputId,
      decodeTxOutput
    ]);
    return new TxInputImpl(id, output);
  } else {
    throw new Error("unhandled TxInput encoding");
  }
}
function compareTxInputs(a, b) {
  return compareTxOutputIds(a.id, b.id);
}
var TxInputImpl = class _TxInputImpl {
  /**
   * @readonly
   * @type {TxOutputId}
   */
  id;
  /**
   * Can be mutated in order to recover
   * @private
   * @type {TxOutput<SC> | undefined}
   */
  _output;
  /**
   * @param {TxOutputIdLike} outputId
   * @param {TxOutput<SC> | undefined} output - used during building/emulation, not part of serialization
   */
  constructor(outputId, output = void 0) {
    this.id = makeTxOutputId(outputId);
    this._output = output;
  }
  /**
   * @type {"TxInput"}
   */
  get kind() {
    return "TxInput";
  }
  /**
   * Shortcut
   * @type {Address<SC>}
   */
  get address() {
    return this.output.address;
  }
  /**
   * Shortcut
   * @type {TxOutputDatum | undefined}
   */
  get datum() {
    return this.output.datum;
  }
  /**
   * Throws an error if the TxInput hasn't been recovered
   * @returns {TxOutput<SC>}
   */
  get output() {
    if (this._output) {
      return this._output;
    } else {
      throw new Error("TxInput original output not synced");
    }
  }
  /**
   * Shortcut
   * @type {Value}
   */
  get value() {
    return this.output.value;
  }
  /**
   * The output itself isn't stored in the ledger, so must be recovered after deserializing blocks/transactions
   * @param {{getUtxo(id: TxOutputId): Promise<TxInput>}} network
   */
  async recover(network) {
    if (!this._output) {
      this._output = /** @type {any} */
      (await network.getUtxo(this.id)).output;
    }
  }
  /**
   * Deep copy of the TxInput so that Network interfaces don't allow accidental mutation of the underlying data
   * @returns {TxInput<SC>}
   */
  copy() {
    return new _TxInputImpl(this.id, this._output?.copy());
  }
  /**
   * @returns {Object}
   */
  dump() {
    return {
      outputId: this.id.toString(),
      output: this._output ? this._output.dump() : null
    };
  }
  /**
   * @param {TxInput<any>} other
   * @returns {boolean}
   */
  isEqual(other) {
    return other.id.isEqual(this.id);
  }
  /**
   * Ledger format is without original output (so full = false)
   * full = true is however useful for complete deserialization of the TxInput (and then eg. using it in off-chain applications)
   * @param {boolean} full
   * @returns {number[]}
   */
  toCbor(full = false) {
    if (full) {
      return encodeTuple([this.id.toCbor(), this.output.toCbor()]);
    } else {
      return this.id.toCbor();
    }
  }
  /**
   * full representation (as used in ScriptContext)
   * @returns {ConstrData}
   */
  toUplcData() {
    if (this._output) {
      return makeConstrData(0, [
        this.id.toUplcData(),
        this._output.toUplcData()
      ]);
    } else {
      throw new Error("TxInput original output not synced");
    }
  }
};

// node_modules/@helios-lang/ledger/src/tx/TxBody.js
function decodeTxBody(bytes) {
  const {
    0: inputs,
    1: outputs,
    2: fee,
    3: lastValidSlot,
    4: dcerts,
    5: withdrawals,
    7: metadataHash,
    8: firstValidSlot,
    9: minted,
    11: scriptDataHash,
    13: collateral,
    14: signers,
    15: _networkId,
    16: collateralReturn,
    17: totalCollateral,
    18: refInputs
  } = decodeObjectIKey(bytes, {
    0: (s) => decodeList(s, decodeTxInput),
    1: (s) => decodeList(s, decodeTxOutput),
    2: decodeInt,
    3: decodeInt,
    4: (s) => decodeList(s, decodeDCert),
    5: (s) => decodeMap(s, decodeStakingAddress, decodeInt),
    7: decodeBytes,
    8: decodeInt,
    9: decodeAssets,
    11: decodeBytes,
    13: (s) => decodeList(s, decodeTxInput),
    14: (s) => decodeList(s, decodePubKeyHash),
    15: decodeInt,
    16: decodeTxOutput,
    17: decodeInt,
    18: (s) => decodeList(s, decodeTxInput)
  });
  return new TxBodyImpl({
    inputs: expectDefined(inputs),
    outputs: expectDefined(outputs),
    fee: expectDefined(fee),
    firstValidSlot: firstValidSlot !== void 0 ? Number(firstValidSlot) : void 0,
    lastValidSlot: lastValidSlot !== void 0 ? Number(lastValidSlot) : void 0,
    dcerts: dcerts ?? [],
    withdrawals: withdrawals ?? [],
    metadataHash,
    minted: minted ?? makeAssets(),
    scriptDataHash,
    collateral: collateral ?? [],
    signers: signers ?? [],
    collateralReturn,
    totalCollateral: totalCollateral ?? 0n,
    refInputs: refInputs ?? []
  });
}
var TxBodyImpl = class {
  /**
   * Inputs must be sorted before submitting (first by TxId, then by utxoIndex)
   * Spending redeemers must point to the sorted inputs
   * @readonly
   * @type {TxInput[]}
   */
  inputs;
  /**
   * @readonly
   * @type {TxOutput[]}
   */
  outputs;
  /**
   * Lovelace fee, mutated as part of final balancing
   * @type {bigint}
   */
  fee;
  /**
   * @readonly
   * @type {number | undefined}
   */
  firstValidSlot;
  /**
   * @readonly
   * @type {number | undefined}
   */
  lastValidSlot;
  /**
   * TODO: ensure these are properly sorted
   * @readonly
   * @type {DCert[]}
   */
  dcerts;
  /**
   * Withdrawals must be sorted by address
   * Stake rewarding redeemers must point to the sorted withdrawals
   * @readonly
   * @type {[StakingAddress, bigint][]}
   */
  withdrawals;
  /**
   * Internally the assets must be sorted by mintingpolicyhash
   * Minting redeemers must point to the sorted minted assets
   * @readonly
   * @type {Assets}
   */
  minted;
  /**
   * @readonly
   * @type {number[] | undefined}
   */
  scriptDataHash;
  /**
   * @readonly
   * @type {TxInput[]}
   */
  collateral;
  /**
   * @readonly
   * @type {PubKeyHash[]}
   */
  signers;
  /**
   * @readonly
   * @type {TxOutput | undefined}
   */
  collateralReturn;
  /**
   * @readonly
   * @type {bigint}
   */
  totalCollateral;
  /**
   * @readonly
   * @type {TxInput[]}
   */
  refInputs;
  /**
   * @readonly
   * @type {number[] | undefined}
   */
  metadataHash;
  /**
   * @param {TxBodyProps} props
   */
  constructor({
    inputs,
    outputs,
    fee,
    firstValidSlot,
    lastValidSlot,
    dcerts,
    withdrawals,
    minted,
    scriptDataHash,
    collateral,
    signers,
    collateralReturn,
    totalCollateral,
    refInputs,
    metadataHash
  }) {
    this.inputs = inputs;
    this.outputs = outputs;
    this.refInputs = refInputs;
    this.fee = fee;
    this.firstValidSlot = firstValidSlot;
    this.lastValidSlot = lastValidSlot;
    this.dcerts = dcerts;
    this.withdrawals = withdrawals;
    this.minted = minted;
    this.scriptDataHash = scriptDataHash;
    this.collateral = collateral ?? [];
    this.signers = signers;
    this.collateralReturn = collateralReturn;
    this.totalCollateral = totalCollateral ?? 0n;
    this.metadataHash = metadataHash;
  }
  /**
   * @type {"TxBody"}
   */
  get kind() {
    return "TxBody";
  }
  /**
   * Used to validate if all the necessary scripts are included TxWitnesses (and that there are not redundant scripts)
   * @type {ScriptHash[]}
   */
  get allScriptHashes() {
    const m = /* @__PURE__ */ new Map();
    this.inputs.forEach((utxo) => {
      const address = utxo.output.address;
      if (address.era == "Byron") {
        throw new Error("not yet implemented");
      }
      const scriptHash = address.spendingCredential;
      if (scriptHash.kind == "ValidatorHash") {
        m.set(scriptHash.toHex(), scriptHash);
      }
    });
    this.minted.getPolicies().forEach((mph) => m.set(mph.toHex(), mph));
    this.withdrawals.forEach(([stakingAddr]) => {
      const svh = stakingAddr.stakingCredential;
      if (svh.kind == "StakingValidatorHash") {
        m.set(svh.toHex(), svh);
      }
    });
    this.dcerts.forEach((dcert) => {
      if (dcert.kind == "DeregistrationDCert" || dcert.kind == "DelegationDCert") {
        const svh = dcert.credential;
        if (svh.kind == "StakingValidatorHash") {
          m.set(svh.toHex(), svh);
        }
      }
    });
    return Array.from(m.values());
  }
  /**
   * Calculates the number of dummy signatures needed to get precisely the right tx size.
   * @returns {number}
   */
  countUniqueSigners() {
    let set = /* @__PURE__ */ new Set();
    let nWorstCase = 0;
    this.inputs.concat(this.collateral).forEach((utxo) => {
      try {
        const address = utxo.output.address;
        if (address.era == "Byron") {
          throw new Error("not yet implemented");
        }
        const spendingCredential = address.spendingCredential;
        if (spendingCredential.kind == "PubKeyHash") {
          set.add(spendingCredential.toHex());
        }
      } catch (_e) {
        nWorstCase += 1;
      }
    });
    this.signers.forEach((signer) => set.add(signer.toHex()));
    return set.size + nWorstCase;
  }
  /**
   * @returns {object}
   */
  dump() {
    return {
      inputs: this.inputs.map((input) => input.dump()),
      outputs: this.outputs.map((output) => output.dump()),
      fee: this.fee.toString(),
      lastValidSlot: this.lastValidSlot ? this.lastValidSlot.toString() : null,
      firstValidSlot: this.firstValidSlot ? this.firstValidSlot.toString() : null,
      minted: this.minted.isZero() ? null : this.minted.dump(),
      metadataHash: this.metadataHash ? bytesToHex(this.metadataHash) : null,
      scriptDataHash: this.scriptDataHash ? bytesToHex(this.scriptDataHash) : null,
      certificates: this.dcerts.length == 0 ? null : this.dcerts.map((dc) => dc.dump()),
      collateral: this.collateral.length == 0 ? null : this.collateral.map((c) => c.dump()),
      signers: this.signers.length == 0 ? null : this.signers.map((rs) => rs.dump()),
      collateralReturn: this.collateralReturn ? this.collateralReturn.dump() : null,
      //totalCollateral: this.totalCollateral.toString(), // doesn't seem to be used anymore
      refInputs: this.refInputs.map((ri) => ri.dump())
    };
  }
  /**
   * @param {NetworkParams} params
   * @returns {TimeRange}
   */
  getValidityTimeRange(params) {
    const helper = makeNetworkParamsHelper(params);
    const start = this.firstValidSlot ? helper.slotToTime(this.firstValidSlot) : Number.NEGATIVE_INFINITY;
    const end = this.lastValidSlot ? helper.slotToTime(this.lastValidSlot) : Number.POSITIVE_INFINITY;
    return makeTimeRange(start, end, {
      excludeStart: false,
      excludeEnd: this.lastValidSlot !== void 0
    });
  }
  /**
   * Used by (indirectly) by emulator to check if slot range is valid.
   * Note: firstValidSlot == lastValidSlot is allowed
   * @param {IntLike} slot
   * @returns {boolean}
   */
  isValidSlot(slot) {
    if (this.lastValidSlot != null) {
      if (toInt(slot) > this.lastValidSlot) {
        return false;
      }
    }
    if (this.firstValidSlot != null) {
      if (toInt(slot) < this.firstValidSlot) {
        return false;
      }
    }
    return true;
  }
  /**
   * A serialized tx throws away input information
   * This must be refetched from the network if the tx needs to be analyzed
   *
   * This must be done for the regular inputs because the datums are needed for correct budget calculation and min required signatures determination
   * This must be done for the reference inputs because they impact the budget calculation
   * This must be done for the collateral inputs as well, so that the minium required signatures can be determined correctly
   * @param {{getUtxo(id: TxOutputId): Promise<TxInput>}} network
   */
  async recover(network) {
    await Promise.all(
      this.inputs.map((input) => input.recover(network)).concat(
        this.refInputs.map((refInput) => refInput.recover(network))
      ).concat(
        this.collateral.map(
          (collateral) => collateral.recover(network)
        )
      )
    );
  }
  /**
   * @returns {Value}
   */
  sumInputValue() {
    return this.inputs.reduce(
      (prev, input) => prev.add(input.value),
      makeValue(0n)
    );
  }
  /**
   * Throws error if any part of the sum is negative (i.e. more is burned than input)
   * @returns {Value}
   */
  sumInputAndMintedValue() {
    return this.sumInputValue().add(makeValue(0n, this.minted)).assertAllPositive();
  }
  /**
   * Excludes lovelace
   * @returns {Assets}
   */
  sumInputAndMintedAssets() {
    return this.sumInputAndMintedValue().assets;
  }
  /**
   * @returns {Value}
   */
  sumOutputValue() {
    return this.outputs.reduce(
      (prev, output) => prev.add(output.value),
      makeValue(0n)
    );
  }
  /**
   * Excludes lovelace
   * @returns {Assets}
   */
  sumOutputAssets() {
    return this.sumOutputValue().assets;
  }
  /**
   * @returns {number[]}
   */
  toCbor() {
    const m = /* @__PURE__ */ new Map();
    m.set(0, encodeDefList(this.inputs));
    m.set(1, encodeDefList(this.outputs));
    m.set(2, encodeInt(this.fee));
    if (this.lastValidSlot !== void 0) {
      m.set(3, encodeInt(this.lastValidSlot));
    }
    if (this.dcerts.length != 0) {
      m.set(4, encodeDefList(this.dcerts));
    }
    if (this.withdrawals.length != 0) {
      m.set(
        5,
        encodeMap(
          this.withdrawals.map(([sa, q]) => [
            sa.toCbor(),
            encodeInt(q)
          ])
        )
      );
    }
    if (this.metadataHash !== void 0) {
      m.set(7, encodeBytes(this.metadataHash));
    }
    if (this.firstValidSlot !== void 0) {
      m.set(8, encodeInt(this.firstValidSlot));
    }
    if (!this.minted.isZero()) {
      m.set(9, this.minted.toCbor());
    }
    if (this.scriptDataHash !== void 0) {
      m.set(11, encodeBytes(this.scriptDataHash));
    }
    if (this.collateral.length != 0) {
      m.set(13, encodeDefList(this.collateral));
    }
    if (this.signers.length != 0) {
      m.set(14, encodeDefList(this.signers));
    }
    if (this.collateralReturn !== void 0) {
      m.set(16, this.collateralReturn.toCbor());
    }
    if (this.totalCollateral > 0n) {
      m.set(17, encodeInt(this.totalCollateral));
    }
    if (this.refInputs.length != 0) {
      m.set(18, encodeDefList(this.refInputs));
    }
    return encodeObjectIKey(m);
  }
  /**
   * Returns the on-chain Tx representation
   * @param {NetworkParams} params
   * @param {TxRedeemer[]} redeemers
   * @param {UplcData[]} datums
   * @param {TxId} txId
   * @returns {TxInfo}
   */
  toTxInfo(params, redeemers, datums, txId) {
    return {
      inputs: this.inputs,
      refInputs: this.refInputs,
      outputs: this.outputs,
      fee: this.fee,
      minted: this.minted,
      dcerts: this.dcerts,
      withdrawals: this.withdrawals,
      validityTimerange: this.getValidityTimeRange(params),
      signers: this.signers,
      redeemers,
      datums,
      id: txId
    };
  }
  /**
   * Not done in the same routine as sortInputs(), because balancing of assets happens after redeemer indices are set
   * @returns {void}
   */
  sortOutputs() {
    this.outputs.forEach((output) => {
      output.value.assets.sort();
    });
  }
  /**
   * @returns {number[]}
   */
  hash() {
    return blake2b(this.toCbor());
  }
};

// node_modules/@helios-lang/ledger/src/tx/TxMetadataAttr.js
function decodeTxMetadataAttr(bytes) {
  const stream = makeByteStream({ bytes });
  if (isString2(stream)) {
    return decodeString(stream);
  } else if (isList(stream)) {
    return { list: decodeList(stream, decodeTxMetadataAttr) };
  } else if (isMap(stream)) {
    return {
      map: decodeMap(stream, decodeTxMetadataAttr, decodeTxMetadataAttr)
    };
  } else {
    return Number(decodeInt(stream));
  }
}
function encodeTxMetadataAttr(attr) {
  if (typeof attr === "string") {
    return encodeString(attr, true);
  } else if (typeof attr === "number") {
    if (attr % 1 != 0) {
      throw new Error("not a whole number");
    }
    return encodeInt(attr);
  } else if ("list" in attr) {
    return encodeDefList(
      attr.list.map((item) => encodeTxMetadataAttr(item))
    );
  } else if (attr instanceof Object && "map" in attr && Object.keys(attr).length == 1) {
    const pairs = attr["map"];
    if (Array.isArray(pairs)) {
      return encodeMap(
        pairs.map((pair) => {
          if (Array.isArray(pair) && pair.length == 2) {
            return [
              encodeTxMetadataAttr(pair[0]),
              encodeTxMetadataAttr(pair[1])
            ];
          } else {
            throw new Error("invalid metadata schema");
          }
        })
      );
    } else {
      throw new Error("invalid metadata schema");
    }
  } else {
    throw new Error("invalid metadata schema");
  }
}

// node_modules/@helios-lang/ledger/src/tx/TxMetadata.js
function decodeTxMetadata(bytes) {
  const attributes = Object.fromEntries(
    decodeMap(bytes, (s) => Number(decodeInt(s)), decodeTxMetadataAttr)
  );
  return new TxMetadataImpl(attributes);
}
var TxMetadataImpl = class {
  /**
   * @readonly
   * @type {{[key: number]: TxMetadataAttr}}
   */
  attributes;
  /**
   * @param {{[key: number]: TxMetadataAttr}} attributes
   */
  constructor(attributes) {
    this.attributes = attributes;
  }
  /**
   * @type {"TxMetadata"}
   */
  get kind() {
    return "TxMetadata";
  }
  /**
   * @type {number[]}
   */
  get keys() {
    return Object.keys(this.attributes).map((key) => parseInt(key)).sort();
  }
  /**
   * @returns {Object}
   */
  dump() {
    let obj = {};
    for (let key of this.keys) {
      obj[key] = this.attributes[key];
    }
    return obj;
  }
  /**
   * @returns {number[]}
   */
  hash() {
    return blake2b(this.toCbor());
  }
  /**
   * Sorts the keys before serializing
   * @returns {number[]}
   */
  toCbor() {
    return encodeMap(
      this.keys.map((key) => [
        encodeInt(BigInt(key)),
        encodeTxMetadataAttr(this.attributes[key])
      ])
    );
  }
};

// node_modules/@helios-lang/ledger/src/tx/TxCertifyingRedeemer.js
function makeTxCertifyingRedeemer(dcertIndex, data, cost = { mem: 0n, cpu: 0n }) {
  const index = toInt(dcertIndex);
  if (index < 0) {
    throw new Error("negative TxCertifyingRedeemer dcert index not allowed");
  }
  return new TxCertifyingRedeemerImpl(index, data, cost);
}
var TxCertifyingRedeemerImpl = class {
  /**
   * @readonly
   * @type {number}
   */
  dcertIndex;
  /**
   * @readonly
   * @type {UplcData}
   */
  data;
  /**
   * @readonly
   * @type {Cost}
   */
  cost;
  /**
   * @param {number} dcertIndex
   * @param {UplcData} data
   * @param {Cost} cost
   */
  constructor(dcertIndex, data, cost) {
    this.dcertIndex = dcertIndex;
    this.data = data;
    this.cost = cost;
  }
  /**
   * @type {"TxCertifyingRedeemer"}
   */
  get kind() {
    return "TxCertifyingRedeemer";
  }
  /**
   * On-chain ConstrData tag
   * @type {number}
   */
  get tag() {
    return 3;
  }
  /**
   * @param {NetworkParams} params
   * @returns {bigint}
   */
  calcExFee(params) {
    const helper = makeNetworkParamsHelper(params);
    const { mem, cpu } = this.cost;
    const [memFee, cpuFee] = helper.exFeeParams;
    return BigInt(Math.ceil(Number(mem) * memFee + Number(cpu) * cpuFee));
  }
  /**
   * @returns {Object}
   */
  dump() {
    return {
      redeemerType: "Certifying",
      dcertIndex: this.dcertIndex,
      json: this.data.toSchemaJson(),
      cbor: bytesToHex(this.data.toCbor()),
      exUnits: {
        mem: this.cost.mem.toString(),
        cpu: this.cost.cpu.toString()
      }
    };
  }
  /**
   * Extracts script details for a specific redeemer on a transaction.
   * @param {Tx} tx
   * @returns {RedeemerDetailsWithoutArgs}
   */
  getRedeemerDetailsWithoutArgs(tx) {
    const dcert = expectDefined(tx.body.dcerts[this.dcertIndex]);
    const summary = `${dcert.kind} @${this.dcertIndex}`;
    if (!("credential" in dcert)) {
      throw new Error("DCert without staking credential");
    }
    if (dcert.credential.kind != "StakingValidatorHash") {
      throw new Error(
        "expected StakingValidatorHash as DCert staking credential"
      );
    }
    const svh = dcert.credential;
    return {
      summary,
      description: `certifying ${summary}`,
      script: expectDefined(tx.witnesses.findUplcProgram(svh))
    };
  }
  /**
   * Extracts script-evaluation details for a specific redeemer from the transaction
   * With the `txInfo` argument, the
   * `args` for evaluating the redeemer are also included in the result.
   * @param {Tx} tx
   * @param {TxInfo} txInfo
   * @returns {RedeemerDetailsWithArgs}
   */
  getRedeemerDetailsWithArgs(tx, txInfo) {
    const partialRes = this.getRedeemerDetailsWithoutArgs(tx);
    const dcert = expectDefined(tx.body.dcerts[this.dcertIndex]);
    return {
      ...partialRes,
      args: [
        this.data,
        makeScriptContextV2(
          txInfo,
          makeCertifyingPurpose(dcert)
        ).toUplcData()
      ].map((a) => makeUplcDataValue(a))
    };
  }
  /**
   * @returns {number[]}
   */
  toCbor() {
    return encodeTuple([
      encodeInt(2),
      encodeInt(this.dcertIndex),
      this.data.toCbor(),
      encodeCost(this.cost)
    ]);
  }
};

// node_modules/@helios-lang/ledger/src/tx/TxMintingRedeemer.js
function makeTxMintingRedeemer(policyIndex, data, cost = { mem: 0n, cpu: 0n }) {
  const index = toInt(policyIndex);
  if (index < 0) {
    throw new Error("negative TxMintingRedeemer policy index not allowed");
  }
  return new TxMintingRedeemerImpl(index, data, cost);
}
var TxMintingRedeemerImpl = class {
  /**
   * @readonly
   * @type {number}
   */
  policyIndex;
  /**
   * @readonly
   * @type {UplcData}
   */
  data;
  /**
   * @readonly
   * @type {Cost}
   */
  cost;
  /**
   * @param {number} policyIndex
   * @param {UplcData} data
   * @param {Cost} cost
   */
  constructor(policyIndex, data, cost) {
    this.policyIndex = policyIndex;
    this.data = data;
    this.cost = cost;
  }
  /**
   * @type {"TxMintingRedeemer"}
   */
  get kind() {
    return "TxMintingRedeemer";
  }
  /**
   * On-chain ConstrData tag
   * @type {number}
   */
  get tag() {
    return 0;
  }
  /**
   * @param {NetworkParams} params
   * @returns {bigint}
   */
  calcExFee(params) {
    const helper = makeNetworkParamsHelper(params);
    const { mem, cpu } = this.cost;
    const [memFee, cpuFee] = helper.exFeeParams;
    return BigInt(Math.ceil(Number(mem) * memFee + Number(cpu) * cpuFee));
  }
  /**
   * @returns {object}
   */
  dump() {
    return {
      redeemerType: "Minting",
      policyIndex: this.policyIndex,
      json: this.data.toSchemaJson(),
      cbor: bytesToHex(this.data.toCbor()),
      exUnits: {
        mem: this.cost.mem.toString(),
        cpu: this.cost.cpu.toString()
      }
    };
  }
  /**
   * Extracts script details for a specific redeemer on a transaction.
   * @param {Tx} tx
   * @returns {RedeemerDetailsWithoutArgs}
   */
  getRedeemerDetailsWithoutArgs(tx) {
    const mph = expectDefined(
      tx.body.minted.getPolicies()[this.policyIndex]
    );
    const summary = `mint @${this.policyIndex}`;
    return {
      summary,
      description: `minting policy ${this.policyIndex} (${mph.toHex()})`,
      script: expectDefined(tx.witnesses.findUplcProgram(mph))
    };
  }
  /**
   * Extracts script-evaluation details for a specific redeemer from the transaction
   * With the `txInfo` argument, the
   * `args` for evaluating the redeemer are also included in the result.
   * @param {Tx} tx
   * @param {TxInfo} txInfo
   * @returns {RedeemerDetailsWithArgs}
   */
  getRedeemerDetailsWithArgs(tx, txInfo) {
    const mph = expectDefined(
      tx.body.minted.getPolicies()[this.policyIndex]
    );
    const partialRes = this.getRedeemerDetailsWithoutArgs(tx);
    return {
      ...partialRes,
      args: [
        this.data,
        makeScriptContextV2(
          txInfo,
          makeMintingPurpose(mph)
        ).toUplcData()
      ].map((a) => makeUplcDataValue(a))
    };
  }
  /**
   * @returns {number[]}
   */
  toCbor() {
    return encodeTuple([
      encodeInt(1),
      encodeInt(this.policyIndex),
      this.data.toCbor(),
      encodeCost(this.cost)
    ]);
  }
};

// node_modules/@helios-lang/ledger/src/tx/TxRewardingRedeemer.js
function makeTxRewardingRedeemer(withdrawalIndex, data, cost = { mem: 0n, cpu: 0n }) {
  const index = toInt(withdrawalIndex);
  if (index < 0) {
    throw new Error(
      "negative TxRewardingRedeemer withdrawal index not allowed"
    );
  }
  return new TxRewardingRedeemerImpl(index, data, cost);
}
var TxRewardingRedeemerImpl = class {
  /**
   * @readonly
   * @type {number}
   */
  withdrawalIndex;
  /**
   * @readonly
   * @type {UplcData}
   */
  data;
  /**
   * @readonly
   * @type {Cost}
   */
  cost;
  /**
   * @param {number} policyIndex
   * @param {UplcData} data
   * @param {Cost} cost
   */
  constructor(policyIndex, data, cost) {
    this.withdrawalIndex = policyIndex;
    this.data = data;
    this.cost = cost;
  }
  /**
   * @type {"TxRewardingRedeemer"}
   */
  get kind() {
    return "TxRewardingRedeemer";
  }
  /**
   * On-chain ConstrData tag
   * @type {number}
   */
  get tag() {
    return 2;
  }
  /**
   * @param {NetworkParams} params
   * @returns {bigint}
   */
  calcExFee(params) {
    const helper = makeNetworkParamsHelper(params);
    const { mem, cpu } = this.cost;
    const [memFee, cpuFee] = helper.exFeeParams;
    return BigInt(Math.ceil(Number(mem) * memFee + Number(cpu) * cpuFee));
  }
  /**
   * @returns {Object}
   */
  dump() {
    return {
      redeemerType: "Rewarding",
      withdrawalIndex: this.withdrawalIndex,
      json: this.data.toSchemaJson(),
      cbor: bytesToHex(this.data.toCbor()),
      exUnits: {
        mem: this.cost.mem.toString(),
        cpu: this.cost.cpu.toString()
      }
    };
  }
  /**
   * Extracts script details for a specific redeemer on a transaction.
   * @param {Tx} tx
   * @returns {RedeemerDetailsWithoutArgs}
   */
  getRedeemerDetailsWithoutArgs(tx) {
    const credential = expectDefined(
      tx.body.withdrawals[this.withdrawalIndex]
    )[0].stakingCredential;
    if (credential.kind != "StakingValidatorHash") {
      throw new Error("expected StakingValidatorHash");
    }
    const svh = expectDefined(credential);
    const summary = `rewards @${this.withdrawalIndex}`;
    return {
      summary,
      description: `withdrawing ${summary} (${svh.toHex()})`,
      script: expectDefined(tx.witnesses.findUplcProgram(svh))
    };
  }
  /**
   * Extracts script-evaluation details for a specific redeemer from the transaction
   *  With the `txInfo` argument, the
   * `args` for evaluating the redeemer are also included in the result.
   * @param {Tx} tx
   * @param {TxInfo} txInfo
   * @returns {RedeemerDetailsWithArgs}
   */
  getRedeemerDetailsWithArgs(tx, txInfo) {
    const partialRes = this.getRedeemerDetailsWithoutArgs(tx);
    const credential = expectDefined(
      tx.body.withdrawals[this.withdrawalIndex]
    )[0].stakingCredential;
    return {
      ...partialRes,
      args: [
        this.data,
        makeScriptContextV2(
          txInfo,
          makeRewardingPurpose(credential)
        ).toUplcData()
      ].map((a) => makeUplcDataValue(a))
    };
  }
  /**
   * @returns {number[]}
   */
  toCbor() {
    return encodeTuple([
      encodeInt(3),
      encodeInt(this.withdrawalIndex),
      this.data.toCbor(),
      encodeCost(this.cost)
    ]);
  }
};

// node_modules/@helios-lang/ledger/src/tx/TxSpendingRedeemer.js
function makeTxSpendingRedeemer(inputIndex, data, cost = { mem: 0n, cpu: 0n }) {
  const index = toInt(inputIndex);
  if (index < 0) {
    throw new Error("negative TxRedeemer spending index not allowed");
  }
  return new TxSpendingRedeemerImpl(index, data, cost);
}
var TxSpendingRedeemerImpl = class {
  /**
   * @readonly
   * @type {number}
   */
  inputIndex;
  /**
   * @readonly
   * @type {UplcData}
   */
  data;
  /**
   * @readonly
   * @type {Cost}
   */
  cost;
  /**
   * @param {number} inputIndex
   * @param {UplcData} data
   * @param {Cost} cost
   */
  constructor(inputIndex, data, cost = { mem: 0n, cpu: 0n }) {
    this.inputIndex = inputIndex;
    this.data = data;
    this.cost = cost;
  }
  /**
   * @type {"TxSpendingRedeemer"}
   */
  get kind() {
    return "TxSpendingRedeemer";
  }
  /**
   * On-chain ConstrData tag
   * @type {number}
   */
  get tag() {
    return 1;
  }
  /**
   * @param {NetworkParams} params
   * @returns {bigint}
   */
  calcExFee(params) {
    const helper = makeNetworkParamsHelper(params);
    const { mem, cpu } = this.cost;
    const [memFee, cpuFee] = helper.exFeeParams;
    return BigInt(Math.ceil(Number(mem) * memFee + Number(cpu) * cpuFee));
  }
  /**
   * @returns {object}
   */
  dump() {
    return {
      redeemerType: "Spending",
      inputIndex: this.inputIndex,
      json: this.data.toSchemaJson(),
      cbor: bytesToHex(this.data.toCbor()),
      exUnits: {
        mem: this.cost.mem.toString(),
        cpu: this.cost.cpu.toString()
      }
    };
  }
  /**
   * Extracts script details for a specific redeemer on a transaction.
   * @param {Tx} tx
   * @returns {RedeemerDetailsWithoutArgs}
   */
  getRedeemerDetailsWithoutArgs(tx) {
    const utxo = expectDefined(tx.body.inputs[this.inputIndex]);
    const summary = `input @${this.inputIndex}`;
    const address = utxo.address;
    if (address.era == "Byron") {
      throw new Error("Byron address not supported");
    }
    const spendingCredential = address.spendingCredential;
    if (spendingCredential.kind != "ValidatorHash") {
      throw new Error(
        "expected Address with ValidatorHash as spending credential"
      );
    }
    return {
      summary,
      description: `spending tx.inputs[${this.inputIndex}] (from UTxO ${utxo.id.toString()})`,
      script: expectDefined(
        tx.witnesses.findUplcProgram(spendingCredential)
      )
    };
  }
  /**
   * Extracts script-evaluation details for a specific redeemer from the transaction
   * With the `txInfo` argument, the
   * `args` for evaluating the redeemer are also included in the result.
   * @param {Tx} tx
   * @param {TxInfo} txInfo
   * @returns {RedeemerDetailsWithArgs}
   */
  getRedeemerDetailsWithArgs(tx, txInfo) {
    const partialRes = this.getRedeemerDetailsWithoutArgs(tx);
    const utxo = expectDefined(tx.body.inputs[this.inputIndex]);
    const datumData = expectDefined(utxo.datum?.data);
    return {
      ...partialRes,
      args: [
        datumData,
        this.data,
        makeScriptContextV2(
          txInfo,
          makeSpendingPurpose(utxo.id)
        ).toUplcData()
      ].map((a) => makeUplcDataValue(a))
    };
  }
  /**
   * @returns {number[]}
   */
  toCbor() {
    return encodeTuple([
      encodeInt(0),
      encodeInt(this.inputIndex),
      this.data.toCbor(),
      encodeCost(this.cost)
    ]);
  }
};

// node_modules/@helios-lang/ledger/src/tx/TxRedeemer.js
function decodeTxRedeemer(bytes) {
  const [tag, decodeItem] = decodeTagged(bytes);
  switch (tag) {
    case 0: {
      const inputIndex = decodeItem(decodeInt);
      const data2 = decodeItem(decodeUplcData);
      const cost2 = decodeItem(decodeCost);
      return makeTxSpendingRedeemer(inputIndex, data2, cost2);
    }
    case 1: {
      const policyIndex = decodeItem(decodeInt);
      const data2 = decodeItem(decodeUplcData);
      const cost2 = decodeItem(decodeCost);
      return makeTxMintingRedeemer(policyIndex, data2, cost2);
    }
    case 2:
      const dcertIndex = decodeItem(decodeInt);
      const data = decodeItem(decodeUplcData);
      const cost = decodeItem(decodeCost);
      return makeTxCertifyingRedeemer(dcertIndex, data, cost);
    case 3: {
      const withdrawalIndex = decodeItem(decodeInt);
      const data2 = decodeItem(decodeUplcData);
      const cost2 = decodeItem(decodeCost);
      return makeTxRewardingRedeemer(withdrawalIndex, data2, cost2);
    }
    default:
      throw new Error(`unhandled TxRedeemer tag ${tag}`);
  }
}

// node_modules/@helios-lang/ledger/src/tx/TxWitnesses.js
function decodeTxWitnesses(bytes) {
  const {
    0: signatures,
    1: nativeScripts,
    3: v1Scripts,
    4: datums,
    5: redeemers,
    6: v2Scripts
  } = decodeObjectIKey(bytes, {
    0: (s) => decodeList(s, decodeSignature2),
    1: (s) => decodeList(s, decodeNativeScript),
    3: (s) => decodeList(s, (bytes2) => decodeUplcProgramV1FromCbor(bytes2)),
    4: (s) => decodeList(s, decodeUplcData),
    5: (s) => decodeList(s, decodeTxRedeemer),
    6: (s) => decodeList(s, (bytes2) => decodeUplcProgramV2FromCbor(bytes2))
  });
  return new TxWitnessesImpl({
    signatures: signatures ?? [],
    nativeScripts: nativeScripts ?? [],
    v1Scripts: v1Scripts ?? [],
    datums: datums ?? [],
    redeemers: redeemers ?? [],
    v2Scripts: v2Scripts ?? [],
    v2RefScripts: []
  });
}
var TxWitnessesImpl = class {
  /**
   * @type {Signature[]}
   */
  signatures;
  /**
   * @readonly
   * @type {UplcData[]}
   */
  datums;
  /**
   * @readonly
   * @type {TxRedeemer[]}
   */
  redeemers;
  /**
   * @readonly
   * @type {NativeScript[]}
   */
  nativeScripts;
  /**
   * @readonly
   * @type {UplcProgramV1[]}
   */
  v1Scripts;
  /**
   * @readonly
   * @type {UplcProgramV2[]}
   */
  v2Scripts;
  /**
   * @readonly
   * @type {UplcProgramV2[]}
   */
  v2RefScripts;
  /**
   *
   * @param {TxWitnessesProps} props
   */
  constructor({
    signatures,
    datums,
    redeemers,
    nativeScripts,
    v1Scripts,
    v2Scripts,
    v2RefScripts
  }) {
    this.signatures = signatures;
    this.datums = datums;
    this.redeemers = redeemers;
    this.nativeScripts = nativeScripts;
    this.v1Scripts = v1Scripts;
    this.v2Scripts = v2Scripts;
    this.v2RefScripts = v2RefScripts;
  }
  /**
   * @type {"TxWitnesses"}
   */
  get kind() {
    return "TxWitnesses";
  }
  /**
   * Returns all the scripts, including the reference scripts
   * @type {(NativeScript | UplcProgramV1 | UplcProgramV2)[]}
   */
  get allScripts() {
    return (
      /** @type {(NativeScript | UplcProgramV1 | UplcProgramV2)[]} */
      [].concat(this.v1Scripts).concat(this.v2Scripts).concat(this.v2RefScripts).concat(this.nativeScripts)
    );
  }
  /**
   * Returns all the non-native scripts (includes the reference scripts)
   * @type {(UplcProgramV1 | UplcProgramV2)[]}
   */
  get allNonNativeScripts() {
    return (
      /** @type {(UplcProgramV1 | UplcProgramV2)[]} */
      [].concat(this.v1Scripts).concat(this.v2Scripts).concat(this.v2RefScripts)
    );
  }
  /**
   * Used to calculate the correct min fee
   * @param {number} n - number of dummy signatures to add
   */
  addDummySignatures(n) {
    if (n == 0) {
      return;
    }
    for (let i = 0; i < n; i++) {
      this.signatures.push(makeDummySignature());
    }
  }
  /**
   * @param {Signature} signature
   */
  addSignature(signature) {
    if (this.signatures.every(
      (s) => !s.isDummy() && !s.pubKeyHash.isEqual(signature.pubKeyHash)
    )) {
      this.signatures.push(signature);
    }
  }
  /**
   * @param {NetworkParams} params
   * @returns {bigint}
   */
  calcExFee(params) {
    return this.redeemers.reduce(
      (sum, redeemer) => sum + redeemer.calcExFee(params),
      0n
    );
  }
  /**
   * @returns {number}
   */
  countNonDummySignatures() {
    return this.signatures.reduce((n, s) => s.isDummy() ? n : n + 1, 0);
  }
  /**
   * @returns {object}
   */
  dump() {
    return {
      signatures: this.signatures.map((pkw) => pkw.dump()),
      datums: this.datums.map((datum) => datum.toString()),
      redeemers: this.redeemers.map((r) => r.dump()),
      nativeScripts: this.nativeScripts.map(
        (script) => script.toJsonSafe()
      ),
      scripts: this.v2Scripts.map(
        (script) => bytesToHex(script.toCbor())
      ),
      refScripts: this.v2RefScripts.map(
        (script) => bytesToHex(script.toCbor())
      )
    };
  }
  /**
   * @param {number[] | MintingPolicyHash | ValidatorHash | StakingValidatorHash} hash
   * @returns {UplcProgramV1 | UplcProgramV2}
   */
  findUplcProgram(hash4) {
    const bytes = Array.isArray(hash4) ? hash4 : hash4.bytes;
    const v2Script = this.v2Scripts.concat(this.v2RefScripts).find((s) => equalsBytes(s.hash(), bytes));
    if (v2Script) {
      return v2Script;
    }
    const v1Script = this.v1Scripts.find(
      (s) => equalsBytes(s.hash(), bytes)
    );
    if (v1Script) {
      return v1Script;
    }
    if (Array.isArray(hash4)) {
      throw new Error(`script for ${bytesToHex(hash4)} not found`);
    } else if (hash4.kind == "MintingPolicyHash") {
      throw new Error(
        `script for minting policy ${hash4.toHex()} not found`
      );
    } else if (hash4.kind == "ValidatorHash") {
      throw new Error(`script for validator ${hash4.toHex()} not found`);
    } else if (hash4.kind == "StakingValidatorHash") {
      throw new Error(
        `script for staking validator ${hash4.toHex()} not found`
      );
    } else {
      throw new Error("unexpected hash type");
    }
  }
  /**
   * Used to determine of Tx needs collateral
   * @returns {boolean}
   */
  isSmart() {
    return this.allNonNativeScripts.length > 0;
  }
  /**
   * @param {(UplcProgramV1 | UplcProgramV2)[]} refScriptsInRefInputs
   */
  recover(refScriptsInRefInputs) {
    refScriptsInRefInputs.forEach((refScript) => {
      const h = refScript.hash();
      if (!this.v2RefScripts.some((prev) => equalsBytes(prev.hash(), h))) {
        if (refScript.plutusVersion == "PlutusScriptV1") {
          throw new Error("UplcProgramV1 ref script not supported");
        } else {
          this.v2RefScripts.push(refScript);
        }
      }
    });
  }
  /**
   * Used to removed any dummy signatures added while calculating the tx fee
   * @param {number} n
   */
  removeDummySignatures(n) {
    if (n == 0) {
      return;
    }
    const res = [];
    let j = 0;
    for (let i = 0; i < this.signatures.length; i++) {
      const signature = this.signatures[i];
      if (signature.isDummy() && j < n) {
        j++;
      } else {
        res.push(signature);
      }
    }
    if (j != n) {
      throw new Error(
        `internal error: unable to remove ${n} dummy signatures`
      );
    }
    this.signatures = res;
  }
  /**
   * @returns {number[]}
   */
  toCbor() {
    const m = /* @__PURE__ */ new Map();
    if (this.signatures.length > 0) {
      m.set(0, encodeDefList(this.signatures));
    }
    if (this.nativeScripts.length > 0) {
      m.set(1, encodeDefList(this.nativeScripts));
    }
    if (this.v1Scripts.length > 0) {
      m.set(3, encodeDefList(this.v1Scripts));
    }
    if (this.datums.length > 0) {
      m.set(4, encodeIndefList(this.datums));
    }
    if (this.redeemers.length > 0) {
      m.set(5, encodeDefList(this.redeemers));
    }
    if (this.v2Scripts.length > 0) {
      const scriptBytes = this.v2Scripts.map((s) => s.toCbor());
      m.set(6, encodeDefList(scriptBytes));
    }
    return encodeObjectIKey(m);
  }
  /**
   * Throws error if signatures are incorrect
   * @param {number[]} bodyBytes
   */
  verifySignatures(bodyBytes) {
    for (let signature of this.signatures) {
      signature.verify(blake2b(bodyBytes));
    }
  }
};

// node_modules/@helios-lang/ledger/src/tx/Tx.js
function decodeTx(bytes) {
  const [body, witnesses, valid, metadata] = decodeTuple(bytes, [
    decodeTxBody,
    decodeTxWitnesses,
    decodeBool,
    (s) => decodeNullOption(s, decodeTxMetadata)
  ]);
  return new TxImpl(body, witnesses, valid, metadata);
}
var TxImpl = class _TxImpl {
  /**
   * @readonly
   * @type {TxBody}
   */
  body;
  /**
   * @readonly
   * @type {TxWitnesses}
   */
  witnesses;
  /**
   * Access this through `isValid()` instead
   * @private
   * @type {boolean}
   */
  valid;
  /**
   * @readonly
   * @type {TxMetadata | undefined}
   */
  metadata;
  /**
   * Access this through `hasValidationError()`
   * @private
   * @type {string | false | undefined}
   */
  validationError;
  /**
   * Creates a new transaction; use {@link TxBuilder} to build a transaction instead.
   * @remarks
   * Use {@link decodeTx} to deserialize a transaction.
   * @param {TxBody} body
   * @param {TxWitnesses} witnesses
   * @param {boolean} valid - false whilst some signatures are still missing
   * @param {TxMetadata | undefined} metadata
   */
  constructor(body, witnesses, valid, metadata = void 0) {
    this.body = body;
    this.witnesses = witnesses;
    this.valid = valid;
    this.metadata = metadata;
    this.validationError = void 0;
    Object.defineProperty(this, "validationError", {
      enumerable: false,
      writable: true,
      configurable: false
    });
  }
  /**
   * @type {"Tx"}
   */
  get kind() {
    return "Tx";
  }
  /**
   * Number of bytes of CBOR encoding of Tx
   *
   * Is used for two things:
   *   - tx fee calculation
   *   - tx size validation
   *
   * @param {boolean} forFeeCalculation - see comment in `this.toCbor()`
   * @returns {number}
   */
  calcSize(forFeeCalculation = false) {
    let nDummy = 0;
    if (forFeeCalculation) {
      nDummy = this.countMissingSignatures();
      this.witnesses.addDummySignatures(nDummy);
    }
    const s = this.toCbor(forFeeCalculation).length;
    if (forFeeCalculation) {
      this.witnesses.removeDummySignatures(nDummy);
    }
    return s;
  }
  /**
   * Adds a signature created by a wallet. Only available after the transaction has been finalized.
   * Optionally verifies that the signature is correct.
   * @param {Signature} signature
   * @param {boolean} verify Defaults to `true`
   * @returns {Tx}
   */
  addSignature(signature, verify = true) {
    if (!this.valid) {
      throw new Error("invalid Tx");
    }
    if (verify) {
      signature.verify(this.id().bytes);
    }
    this.witnesses.addSignature(signature);
    return this;
  }
  /**
   * Adds multiple signatures at once. Only available after the transaction has been finalized.
   * Optionally verifies each signature is correct.
   * @param {Signature[]} signatures
   * @param {boolean} verify
   * @returns {Tx}
   */
  addSignatures(signatures, verify = true) {
    for (let s of signatures) {
      this.addSignature(s, verify);
    }
    return this;
  }
  /**
   * @param {NetworkParams} params
   * @param {boolean} recalcMinBaseFee
   * @returns {bigint} - a quantity of lovelace
   */
  calcMinCollateral(params, recalcMinBaseFee = false) {
    const fee = recalcMinBaseFee ? this.calcMinFee(params) : this.body.fee;
    const helper = makeNetworkParamsHelper(params);
    const minCollateral = (fee * BigInt(helper.minCollateralPct) + 100n) / 100n;
    return minCollateral;
  }
  /**
   * @param {NetworkParams} params
   * @returns {bigint} - a quantity of lovelace
   */
  calcMinFee(params) {
    const helper = makeNetworkParamsHelper(params);
    const [a, b] = helper.txFeeParams;
    const sizeFee = BigInt(a) + BigInt(this.calcSize(true)) * BigInt(b);
    const exFee = this.witnesses.calcExFee(params);
    if (helper.refScriptsFeePerByte == 0) {
      return sizeFee + exFee;
    } else {
      const refScriptsSize = calcRefScriptsSize(
        this.body.inputs,
        this.body.refInputs
      );
      const refScriptsFee = calcRefScriptsFee(
        refScriptsSize,
        helper.refScriptsFeePerByte
      );
      return sizeFee + exFee + refScriptsFee;
    }
  }
  /**
   * Creates a new Tx without the metadata for client-side signing where the client can't know the metadata before tx-submission.
   * @returns {Tx}
   */
  clearMetadata() {
    return new _TxImpl(this.body, this.witnesses, this.valid, void 0);
  }
  /**
   * @returns {object}
   */
  dump() {
    return {
      body: this.body.dump(),
      witnesses: this.witnesses.dump(),
      metadata: this.metadata ? this.metadata.dump() : null,
      id: this.id().toString(),
      size: this.calcSize()
    };
  }
  /**
   * @returns {TxId}
   */
  id() {
    return makeTxId(this.body.hash());
  }
  /**
   * @returns {boolean}
   */
  isSmart() {
    return this.witnesses.isSmart();
  }
  /**
   * indicates if the necessary signatures are present and valid
   * @returns {boolean}
   */
  isValid() {
    return this.valid;
  }
  /**
   * Indicates if a built transaction has passed all consistency checks.
   * @remarks
   * - `null` if the transaction hasn't been validated yet
   * - `false` when the transaction is valid
   * - a `string` with the error message if any validation check failed
   * @returns {string | false | undefined}
   */
  get hasValidationError() {
    return this.validationError;
  }
  /**
   * Used by emulator to check if tx is valid.
   * @param {bigint} slot
   * @returns {boolean}
   */
  isValidSlot(slot) {
    return this.body.isValidSlot(slot);
  }
  /**
   * Restores input information after deserializing a CBOR-encoded transaction
   * @remarks
   * A serialized tx throws away input information
   * This must be refetched from the network if the tx needs to be analyzed
   * @param {{getUtxo(id: TxOutputId): Promise<TxInput>}} network - the TxInput returned by the network must itself be fully recovered
   */
  async recover(network) {
    await this.body.recover(network);
    const refScriptsInRefInputs = this.body.refInputs.reduce(
      (refScripts, input) => {
        const refScript = input.output.refScript;
        if (refScript) {
          return refScripts.concat([refScript]);
        } else {
          return refScripts;
        }
      },
      /** @type {(UplcProgramV1 | UplcProgramV2)[]} */
      []
    );
    this.witnesses.recover(refScriptsInRefInputs);
  }
  /**
   * Serialize a transaction.
   *
   * Note: Babbage still follows Alonzo for the Tx size fee.
   *   According to https://github.com/IntersectMBO/cardano-ledger/blob/cardano-ledger-spec-2023-04-03/eras/alonzo/impl/src/Cardano/Ledger/Alonzo/Tx.hs#L316,
   *   the `isValid` field is omitted when calculating the size of the tx for fee calculation. This is to stay compatible with Mary (?why though, the txFeeFixed could've been changed instead?)
   *
   * @param {boolean} forFeeCalculation - set this to true if you want to calculate the size needed for the Tx fee, another great little Cardano quirk, pffff.
   * @returns {number[]}
   */
  toCbor(forFeeCalculation = false) {
    if (forFeeCalculation) {
      return encodeTuple([
        this.body.toCbor(),
        this.witnesses.toCbor(),
        encodeNullOption(this.metadata)
      ]);
    } else {
      return encodeTuple([
        this.body.toCbor(),
        this.witnesses.toCbor(),
        encodeBool(true),
        encodeNullOption(this.metadata)
      ]);
    }
  }
  /**
   * Throws an error if the tx isn't valid
   *
   * Checks that are performed:
   *   * size of tx <= params.maxTxSize
   *   * body.fee >= calculated min fee
   *   * value is conserved (minus what is burned, plus what is minted)
   *   * enough collateral if smart
   *   * no collateral if not smart
   *   * all necessary scripts are attached
   *   * no redundant scripts are attached (only checked if strict=true)
   *   * each redeemer must have enough ex budget
   *   * total ex budget can't exceed max tx ex budget for either mem or cpu
   *   * each output contains enough lovelace (minDeposit)
   *   * the assets in the output values are correctly sorted (only checked if strict=true, because only needed by some wallets)
   *   * inputs are in the correct order
   *   * ref inputs are in the correct order
   *   * minted assets are in the correct order
   *   * staking withdrawals are in the correct order
   *   * metadatahash corresponds to metadata
   *   * metadatahash is null if there isn't any metadata
   *   * script data hash is correct
   *
   * Checks that aren't performed:
   *   * all necessary signatures are included (must done after tx has been signed)
   *   * validity time range, which can only be checked upon submission
   *
   * @param {NetworkParams} params
   * @param {Object} options
   * @param {boolean} [options.strict=false] - can be left as false for inspecting general transactions. The TxBuilder always uses strict=true.
   * @param {boolean} [options.verbose=false] - provides more details of transaction-budget usage when the transaction is close to the limit
   * @param {UplcLogger} [options.logOptions] - logging options for diagnostics
   * @returns {void}
   */
  validate(params, options = {}) {
    const { strict = false, logOptions } = options;
    this.validateSize(params);
    this.validateFee(params);
    this.validateConservation(params);
    this.validateCollateral(params);
    this.validateScriptsPresent(strict);
    this.validateRedeemersExBudget(params, logOptions);
    this.validateTotalExBudget(params, options);
    this.validateOutputs(params, strict);
    this.validateInputsOrder();
    this.validateRefInputsOrder();
    this.validateMintedOrder();
    this.validateWithdrawalsOrder();
    this.validateMetadata();
    this.validateScriptDataHash(params);
  }
  /**
   * Validates the transaction without throwing an error if it isn't valid
   * If the transaction doesn't validate, the tx's ${validationError} will be set
   * @param {NetworkParams} params
   * @param {Object} [options]
   * @param {boolean} [options.strict=false] - can be left as false for inspecting general transactions. The TxBuilder always uses strict=true.
   * @param {boolean} [options.verbose=false] - provides more details of transaction-budget usage when the transaction is close to the limit
   * @param {UplcLogger} [options.logOptions] - hooks for script logging during transaction execution
   * @returns {Tx}
   */
  validateUnsafe(params, options = {}) {
    try {
      this.validate(params, options);
      this.validationError = false;
    } catch (e) {
      this.validationError = e.message;
      console.error(
        "Error validating transaction: ",
        this.validationError
      );
    }
    return this;
  }
  /**
   * Throws an error if all necessary signatures haven't yet been added
   * Separate from the other validation checks
   * If valid: this.valid is mutated to true
   */
  validateSignatures() {
    const signatures = this.witnesses.signatures;
    const includedSigners = new Set(
      signatures.map((s) => s.pubKeyHash.toHex())
    );
    this.body.signers.forEach((s) => {
      if (!includedSigners.has(s.toHex())) {
        throw new Error(`signature for signer ${s.toHex()} missing`);
      }
    });
    this.body.inputs.concat(this.body.collateral).forEach((utxo) => {
      const address = utxo.output.address;
      if (address.era == "Byron") {
        throw new Error("not yet implemented");
      }
      const pkh = address.spendingCredential;
      if (pkh.kind == "PubKeyHash" && !includedSigners.has(pkh.toHex())) {
        throw new Error(
          `signature for input at ${address.toBech32()} missing`
        );
      }
    });
    this.valid = true;
  }
  /**
   * @private
   * @returns {number}
   */
  countMissingSignatures() {
    return this.body.countUniqueSigners() - this.witnesses.countNonDummySignatures();
  }
  /**
   * Validates that the collateral is correct
   * @remarks
   * Throws an error if there isn't enough collateral,
   * or if too much collateral is returned.
   *
   * The net collateral must not be more than 5x the required
   * collateral, or an error is thrown.
   *
   * Also throws an error if the script doesn't require collateral, but
   * collateral was actually included.
   * @private
   * @param {NetworkParams} params
   */
  validateCollateral(params) {
    const helper = makeNetworkParamsHelper(params);
    if (this.body.collateral.length > helper.maxCollateralInputs) {
      throw new Error("too many collateral inputs");
    }
    if (this.isSmart()) {
      const minCollateral = this.getMinCollateral(params);
      let sum = makeValue(0n);
      for (let col of this.body.collateral) {
        if (!col.output) {
          throw new Error(
            "expected collateral TxInput.origOutput to be set"
          );
        } else if (!col.output.value.assets.isZero()) {
          throw new Error("collateral can only contain lovelace");
        } else {
          sum = sum.add(col.output.value);
        }
      }
      if (sum.lovelace < minCollateral) {
        throw new Error("not enough collateral");
      }
      const included = sum.lovelace;
      if (this.body.collateralReturn != null) {
        sum = sum.subtract(this.body.collateralReturn.value);
        const netCollateral = sum.lovelace;
        const collateralDiff = netCollateral - minCollateral;
        if (collateralDiff < 0) {
          const returned = this.body.collateralReturn.value.lovelace;
          throw new Error(
            `collateralReturn is ${0n - collateralDiff} lovelace is too high
 ${included} collateral inputs; need ${minCollateral} minimum
-${returned} collateral returned, so ${netCollateral} net collateral is too low`
          );
        }
      }
      if (included > minCollateral * 5n) {
        console.error("Warning: way too much collateral");
      }
    } else {
      if (this.body.collateral.length != 0) {
        throw new Error("unnecessary collateral included");
      }
    }
  }
  /**
   * Computes the collateral needed for the transaction
   * @private
   * @param {NetworkParams} params
   * @returns {bigint}
   */
  getMinCollateral(params) {
    const helper = makeNetworkParamsHelper(params);
    let minCollateralPct = helper.minCollateralPct;
    const fee = this.body.fee;
    const minCollateral = BigInt(
      Math.ceil(minCollateralPct * Number(fee) / 100)
    );
    return minCollateral;
  }
  /**
   * Validate that value is conserved, minus what is burned and plus what is minted
   * Throws an error if value isn't conserved
   * @private
   * @param {NetworkParams} params
   */
  validateConservation(params) {
    const helper = makeNetworkParamsHelper(params);
    const stakeAddrDeposit = makeValue(helper.stakeAddressDeposit);
    let v = makeValue(0n);
    v = this.body.inputs.reduce((prev, inp) => inp.value.add(prev), v);
    v = this.body.dcerts.reduce((prev, dcert) => {
      return dcert.kind == "DeregistrationDCert" ? prev.add(stakeAddrDeposit) : prev;
    }, v);
    v = v.subtract(makeValue(this.body.fee));
    v = v.add(makeValue(0, this.body.minted));
    v = this.body.outputs.reduce((prev, out) => {
      return prev.subtract(out.value);
    }, v);
    v = this.body.dcerts.reduce((prev, dcert) => {
      return dcert.kind == "RegistrationDCert" ? prev.subtract(stakeAddrDeposit) : prev;
    }, v);
    if (v.lovelace != 0n) {
      throw new Error(
        `tx not balanced, net lovelace not zero (${v.lovelace})`
      );
    }
    if (!v.assets.isZero()) {
      throw new Error("tx not balanced, net assets not zero");
    }
  }
  /**
   * Final check that fee is big enough
   * Throws an error if not
   * @private
   * @param {NetworkParams} params
   */
  validateFee(params) {
    const minFee = this.calcMinFee(params);
    if (minFee > this.body.fee) {
      throw new Error(
        `fee too small, expected at least ${minFee}, got ${this.body.fee}`
      );
    }
  }
  /**
   * Throws an error in the inputs aren't in the correct order
   * @private
   */
  validateInputsOrder() {
    this.body.inputs.forEach((input, i) => {
      if (i > 0) {
        const prev = this.body.inputs[i - 1];
        if (compareTxInputs(prev, input) >= 0) {
          throw new Error("inputs aren't sorted");
        }
      }
    });
  }
  /**
   * Throws an error if the metadatahash doesn't correspond, or if a tx without metadata has its metadatahash set
   * @private
   */
  validateMetadata() {
    const metadata = this.metadata;
    if (metadata) {
      const h = metadata.hash();
      if (this.body.metadataHash) {
        if (compareBytes(h, this.body.metadataHash) != 0) {
          throw new Error(
            "metadataHash doesn't correspond with actual metadata"
          );
        }
      } else {
        throw new Error(
          "metadataHash not included in a Tx that has metadata"
        );
      }
    } else {
      if (this.body.metadataHash) {
        throw new Error(
          "metadataHash included in a Tx that doesn't have any metadata"
        );
      }
    }
  }
  /**
   * Throws an error if the minted assets aren't in the correct order
   * @private
   */
  validateMintedOrder() {
    this.body.minted.assertSorted();
  }
  /**
   * Checks that each output contains enough lovelace,
   *   and that the contained assets are correctly sorted
   * @private
   * @param {NetworkParams} params
   * @param {boolean} strict
   */
  validateOutputs(params, strict) {
    this.body.outputs.forEach((output) => {
      const minLovelace = output.calcDeposit(params);
      if (minLovelace > output.value.lovelace) {
        throw new Error(
          `not enough lovelace in output (expected at least ${minLovelace.toString()}, got ${output.value.lovelace})`
        );
      }
      if (strict) {
        output.value.assets.assertSorted();
      }
    });
  }
  /**
   * @private
   * @param {NetworkParams} params
   * @param {UplcLogger | undefined} logOptions
   */
  validateRedeemersExBudget(params, logOptions) {
    const txInfo = this.body.toTxInfo(
      params,
      this.witnesses.redeemers,
      this.witnesses.datums,
      this.id()
    );
    for (const redeemer of this.witnesses.redeemers) {
      logOptions?.reset?.("validate");
      const { description, summary, script, args } = redeemer.getRedeemerDetailsWithArgs(this, txInfo);
      const { cost, result } = script.eval(args, {
        logOptions: logOptions ?? void 0
      });
      let altResult;
      if (script.alt) {
        altResult = script.alt.eval(args, {
          logOptions: logOptions ?? void 0
        });
      }
      if (cost.mem > redeemer.cost.mem) {
        throw new Error(
          `actual mem cost for ${summary} too high, expected at most ${redeemer.cost.mem}, got ${cost.mem}
 ... in ${description}`
          // @reviewers: WDYT?
        );
      }
      if (cost.cpu > redeemer.cost.cpu) {
        throw new Error(
          `actual cpu cost for ${summary} too high, expected at most ${redeemer.cost.cpu}, got ${cost.cpu}
 ... in ${description}`
          // @reviewers: WDYT?
        );
      }
      if (isLeft3(result)) {
        if (altResult && !isLeft3(altResult.result)) {
          console.warn(
            ` - WARNING: optimized script for ${summary} failed, but unoptimized succeeded`
          );
          debugger;
        } else {
          console.warn(
            `NOTE: no alt script attached for ${summary}; no script logs available.  See \`compile\` docs to enable it`
          );
          debugger;
        }
        const errMsg = result.left.error || logOptions?.lastMessage || (script.alt ? `\u2039no alt= script for ${summary}, no logged errors\u203A` : "\u2039no logged errors\u203A");
        logOptions?.logError?.(
          errMsg,
          result.left.callSites.slice().pop()?.site
        );
        throw new UplcRuntimeError(
          `script validation error in ${summary}: ${errMsg}
 ... error in ${description}`,
          // TODO: should description and summary also be part of the UplcRuntimeError stack trace?
          result.left.callSites
        );
      }
      logOptions?.flush?.();
    }
  }
  /**
   * Throws an error if the ref inputs aren't in the correct order
   * @private
   */
  validateRefInputsOrder() {
    this.body.refInputs.forEach((input, i) => {
      if (i > 0) {
        const prev = this.body.refInputs[i - 1];
        if (compareTxInputs(prev, input) >= 0) {
          throw new Error("refInputs not sorted");
        }
      }
    });
  }
  /**
   * Throws an error if the script data hash is incorrect
   * @private
   * @param {NetworkParams} params
   */
  validateScriptDataHash(params) {
    if (this.witnesses.redeemers.length > 0) {
      if (this.body.scriptDataHash) {
        const scriptDataHash = calcScriptDataHash(
          params,
          this.witnesses.datums,
          this.witnesses.redeemers
        );
        if (compareBytes(scriptDataHash, this.body.scriptDataHash) != 0) {
          throw new Error("wrong script data hash");
        }
      } else {
        throw new Error(
          "no script data hash included for a Tx that has redeemers"
        );
      }
    } else {
      if (this.body.scriptDataHash) {
        throw new Error(
          "script data hash included for a Tx that has no redeemers"
        );
      }
    }
  }
  /**
   * Checks that all necessary scripts and UplcPrograms are included, and that all included scripts are used
   * @private
   * @param {boolean} strict
   */
  validateScriptsPresent(strict) {
    const allScripts = this.witnesses.allScripts;
    const includedScriptHashes = new Set(
      allScripts.map((s) => {
        if ("kind" in s && (s.kind == "After" || s.kind == "All" || s.kind == "Any" || s.kind == "AtLeast" || s.kind == "Before" || s.kind == "Sig")) {
          return bytesToHex(hashNativeScript(s));
        } else {
          return bytesToHex(s.hash());
        }
      })
    );
    if (allScripts.length != includedScriptHashes.size) {
      throw new Error("duplicate scripts included in transaction");
    }
    const requiredScriptHashes = this.body.allScriptHashes;
    if (requiredScriptHashes.length < includedScriptHashes.size) {
      throw new Error(
        `too many scripts included, not all are needed (${includedScriptHashes.size} included, but only ${requiredScriptHashes.length} required)`
      );
    }
    requiredScriptHashes.forEach((hash4) => {
      const key = hash4.toHex();
      if (!includedScriptHashes.has(key)) {
        throw new Error(`missing script for hash ${key}`);
      }
    });
    if (strict) {
      includedScriptHashes.forEach((key) => {
        if (requiredScriptHashes.findIndex((h) => h.toHex() == key) == -1) {
          throw new Error(`detected unused script ${key}`);
        }
      });
    }
  }
  /**
   * Throws error if tx is too big
   * @private
   * @param {NetworkParams} params
   */
  validateSize(params) {
    const helper = makeNetworkParamsHelper(params);
    if (this.calcSize() > helper.maxTxSize) {
      throw new Error("tx too big");
    }
  }
  /**
   * Throws error if execution budget is exceeded, with optional warnings and script-profile diagnostics
   * @private
   * @param {NetworkParams} params
   * @param {Object} options
   * @param {boolean} [options.verbose=false] - if true -> warn if ex budget >= 50% max budget
   * @param {boolean} [options.strict=true] - if false, over-budget in the presence of unoptimized scripts will only be a warning
   */
  validateTotalExBudget(params, options) {
    const verbose = options.verbose ?? false;
    const strict = options.strict ?? true;
    const helper = makeNetworkParamsHelper(params);
    let totalMem = 0n;
    let totalCpu = 0n;
    let missingAltScripts = 0;
    for (let redeemer of this.witnesses.redeemers) {
      totalMem += redeemer.cost.mem;
      totalCpu += redeemer.cost.cpu;
      const { script, description } = redeemer.getRedeemerDetailsWithoutArgs(this);
      if (!script.alt) {
        missingAltScripts += 1;
        if (verbose) {
          console.error(
            ` - unoptimized? mem=${memPercent(redeemer.cost.mem)}% cpu=${cpuPercent(redeemer.cost.cpu)}% in ${description} `
          );
        }
      }
    }
    let [maxMem, maxCpu] = helper.maxTxExecutionBudget;
    if (totalMem > BigInt(maxMem)) {
      const problem = `tx execution budget exceeded for mem (${totalMem.toString()} = ${memPercent(totalMem)}% of ${maxMem.toString()})

            
`;
      if (missingAltScripts && !strict) {
        console.error(problem);
        console.error(
          `Note: ${missingAltScripts} unoptimized(?) scripts`
        );
      } else {
        throw new Error(problem);
      }
    } else if (verbose && totalMem > BigInt(maxMem) / 2n) {
      console.error(
        `Warning: mem usage = ${memPercent(totalMem)}% of tx-max mem budget (${totalMem.toString()}/${maxMem.toString()} >= 50%)`
      );
    }
    if (totalCpu > BigInt(maxCpu)) {
      const problem = `tx execution budget exceeded for cpu (${totalCpu.toString()} > ${maxCpu.toString()})
`;
      if (missingAltScripts && !strict) {
        console.error(problem);
        console.error(
          `Note: ${missingAltScripts} unoptimized(?) scripts`
        );
      } else {
        throw new Error(problem);
      }
    } else if (verbose && totalCpu > BigInt(maxCpu) / 2n) {
      console.error(
        `Warning: cpu usage = ${cpuPercent(totalCpu)}% of tx-max cpu budget (${totalCpu.toString()}/${maxCpu.toString()} >= 50%)`
      );
    }
    function memPercent(mem) {
      return Math.floor(
        Number(
          mem * 1000n / BigInt(helper.maxTxExecutionBudget[0])
        )
      ) / 10;
    }
    function cpuPercent(cpu) {
      return Math.floor(
        Number(
          cpu * 1000n / BigInt(helper.maxTxExecutionBudget[1])
        )
      ) / 10;
    }
  }
  /**
   * Throws an error if the withdrawals aren't in the correct order
   * @private
   */
  validateWithdrawalsOrder() {
    this.body.withdrawals.forEach((w, i) => {
      if (i > 0) {
        const prev = this.body.withdrawals[i - 1];
        if (compareStakingAddresses(prev[0], w[0]) >= 0) {
          throw new Error("withdrawals not sorted");
        }
      }
    });
  }
};
function calcScriptDataHash(params, datums, redeemers) {
  const helper = makeNetworkParamsHelper(params);
  if (redeemers.length == 0) {
    throw new Error(
      "expected at least 1 redeemer to be able to create the script data hash"
    );
  }
  let bytes = encodeDefList(redeemers);
  if (datums.length > 0) {
    bytes = bytes.concat(makeListData(datums).toCbor());
  }
  const costParams = helper.costModelParamsV2;
  bytes = bytes.concat(
    encodeMap([
      [
        encodeInt(1),
        encodeDefList(costParams.map((cp) => encodeInt(BigInt(cp))))
      ]
    ])
  );
  return blake2b(bytes);
}
function calcRefScriptsFee(size, feePerByte, growthIncrement = 25600n, growthFactor = 1.2) {
  let multiplier = 1;
  let fee = 0n;
  while (size > growthIncrement) {
    fee += BigInt(
      Math.floor(Number(growthIncrement) * multiplier * feePerByte)
    );
    size -= growthIncrement;
    multiplier *= growthFactor;
  }
  fee += BigInt(Math.floor(Number(size) * multiplier * feePerByte));
  return fee;
}
function calcRefScriptsSize(inputs, refInputs) {
  const uniqueInputs = {};
  inputs.concat(refInputs ?? []).forEach((input) => {
    uniqueInputs[input.id.toString()] = input;
  });
  const refScriptSize = Object.values(uniqueInputs).reduce(
    (prev, txInput) => {
      if (txInput.output.refScript) {
        return prev + BigInt(txInput.output.refScript.toCbor().length);
      } else {
        return prev;
      }
    },
    0n
  );
  return refScriptSize;
}

// node_modules/@helios-lang/tx-utils/src/duration/index.js
var MILLISECOND = 1;
var SECOND = 1e3 * MILLISECOND;
var MINUTE = 60 * SECOND;
var HOUR = 60 * MINUTE;
var DAY = 24 * HOUR;
var WEEK = 7 * DAY;
var DEFAULT_TX_VALIDITY_OFFSETS = [-90 * SECOND, 300 * SECOND];

// node_modules/@helios-lang/tx-utils/src/keys/Bip32PrivateKey.js
var BIP32_HARDEN = 2147483648;
function makeBip32PrivateKey(bytes) {
  return new Bip32PrivateKeyImpl(bytes);
}
var Bip32PrivateKeyImpl = class _Bip32PrivateKeyImpl {
  /**
   * 96 bytes
   * @type {number[]}
   */
  bytes;
  /**
   * Derived and cached on demand
   * @private
   * @type {PubKey | undefined}
   */
  pubKey;
  /**
   * @param {number[]} bytes
   */
  constructor(bytes) {
    if (bytes.length != 96) {
      throw new Error(
        `expected a 96 byte private key, got ${bytes.length} bytes`
      );
    }
    this.bytes = bytes;
    this.pubKey = void 0;
  }
  /**
   * @private
   * @type {number[]}
   */
  get k() {
    return this.bytes.slice(0, 64);
  }
  /**
   * @private
   * @type {number[]}
   */
  get kl() {
    return this.bytes.slice(0, 32);
  }
  /**
   * @private
   * @type {number[]}
   */
  get kr() {
    return this.bytes.slice(32, 64);
  }
  /**
   * @private
   * @type {number[]}
   */
  get c() {
    return this.bytes.slice(64, 96);
  }
  /**
   * @param {number} i
   * @returns {Bip32PrivateKey}
   */
  derive(i) {
    const Z3 = this.calcChildZ(i);
    const kl = encodeIntLE32(
      8n * decodeIntLE(Z3.slice(0, 28)) + decodeIntLE(this.kl)
    ).slice(0, 32);
    const kr = encodeIntLE32(
      decodeIntLE(Z3.slice(32, 64)) + decodeIntLE(this.kr) % 115792089237316195423570985008687907853269984665640564039457584007913129639936n
    ).slice(0, 32);
    const c = this.calcChildC(i).slice(32, 64);
    return new _Bip32PrivateKeyImpl(kl.concat(kr).concat(c));
  }
  /**
   * @param {number[]} path
   * @returns {Bip32PrivateKey}
   */
  derivePath(path) {
    let pk = this;
    path.forEach((i) => {
      pk = pk.derive(i);
    });
    return pk;
  }
  /**
   * @returns {PubKey}
   */
  derivePubKey() {
    if (!this.pubKey) {
      this.pubKey = makePubKey(Ed25519.derivePublicKey(this.k, false));
    }
    return this.pubKey;
  }
  /**
   * @param {number[]} message
   * @returns {Signature}
   */
  sign(message) {
    return makeSignature(
      this.derivePubKey(),
      Ed25519.sign(message, this.k, false)
    );
  }
  /**
   * @private
   * @param {number} i - child index
   */
  calcChildZ(i) {
    const ib = encodeIntBE(BigInt(i)).reverse();
    while (ib.length < 4) {
      ib.push(0);
    }
    if (ib.length != 4) {
      throw new Error("child index too big");
    }
    if (i < BIP32_HARDEN) {
      const A = this.derivePubKey().bytes;
      return hmacSha2_512(this.c, [2].concat(A).concat(ib));
    } else {
      return hmacSha2_512(this.c, [0].concat(this.k).concat(ib));
    }
  }
  /**
   * @private
   * @param {number} i
   */
  calcChildC(i) {
    const ib = encodeIntBE(BigInt(i)).reverse();
    while (ib.length < 4) {
      ib.push(0);
    }
    if (ib.length != 4) {
      throw new Error("child index too big");
    }
    if (i < BIP32_HARDEN) {
      const A = this.derivePubKey().bytes;
      return hmacSha2_512(this.c, [3].concat(A).concat(ib));
    } else {
      return hmacSha2_512(this.c, [1].concat(this.k).concat(ib));
    }
  }
};

// src/worker/scope.ts
var scope = self;

// src/worker/change.ts
async function notifyPageOfChange() {
  const clients = await scope.clients.matchAll({ includeUncontrolled: true });
  for (const client of clients) {
    client.postMessage({
      type: "change",
      payload: {}
    });
  }
}

// src/worker/db.ts
var DB_NAME = "ServiceWorkerDB";
var DB_VERSION = 1;
var CONFIG_TABLE = "config";
var EVENTS_TABLE = "events";
function openDatabaseInternal(resolve, reject) {
  const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = (_event) => {
    const db = request.result;
    if (!db.objectStoreNames.contains(CONFIG_TABLE)) {
      db.createObjectStore(CONFIG_TABLE, { keyPath: "key" });
    }
    if (!db.objectStoreNames.contains(EVENTS_TABLE)) {
      db.createObjectStore(EVENTS_TABLE, { autoIncrement: true });
    }
  };
  request.onsuccess = () => {
    resolve(request.result);
  };
  request.onerror = () => {
    reject(request.error);
  };
}
function openDatabase() {
  return new Promise((resolve, reject) => {
    openDatabaseInternal(resolve, reject);
  });
}
async function appendEvent(event) {
  try {
    const db = await openDatabase();
    await put(db, EVENTS_TABLE, event);
    console.log("Event saved");
  } catch (e) {
    console.error("Error saving event:", e);
  }
}
function getDeviceId() {
  return getConfig("deviceId", 0);
}
function getPrivateKey() {
  return getConfig("privateKey", "");
}
async function listEvents() {
  try {
    const db = await openDatabase();
    return await list(db, EVENTS_TABLE);
  } catch (e) {
    console.error("Error listing events:", e);
    return [];
  }
}
function setDeviceId(id) {
  return setConfig("deviceId", id);
}
function setPrivateKey(hex) {
  return setConfig("privateKey", hex);
}
async function getConfig(key, def) {
  try {
    const db = await openDatabase();
    return await get(db, CONFIG_TABLE, key, def);
  } catch (e) {
    console.error("Error getting config:", e);
    return def;
  }
}
async function setConfig(key, value) {
  try {
    const db = await openDatabase();
    await put(db, CONFIG_TABLE, { key, value });
    console.log("Config saved");
  } catch (e) {
    console.error("Error saving config:", e);
  }
}
function put(db, storeName, data) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    const request = store.put(data);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
function get(db, storeName, key, def) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readonly");
    const store = transaction.objectStore(storeName);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result?.value ?? def);
    request.onerror = () => reject(request.error);
  });
}
function list(db, storeName) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readonly");
    const store = transaction.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// src/worker/auth.ts
var VAPID_BASE64_CODEC = makeBase64({ alphabet: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_", padChar: "=" });
var VAPID_PUBLIC_KEY = "BD-RNoqSQfw06BlHF0I8v4YKcRrSrcQtTPGRKYQzISkLtcJ0XFfjZ_IPA8xJwsjeKx2WL183jdWQig-6fnPXT30";
var SECRETS = void 0;
var SUBSCRIPTION = void 0;
async function authorizeAndSubscribe() {
  try {
    SECRETS = void 0;
    const privateKey = await getPrivateKey();
    if (privateKey == "") {
      return;
    }
    const deviceId = await getDeviceId();
    const secrets = await fetchSecrets(privateKey, deviceId);
    if (!secrets) {
      return;
    }
    SECRETS = secrets;
    const subscription = await createSubscription(privateKey, deviceId);
    if (!subscription) {
      return;
    }
    SUBSCRIPTION = subscription;
  } catch (e) {
    console.error(e);
    return;
  } finally {
    await notifyPageOfChange();
  }
}
function isAuthorized() {
  return SECRETS !== void 0;
}
function isSubscribed() {
  return SUBSCRIPTION !== void 0;
}
function createAuthToken(privateKey, deviceId) {
  const nonce = Date.now() + Math.floor(Math.random() * 1e3);
  const message = encodeTuple([encodeInt(nonce), encodeInt(deviceId)]);
  const signature = makeBip32PrivateKey(hexToBytes(privateKey)).sign(message);
  const payload = encodeTuple([encodeBytes(message), signature]);
  const payloadHex = bytesToHex(payload);
  return payloadHex;
}
async function fetchSecrets(privateKey, deviceId) {
  const response = await fetch(
    `https://api.oracle.token.pbg.io/secrets`,
    {
      method: "GET",
      mode: "cors",
      headers: {
        Authorization: createAuthToken(
          privateKey,
          deviceId
        )
      }
    }
  );
  const data = await response.text();
  return JSON.parse(data);
}
async function createSubscription(privateKey, deviceId) {
  try {
    const subscription = await scope.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: new Uint8Array(VAPID_BASE64_CODEC.decode(VAPID_PUBLIC_KEY))
    });
    const response = await fetch(`https://api.oracle.token.pbg.io/subscribe`, {
      method: "POST",
      mode: "cors",
      headers: {
        Authorization: createAuthToken(
          privateKey,
          deviceId
        )
      },
      body: JSON.stringify(subscription)
    });
    if (response.status >= 200 && response.status < 300) {
      return subscription;
    } else {
      return void 0;
    }
  } catch (e) {
    console.error(e);
    return void 0;
  }
}

// src/worker/feed.ts
async function signFeed(options) {
  const privateKey = await getPrivateKey();
  const deviceId = await getDeviceId();
  const tx = await fetchPriceFeed(privateKey, deviceId);
  if (tx) {
    const pk = makeBip32PrivateKey(hexToBytes(privateKey));
    const id = tx.body.hash();
    const signature = pk.sign(id);
    await putSignature(privateKey, deviceId, signature);
    const event = {
      hash: bytesToHex(id),
      timestamp: Date.now(),
      prices: {}
      // TODO: fetch from tx and validate
    };
    await appendEvent(event);
    await notifyPageOfChange();
    await scope.registration.showNotification("Signed price feed tx", {
      ...options,
      body: bytesToHex(id)
    });
  } else {
    await scope.registration.showNotification("Missing tx", {
      ...options
    });
  }
}
async function fetchPriceFeed(privateKey, deviceId) {
  try {
    const response = await fetch(`https://api.oracle.token.pbg.io/feed`, {
      method: "GET",
      mode: "cors",
      headers: {
        Authorization: createAuthToken(
          privateKey,
          deviceId
        )
      }
    });
    if (response.status >= 200 && response.status < 300) {
      const text = await response.text();
      const obj = JSON.parse(text);
      if ("tx" in obj && typeof obj.tx == "string") {
        return decodeTx(obj.tx);
      } else {
        return void 0;
      }
    } else {
      return void 0;
    }
  } catch (e) {
    console.error(e);
    return void 0;
  }
}
async function putSignature(privateKey, deviceId, signature) {
  try {
    await fetch(`https://api.oracle.token.pbg.io/feed`, {
      method: "POST",
      mode: "cors",
      headers: {
        Authorization: createAuthToken(
          privateKey,
          deviceId
        )
      },
      body: bytesToHex(signature.toCbor())
    });
  } catch (e) {
    console.error(e);
  }
}

// src/worker/index.ts
scope.addEventListener("activate", (event) => {
  console.log("Service Worker activated");
  event.waitUntil(authorizeAndSubscribe());
});
scope.addEventListener("install", (event) => {
  console.log("Service Worker installed");
  event.waitUntil(openDatabase());
  scope.skipWaiting();
});
scope.addEventListener("message", (event) => {
  const { method, key, value } = event.data;
  const port = event.ports[0];
  const handleSuccess = (data) => {
    port.postMessage({ status: "success", data });
  };
  const handleError = (msg) => {
    port.postMessage({ status: "error", error: msg });
  };
  event.waitUntil(
    (async () => {
      try {
        switch (method) {
          case "get":
            switch (key) {
              case "deviceId":
                handleSuccess(await getDeviceId());
                break;
              case "events":
                handleSuccess(await listEvents());
                break;
              case "isAuthorized":
                handleSuccess(isAuthorized());
                break;
              case "isSubscribed":
                handleSuccess(isSubscribed());
                break;
              case "privateKey":
                handleSuccess(await getPrivateKey());
                break;
              default:
                handleError(`invalid key "${key}"`);
            }
            break;
          case "set":
            switch (key) {
              case "deviceId":
                await setDeviceId(value);
                handleSuccess();
                break;
              case "privateKey":
                await setPrivateKey(value);
                await authorizeAndSubscribe();
                handleSuccess();
                break;
              default:
                handleError(`invalid key "${key}"`);
            }
            break;
          default:
            handleError(`invalid method "${method}"`);
        }
      } catch (e) {
        handleError("internal error:" + e.message);
      }
    })()
  );
});
scope.addEventListener("push", (event) => {
  const payload = event.data ? event.data.json() : {};
  const message = payload.message || "N/A";
  const options = {
    body: message,
    icon: "icon.png",
    badge: "badge.png"
  };
  event.waitUntil(signFeed(options));
});
/*! Bundled license information:

@helios-lang/ledger/src/tx/Tx.js:
  (*!!! todo: this line doesn't catch errors if we e.g. include an extra 'undefined' arg.  WHY? *)
*/
