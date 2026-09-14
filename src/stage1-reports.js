import { supabase } from './supabase.js';

function extractOutputText(responseJson) {
  if (!responseJson) {
    return '';
  }

  if (
    typeof responseJson.output_text === 'string' &&
    responseJson.output_text.trim() !== ''
  ) {
    return responseJson.output_text;
  }

  const output = Array.isArray(responseJson.output)
    ? responseJson.output
    : [];

  for (const item of output) {
    const content = Array.isArray(item?.content)
      ? item.content
      : [];

    for (const part of content) {
      if (
        part?.type === 'output_text' &&
        typeof part.text === 'string'
      ) {
        return part.text;
      }
    }
  }

  return '';
}

export async function getStage1Reports() {
  const { data: responses, error: responseError } =
    await supabase
      .from('stage1_analysis_responses')
      .select(`
        id,
        request_package_id,
        provider,
        model,
        response_json,
        created_at
      `)
      .order('id', { ascending: true });

  if (responseError) {
    throw responseError;
  }

  const reports = [];

  for (const response of responses ?? []) {
    const { data: requestPackage, error: packageError } =
      await supabase
        .from('stage1_request_packages')
        .select(`
          id,
          queue_id,
          source_snapshot_id,
          contract_id,
          model_configuration_id,
          request_json,
          created_at
        `)
        .eq('id', response.request_package_id)
        .single();

    if (packageError) {
      throw packageError;
    }

    const { data: queueItem, error: queueError } =
      await supabase
        .from('stage1_analysis_queue')
        .select(`
          id,
          snapshot_id,
          status,
          queued_at,
          claimed_at,
          completed_at,
          failed_at
        `)
        .eq('id', requestPackage.queue_id)
        .single();

    if (queueError) {
      throw queueError;
    }

    reports.push({
      response_id: response.id,
      request_package_id: response.request_package_id,
      queue_id: requestPackage.queue_id,
      snapshot_id: requestPackage.source_snapshot_id,
      contract_id: requestPackage.contract_id,
      model_configuration_id:
        requestPackage.model_configuration_id,

      provider: response.provider,
      model: response.model,

      status: queueItem.status,
      completed_at: queueItem.completed_at,
      response_created_at: response.created_at,

      analysis_text:
        extractOutputText(response.response_json),

      response_json: response.response_json
    });
  }

  return reports;
}
