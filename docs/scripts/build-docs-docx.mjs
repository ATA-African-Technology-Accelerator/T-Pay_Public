#!/usr/bin/env node
/**
 * Builds docs/T-Pay-PRD.docx from docs/T-Pay-PRD.md.
 *
 * The markdown stays the single editable source, the same way it does for the
 * PDF. Run with `npm run docs:docx`.
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AlignmentType,
  Bookmark,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  InternalHyperlink,
  LevelFormat,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { marked } from 'marked';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SOURCE = path.join(ROOT, 'docs/T-Pay-PRD.md');
const OUTPUT = path.join(ROOT, 'docs/T-Pay-PRD.docx');

const GREEN = '0B5D4B';
const INK = '1B2430';
const MUTED = '5B6573';
const TINT = 'EEF4F1';
const LINE = 'D5DBD8';
const BODY_FONT = 'Calibri';
const CODE_FONT = 'Consolas';
const PAGE_WIDTH = 11906; // A4 in DXA
const PAGE_HEIGHT = 16838;
const MARGIN = 1134; // 2 cm
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const MIN_COLUMN = 900;

function decode(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseFrontMatter(source) {
  const match = source.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) throw new Error('Front matter is missing.');
  const meta = Object.fromEntries(
    match[1].split('\n').map((line) => {
      const index = line.indexOf(':');
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
    }),
  );
  return { meta, body: source.slice(match[0].length) };
}

function inlineRuns(tokens, style = {}) {
  return (tokens ?? []).flatMap((token) => {
    switch (token.type) {
      case 'strong':
        return inlineRuns(token.tokens, { ...style, bold: true });
      case 'em':
        return inlineRuns(token.tokens, { ...style, italics: true });
      case 'codespan':
        return [new TextRun({ ...style, text: decode(token.text), font: CODE_FONT, color: GREEN })];
      case 'link':
        return inlineRuns(token.tokens, style);
      case 'br':
        return [new TextRun({ ...style, break: 1 })];
      default:
        if (token.tokens) return inlineRuns(token.tokens, style);
        return [new TextRun({ ...style, text: decode(token.text ?? token.raw ?? '') })];
    }
  });
}

function plainLength(cell) {
  return cell.text.replace(/[*`]/g, '').length;
}

/** Share page width by content length, with a floor so short columns stay readable. */
function columnWidths(token) {
  const count = token.header.length;
  const weights = token.header.map((cell, column) => {
    const lengths = [cell, ...token.rows.map((row) => row[column])].map(plainLength);
    return Math.sqrt(Math.max(...lengths) + lengths.reduce((sum, value) => sum + value, 0) / lengths.length);
  });
  const total = weights.reduce((sum, value) => sum + value, 0);
  const widths = weights.map((weight) => Math.max(MIN_COLUMN, Math.round((weight / total) * CONTENT_WIDTH)));
  const excess = widths.reduce((sum, value) => sum + value, 0) - CONTENT_WIDTH;
  const flexible = widths.reduce((sum, value) => sum + (value > MIN_COLUMN ? value - MIN_COLUMN : 0), 0);
  const adjusted = widths.map((value) =>
    value > MIN_COLUMN ? Math.round(value - (excess * (value - MIN_COLUMN)) / flexible) : value,
  );
  adjusted[count - 1] += CONTENT_WIDTH - adjusted.reduce((sum, value) => sum + value, 0);
  return adjusted;
}

function tableCell(cell, width, header) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    margins: { top: 60, bottom: 60, left: 90, right: 90 },
    shading: header ? { type: ShadingType.CLEAR, fill: TINT, color: 'auto' } : undefined,
    children: [
      new Paragraph({
        spacing: { before: 0, after: 0 },
        children: inlineRuns(cell.tokens, { size: 18, bold: header || undefined, color: header ? GREEN : INK }),
      }),
    ],
  });
}

function table(token) {
  const widths = columnWidths(token);
  const line = { style: BorderStyle.SINGLE, size: 4, color: LINE };
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    borders: { top: line, bottom: line, left: line, right: line, insideHorizontal: line, insideVertical: line },
    rows: [
      new TableRow({
        tableHeader: true,
        cantSplit: true,
        children: token.header.map((cell, index) => tableCell(cell, widths[index], true)),
      }),
      ...token.rows.map(
        (row) =>
          new TableRow({
            cantSplit: true,
            children: row.map((cell, index) => tableCell(cell, widths[index], false)),
          }),
      ),
    ],
  });
}

function codeBlock(token) {
  return decode(token.text)
    .split('\n')
    .map(
      (line) =>
        new Paragraph({
          spacing: { before: 0, after: 0, line: 250 },
          keepLines: true,
          shading: { type: ShadingType.CLEAR, fill: 'F4F6F5', color: 'auto' },
          children: [new TextRun({ text: line || ' ', font: CODE_FONT, size: 17 })],
        }),
    );
}

function bookmarkId(index) {
  return `section_${index}`;
}

function renderBody(tokens) {
  const blocks = [];
  const contents = [];
  let listInstance = 0;
  let sectionIndex = 0;

  for (const token of tokens) {
    switch (token.type) {
      case 'heading': {
        const runs = inlineRuns(token.tokens);
        if (token.depth === 2) {
          const id = bookmarkId(sectionIndex);
          sectionIndex += 1;
          contents.push({ id, title: decode(token.text) });
          blocks.push(
            new Paragraph({
              heading: HeadingLevel.HEADING_1,
              pageBreakBefore: true,
              children: [new Bookmark({ id, children: runs })],
            }),
          );
        } else {
          blocks.push(
            new Paragraph({
              heading: token.depth === 3 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
              children: runs,
            }),
          );
        }
        break;
      }
      case 'paragraph':
        blocks.push(new Paragraph({ spacing: { after: 140 }, children: inlineRuns(token.tokens) }));
        break;
      case 'table':
        blocks.push(table(token), new Paragraph({ spacing: { after: 120 }, children: [] }));
        break;
      case 'code':
        blocks.push(...codeBlock(token), new Paragraph({ spacing: { after: 120 }, children: [] }));
        break;
      case 'list': {
        listInstance += 1;
        for (const item of token.items) {
          blocks.push(
            new Paragraph({
              spacing: { after: 70 },
              numbering: {
                reference: token.ordered ? 'numbers' : 'bullets',
                level: 0,
                instance: listInstance,
              },
              children: inlineRuns(item.tokens),
            }),
          );
        }
        break;
      }
      case 'space':
        break;
      default:
        throw new Error(`Unhandled markdown block: ${token.type}`);
    }
  }
  return { blocks, contents };
}

function cover(meta) {
  return [
    new Paragraph({
      spacing: { before: 1800, after: 120 },
      border: { top: { style: BorderStyle.SINGLE, size: 36, color: GREEN, space: 16 } },
      children: [new TextRun({ text: 'PRODUCT REQUIREMENTS DOCUMENT', size: 18, color: GREEN, characterSpacing: 40 })],
    }),
    new Paragraph({
      spacing: { after: 100 },
      children: [new TextRun({ text: meta.title, size: 84, bold: true, color: INK })],
    }),
    new Paragraph({
      spacing: { after: 240 },
      children: [new TextRun({ text: meta.tagline, size: 28, italics: true, color: MUTED })],
    }),
    new Paragraph({
      spacing: { before: 4800, after: 80 },
      children: [new TextRun({ text: meta.status, color: MUTED })],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: `Version ${meta.version}  ·  ${meta.date}  ·  ${meta.author}`, color: MUTED }),
      ],
    }),
  ];
}

function contentsPage(contents) {
  return [
    new Paragraph({
      pageBreakBefore: true,
      spacing: { after: 200 },
      children: [new TextRun({ text: 'Contents', size: 34, bold: true, color: INK })],
    }),
    ...contents.map(
      ({ id, title }) =>
        new Paragraph({
          spacing: { after: 110 },
          children: [
            new InternalHyperlink({
              anchor: id,
              children: [new TextRun({ text: title, color: GREEN })],
            }),
          ],
        }),
    ),
  ];
}

const headingStyle = (size, before, after, color = INK) => ({
  run: { font: BODY_FONT, size, bold: true, color },
  paragraph: { spacing: { before, after }, keepNext: true },
});

async function main() {
  const source = await readFile(SOURCE, 'utf8');
  const { meta, body } = parseFrontMatter(source);
  const { blocks, contents } = renderBody(marked.lexer(body));

  const document = new Document({
    title: `${meta.title} ${meta.subtitle}`,
    creator: meta.author,
    styles: {
      default: {
        document: { run: { font: BODY_FONT, size: 21, color: INK } },
        heading1: headingStyle(34, 0, 200),
        heading2: headingStyle(26, 260, 110, GREEN),
        heading3: headingStyle(22, 200, 90),
      },
    },
    numbering: {
      config: [
        {
          reference: 'numbers',
          levels: [{
            level: 0,
            format: LevelFormat.DECIMAL,
            text: '%1.',
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 420, hanging: 300 } } },
          }],
        },
        {
          reference: 'bullets',
          levels: [{
            level: 0,
            format: LevelFormat.BULLET,
            text: '•',
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 420, hanging: 260 } } },
          }],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
            margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({ text: 'T-Pay PRD  ·  Page ', size: 16, color: MUTED }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 16, color: MUTED }),
                ],
              }),
            ],
          }),
        },
        children: [...cover(meta), ...contentsPage(contents), ...blocks],
      },
    ],
  });

  await writeFile(OUTPUT, await Packer.toBuffer(document));
  console.log(`Built ${path.relative(ROOT, OUTPUT)} with ${contents.length} sections`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
