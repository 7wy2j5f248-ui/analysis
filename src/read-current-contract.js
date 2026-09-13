import { getCurrentStage1Contract } from './contracts.js';

try {
  const data = await getCurrentStage1Contract();

  console.log('Stage:', data.stage);
  console.log('Version:', data.version);
  console.log('Current:', data.is_current);
  console.log('');
  console.log(data.contract_text);
} catch (error) {
  console.error('Supabase error:', error);
  process.exit(1);
}