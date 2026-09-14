import { supabase } from './supabase.js';

const allowedPurposes = new Set([
  'interviewing',
  'data_analysis'
]);

function validatePurpose(purpose) {
  if (!allowedPurposes.has(purpose)) {
    throw new Error(
      `Invalid AI configuration purpose: ${purpose}`
    );
  }
}

export async function getCurrentAIModelConfiguration(
  purpose
) {
  validatePurpose(purpose);

  const { data, error } = await supabase
    .from('ai_model_configurations')
    .select(`
      id,
      purpose,
      version,
      provider_key,
      model,
      model_settings,
      is_current,
      created_at
    `)
    .eq('purpose', purpose)
    .eq('is_current', true)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? null;
}


export async function saveAIModelConfiguration({
  purpose,
  providerKey,
  model,
  modelSettings = {}
}) {
  validatePurpose(purpose);

  if (
    typeof providerKey !== 'string' ||
    providerKey.trim() === ''
  ) {
    throw new Error('Provider is required.');
  }

  if (
    typeof model !== 'string' ||
    model.trim() === ''
  ) {
    throw new Error('Model is required.');
  }

  if (
    modelSettings === null ||
    Array.isArray(modelSettings) ||
    typeof modelSettings !== 'object'
  ) {
    throw new Error(
      'Model settings must be an object.'
    );
  }

  const cleanProviderKey = providerKey.trim();
  const cleanModel = model.trim();

  const current =
    await getCurrentAIModelConfiguration(purpose);

  if (
    current &&
    current.provider_key === cleanProviderKey &&
    current.model === cleanModel &&
    JSON.stringify(current.model_settings ?? {}) ===
      JSON.stringify(modelSettings)
  ) {
    return {
      ...current,
      unchanged: true
    };
  }

  const { data: latest, error: latestError } =
    await supabase
      .from('ai_model_configurations')
      .select('version')
      .eq('purpose', purpose)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

  if (latestError) {
    throw latestError;
  }

  const nextVersion =
    (latest?.version ?? 0) + 1;

  if (current) {
    const { error: clearError } = await supabase
      .from('ai_model_configurations')
      .update({
        is_current: false
      })
      .eq('id', current.id);

    if (clearError) {
      throw clearError;
    }
  }

  const { data: saved, error: saveError } =
    await supabase
      .from('ai_model_configurations')
      .insert({
        purpose,
        version: nextVersion,
        provider_key: cleanProviderKey,
        model: cleanModel,
        model_settings: modelSettings,
        is_current: true
      })
      .select(`
        id,
        purpose,
        version,
        provider_key,
        model,
        model_settings,
        is_current,
        created_at
      `)
      .single();

  if (saveError) {
    if (current) {
      await supabase
        .from('ai_model_configurations')
        .update({
          is_current: true
        })
        .eq('id', current.id);
    }

    throw saveError;
  }

  return {
    ...saved,
    unchanged: false
  };
}
