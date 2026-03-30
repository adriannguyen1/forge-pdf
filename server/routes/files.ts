import { Router } from 'express';
import { fileRegistry } from './upload.js';

const router = Router();

router.get('/files/:id/pdf', (req, res) => {
  const file = fileRegistry.get(req.params.id);
  if (!file) {
    res.status(404).json({ error: 'File not found' });
    return;
  }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${file.originalName}"`);
  res.sendFile(file.pdfPath);
});

export default router;
