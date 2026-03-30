import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { PDFDocument } from 'pdf-lib';
import fs from 'fs/promises';
import { mkdirSync } from 'fs';
import { convertDocxToPdf } from '../services/docxConverter.js';
import { convertHtmlToPdf } from '../services/htmlConverter.js';
import { convertWithLibreOffice } from '../services/libreOfficeConverter.js';

const uploadsDir = process.env.UPLOADS_DIR || path.join(os.tmpdir(), 'forge-pdf-uploads');
mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (_req, file, cb) => {
    const id = uuidv4();
    const ext = path.extname(file.originalname);
    cb(null, `${id}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['.docx', '.doc', '.pptx', '.ppt', '.html', '.htm'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only DOCX, DOC, PPTX, PPT, and HTML files are accepted for server conversion'));
    }
  },
});

interface FileMetadata {
  id: string;
  originalName: string;
  pdfPath: string;
  pageCount: number;
}

// In-memory file registry (good enough for single-server use)
export const fileRegistry = new Map<string, FileMetadata>();

const router = Router();

router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    const fileId = path.basename(req.file.filename, path.extname(req.file.filename));
    let pdfPath: string;

    if (ext === '.html' || ext === '.htm') {
      pdfPath = path.join(uploadsDir, `${fileId}.pdf`);
      await convertHtmlToPdf(req.file.path, pdfPath);
      await fs.unlink(req.file.path);
    } else if (ext === '.docx') {
      pdfPath = path.join(uploadsDir, `${fileId}.pdf`);
      await convertDocxToPdf(req.file.path, pdfPath);
      await fs.unlink(req.file.path);
    } else if (ext === '.doc' || ext === '.pptx' || ext === '.ppt') {
      const generatedPdfPath = await convertWithLibreOffice(req.file.path, uploadsDir);
      pdfPath = path.join(uploadsDir, `${fileId}.pdf`);
      if (generatedPdfPath !== pdfPath) {
        await fs.rename(generatedPdfPath, pdfPath);
      }
      await fs.unlink(req.file.path).catch(() => {});
    } else {
      res.status(400).json({ error: 'Unsupported file type' });
      return;
    }

    // Read page count
    const pdfBytes = await fs.readFile(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const pageCount = pdfDoc.getPageCount();

    const metadata: FileMetadata = {
      id: fileId,
      originalName: req.file.originalname,
      pdfPath,
      pageCount,
    };

    fileRegistry.set(fileId, metadata);

    res.json({
      fileId,
      fileName: req.file.originalname,
      pageCount,
    });
  } catch (err: any) {
    console.error('Upload error:', err);
    res.status(500).json({ error: err.message || 'Upload failed' });
  }
});

export default router;
