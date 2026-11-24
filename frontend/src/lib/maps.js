export function destinationMapUrl(latitude, longitude, label = 'Delivery destination') {
  if (latitude == null || longitude == null) return null;
  const destination = `${Number(latitude)},${Number(longitude)}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=two_wheeler&dir_action=navigate&destination_place_id=&query=${encodeURIComponent(label)}`;
}

export function stopMapUrl(stop) {
  return destinationMapUrl(stop?.latitude, stop?.longitude, stop?.address_line || 'Delivery stop');
}
