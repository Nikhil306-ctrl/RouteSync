import { useMemo, useState } from 'react';
import { BarChart3, IndianRupee, Printer, ReceiptText, TrendingUp } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import PageHeader from '../../../components/ui/PageHeader.jsx';
import { Card, CardBody, CardHeader, StatCard } from '../../../components/ui/Card.jsx';
import { EmptyState, ErrorState, InlineNotice, LoadingState } from '../../../components/ui/States.jsx';
import { Select } from '../../../components/ui/Field.jsx';
import Button from '../../../components/ui/Button.jsx';
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

const STATUS_COLORS = {
  pending: '#94a3b8',
  confirmed: '#f97316',
  preparing: '#fb923c',
  ready: '#eab308',
  assigned: '#0ea5e9',
  picked_up: '#6366f1',
  out_for_delivery: '#8b5cf6',
  delivered: '#10b981',
  cancelled: '#ef4444',
  rejected: '#dc2626',
};

const PRIORITY_COLORS = {
  low: '#94a3b8',
  normal: '#f97316',
  high: '#f59e0b',
  urgent: '#dc2626',
};

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

  const statusChartData = statusCounts.map((entry) => ({
    status: entry.status,
    name: titleCase(entry.status),
    count: entry.count,
    fill: STATUS_COLORS[entry.status] ?? '#f97316',
  }));

  const priorityChartData = Object.entries(priorityCounts).map(([priority, count]) => ({
    name: titleCase(priority),
    value: count,
    fill: PRIORITY_COLORS[priority] ?? '#f97316',
  }));

  const restaurantChartData = restaurantPerformance.slice(0, 8).map((restaurant) => ({
    name: restaurant.name.length > 18 ? `${restaurant.name.slice(0, 17)}…` : restaurant.name,
    orders: restaurant.orders,
    delivered: restaurant.delivered,
    revenue: Math.round(restaurant.revenue / 100),
  }));

  if (loading) return <LoadingState rows={6} label="Calculating reports" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

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
              <CardBody>
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={statusChartData} margin={{ top: 8, right: 8, bottom: 8, left: -18 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-24} textAnchor="end" height={64} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(value) => [`${value} orders`, 'Count']} />
                      <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                        {statusChartData.map((entry) => (
                          <Cell key={entry.status} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Priority mix" description="Requested order priority values." />
              <CardBody>
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={priorityChartData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={46}
                        outerRadius={80}
                        paddingAngle={2}
                      >
                        {priorityChartData.map((entry) => (
                          <Cell key={entry.name} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value, name) => [`${value} orders`, name]} />
                      <Legend verticalAlign="bottom" height={24} iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-4 rounded-lg border border-line p-3 text-xs leading-5 text-muted">
                  Revenue includes delivered orders only. Cancelled, rejected and in-flight orders are
                  excluded from the delivered revenue total.
                </div>
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader title="Venue volume and delivered value" description="Top venues by delivered revenue in the selected period. Values in rupees." />
            <CardBody>
              {restaurantChartData.length ? (
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={restaurantChartData} margin={{ top: 8, right: 8, bottom: 8, left: -8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-18} textAnchor="end" height={58} />
                      <YAxis yAxisId="orders" allowDecimals={false} tick={{ fontSize: 11 }} />
                      <YAxis yAxisId="revenue" orientation="right" tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(value, name) => (name === 'Revenue (₹)' ? [`₹${value}`, name] : [`${value}`, name])} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar yAxisId="orders" dataKey="orders" name="Orders" fill="#f97316" radius={[5, 5, 0, 0]} />
                      <Bar yAxisId="revenue" dataKey="revenue" name="Revenue (₹)" fill="#0f766e" radius={[5, 5, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-sm text-muted">No venue aggregates are available in this period.</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Restaurant performance" description="Recorded order volume and delivered value by venue." />
            {restaurantPerformance.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-left text-sm" aria-label="Restaurant performance">
                  <thead className="border-b border-line bg-slate-50">
                    <tr>
                      {['Restaurant', 'Orders', 'Delivered', 'Cancelled', 'Delivered value', 'Share of orders'].map((header) => (
                        <th key={header} className="px-4 py-3 text-xs font-semibold text-muted">{header}</th>
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
