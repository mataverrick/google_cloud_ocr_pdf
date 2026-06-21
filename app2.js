const express = require('express');
const multer = require('multer');
const { PDFDocument } = require('pdf-lib');
const { DocumentProcessorServiceClient } =
  require('@google-cloud/documentai').v1;

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

const projectId = '363701528902';
const location = 'us';
const processorId = '6b8f99dae711af9a';

const client = new DocumentProcessorServiceClient({
  keyFilename: './key.json'
});

/**
 * Divide PDF en chunks de N páginas
 */
async function splitPdf(buffer, chunkSize = 10) {
  const pdfDoc = await PDFDocument.load(buffer);
  const totalPages = pdfDoc.getPageCount();

  const chunks = [];

  for (let i = 0; i < totalPages; i += chunkSize) {
    const newPdf = await PDFDocument.create();

    const pageIndexes = Array.from(
      { length: Math.min(chunkSize, totalPages - i) },
      (_, j) => i + j
    );

    const copiedPages = await newPdf.copyPages(pdfDoc, pageIndexes);
    copiedPages.forEach(page => newPdf.addPage(page));

    const pdfBytes = await newPdf.save();
    chunks.push(Buffer.from(pdfBytes));
  }

  return chunks;
}

/**
 * OCR endpoint
 */
app.post('/ocr', upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'No se recibió ningún archivo'
      });
    }

    const chunks = await splitPdf(req.file.buffer, 10);

    const name =
      `projects/${projectId}/locations/${location}/processors/${processorId}`;

    let fullText = '';

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      const request = {
        name,
        rawDocument: {
          content: chunk.toString('base64'),
          mimeType: req.file.mimetype
        }
      };

      const [result] = await client.processDocument(request);

      const text = result.document.text || '';
      fullText += text + '\n';
    }

    res.json({
      success: true,
      pages: chunks.length,
      text: fullText.trim()
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.listen(3001, () => {
  console.log('OCR escuchando en puerto 3001');
});
