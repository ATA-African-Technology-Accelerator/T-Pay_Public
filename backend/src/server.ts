// backend/src/server.ts
import express from 'express';
import cors from 'cors';
import { apiRouter } from './routes/api.routes';

const app = express();

app.use(cors());
app.use(express.json());
app.use('/api', apiRouter);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 Backend server listening on http://localhost:${PORT}`);
});

