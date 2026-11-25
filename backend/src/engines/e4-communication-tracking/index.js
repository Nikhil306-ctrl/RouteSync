// Notifications, assignment events, audit rows and Realtime-visible changes are
// written in the same database transaction as the schedule by persist_schedule.
// The Worker reports outcomes without making restaurant confirmation contingent
// on a second infrastructure operation.
export function schedulingOutcome(result, persisted) {
  return { run: persisted, metrics: result.metrics, assigned: persisted?.assigned ?? [], unscheduled: persisted?.unscheduled ?? [] };
}
