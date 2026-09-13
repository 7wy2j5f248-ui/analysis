import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

import { getCurrentStage1Contract } from './contracts.js';
import { saveStage1Contract } from './save-contract.js';

const app = express();
const port = 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json());

app.use(
  express.static(
    path.join(__dirname, '..', 'public')
  )
);

app.get('/api/contract', async (req, res) => {
  try {
    const contract = await getCurrentStage1Contract();

    res.json(contract);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Failed to load current contract.'
    });
  }
});

app.post('/api/contract', async (req, res) => {
  try {
    const contractText = req.body.contract_text;

    if (
      typeof contractText !== 'string' ||
      contractText.trim() === ''
    ) {
      return res.status(400).json({
        error: 'Contract text is required.'
      });
    }

    const current = await getCurrentStage1Contract();

    if (contractText === current.contract_text) {
      return res.json({
        ...current,
        unchanged: true
      });
    }

    const saved = await saveStage1Contract(contractText);

    const savedRow =
      Array.isArray(saved) ? saved[0] : saved;

    res.json({
      ...savedRow,
      unchanged: false
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Failed to save contract.'
    });
  }
});

app.listen(port, () => {
  console.log(
    `Analysis server running on port ${port}`
  );
});
