// Helpers for the Milestone II report: Times New Roman 11 pt, black on white, single column,
// US Letter with 1-inch margins, numbered figures and tables.
const fs = require("fs");
const path = require("path");
const {
  Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, WidthType, AlignmentType,
  HeadingLevel, ShadingType, BorderStyle,
} = require("docx");

const FONT = "Times New Roman";
const BODY = 22; // half-points: 11 pt
const SMALL = 18; // 9 pt for table cells? keep >= 10 pt -> 20
const TABLE_SIZE = 20; // 10 pt
const CONTENT_WIDTH = 9360; // 6.5 in in DXA
const FIG_DIR = path.join(__dirname, "..", "figures");

let figureNo = 0;
let tableNo = 0;
const labels = {}; // token -> number, e.g. FIG_PR -> 3; resolved in the final XML by build_report.js

// Inline markup: **bold**, *italic*, `code` (rendered as plain text in Courier-free body font)
function runs(text, opts = {}) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(new TextRun({ text: text.slice(last, m.index), font: FONT, size: opts.size || BODY }));
    const t = m[0];
    if (t.startsWith("**")) out.push(new TextRun({ text: t.slice(2, -2), bold: true, font: FONT, size: opts.size || BODY }));
    else if (t.startsWith("`")) out.push(new TextRun({ text: t.slice(1, -1), font: FONT, size: opts.size || BODY }));
    else out.push(new TextRun({ text: t.slice(1, -1), italics: true, font: FONT, size: opts.size || BODY }));
    last = m.index + t.length;
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last), font: FONT, size: opts.size || BODY }));
  return out;
}

function P(text, opts = {}) {
  return new Paragraph({
    children: runs(text, opts),
    spacing: { after: opts.after ?? 100, line: 250 },
    alignment: opts.align || AlignmentType.JUSTIFIED,
    indent: opts.indent ? { left: opts.indent } : undefined,
  });
}

function bullet(text) {
  return new Paragraph({ children: runs(text), numbering: { reference: "bullets", level: 0 }, spacing: { after: 40, line: 250 } });
}

function H1(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text, font: FONT, bold: true, size: 26, color: "000000" })], spacing: { before: 200, after: 100 } });
}

function H2(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text, font: FONT, bold: true, size: 23, color: "000000" })], spacing: { before: 140, after: 80 } });
}

function H3(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun({ text, font: FONT, bold: true, italics: true, size: BODY, color: "000000" })], spacing: { before: 100, after: 60 } });
}

// PNG size from the IHDR chunk, so figures keep their aspect ratio.
function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), data: b };
}

function figure(file, caption, widthIn = 6.5, label = null) {
  figureNo += 1;
  if (label) labels[label] = figureNo;
  const { w, h, data } = pngSize(path.join(FIG_DIR, file));
  const widthPx = widthIn * 96;
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 80, after: 40 },
      children: [new ImageRun({ type: "png", data, transformation: { width: widthPx, height: Math.round(widthPx * h / w) },
        altText: { title: `Figure ${figureNo}`, description: caption, name: file } })],
    }),
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED, spacing: { after: 140 },
      children: [new TextRun({ text: `Figure ${figureNo}. `, bold: true, font: FONT, size: TABLE_SIZE }), ...runs(caption, { size: TABLE_SIZE })],
    }),
  ];
}

function nextFigure() { return figureNo + 1; }
function nextTable() { return tableNo + 1; }

const border = { style: BorderStyle.SINGLE, size: 4, color: "808080" };
const borders = { top: border, bottom: border, left: border, right: border };

// rows: array of arrays of strings; first row = header. widths: relative weights.
function table(caption, rows, widths, label = null) {
  tableNo += 1;
  if (label) labels[label] = tableNo;
  const total = widths.reduce((a, b) => a + b, 0);
  const cols = widths.map((w) => Math.floor(CONTENT_WIDTH * w / total));
  cols[cols.length - 1] += CONTENT_WIDTH - cols.reduce((a, b) => a + b, 0);
  const trs = rows.map((r, i) => new TableRow({
    tableHeader: i === 0,
    cantSplit: true,
    children: r.map((cell, j) => new TableCell({
      borders,
      width: { size: cols[j], type: WidthType.DXA },
      shading: i === 0 ? { fill: "E7E6E6", type: ShadingType.CLEAR, color: "auto" } : undefined,
      margins: { top: 30, bottom: 30, left: 70, right: 70 },
      children: [new Paragraph({
        alignment: j === 0 ? AlignmentType.LEFT : AlignmentType.CENTER,
        children: i === 0 ? [new TextRun({ text: String(cell), bold: true, font: FONT, size: TABLE_SIZE })] : runs(String(cell), { size: TABLE_SIZE }),
      })],
    })),
  }));
  return [
    new Paragraph({
      keepNext: true, spacing: { before: 100, after: 50 },
      children: [new TextRun({ text: `Table ${tableNo}. `, bold: true, font: FONT, size: TABLE_SIZE }), ...runs(caption, { size: TABLE_SIZE })],
    }),
    new Table({ width: { size: CONTENT_WIDTH, type: WidthType.DXA }, columnWidths: cols, rows: trs }),
    new Paragraph({ spacing: { after: 100 }, children: [] }),
  ];
}

module.exports = { labels, P, bullet, H1, H2, H3, figure, table, runs, nextFigure, nextTable, FONT, BODY };
