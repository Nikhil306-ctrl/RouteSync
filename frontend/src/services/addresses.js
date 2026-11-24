import { requireSupabase, unwrap } from './client.js';

export async function listAddresses(customerId) {
  const supabase = requireSupabase();
  return (
    unwrap(
      await supabase
        .from('customer_addresses')
        .select(
          'id, customer_id, label, recipient_name, phone, address_line1, address_line2, landmark, city, state, pincode, latitude, longitude, is_default, created_at, updated_at',
        )
        .eq('customer_id', customerId)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: true }),
    ) ?? []
  );
}

export async function createAddress(customerId, values) {
  const supabase = requireSupabase();
  if (values.is_default) {
    const { error: resetError } = await supabase
      .from('customer_addresses')
      .update({ is_default: false })
      .eq('customer_id', customerId)
      .eq('is_default', true);
    if (resetError) throw resetError;
  }

  return unwrap(
    await supabase
      .from('customer_addresses')
      .insert({
        customer_id: customerId,
        label: values.label?.trim() || 'Home',
        recipient_name: values.recipient_name.trim(),
        phone: values.phone?.trim() || null,
        address_line1: values.address_line1.trim(),
        address_line2: values.address_line2?.trim() || null,
        landmark: values.landmark?.trim() || null,
        city: values.city?.trim() || 'Belagavi',
        state: values.state?.trim() || 'Karnataka',
        pincode: values.pincode?.trim() || null,
        is_default: Boolean(values.is_default),
      })
      .select()
      .single(),
  );
}

export async function updateAddress(id, customerId, values) {
  const supabase = requireSupabase();
  if (values.is_default) {
    const { error: resetError } = await supabase
      .from('customer_addresses')
      .update({ is_default: false })
      .eq('customer_id', customerId)
      .eq('is_default', true)
      .neq('id', id);
    if (resetError) throw resetError;
  }

  return unwrap(
    await supabase
      .from('customer_addresses')
      .update({
        label: values.label?.trim(),
        recipient_name: values.recipient_name?.trim(),
        phone: values.phone?.trim() || null,
        address_line1: values.address_line1?.trim(),
        address_line2: values.address_line2?.trim() || null,
        landmark: values.landmark?.trim() || null,
        city: values.city?.trim(),
        state: values.state?.trim(),
        pincode: values.pincode?.trim() || null,
        is_default: values.is_default,
      })
      .eq('id', id)
      .select()
      .single(),
  );
}

export async function setDefaultAddress(id, customerId) {
  const supabase = requireSupabase();
  const { error: resetError } = await supabase
    .from('customer_addresses')
    .update({ is_default: false })
    .eq('customer_id', customerId)
    .eq('is_default', true);
  if (resetError) throw resetError;

  return unwrap(
    await supabase
      .from('customer_addresses')
      .update({ is_default: true })
      .eq('id', id)
      .select()
      .single(),
  );
}

export async function deleteAddress(id) {
  const supabase = requireSupabase();
  const { error } = await supabase.from('customer_addresses').delete().eq('id', id);
  if (error) throw error;
  return true;
}
