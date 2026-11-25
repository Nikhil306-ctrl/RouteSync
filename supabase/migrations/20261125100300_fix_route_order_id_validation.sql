-- Apply manually after 20261125100100 and 20261125100200.
-- The deployed function rejects canonical UUID JSON strings at the route order
-- ID check (SQLSTATE 22023). Preserve its full transactional implementation;
-- replace only the scalar extraction used by this existing regex check.
do $$
declare
  v_definition text;
  v_old constant text := 'x.value #>> ''{}'' !~*';
  v_new constant text := 'btrim(x.value::text, chr(34)) !~*';
begin
  select pg_get_functiondef('public.persist_schedule(uuid,text,uuid[],jsonb,jsonb,jsonb)'::regprocedure)
    into v_definition;
  if v_definition is null or strpos(v_definition, v_old) = 0 then
    raise exception 'Expected Phase 6 persist_schedule validation body was not found; no function changed.';
  end if;
  execute replace(v_definition, v_old, v_new);
end;
$$;

-- Reassert the original execution boundary (CREATE OR REPLACE retains grants).
revoke all on function public.persist_schedule(uuid, text, uuid[], jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.persist_schedule(uuid, text, uuid[], jsonb, jsonb, jsonb)
  to service_role;
