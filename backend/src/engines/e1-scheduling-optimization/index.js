// Estimated geographic graph, NOT a road network. Complete edges use Haversine
// distance; 18 km/h and two minutes per stop are provisional planning assumptions.
export const SPEED_KMH = 18;
export const STOP_MS = 2 * 60_000;
export const WEIGHTS = Object.freeze({ approach: 0.22, distance: 0.23, completion: 0.16, slack: 0.12, workload: 0.17, detour: 0.10 });

export function distance(a, b) {
  const radians = (x) => x * Math.PI / 180;
  const dLat = radians(Number(b.latitude) - Number(a.latitude));
  const dLon = radians(Number(b.longitude) - Number(a.longitude));
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(Number(a.latitude))) * Math.cos(radians(Number(b.latitude))) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function shortestPath(graph, start, end) {
  const costs = new Map([[start, 0]]), previous = new Map(), pending = new Set(Object.keys(graph));
  while (pending.size) {
    const node = [...pending].sort((a, b) => (costs.get(a) ?? Infinity) - (costs.get(b) ?? Infinity) || a.localeCompare(b))[0];
    if (!Number.isFinite(costs.get(node))) break;
    pending.delete(node);
    if (node === end) break;
    for (const [next, weight] of Object.entries(graph[node] ?? {})) {
      if (!pending.has(next) || !Number.isFinite(weight) || weight < 0) continue;
      const cost = costs.get(node) + weight;
      if (cost < (costs.get(next) ?? Infinity)) { costs.set(next, cost); previous.set(next, node); }
    }
  }
  if (!costs.has(end)) return null;
  const path = [end];
  while (path[0] !== start) path.unshift(previous.get(path[0]));
  return { path, distanceKm: costs.get(end) };
}

export function geographicGraph(points) {
  return Object.fromEntries(points.map((point) => [point.id, Object.fromEntries(points.filter((other) => other.id !== point.id).map((other) => [other.id, distance(point, other)]))]));
}

const travelMs = (km) => km / SPEED_KMH * 3_600_000;
const scale = (value, limit) => Math.min(1, Math.max(0, value / limit));

// Enumerate all precedence-preserving sequences (at most 3 orders per batch).
export function optimizeRoute(rider, orders, now = Date.now()) {
  const points = [{ id: 'start', latitude: rider.latitude, longitude: rider.longitude }, ...orders.flatMap((order) => [
    { id: `p:${order.id}`, latitude: order.pickup.latitude, longitude: order.pickup.longitude },
    { id: `d:${order.id}`, latitude: order.dropoff.latitude, longitude: order.dropoff.longitude },
  ])];
  const graph = geographicGraph(points);
  let best = null;
  function visit(node, remaining, picked, time, km, stops) {
    if (!remaining.length) {
      if (!best || km < best.distanceKm || (km === best.distanceKm && time < best.completedAt)) best = { stops, distanceKm: km, completedAt: time };
      return;
    }
    for (const stop of remaining) {
      if (stop.type === 'dropoff' && !picked.has(stop.order.id)) continue;
      const leg = shortestPath(graph, node, `${stop.type === 'pickup' ? 'p' : 'd'}:${stop.order.id}`);
      let arrival = time + travelMs(leg.distanceKm);
      if (stop.type === 'pickup') arrival = Math.max(arrival, Date.parse(stop.order.estimated_ready_at));
      else arrival = Math.max(arrival, Date.parse(stop.order.delivery_window_start));
      if (stop.type === 'dropoff' && arrival > Date.parse(stop.order.delivery_window_end)) continue;
      if (arrival + STOP_MS > Date.parse(rider.shift.ends_at)) continue;
      const next = { order_id: stop.order.id, stop_type: stop.type, planned_arrival: new Date(arrival).toISOString(), planned_departure: new Date(arrival + STOP_MS).toISOString(), address_line: stop.type === 'pickup' ? stop.order.pickup.address_line : stop.order.delivery_address_line, latitude: stop.type === 'pickup' ? stop.order.pickup.latitude : stop.order.dropoff.latitude, longitude: stop.type === 'pickup' ? stop.order.pickup.longitude : stop.order.dropoff.longitude };
      visit(`${stop.type === 'pickup' ? 'p' : 'd'}:${stop.order.id}`, remaining.filter((entry) => entry !== stop), stop.type === 'pickup' ? new Set([...picked, stop.order.id]) : picked, arrival + STOP_MS, km + leg.distanceKm, [...stops, next]);
    }
  }
  visit('start', orders.flatMap((order) => [{ type: 'pickup', order }, { type: 'dropoff', order }]), new Set(), now, 0, []);
  return best;
}

function score(rider, orders, route, weights, now) {
  const first = route.stops[0];
  const approach = distance(rider, first);
  const direct = orders.reduce((sum, order) => sum + distance(order.pickup, order.dropoff), 0);
  const slack = Math.min(...orders.map((order) => (Date.parse(order.delivery_window_end) - Date.parse(route.stops.find((stop) => stop.order_id === order.id && stop.stop_type === 'dropoff').planned_arrival)) / 60_000));
  const breakdown = {
    approach: scale(approach, 20), distance: scale(route.distanceKm, 40),
    completion: scale((route.completedAt - now) / 60_000, 120),
    slack: 1 - scale(slack, 60), workload: scale(rider.load, rider.max_concurrent_orders),
    detour: scale(Math.max(0, route.distanceKm - approach - direct), 20),
  };
  return { score: Object.entries(weights).reduce((sum, [key, weight]) => sum + weight * breakdown[key], 0), breakdown };
}

// CSP: variables=orders; domains=feasible rider/route placements; hard constraints
// are tested before scoring. MRV, forward checking and branch-and-bound apply.
export function solve(orders, riders, { now = Date.now(), maxNodes = 1500, maxMs = 120, maxCandidates = 5000, weights = WEIGHTS } = {}) {
  const start = Date.now();
  const metrics = { orders_considered: orders.length, riders_considered: riders.length, candidates_evaluated: 0, search_nodes: 0, backtracks: 0, pruned_branches: 0 };
  const rejections = [];
  let best = [], bestCount = 0, bestCost = Infinity, bounded = false;
  function options(order, allocations) {
    const choices = [];
    for (const rider of riders) {
      if (metrics.candidates_evaluated >= maxCandidates || Date.now() - start >= maxMs) { bounded = true; break; }
      metrics.candidates_evaluated++;
      const prior = allocations.get(rider.id) ?? [];
      let reason = null;
      if (!rider.active || !rider.verified || !rider.available) reason = 'rider_unavailable';
      else if (!rider.shift || Date.parse(rider.shift.starts_at) > now || Date.parse(rider.shift.ends_at) <= now) reason = 'shift_unavailable';
      else if (!Number.isInteger(rider.max_concurrent_orders) || rider.load + prior.length + 1 > rider.max_concurrent_orders) reason = 'capacity';
      else if (rider.load > 0) reason = 'existing_commitment'; // Existing routes cannot be silently rewritten.
      if (reason) { rejections.push({ order_id: order.id, rider_id: rider.id, reason }); continue; }
      const bundle = [...prior, order];
      if (bundle.length > 3) continue;
      if (bundle.length > 1 && (Math.max(...bundle.map((o) => Date.parse(o.estimated_ready_at))) - Math.min(...bundle.map((o) => Date.parse(o.estimated_ready_at))) > 20 * 60_000 ||
        bundle.some((o) => distance(o.pickup, order.pickup) > 5 && distance(o.dropoff, order.dropoff) > 5))) {
        rejections.push({ order_id: order.id, rider_id: rider.id, reason: 'batch_incompatible' }); continue;
      }
      const route = optimizeRoute(rider, bundle, now);
      if (!route) { rejections.push({ order_id: order.id, rider_id: rider.id, reason: 'route_or_deadline' }); continue; }
      if (bundle.length > 1 && route.distanceKm - distance(rider, route.stops[0]) - bundle.reduce((sum, entry) => sum + distance(entry.pickup, entry.dropoff), 0) > 5) {
        rejections.push({ order_id: order.id, rider_id: rider.id, reason: 'batch_detour' }); continue;
      }
      const evaluation = score(rider, bundle, route, weights, now);
      choices.push({ rider, bundle, route, ...evaluation });
    }
    return choices.sort((a, b) => a.score - b.score || a.rider.id.localeCompare(b.rider.id));
  }
  function search(remaining, allocations) {
    if (bounded || metrics.search_nodes >= maxNodes || Date.now() - start >= maxMs) { bounded = true; return; }
    metrics.search_nodes++;
    const assigned = [...allocations.values()].flat().length;
    if (assigned + remaining.length < bestCount) { metrics.pruned_branches++; return; }
    if (!remaining.length) {
      const placements = [...allocations].map(([id, bundle]) => optionsForBundle(riders.find((r) => r.id === id), bundle, now, weights));
      const cost = placements.reduce((sum, placement) => sum + placement.score, 0);
      if (assigned > bestCount || (assigned === bestCount && cost < bestCost)) { best = placements; bestCount = assigned; bestCost = cost; }
      return;
    }
    const domains = remaining.map((order) => ({ order, choices: options(order, allocations) }));
    domains.sort((a, b) => a.choices.length - b.choices.length || a.order.id.localeCompare(b.order.id));
    const { order, choices } = domains[0];
    const rest = remaining.filter((entry) => entry !== order);
    for (const choice of choices) {
      const next = new Map(allocations);
      next.set(choice.rider.id, choice.bundle);
      if (rest.some((entry) => !options(entry, next).length) && assigned + 1 + rest.length < bestCount) { metrics.pruned_branches++; continue; }
      search(rest, next);
      if (bounded) break;
    }
    metrics.backtracks++;
    search(rest, allocations); // explicit unscheduled branch
  }
  // A greedy feasible incumbent ensures bounded runs retain useful assignments.
  const incumbent = new Map();
  for (const order of orders) {
    if (bounded) break;
    const choice = options(order, incumbent)[0];
    if (choice) incumbent.set(choice.rider.id, choice.bundle);
  }
  best = [...incumbent].map(([id, bundle]) => optionsForBundle(riders.find((r) => r.id === id), bundle, now, weights));
  bestCount = [...incumbent.values()].flat().length;
  bestCost = best.reduce((sum, placement) => sum + placement.score, 0);
  search(orders, new Map());
  return { placements: best, rejections: rejections.slice(0, 300), metrics: { ...metrics, feasible_assignments: best.reduce((n, p) => n + p.bundle.length, 0), unscheduled_orders: orders.length - best.reduce((n, p) => n + p.bundle.length, 0), estimated_total_distance_km: best.reduce((n, p) => n + p.route.distanceKm, 0), execution_ms: Date.now() - start, termination: bounded ? 'bounded' : 'optimal' } };
}

function optionsForBundle(rider, bundle, now, weights) {
  const route = optimizeRoute(rider, bundle, now);
  return { rider, bundle, route, ...score(rider, bundle, route, weights, now) };
}
