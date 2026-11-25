export const SESSION_INVALID_EVENT = 'routesync:session-invalid';

const RECOVERY_TIMEOUT_MS = 8000;

function timeoutError() {
  const error = new Error('Session recovery timed out.');
  error.name = 'SESSION_RECOVERY_TIMEOUT';
  error.temporary = true;
  return error;
}

function withTimeout(promise, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(timeoutError()), timeoutMs);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function isTemporaryError(error) {
  const status = Number(error?.status ?? error?.statusCode ?? 0);
  return Boolean(
    error?.temporary ||
      error?.name === 'SESSION_RECOVERY_TIMEOUT' ||
      error?.name === 'AuthRetryableFetchError' ||
      (status >= 500 && status < 600),
  );
}

function sessionStatus(session) {
  const token = session?.access_token ?? null;
  const userId = session?.user?.id ?? null;
  return token ? { status: 'valid', token, userId } : { status: 'invalid', token: null, userId };
}

function sameUser(expectedUserId, userId) {
  return !expectedUserId || !userId || expectedUserId === userId;
}

export function createSessionRecovery({ client = null, timeoutMs = RECOVERY_TIMEOUT_MS } = {}) {
  const listeners = new Set();
  let inFlight = null;

  function notifyInvalid(reason, userId = null) {
    for (const listener of [...listeners]) {
      try {
        listener({ reason, userId, type: SESSION_INVALID_EVENT });
      } catch {}
    }
  }

  async function snapshot() {
    if (!client?.auth?.getSession) {
      return { status: 'invalid', token: null, userId: null };
    }

    try {
      const { data, error } = await withTimeout(
        Promise.resolve(client.auth.getSession()),
        timeoutMs,
      );
      if (error) {
        return isTemporaryError(error)
          ? { status: 'temporary', token: null, userId: null }
          : { status: 'invalid', token: null, userId: null };
      }
      return sessionStatus(data?.session);
    } catch (error) {
      return isTemporaryError(error)
        ? { status: 'temporary', token: null, userId: null }
        : { status: 'invalid', token: null, userId: null };
    }
  }

  async function performRecovery(rejectedToken, expectedUserId) {
    const current = await snapshot();

    if (current.status === 'temporary') return current;

    if (current.status === 'invalid') {
      if (rejectedToken) notifyInvalid('session-invalid', expectedUserId ?? current.userId ?? null);
      return {
        status: 'invalid',
        token: null,
        userId: expectedUserId ?? current.userId ?? null,
      };
    }

    if (!sameUser(expectedUserId, current.userId)) {
      notifyInvalid('account-changed', current.userId ?? expectedUserId ?? null);
      return { status: 'changed', token: null, userId: current.userId ?? null };
    }

    if (rejectedToken && current.token !== rejectedToken) {
      return { status: 'already-refreshed', token: current.token, userId: current.userId ?? null };
    }

    if (!client?.auth?.refreshSession) {
      notifyInvalid('session-invalid', expectedUserId ?? current.userId ?? null);
      return { status: 'invalid', token: null, userId: expectedUserId ?? current.userId ?? null };
    }

    try {
      const { data, error } = await withTimeout(
        Promise.resolve(client.auth.refreshSession()),
        timeoutMs,
      );
      if (error) {
        if (isTemporaryError(error)) {
          return { status: 'temporary', token: null, userId: expectedUserId ?? null };
        }
        notifyInvalid('session-invalid', expectedUserId ?? null);
        return { status: 'invalid', token: null, userId: expectedUserId ?? null };
      }

      const refreshed = sessionStatus(data?.session);
      if (refreshed.status === 'invalid') {
        notifyInvalid('session-invalid', expectedUserId ?? null);
        return { status: 'invalid', token: null, userId: expectedUserId ?? null };
      }

      if (!sameUser(expectedUserId, refreshed.userId)) {
        notifyInvalid('account-changed', refreshed.userId ?? expectedUserId ?? null);
        return { status: 'changed', token: null, userId: refreshed.userId ?? null };
      }

      return { status: 'refreshed', token: refreshed.token, userId: refreshed.userId ?? null };
    } catch (error) {
      if (isTemporaryError(error)) {
        return { status: 'temporary', token: null, userId: expectedUserId ?? null };
      }
      notifyInvalid('session-invalid', expectedUserId ?? null);
      return { status: 'invalid', token: null, userId: expectedUserId ?? null };
    }
  }

  async function recover(rejectedToken = null, expectedUserId = null) {
    if (inFlight) {
      const result = await inFlight;
      if (rejectedToken && result.token && result.token !== rejectedToken) {
        return { ...result, status: 'already-refreshed' };
      }
      return result;
    }

    const task = performRecovery(rejectedToken, expectedUserId);
    inFlight = task.finally(() => {
      inFlight = null;
    });

    try {
      return await inFlight;
    } catch (error) {
      return isTemporaryError(error)
        ? { status: 'temporary', token: null, userId: expectedUserId ?? null }
        : { status: 'invalid', token: null, userId: expectedUserId ?? null };
    }
  }

  function onInvalidSession(listener) {
    if (typeof listener !== 'function') return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return { snapshot, recover, onInvalidSession };
}
