export type QrMatrix = boolean[][];

type QrVersionInfo = {
  version: number;
  dataCodewords: number;
  eccCodewordsPerBlock: number;
  blocks: Array<{ count: number; dataCodewords: number }>;
  alignment: number[];
  remainderBits: number;
};

const QR_VERSIONS: QrVersionInfo[] = [
  {
    version: 1,
    dataCodewords: 19,
    eccCodewordsPerBlock: 7,
    blocks: [{ count: 1, dataCodewords: 19 }],
    alignment: [],
    remainderBits: 0,
  },
  {
    version: 2,
    dataCodewords: 34,
    eccCodewordsPerBlock: 10,
    blocks: [{ count: 1, dataCodewords: 34 }],
    alignment: [6, 18],
    remainderBits: 7,
  },
  {
    version: 3,
    dataCodewords: 55,
    eccCodewordsPerBlock: 15,
    blocks: [{ count: 1, dataCodewords: 55 }],
    alignment: [6, 22],
    remainderBits: 7,
  },
  {
    version: 4,
    dataCodewords: 80,
    eccCodewordsPerBlock: 20,
    blocks: [{ count: 1, dataCodewords: 80 }],
    alignment: [6, 26],
    remainderBits: 7,
  },
  {
    version: 5,
    dataCodewords: 108,
    eccCodewordsPerBlock: 26,
    blocks: [{ count: 1, dataCodewords: 108 }],
    alignment: [6, 30],
    remainderBits: 7,
  },
  {
    version: 6,
    dataCodewords: 136,
    eccCodewordsPerBlock: 18,
    blocks: [{ count: 2, dataCodewords: 68 }],
    alignment: [6, 34],
    remainderBits: 7,
  },
  {
    version: 7,
    dataCodewords: 156,
    eccCodewordsPerBlock: 20,
    blocks: [{ count: 2, dataCodewords: 78 }],
    alignment: [6, 22, 38],
    remainderBits: 0,
  },
  {
    version: 8,
    dataCodewords: 194,
    eccCodewordsPerBlock: 24,
    blocks: [{ count: 2, dataCodewords: 97 }],
    alignment: [6, 24, 42],
    remainderBits: 0,
  },
  {
    version: 9,
    dataCodewords: 232,
    eccCodewordsPerBlock: 30,
    blocks: [{ count: 2, dataCodewords: 116 }],
    alignment: [6, 26, 46],
    remainderBits: 0,
  },
  {
    version: 10,
    dataCodewords: 274,
    eccCodewordsPerBlock: 18,
    blocks: [
      { count: 2, dataCodewords: 68 },
      { count: 2, dataCodewords: 69 },
    ],
    alignment: [6, 28, 50],
    remainderBits: 0,
  },
];

const byteEncoder = new TextEncoder();

const getBit = (value: number, index: number) => ((value >>> index) & 1) !== 0;

const appendBits = (
  target: boolean[],
  value: number,
  bitLength: number,
) => {
  for (let index = bitLength - 1; index >= 0; index -= 1) {
    target.push(((value >>> index) & 1) !== 0);
  }
};

const bitsToCodewords = (bits: boolean[]) => {
  const codewords: number[] = [];
  for (let index = 0; index < bits.length; index += 8) {
    let value = 0;
    for (let offset = 0; offset < 8; offset += 1) {
      value = (value << 1) | (bits[index + offset] ? 1 : 0);
    }
    codewords.push(value);
  }
  return codewords;
};

const createGaloisTables = () => {
  const exp = new Array<number>(512).fill(0);
  const log = new Array<number>(256).fill(0);
  let value = 1;
  for (let index = 0; index < 255; index += 1) {
    exp[index] = value;
    log[value] = index;
    value <<= 1;
    if (value & 0x100) {
      value ^= 0x11d;
    }
  }
  for (let index = 255; index < 512; index += 1) {
    exp[index] = exp[index - 255];
  }
  return { exp, log };
};

const GF = createGaloisTables();

const gfMultiply = (left: number, right: number) => {
  if (left === 0 || right === 0) return 0;
  return GF.exp[GF.log[left] + GF.log[right]];
};

const reedSolomonGenerator = (degree: number) => {
  let result = [1];
  for (let degreeIndex = 0; degreeIndex < degree; degreeIndex += 1) {
    const next = new Array(result.length + 1).fill(0);
    result.forEach((coefficient, index) => {
      next[index] ^= coefficient;
      next[index + 1] ^= gfMultiply(coefficient, GF.exp[degreeIndex]);
    });
    result = next;
  }
  return result;
};

const reedSolomonRemainder = (data: number[], degree: number) => {
  const generator = reedSolomonGenerator(degree);
  const remainder = new Array<number>(degree).fill(0);

  data.forEach((codeword) => {
    const factor = codeword ^ remainder.shift()!;
    remainder.push(0);
    for (let index = 0; index < degree; index += 1) {
      remainder[index] ^= gfMultiply(generator[index + 1], factor);
    }
  });

  return remainder;
};

const chooseVersion = (bytes: Uint8Array) => {
  const version = QR_VERSIONS.find((entry) => {
    const charCountBits = entry.version <= 9 ? 8 : 16;
    const totalBits = 4 + charCountBits + bytes.length * 8;
    return totalBits <= entry.dataCodewords * 8;
  });

  if (!version) {
    throw new Error("Link troppo lungo per il QR Code integrato.");
  }

  return version;
};

const encodeData = (text: string, versionInfo: QrVersionInfo) => {
  const bytes = byteEncoder.encode(text);
  const bits: boolean[] = [];
  appendBits(bits, 0b0100, 4);
  appendBits(bits, bytes.length, versionInfo.version <= 9 ? 8 : 16);
  bytes.forEach((byte) => appendBits(bits, byte, 8));

  const capacityBits = versionInfo.dataCodewords * 8;
  const terminatorLength = Math.min(4, capacityBits - bits.length);
  appendBits(bits, 0, terminatorLength);
  while (bits.length % 8 !== 0) {
    bits.push(false);
  }

  const dataCodewords = bitsToCodewords(bits);
  for (
    let padIndex = 0;
    dataCodewords.length < versionInfo.dataCodewords;
    padIndex += 1
  ) {
    dataCodewords.push(padIndex % 2 === 0 ? 0xec : 0x11);
  }

  return dataCodewords;
};

const buildCodewords = (dataCodewords: number[], versionInfo: QrVersionInfo) => {
  const blocks: Array<{ data: number[]; ecc: number[] }> = [];
  let offset = 0;

  versionInfo.blocks.forEach((group) => {
    for (let index = 0; index < group.count; index += 1) {
      const data = dataCodewords.slice(offset, offset + group.dataCodewords);
      offset += group.dataCodewords;
      blocks.push({
        data,
        ecc: reedSolomonRemainder(data, versionInfo.eccCodewordsPerBlock),
      });
    }
  });

  const result: number[] = [];
  const maxDataLength = Math.max(...blocks.map((block) => block.data.length));
  for (let index = 0; index < maxDataLength; index += 1) {
    blocks.forEach((block) => {
      if (index < block.data.length) result.push(block.data[index]);
    });
  }
  for (let index = 0; index < versionInfo.eccCodewordsPerBlock; index += 1) {
    blocks.forEach((block) => result.push(block.ecc[index]));
  }

  return result;
};

const createMatrix = (size: number) => ({
  modules: Array.from({ length: size }, () => new Array<boolean>(size).fill(false)),
  functions: Array.from({ length: size }, () => new Array<boolean>(size).fill(false)),
});

const setFunctionModule = (
  modules: boolean[][],
  functions: boolean[][],
  row: number,
  col: number,
  dark: boolean,
) => {
  modules[row][col] = dark;
  functions[row][col] = true;
};

const drawFinderPattern = (
  modules: boolean[][],
  functions: boolean[][],
  row: number,
  col: number,
) => {
  const size = modules.length;
  for (let dy = -1; dy <= 7; dy += 1) {
    for (let dx = -1; dx <= 7; dx += 1) {
      const yy = row + dy;
      const xx = col + dx;
      if (yy < 0 || yy >= size || xx < 0 || xx >= size) continue;
      const dark =
        dy >= 0 &&
        dy <= 6 &&
        dx >= 0 &&
        dx <= 6 &&
        (dy === 0 ||
          dy === 6 ||
          dx === 0 ||
          dx === 6 ||
          (dy >= 2 && dy <= 4 && dx >= 2 && dx <= 4));
      setFunctionModule(modules, functions, yy, xx, dark);
    }
  }
};

const drawAlignmentPattern = (
  modules: boolean[][],
  functions: boolean[][],
  row: number,
  col: number,
) => {
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      setFunctionModule(
        modules,
        functions,
        row + dy,
        col + dx,
        Math.max(Math.abs(dx), Math.abs(dy)) !== 1,
      );
    }
  }
};

const formatBits = (mask: number) => {
  const data = (0b01 << 3) | mask;
  let bits = data << 10;
  for (let index = 14; index >= 10; index -= 1) {
    if (((bits >>> index) & 1) !== 0) {
      bits ^= 0x537 << (index - 10);
    }
  }
  return ((data << 10) | bits) ^ 0x5412;
};

const versionBits = (version: number) => {
  let bits = version << 12;
  for (let index = 17; index >= 12; index -= 1) {
    if (((bits >>> index) & 1) !== 0) {
      bits ^= 0x1f25 << (index - 12);
    }
  }
  return (version << 12) | bits;
};

const drawFormatBits = (
  modules: boolean[][],
  functions: boolean[][],
  mask: number,
) => {
  const size = modules.length;
  const bits = formatBits(mask);
  for (let index = 0; index <= 5; index += 1) {
    setFunctionModule(modules, functions, 8, index, getBit(bits, index));
  }
  setFunctionModule(modules, functions, 8, 7, getBit(bits, 6));
  setFunctionModule(modules, functions, 8, 8, getBit(bits, 7));
  setFunctionModule(modules, functions, 7, 8, getBit(bits, 8));
  for (let index = 9; index < 15; index += 1) {
    setFunctionModule(modules, functions, 14 - index, 8, getBit(bits, index));
  }
  for (let index = 0; index < 8; index += 1) {
    setFunctionModule(modules, functions, size - 1 - index, 8, getBit(bits, index));
  }
  for (let index = 8; index < 15; index += 1) {
    setFunctionModule(modules, functions, 8, size - 15 + index, getBit(bits, index));
  }
  setFunctionModule(modules, functions, 8, size - 8, true);
};

const drawVersionBits = (
  modules: boolean[][],
  functions: boolean[][],
  version: number,
) => {
  if (version < 7) return;
  const size = modules.length;
  const bits = versionBits(version);
  for (let index = 0; index < 18; index += 1) {
    const bit = getBit(bits, index);
    const row = Math.floor(index / 3);
    const col = index % 3 + size - 11;
    setFunctionModule(modules, functions, row, col, bit);
    setFunctionModule(modules, functions, col, row, bit);
  }
};

const drawFunctionPatterns = (versionInfo: QrVersionInfo) => {
  const size = versionInfo.version * 4 + 17;
  const { modules, functions } = createMatrix(size);
  drawFinderPattern(modules, functions, 0, 0);
  drawFinderPattern(modules, functions, 0, size - 7);
  drawFinderPattern(modules, functions, size - 7, 0);

  for (let index = 0; index < size; index += 1) {
    if (!functions[6][index]) {
      setFunctionModule(modules, functions, 6, index, index % 2 === 0);
    }
    if (!functions[index][6]) {
      setFunctionModule(modules, functions, index, 6, index % 2 === 0);
    }
  }

  versionInfo.alignment.forEach((row) => {
    versionInfo.alignment.forEach((col) => {
      if (functions[row][col]) return;
      drawAlignmentPattern(modules, functions, row, col);
    });
  });

  drawVersionBits(modules, functions, versionInfo.version);
  drawFormatBits(modules, functions, 0);
  return { modules, functions };
};

const maskCondition = (mask: number, row: number, col: number) => {
  switch (mask) {
    case 0:
      return (row + col) % 2 === 0;
    case 1:
      return row % 2 === 0;
    case 2:
      return col % 3 === 0;
    case 3:
      return (row + col) % 3 === 0;
    case 4:
      return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
    case 5:
      return ((row * col) % 2) + ((row * col) % 3) === 0;
    case 6:
      return (((row * col) % 2) + ((row * col) % 3)) % 2 === 0;
    default:
      return (((row + col) % 2) + ((row * col) % 3)) % 2 === 0;
  }
};

const placeDataBits = (
  baseModules: boolean[][],
  functions: boolean[][],
  codewords: number[],
  mask: number,
) => {
  const size = baseModules.length;
  const modules = baseModules.map((row) => [...row]);
  const bits = codewords.flatMap((codeword) =>
    Array.from({ length: 8 }, (_, index) => getBit(codeword, 7 - index)),
  );
  let bitIndex = 0;
  let upward = true;

  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right -= 1;
    for (let vert = 0; vert < size; vert += 1) {
      const row = upward ? size - 1 - vert : vert;
      for (let offset = 0; offset < 2; offset += 1) {
        const col = right - offset;
        if (functions[row][col]) continue;
        const bit = bitIndex < bits.length ? bits[bitIndex] : false;
        modules[row][col] = bit !== maskCondition(mask, row, col);
        bitIndex += 1;
      }
    }
    upward = !upward;
  }

  return modules;
};

const penaltyScore = (modules: boolean[][]) => {
  const size = modules.length;
  let penalty = 0;

  const scoreLine = (line: boolean[]) => {
    let score = 0;
    let runColor = line[0];
    let runLength = 1;
    for (let index = 1; index < line.length; index += 1) {
      if (line[index] === runColor) {
        runLength += 1;
        if (runLength === 5) score += 3;
        if (runLength > 5) score += 1;
      } else {
        runColor = line[index];
        runLength = 1;
      }
    }
    return score;
  };

  for (let row = 0; row < size; row += 1) {
    penalty += scoreLine(modules[row]);
    penalty += scoreLine(modules.map((line) => line[row]));
  }

  for (let row = 0; row < size - 1; row += 1) {
    for (let col = 0; col < size - 1; col += 1) {
      const color = modules[row][col];
      if (
        modules[row][col + 1] === color &&
        modules[row + 1][col] === color &&
        modules[row + 1][col + 1] === color
      ) {
        penalty += 3;
      }
    }
  }

  const finderPattern = [true, false, true, true, true, false, true];
  const matchesPattern = (line: boolean[], index: number) =>
    finderPattern.every((value, offset) => line[index + offset] === value);
  for (let row = 0; row < size; row += 1) {
    const horizontal = modules[row];
    const vertical = modules.map((line) => line[row]);
    for (let index = 0; index <= size - 7; index += 1) {
      if (matchesPattern(horizontal, index)) penalty += 40;
      if (matchesPattern(vertical, index)) penalty += 40;
    }
  }

  const darkCount = modules.flat().filter(Boolean).length;
  const total = size * size;
  penalty += Math.floor(Math.abs((darkCount * 20) / total - 10)) * 10;
  return penalty;
};

export const generateQrMatrix = (text: string): QrMatrix => {
  if (!text.trim()) {
    throw new Error("Testo QR mancante.");
  }

  const bytes = byteEncoder.encode(text);
  const versionInfo = chooseVersion(bytes);
  const dataCodewords = encodeData(text, versionInfo);
  const codewords = buildCodewords(dataCodewords, versionInfo);
  const base = drawFunctionPatterns(versionInfo);
  let bestMask = 0;
  let bestMatrix = placeDataBits(base.modules, base.functions, codewords, 0);
  let bestPenalty = Number.POSITIVE_INFINITY;

  for (let mask = 0; mask < 8; mask += 1) {
    const nextBase = drawFunctionPatterns(versionInfo);
    const matrix = placeDataBits(nextBase.modules, nextBase.functions, codewords, mask);
    drawFormatBits(matrix, nextBase.functions, mask);
    const penalty = penaltyScore(matrix);
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      bestMask = mask;
      bestMatrix = matrix;
    }
  }

  const finalBase = drawFunctionPatterns(versionInfo);
  const finalMatrix = placeDataBits(
    finalBase.modules,
    finalBase.functions,
    codewords,
    bestMask,
  );
  drawFormatBits(finalMatrix, finalBase.functions, bestMask);
  return finalMatrix;
};

export const drawQrToCanvas = (
  canvas: HTMLCanvasElement,
  matrix: QrMatrix,
  options: { size?: number; margin?: number } = {},
) => {
  const size = options.size || 320;
  const margin = options.margin ?? 4;
  const context = canvas.getContext("2d");
  if (!context) return;

  const moduleCount = matrix.length;
  const scale = Math.floor(size / (moduleCount + margin * 2));
  const canvasSize = scale * (moduleCount + margin * 2);
  canvas.width = canvasSize;
  canvas.height = canvasSize;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvasSize, canvasSize);
  context.fillStyle = "#0f172a";

  matrix.forEach((row, rowIndex) => {
    row.forEach((dark, colIndex) => {
      if (!dark) return;
      context.fillRect(
        (colIndex + margin) * scale,
        (rowIndex + margin) * scale,
        scale,
        scale,
      );
    });
  });
};
