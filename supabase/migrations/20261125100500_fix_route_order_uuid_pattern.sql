-- Apply after 20261125100400. The route order ID regex omitted the fourth
-- four-character UUID group; canonical UUIDs therefore always failed 22023.
-- Change only this predicate; preserve transactional validation and grants.
do $$
declare
  v_definition text;
  v_old constant text := 'x.value !~* ''^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$''';
  v_new constant text := 'x.value !~* ''^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$''';
begin
  select pg_get_functiondef('public.persist_schedule(uuid,text,uuid[],jsonb,jsonb,jsonb)'::regprocedure)
    into v_definition;
  if v_definition is null or strpos(v_definition, v_old) = 0 then
    raise exception 'Expected route UUID predicate not found; no change applied.';
  end if;
  execute replace(v_definition, v_old, v_new);
end;
$$;

revoke all on function public.persist_schedule(uuid, text, uuid[], jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.persist_schedule(uuid, text, uuid[], jsonb, jsonb, jsonb)
  to service_role;
