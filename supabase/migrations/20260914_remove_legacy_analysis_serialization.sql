-- Remove legacy Stage 1 serialization from the active database path.
-- Current Stage 1 source snapshots already enqueue automatically through
-- private.freeze_stage1_source_after_completion -> stage1_source_snapshots
-- -> private.enqueue_stage1_snapshot -> stage1_analysis_queue.

-- Stop completed interviews from also entering the old automatic-case queue.
drop trigger if exists interview_sessions_enqueue_case_analysis
on public.interview_sessions;

-- Keep the legacy claim function callable for compatibility, but remove its
-- global one-processing-at-a-time restriction. Multiple callers may claim
-- different jobs concurrently. The row lock prevents duplicate claiming.
create or replace function public.claim_next_automatic_case_analysis(
    p_analysis_version text
)
returns table(
    session_id text,
    participant_id text,
    case_number text,
    source_completed_at timestamptz,
    attempt_count integer
)
language plpgsql
set search_path to ''
as $function$
begin
    return query
    with candidate as (
        select job.session_id
        from public.automatic_case_analysis_jobs as job
        where job.analysis_version = p_analysis_version
          and job.archived_at is null
          and (
              (
                  job.status = 'pending'
                  and coalesce(job.next_retry_at, now()) <= now()
              )
              or (
                  job.status = 'failed'
                  and job.attempt_count < 5
                  and coalesce(job.next_retry_at, now()) <= now()
              )
              or (
                  job.status = 'processing'
                  and coalesce(job.lease_expires_at, now()) <= now()
              )
          )
        order by
            job.source_completed_at,
            job.queued_at,
            job.session_id
        for update skip locked
        limit 1
    )
    update public.automatic_case_analysis_jobs as job
    set
        status = 'processing',
        attempt_count = job.attempt_count + 1,
        claimed_at = now(),
        lease_expires_at = now() + interval '10 minutes',
        next_retry_at = null,
        last_error = null,
        updated_at = now()
    from candidate
    where job.session_id = candidate.session_id
    returning
        job.session_id,
        job.participant_id,
        job.case_number,
        job.source_completed_at,
        job.attempt_count;
end;
$function$;

comment on function public.claim_next_automatic_case_analysis(text) is
'Legacy compatibility claim function. It does not impose a global Stage 1 concurrency ceiling; independent jobs may be claimed concurrently.';
