import { useMemo, useState } from 'react';
import { BarChart3, IndianRupee, Printer, ReceiptText, TrendingUp } from 'lucide-react';
import PageHeader from '../../../components/ui/PageHeader.jsx';
import { Card, CardBody, CardHeader, StatCard } from '../../../components/ui/Card.jsx';
import { EmptyState, ErrorState, InlineNotice, LoadingState } from '../../../components/ui/States.jsx';
import { Select } from '../../../components/ui/Field.jsx';
import Button from '../../../components/ui/Button.jsx';
import { StatusBadge } from '../../../components/ui/Badge.jsx';
import { useAsyncData, useDocumentTitle } from '../../../hooks/useAsyncData.js';
import { formatCurrency, titleCase } from '../../../lib/format.js';
import { listOrders, orderMetrics } from '../../../services/orders.js';
import { listAdminRestaurants } from '../../../services/restaurants.js';

const periods = [
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: 'all', label: 'All recorded orders' },
];

const statusOrder = ['pending', 'confirmed', 'preparing', 'ready', 'assigned', 'picked_up', 'out_for_delivery', 'delivered', 'cancelled', 'rejected'];

export default function AdminAnalytics() {
  useDocumentTitle('Analytics & reports');
  const [period, setPeriod] = useState('30');

  const { data, loading, error, reload } = useAsyncData(async () => {
    const [orders, restaurants] = await Promise.all([listOrders({ limit: 1000 }), listAdminRestaurants()]);
    return { orders, restaurants };
  }, []);

  const filteredOrders = useMemo(() => {
    if (!data) return [];
    if (period === 'all') return data.orders;
    const cutoff = Date.now() - Number(period) * 24 * 60 * 60 * 1000;
    return data.orders.filter((order) => new Date(order.created_at).getTime() >= cutoff);
  }, [data, period]);

  const metrics = orderMetrics(filteredOrders);
  const deliveredOrders = filteredOrders.filter((order) => order.status === 'delivered');
  const averageOrder = deliveredOrders.length ? Math.round(metrics.revenueMinor / deliveredOrders.length) : 0;
  const completionRate = filteredOrders.length
    ? Math.round((deliveredOrders.length / filteredOrders.length) * 100)
    : 0;

  const statusCounts = useMemo(() => {
    const counts = new Map();
    for (const order of filteredOrders) counts.set(order.status, (counts.get(order.status) ?? 0) + 1);
    return statusOrder
      .map((status) => ({ status, count: counts.get(status) ?? 0 }))
      .filter((entry) => entry.count > 0);
  }, [filteredOrders]);

  const restaurantPerformance = useMemo(() => {
    const map = new Map();
    for (const order of filteredOrders) {
      const entry = map.get(order.restaurant_id) ?? {
        id: order.restaurant_id,
        name: order.restaurant?.name ?? 'Restaurant',
        orders: 0,
        delivered: 0,
        cancelled: 0,
        revenue: 0,
      };
      entry.orders += 1;
      if (order.status === 'delivered') {
        entry.delivered += 1;
        entry.revenue += Number(order.total_minor ?? 0);
      }
      if (order.status === 'cancelled' || order.status === 'rejected') entry.cancelled += 1;
      map.set(order.restaurant_id, entry);
    }
    return [...map.values()].sort((a, b) => b.revenue - a.revenue || b.orders - a.orders);
  }, [filteredOrders]);

  const priorityCounts = useMemo(() => {
    const counts = { low: 0, normal: 0, high: 0, urgent: 0 };
    for (const order of filteredOrders) counts[order.priority] = (counts[order.priority] ?? 0) + 1;
    return counts;
  }, [filteredOrders]);

  if (loading) return <LoadingState rows={6} label="Calculating reports" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const maxStatus = Math.max(1, ...statusCounts.map((entry) => entry.count));

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Operations reporting"
        title="Analytics & reports"
        description="Operational summaries calculated directly from order records. No decorative chart or projected trend is inserted."
        actions={
          <>
            <Select value={period} onChange={(event) => setPeriod(event.target.value)} aria-label="Reporting period" className="min-w-44">
              {periods.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </Select>
            <Button variant="secondary" icon={Printer} onClick={() => window.print()}>Print</Button>
          </>
        }
      />

      {!filteredOrders.length ? (
        <EmptyState
          icon={BarChart3}
          title="No orders in this reporting period"
          description="There is not enough recorded order data to calculate a report. Change the period or return after orders exist."
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Orders" value={filteredOrders.length} helper="Records in period" icon={ReceiptText} tone="orange" />
            <StatCard label="Delivered revenue" value={formatCurrency(metrics.revenueMinor)} helper={`${deliveredOrders.length} delivered orders`} icon={IndianRupee} tone="green" />
            <StatCard label="Average delivered value" value={formatCurrency(averageOrder)} helper="Delivered order total ÷ count" icon={TrendingUp} />
            <StatCard label="Completion rate" value={`${completionRate}%`} helper={`${metrics.cancelled} cancelled or rejected`} icon={BarChart3} />
          </div>

          <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
            <Card>
              <CardHeader title="Order status distribution" description="Exact counts from the selected records." />
              <CardBody className="space-y-4">
                {statusCounts.map((entry) => (
                  <div key={entry.status}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={entry.status} dot={false} />
                        <span className="text-xs text-muted">{titleCase(entry.status)}</span>
                      </div>
                      <span className="text-xs font-bold tabular-nums text-ink">{entry.count}</span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${['delivered', 'completed'].includes(entry.status) ? 'bg-emerald-500' : ['cancelled', 'rejected'].includes(entry.status) ? 'bg-red-400' : 'bg-accent'}`}
                        style={{ width: `${Math.max(4, (entry.count / maxStatus) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Priority mix" description="Requested order priority values." />
              <CardBody>
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(priorityCounts).map(([priority, count]) => (
                    <div key={priority} className="rounded-lg border border-line bg-slate-50 p-3">
                      <div className="flex items-center justify-between">
                        <StatusBadge status={priority} dot={false} />
                        <span className="font-display text-xl font-bold text-ink">{count}</span>
                      </div>
                      <p className="mt-2 text-[0.68rem] text-muted">{filteredOrders.length ? Math.round((count / filteredOrders.length) * 100) : 0}% of orders</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 rounded-lg border border-line p-3 text-xs leading-5 text-muted">
                  Revenue includes delivered orders only. Cancelled, rejected and in-flight orders are
                  excluded from the delivered revenue total.
                </div>
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader title="Restaurant performance" description="Recorded order volume and delivered value by venue." />
            {restaurantPerformance.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-left text-sm" aria-label="Restaurant performance">
                  <thead className="border-b border-line bg-slate-50">
                    <tr>
                      {['Restaurant', 'Orders', 'Delivered', 'Cancelled', 'Delivered value', 'Share of orders'].map((header) => (
                        <th key={header} className="px-4 py-3 text-[0.65rem] font-extrabold uppercase tracking-[0.1em] text-slate-500">{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {restaurantPerformance.map((restaurant) => (
                      <tr key={restaurant.id}>
                        <td className="px-4 py-3 font-semibold text-ink">{restaurant.name}</td>
                        <td className="px-4 py-3 tabular-nums">{restaurant.orders}</td>
                        <td className="px-4 py-3 tabular-nums text-emerald-700">{restaurant.delivered}</td>
                        <td className="px-4 py-3 tabular-nums text-red-600">{restaurant.cancelled}</td>
                        <td className="px-4 py-3 font-semibold tabular-nums">{formatCurrency(restaurant.revenue)}</td>
                        <td className="px-4 py-3">
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                            <div className="h-full rounded-full bg-accent" style={{ width: `${(restaurant.orders / filteredOrders.length) * 100}%` }} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <CardBody><p className="text-sm text-muted">Restaurant performance is unavailable because no matching orders are visible.</p></CardBody>
            )}
          </Card>

          <InlineNotice tone="neutral" title="Report scope">
            This is a client-side operational report over rows the current admin can read. It is not a
            financial ledger, a forecasting model or a substitute for the Phase 7 reporting backend.
          </InlineNotice>
        </>
      )}
    </div>
  );
}
