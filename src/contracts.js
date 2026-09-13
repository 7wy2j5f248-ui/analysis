import { supabase } from './supabase.js';

export async function getCurrentStage1Contract() {
  const { data, error } = await supabase
    .from('analysis_contracts')
    .select('id, stage, version, contract_text, is_current, created_at')
    .eq('stage', 'stage1')
    .eq('is_current', true)
    .single();

  if (error) {
    throw error;
  }

  return data;
}