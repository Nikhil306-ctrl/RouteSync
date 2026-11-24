import { apiGet } from './client.js';

export function getHealth(options) {
  return apiGet('/health', options);
}
