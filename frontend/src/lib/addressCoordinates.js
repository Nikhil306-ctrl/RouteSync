export function hasDeliveryCoordinates(values) {
  return values?.latitude != null && values?.longitude != null && String(values.latitude).trim() !== '' &&
    String(values.longitude).trim() !== '' && Number.isFinite(Number(values.latitude)) && Number.isFinite(Number(values.longitude)) &&
    Math.abs(Number(values.latitude)) <= 90 && Math.abs(Number(values.longitude)) <= 180;
}

export function parseDeliveryCoordinates(values) {
  if (!hasDeliveryCoordinates(values)) {
    throw new Error('Enter valid latitude (-90 to 90) and longitude (-180 to 180) for delivery scheduling.');
  }
  return { latitude: Number(values.latitude), longitude: Number(values.longitude) };
}

export function coordinatePoint(values) {
  if (!hasDeliveryCoordinates(values)) return null;
  return { latitude: Number(values.latitude), longitude: Number(values.longitude) };
}
