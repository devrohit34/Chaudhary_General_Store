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

const trace = JSON.parse(fs.readFileSync(traceFile, 'utf8'));

const fontFiles = fs.readdirSync(fontsDir, {
  withFileTypes: true,
})
  .filter((entry) => entry.isFile())
  .map((entry) =>
    path.relative(
      path.dirname(traceFile),
      path.join(fontsDir, entry.name)
    ).split(path.sep).join('/')
  );

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

console.log('PDFKit font files added to invoice trace:', fontFiles.length);
console.log(
  'Helvetica included:',
  trace.files.some((file) => file.includes('Helvetica.cjs'))
);