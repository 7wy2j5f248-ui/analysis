drop index if exists public.stage1_analysis_queue_one_processing;

create or replace function private.claim_next_stage1_item()
returns table(
  queue_id bigint,
  snapshot_id bigint,
  status text,
  claimed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with next_item as (
    select q.id
    from public.stage1_analysis_queue q
    where q.status = 'pending'
    order by q.queued_at, q.id
    for update skip locked
    limit 1
  )
  update public.stage1_analysis_queue q
  set
    status = 'processing',
    claimed_at = now()
  from next_item
  where q.id = next_item.id
  returning
    q.id,
    q.snapshot_id,
    q.status,
    q.claimed_at;
end;
$$;

comment on function private.claim_next_stage1_item() is
'Claims one pending Stage 1 case without globally serializing Stage 1. Multiple workers may claim different pending cases concurrently; analytical independence does not imply sequential execution.';
