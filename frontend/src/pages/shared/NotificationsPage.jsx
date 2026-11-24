import { useMemo, useState } from 'react';
import { Bell, Check, CheckCheck, Inbox } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { Card } from '../../components/ui/Card.jsx';
import Tabs from '../../components/ui/Tabs.jsx';
import { EmptyState, ErrorState, InlineNotice, LoadingState } from '../../components/ui/States.jsx';
import Button from '../../components/ui/Button.jsx';
import { useAsyncData, useDocumentTitle } from '../../hooks/useAsyncData.js';
import { formatDateTime } from '../../lib/format.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../../services/notifications.js';

export default function NotificationsPage({ eyebrow = 'Account', title = 'Notifications' }) {
  useDocumentTitle(title);
  const { user } = useAuth();
  const [tab, setTab] = useState('all');
  const [markingAll, setMarkingAll] = useState(false);
  const [actionError, setActionError] = useState('');

  const { data, loading, error, reload, setData } = useAsyncData(
    () => listNotifications(user.id),
    [user.id],
  );

  const notifications = data ?? [];
  const unread = notifications.filter((notification) => !notification.read_at);
  const filtered = useMemo(
    () => (tab === 'unread' ? unread : notifications),
    [tab, notifications, unread],
  );

  const markOne = async (notification) => {
    if (notification.read_at) return;
    setActionError('');
    try {
      const updated = await markNotificationRead(notification.id);
      setData((current) =>
        (current ?? []).map((entry) => (entry.id === updated.id ? updated : entry)),
      );
    } catch (markError) {
      setActionError(markError.message ?? 'Unable to mark this notification as read.');
    }
  };

  const markAll = async () => {
    if (!unread.length) return;
    setMarkingAll(true);
    setActionError('');
    try {
      await markAllNotificationsRead(user.id);
      setData((current) =>
        (current ?? []).map((entry) => ({
          ...entry,
          read_at: entry.read_at || new Date().toISOString(),
        })),
      );
    } catch (markError) {
      setActionError(markError.message ?? 'Unable to mark notifications as read.');
    } finally {
      setMarkingAll(false);
    }
  };

  if (loading) return <LoadingState rows={5} label="Loading notifications" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        description="In-app notifications addressed to your account. Order and system messages appear only when written by a trusted operation."
        actions={
          <Button variant="secondary" icon={CheckCheck} onClick={markAll} loading={markingAll} disabled={!unread.length}>
            Mark all read
          </Button>
        }
      />

      {actionError ? <InlineNotice tone="danger">{actionError}</InlineNotice> : null}

      <Card>
        <Tabs
          tabs={[
            { value: 'all', label: 'All notifications', count: notifications.length },
            { value: 'unread', label: 'Unread', count: unread.length },
          ]}
          value={tab}
          onChange={setTab}
          className="px-4 pt-2"
          ariaLabel="Filter notifications"
        />
        {filtered.length ? (
          <div className="divide-y divide-line">
            {filtered.map((notification) => (
              <article key={notification.id} className={`flex gap-3 px-4 py-4 sm:px-5 ${notification.read_at ? 'bg-white' : 'bg-orange-50/40'}`}>
                <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg ${notification.read_at ? 'bg-slate-100 text-slate-500' : 'bg-warm text-accent'}`}>
                  <Bell className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <h2 className={`text-sm ${notification.read_at ? 'font-semibold text-slate-700' : 'font-bold text-ink'}`}>
                        {notification.title}
                        {!notification.read_at ? <span className="ml-2 inline-block h-1.5 w-1.5 rounded-full bg-accent align-middle" aria-label="Unread" /> : null}
                      </h2>
                      <p className="mt-1 text-sm leading-6 text-slate-600">{notification.body}</p>
                      <p className="mt-1.5 text-[0.68rem] font-semibold uppercase tracking-wide text-slate-400">
                        {notification.type.replaceAll('_', ' ')} · {formatDateTime(notification.created_at)}
                        {notification.order_id ? ` · Order ${notification.order_id.slice(0, 8)}` : ''}
                      </p>
                    </div>
                    {!notification.read_at ? (
                      <Button variant="ghost" size="sm" icon={Check} onClick={() => markOne(notification)} className="self-start">
                        Mark read
                      </Button>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="p-5">
            <EmptyState
              compact
              icon={Inbox}
              title={tab === 'unread' ? 'You are all caught up' : 'No notifications yet'}
              description="Notifications will appear here when an order or system event produces an in-app message for your account."
            />
          </div>
        )}
      </Card>

      <InlineNotice tone="neutral" title="Delivery channel">
        In-app notifications are the channel represented in the current schema. Email, SMS and push
        preferences are not configured in this phase.
      </InlineNotice>
    </div>
  );
}
