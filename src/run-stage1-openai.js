import { supabase } from './supabase.js';

const OPENAI_API_URL =
  'https://api.openai.com/v1/responses';


function requirePackageId() {
  const packageId = Number(process.argv[2]);

  if (
    !Number.isInteger(packageId) ||
    packageId <= 0
  ) {
    throw new Error(
      'Provide a valid Stage 1 request package ID.'
    );
  }

  return packageId;
}


function requireApiKey() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error(
      'OPENAI_API_KEY is missing.'
    );
  }

  return apiKey;
}


async function loadRequestPackage(packageId) {
  const { data, error } = await supabase
    .from('stage1_request_packages')
    .select(`
      id,
      queue_id,
      source_snapshot_id,
      contract_id,
      model_configuration_id,
      request_json
    `)
    .eq('id', packageId)
    .single();

  if (error) {
    throw error;
  }

  return data;
}


async function loadExistingResponse(packageId) {
  const { data, error } = await supabase
    .from('stage1_analysis_responses')
    .select(`
      id,
      request_package_id,
      provider,
      model,
      response_json,
      created_at
    `)
    .eq('request_package_id', packageId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? null;
}


async function markQueueCompleted(queueId) {
  const { error } = await supabase
    .from('stage1_analysis_queue')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      failed_at: null,
      last_error: null
    })
    .eq('id', queueId)
    .eq('status', 'processing');

  if (error) {
    throw error;
  }
}


async function markQueueFailed(
  queueId,
  message
) {
  const { error } = await supabase
    .from('stage1_analysis_queue')
    .update({
      status: 'failed',
      failed_at: new Date().toISOString(),
      last_error: message
    })
    .eq('id', queueId)
    .eq('status', 'processing');

  if (error) {
    throw error;
  }
}


async function preserveResponse({
  packageId,
  provider,
  model,
  responseJson
}) {
  const { data, error } = await supabase
    .from('stage1_analysis_responses')
    .insert({
      request_package_id: packageId,
      provider,
      model,
      response_json: responseJson
    })
    .select(`
      id,
      request_package_id,
      provider,
      model,
      created_at
    `)
    .single();

  if (error) {
    throw error;
  }

  return data;
}


function buildOpenAIRequest(requestPackage) {
  const frozen =
    requestPackage.request_json;

  const modelConfiguration =
    frozen.model_configuration;

  const contract =
    frozen.contract;

  const source =
    frozen.source;


  if (
    modelConfiguration.provider !== 'openai'
  ) {
    throw new Error(
      `Request package ${requestPackage.id} ` +
      `is configured for provider ` +
      `${modelConfiguration.provider}, not OpenAI.`
    );
  }


  const modelSettings =
    modelConfiguration.model_settings ?? {};


  return {
    ...modelSettings,

    model:
      modelConfiguration.model,

    instructions:
      contract.contract_text,

    input:
      JSON.stringify(
        source.interview_outcome
      ),

    store: false
  };
}


async function callOpenAI(
  apiKey,
  requestBody
) {
  const response = await fetch(
    OPENAI_API_URL,
    {
      method: 'POST',

      headers: {
        Authorization:
          `Bearer ${apiKey}`,

        'Content-Type':
          'application/json'
      },

      body:
        JSON.stringify(requestBody)
    }
  );


  const responseText =
    await response.text();


  let responseJson;

  try {
    responseJson =
      JSON.parse(responseText);
  } catch {
    throw new Error(
      'OpenAI returned a non-JSON response.'
    );
  }


  return {
    httpOk: response.ok,
    httpStatus: response.status,
    responseJson
  };
}


async function main() {
  const packageId =
    requirePackageId();

  const apiKey =
    requireApiKey();

  const requestPackage =
    await loadRequestPackage(packageId);


  const existingResponse =
    await loadExistingResponse(packageId);


  if (existingResponse) {
    console.log(
      `Request package ${packageId} ` +
      `already has preserved response ` +
      `${existingResponse.id}.`
    );

    return;
  }


  const openAIRequest =
    buildOpenAIRequest(
      requestPackage
    );


  console.log(
    `Calling OpenAI for Stage 1 ` +
    `request package ${packageId}.`
  );

  console.log(
    `Frozen model: ${openAIRequest.model}`
  );


  const result =
    await callOpenAI(
      apiKey,
      openAIRequest
    );


  const preserved =
    await preserveResponse({
      packageId,
      provider: 'openai',
      model: openAIRequest.model,
      responseJson:
        result.responseJson
    });


  if (
    result.httpOk &&
    result.responseJson.status ===
      'completed'
  ) {
    await markQueueCompleted(
      requestPackage.queue_id
    );

    console.log(
      `Response ${preserved.id} ` +
      `preserved successfully.`
    );

    console.log(
      `Queue ${requestPackage.queue_id} ` +
      `marked completed.`
    );

    return;
  }


  const failureMessage =
    result.responseJson?.error?.message ??
    `OpenAI response status: ` +
      `${result.responseJson?.status ?? 'unknown'}; ` +
      `HTTP ${result.httpStatus}.`;


  await markQueueFailed(
    requestPackage.queue_id,
    failureMessage
  );


  console.log(
    `Provider response ${preserved.id} ` +
    `was preserved.`
  );

  console.log(
    `Queue ${requestPackage.queue_id} ` +
    `marked failed.`
  );
}


main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
