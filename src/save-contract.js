import { supabase } from './supabase.js';

export async function saveStage1Contract(contractText) {
  const { data, error } = await supabase
    .rpc('save_analysis_contract_version', {
      p_stage: 'stage1',
      p_contract_text: contractText
    });

  if (error) {
    throw error;
  }

  return data;
}