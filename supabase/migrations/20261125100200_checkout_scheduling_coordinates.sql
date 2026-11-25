-- Apply manually after 20261125100100. Existing orders/addresses are untouched.
-- Checkout must snapshot coordinates atomically, even if an address changes
-- after the Worker's preflight quote but before create_order inserts the order.
create function public.require_new_order_delivery_coordinates()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status <> 'draft' and (new.delivery_latitude is null or new.delivery_longitude is null) then
    raise exception 'Delivery address requires latitude and longitude before checkout.' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger orders_require_delivery_coordinates
before insert on public.orders
for each row execute function public.require_new_order_delivery_coordinates();

revoke all on function public.require_new_order_delivery_coordinates() from public, anon, authenticated;
