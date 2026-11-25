-- Apply manually after 20261125100300. The deployed JSONB scalar validator
-- still rejects canonical route UUIDs. Compare the extracted TEXT directly.
do $$
declare
  v_definition text;
  v_before constant text := 'jsonb_array_elements(v_item -> ''order_ids'') as x(value)';
begin
  select pg_get_functiondef('public.persist_schedule(uuid,text,uuid[],jsonb,jsonb,jsonb)'::regprocedure)
    into v_definition;
  if v_definition is null or strpos(v_definition, v_before) = 0
     or strpos(v_definition, 'jsonb_typeof(x.value) is distinct from ''string''') = 0 then
    raise exception 'Expected route order ID validator not found; no change applied.';
  end if;
  v_definition := replace(v_definition, v_before,
    'jsonb_array_elements_text(v_item -> ''order_ids'') as x(value)');
  v_definition := replace(v_definition,
    'jsonb_typeof(x.value) is distinct from ''string''', 'x.value is null');
  v_definition := replace(v_definition, 'x.value #>> ''{}'' !~*', 'x.value !~*');
  v_definition := replace(v_definition, 'btrim(x.value::text, chr(34)) !~*', 'x.value !~*');
  execute v_definition;
end;
$$;

revoke all on function public.persist_schedule(uuid, text, uuid[], jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.persist_schedule(uuid, text, uuid[], jsonb, jsonb, jsonb)
  to service_role;
