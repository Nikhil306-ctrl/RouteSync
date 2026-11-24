import { Hono } from 'hono';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import {
  ASSIGNMENT_SELECT,
  RIDER_STATUSES,
  clampLimit,
  currentAssignment,
  fail,
  getAssignmentEvents,
  getAssignmentForRider,
  getOrderById,
  getOrderEvents,
  handleDbError,
  isUuid,
  privileged,
  readJson,
  unwrap,
  validateTransitionBody,
} from '../lib/orderLifecycle.js';

const router = new Hono();

router.use('*', requireAuth, requireRole('rider'));

async function loadRiderAssignmentDetail(client, riderId, assignmentId) {
  const assignment = await getAssignmentForRider(client, riderId, assignmentId);
  if (!assignment) return null;

  const [orderEvents, assignmentEvents] = await Promise.all([
    getOrderEvents(client, assignment.order_id),
    getAssignmentEvents(client, [assignment.id]),
  ]);

  return { assignment, events: orderEvents, assignment_events: assignmentEvents };
}

router.get('/assignments', async (c) => {
  const client = privileged(c);
  const riderId = c.get('profile').id;

  try {
    let query = client
      .from('assignments')
      .select(ASSIGNMENT_SELECT)
      .eq('rider_id', riderId)
      .order('created_at', { ascending: false })
      .limit(clampLimit(c.req.query('limit'), 150, 250));

    const current = c.req.query('current');
    if (current === 'true') query = query.eq('is_current', true);

    const assignments = (await unwrap(query)) ?? [];
    return c.json({
      assignments,
      current_assignment:
        currentAssignment(assignments.filter((assignment) => assignment.is_current)) ?? null,
    });
  } catch (error) {
    return handleDbError(c, error, 'Your assignments could not be loaded.');
  }
});

router.get('/assignments/:assignmentId', async (c) => {
  const { assignmentId } = c.req.param();
  if (!isUuid(assignmentId)) return fail(c, 404, 'NOT_FOUND', 'Assignment not found.');

  const client = privileged(c);
  try {
    const detail = await loadRiderAssignmentDetail(
      client,
      c.get('profile').id,
      assignmentId,
    );
    if (!detail) return fail(c, 404, 'NOT_FOUND', 'Assignment not found.');

    return c.json(detail);
  } catch (error) {
    return handleDbError(c, error, 'The assignment could not be loaded.');
  }
});

router.post('/assignments/:assignmentId/respond', async (c) => {
  const { assignmentId } = c.req.param();
  if (!isUuid(assignmentId)) return fail(c, 404, 'NOT_FOUND', 'Assignment not found.');

  const body = await readJson(c);
  if (typeof body?.accept !== 'boolean') {
    return fail(c, 422, 'INVALID_INPUT', 'Choose whether to accept or decline this assignment.');
  }

  const reason = String(body?.reason ?? '').trim();
  if (!body.accept && !reason) {
    return fail(c, 422, 'INVALID_INPUT', 'Add a reason for declining the assignment.');
  }
  if (reason.length > 280) {
    return fail(c, 422, 'INVALID_INPUT', 'The reason may not exceed 280 characters.');
  }

  const client = privileged(c);
  const riderId = c.get('profile').id;

  try {
    const { data, error } = await client.rpc('respond_assignment', {
      p_assignment_id: assignmentId,
      p_rider_id: riderId,
      p_accept: body.accept,
      p_reason: reason || null,
    });
    if (error) throw error;

    const detail = await loadRiderAssignmentDetail(client, riderId, assignmentId);
    return c.json({ result: data, ...detail });
  } catch (error) {
    return handleDbError(c, error, 'The assignment response could not be saved.');
  }
});

router.post('/orders/:orderId/transition', async (c) => {
  const { orderId } = c.req.param();
  if (!isUuid(orderId)) return fail(c, 404, 'NOT_FOUND', 'Order not found.');

  const transition = validateTransitionBody(await readJson(c), RIDER_STATUSES);
  if (transition.error) return fail(c, 422, 'INVALID_INPUT', transition.error);

  const client = privileged(c);
  const riderId = c.get('profile').id;

  try {
    const { data, error } = await client.rpc('transition_order_status', {
      p_order_id: orderId,
      p_actor_id: riderId,
      p_actor_role: 'rider',
      p_next: transition.status,
      p_expected_status: transition.expectedStatus,
      p_reason: transition.reason,
      p_prep_time_minutes: null,
    });
    if (error) throw error;

    const order = await getOrderById(client, orderId);
    const events = await getOrderEvents(client, orderId);
    const assignments = (
      await unwrap(
        await client
          .from('assignments')
          .select(ASSIGNMENT_SELECT)
          .eq('order_id', orderId)
          .eq('rider_id', riderId)
          .eq('is_current', true)
          .maybeSingle(),
      )
    ) ?? null;

    return c.json({ result: data, order, events, assignment: assignments });
  } catch (error) {
    return handleDbError(c, error, 'The delivery status could not be updated.');
  }
});

export default router;
