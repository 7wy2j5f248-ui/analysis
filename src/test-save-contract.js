import { getCurrentStage1Contract } from './contracts.js';
import { saveStage1Contract } from './save-contract.js';

try {
  const current = await getCurrentStage1Contract();

  console.log('Before save:');
  console.log('Version:', current.version);
  console.log('Current:', current.is_current);

  const saved = await saveStage1Contract(current.contract_text);
  const savedRow = Array.isArray(saved) ? saved[0] : saved;

  console.log('');
  console.log('After save:');
  console.log('Version:', savedRow.version);
  console.log('Current:', savedRow.is_current);
} catch (error) {
  console.error('Test failed:', error);
  process.exit(1);
}