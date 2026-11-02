const fs = require('fs');
const path = require('path');

const root = process.cwd();

const traceFile = path.join(
  root,
  '.next/server/app/api/orders/[orderNumber]/invoice/route.js.nft.json'
);

const fontsDir = path.join(
  root,
  'node_modules/pdfkit/js/standard-fonts'
);

if (!fs.existsSync(traceFile)) {
  console.error('Invoice trace file not found:', traceFile);
  process.exit(1);
}

if (!fs.existsSync(fontsDir)) {
  console.error('PDFKit standard fonts folder not found:', fontsDir);
  process.exit(1);
}

// Recursively collect files, including nested chunks folders.
function getFilesRecursively(directory) {
  const files = [];

  for (const entry of fs.readdirSync(directory, {
    withFileTypes: true,
  })) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...getFilesRecursively(fullPath));
    } else if (entry.isFile()) {
      files.push(
        path.relative(
          path.dirname(traceFile),
          fullPath
        ).split(path.sep).join('/')
      );
    }
  }

  return files;
}

const trace = JSON.parse(
  fs.readFileSync(traceFile, 'utf8')
);

const fontFiles = getFilesRecursively(fontsDir);

trace.files = [
  ...new Set([
    ...(trace.files || []),
    ...fontFiles,
  ]),
];

fs.writeFileSync(
  traceFile,
  JSON.stringify(trace, null, 2)
);

const glyphChunk = fontFiles.find((file) =>
  file.includes('/chunks/standardGlyphNames-')
);

const missingFiles = fontFiles.filter((file) =>
  !fs.existsSync(
    path.resolve(path.dirname(traceFile), file)
  )
);

console.log('PDFKit font files added:', fontFiles.length);
console.log('Nested glyph chunk included:', Boolean(glyphChunk));
console.log('Missing local files:', missingFiles.length);

if (!glyphChunk || missingFiles.length > 0) {
  console.error('PDFKit trace verification failed.');
  process.exit(1);
}

console.log('PDFKit trace verification: PASS');