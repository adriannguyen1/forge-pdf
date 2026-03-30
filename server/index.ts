import express from 'express';
import cors from 'cors';
import uploadRouter from './routes/upload.js';
import filesRouter from './routes/files.js';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api', uploadRouter);
app.use('/api', filesRouter);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
