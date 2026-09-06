import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError, apiRequest } from '../api/client';
import { AppLayout } from '../components/AppLayout';
import { Card } from '../components/Card';
import { ErrorMessage } from '../components/ErrorMessage';
import { Loading } from '../components/Loading';
import { PageHeader } from '../components/PageHeader';
import type { PublishingCalendarItem, PublishingCalendarStatus, SocialConnectionPlatform, SocialImageAsset, SocialPublicationSummary } from '../types';

const PLATFORMS: SocialConnectionPlatform[] = ['linkedin', 'x', 'facebook', 'instagram'];
const STATUSES: PublishingCalendarStatus[] = ['scheduled', 'processing', 'published', 'failed', 'cancelled'];
// Mirrors the backend's genuinely-implemented fetchPostStatus capability
// (19F) — LinkedIn's status lookup is not implemented, so its Sync
// Status action is never shown (item 34).
const SYNCABLE_PLATFORMS = new Set<SocialConnectionPlatform>(['x', 'facebook', 'instagram']);

function labelize(value: string): string {
  return value
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 24 * 60 * 60 * 1000);
}
function dateKey(iso: string): string {
  return new Date(iso).toDateString();
}
function effectiveTime(item: PublishingCalendarItem): string | undefined {
  return item.scheduledAt ?? item.publishedAt;
}

// Converts a wall-clock "YYYY-MM-DDTHH:mm" value picked in `timeZone` to a
// UTC ISO instant — same dependency-free technique used by the Schedule
// form on the campaign page (naive-as-UTC, then shift by that instant's
// real offset in `timeZone`, found via an Intl round-trip).
function zonedTimeToUtcIso(localDateTime: string, timeZone: string): string | null {
  if (!localDateTime) return null;
  const naiveUtc = new Date(`${localDateTime}:00Z`);
  if (Number.isNaN(naiveUtc.getTime())) return null;
  try {
    const zonedMillis = new Date(naiveUtc.toLocaleString('en-US', { timeZone })).getTime();
    const utcMillis = new Date(naiveUtc.toLocaleString('en-US', { timeZone: 'UTC' })).getTime();
    return new Date(naiveUtc.getTime() - (zonedMillis - utcMillis)).toISOString();
  } catch {
    return naiveUtc.toISOString();
  }
}

function formatLocal(iso: string): string {
  return new Date(iso).toLocaleString();
}
function formatLocalTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export default function PublishingCalendarPage() {
  const { organizationId, productId, campaignId } = useParams<{ organizationId: string; productId: string; campaignId: string }>();
  const basePath = `/organizations/${organizationId}/products/${productId}/campaigns/${campaignId}`;

  const [view, setView] = useState<'calendar' | 'list'>('list');
  const [monthAnchor, setMonthAnchor] = useState(() => new Date());
  const [platformFilter, setPlatformFilter] = useState<'' | SocialConnectionPlatform>('');
  const [statusFilter, setStatusFilter] = useState<'' | PublishingCalendarStatus>('');

  const [items, setItems] = useState<PublishingCalendarItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<PublishingCalendarItem | null>(null);
  const [selectedPublication, setSelectedPublication] = useState<SocialPublicationSummary | null>(null);
  const [creativeImages, setCreativeImages] = useState<SocialImageAsset[] | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editLocalDateTime, setEditLocalDateTime] = useState('');
  const [editTimezone, setEditTimezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [detailBusy, setDetailBusy] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Default view: current month for the Calendar tab; the List tab
  // always covers the same range (upcoming ~30 days from the month
  // anchor's start) so switching tabs never refetches with a mismatched
  // window.
  const rangeStart = useMemo(() => startOfMonth(monthAnchor), [monthAnchor]);
  const rangeEnd = useMemo(() => addDays(endOfMonth(monthAnchor), 30), [monthAnchor]);

  async function loadCalendar() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ start: rangeStart.toISOString(), end: rangeEnd.toISOString() });
      if (platformFilter) params.set('platform', platformFilter);
      if (statusFilter) params.set('status', statusFilter);
      const result = await apiRequest<PublishingCalendarItem[]>(`${basePath}/publishing-calendar?${params.toString()}`);
      setItems(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load the publishing calendar');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCalendar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeStart, rangeEnd, platformFilter, statusFilter]);

  useEffect(() => {
    if (!selected) {
      setCreativeImages(null);
      setSelectedPublication(null);
      setEditing(false);
      setDetailError(null);
      return;
    }
    setDetailError(null);
    if (!selected.creativeAssetId) {
      setCreativeImages(null);
    } else {
      (async () => {
        try {
          const imgs = await apiRequest<SocialImageAsset[]>(`${basePath}/creative/social-image/${selected.source.contentArtifactId}/versions/${selected.source.contentVersion}`);
          setCreativeImages(imgs.filter((i) => i.id === selected.creativeAssetId));
        } catch {
          setCreativeImages(null);
        }
      })();
    }
    // Remote status only exists on the SocialPublication record itself —
    // the calendar feed never carries it (19E's item never mutates for
    // 19F concerns) — so fetch it lazily only when a published item with
    // a publicationId is opened.
    if (selected.publicationId) {
      loadPublicationDetail(selected.publicationId);
    } else {
      setSelectedPublication(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  async function loadPublicationDetail(publicationId: string) {
    try {
      const pub = await apiRequest<SocialPublicationSummary>(`${basePath}/social-publications/${publicationId}`);
      setSelectedPublication(pub);
    } catch {
      setSelectedPublication(null);
    }
  }

  function refreshSelected(updatedList: PublishingCalendarItem[]) {
    if (!selected) return;
    const stillThere = updatedList.find((i) => i.id === selected.id);
    setSelected(stillThere ?? null);
  }

  async function handleCancel(item: PublishingCalendarItem) {
    if (!item.scheduleId) return;
    if (!window.confirm('Cancel this scheduled post?')) return;
    setDetailBusy(true);
    setDetailError(null);
    try {
      await apiRequest(`${basePath}/social-schedules/${item.scheduleId}/cancel`, { method: 'POST' });
      await loadCalendar();
    } catch (err) {
      setDetailError(err instanceof ApiError ? err.message : 'Failed to cancel schedule');
    } finally {
      setDetailBusy(false);
    }
  }

  function startEdit(item: PublishingCalendarItem) {
    if (!item.scheduledAt) return;
    setEditTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    const d = new Date(item.scheduledAt);
    const pad = (n: number) => String(n).padStart(2, '0');
    setEditLocalDateTime(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
    setEditing(true);
  }

  async function handleSaveEdit(item: PublishingCalendarItem) {
    if (!item.scheduleId) return;
    const iso = zonedTimeToUtcIso(editLocalDateTime, editTimezone);
    if (!iso) return;
    setDetailBusy(true);
    setDetailError(null);
    try {
      await apiRequest(`${basePath}/social-schedules/${item.scheduleId}`, { method: 'PATCH', body: { scheduledAt: iso, timezone: editTimezone } });
      setEditing(false);
      await loadCalendar();
    } catch (err) {
      setDetailError(err instanceof ApiError ? err.message : 'Failed to update schedule');
    } finally {
      setDetailBusy(false);
    }
  }

  async function handleSync(item: PublishingCalendarItem) {
    if (!item.publicationId) return;
    setSyncBusy(true);
    setDetailError(null);
    try {
      await apiRequest(`${basePath}/social-publications/${item.publicationId}/sync-status`, { method: 'POST' });
      await loadPublicationDetail(item.publicationId);
    } catch (err) {
      setDetailError(err instanceof ApiError ? err.message : 'Remote status check failed');
    } finally {
      setSyncBusy(false);
    }
  }

  useEffect(() => {
    if (items) refreshSelected(items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const upcoming = (items ?? [])
    .filter((i) => (i.status === 'scheduled' || i.status === 'processing') && effectiveTime(i))
    .sort((a, b) => new Date(effectiveTime(a)!).getTime() - new Date(effectiveTime(b)!).getTime());
  const recentlyPublished = (items ?? [])
    .filter((i) => i.status === 'published')
    .sort((a, b) => new Date(effectiveTime(b)!).getTime() - new Date(effectiveTime(a)!).getTime());
  const other = (items ?? []).filter((i) => i.status === 'failed' || i.status === 'cancelled');

  // A simple 7-column month grid: from the Sunday on/before the 1st
  // through the Saturday on/after the last day of the month. No
  // drag/drop — clicking a chip opens the same detail panel as List view
  // (item 16).
  const monthDays = useMemo(() => {
    const first = startOfMonth(monthAnchor);
    const gridStart = addDays(first, -first.getDay());
    const days: Date[] = [];
    for (let i = 0; i < 42; i++) days.push(addDays(gridStart, i));
    return days;
  }, [monthAnchor]);

  const itemsByDay = useMemo(() => {
    const map = new Map<string, PublishingCalendarItem[]>();
    for (const item of items ?? []) {
      const t = effectiveTime(item);
      if (!t) continue;
      const key = dateKey(t);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return map;
  }, [items]);

  function renderItemChip(item: PublishingCalendarItem) {
    const time = effectiveTime(item);
    return (
      <div
        key={item.id}
        onClick={() => setSelected(item)}
        style={{ cursor: 'pointer', padding: '4px 6px', marginTop: 4, borderRadius: 4, border: '1px solid var(--border-color, #ddd)', fontSize: 12 }}
      >
        <div className="tag-list" style={{ gap: 4 }}>
          <span className="tag">{labelize(item.platform)}</span>
          <span className="tag">{labelize(item.status)}</span>
        </div>
        <div className="entity-card-meta">
          {item.connection.accountName ?? item.connection.username ?? 'Account'} {time ? `· ${formatLocalTime(time)}` : ''}
        </div>
      </div>
    );
  }

  return (
    <AppLayout>
      <PageHeader
        backTo={{ to: basePath, label: 'Campaign' }}
        title="Publishing Calendar"
        actions={
          <>
            <button className={`btn ${view === 'list' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setView('list')}>
              List
            </button>
            <button className={`btn ${view === 'calendar' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setView('calendar')}>
              Calendar
            </button>
          </>
        }
      />

      <Card>
        <div className="form-inline">
          <div className="field" style={{ marginBottom: 0 }}>
            <select value={platformFilter} onChange={(e) => setPlatformFilter(e.target.value as SocialConnectionPlatform | '')}>
              <option value="">All platforms</option>
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {labelize(p)}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as PublishingCalendarStatus | '')}>
              <option value="">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {labelize(s)}
                </option>
              ))}
            </select>
          </div>
          {view === 'calendar' && (
            <div className="tag-list" style={{ margin: 0 }}>
              <button className="btn btn-secondary" onClick={() => setMonthAnchor((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}>
                &larr;
              </button>
              <span className="summary-label">{monthAnchor.toLocaleDateString([], { month: 'long', year: 'numeric' })}</span>
              <button className="btn btn-secondary" onClick={() => setMonthAnchor((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}>
                &rarr;
              </button>
            </div>
          )}
        </div>

        <ErrorMessage message={error} />
        {loading && <Loading text="Loading publishing activity..." />}

        {!loading && items && items.length === 0 && <p className="entity-card-meta">No publishing activity in this date range.</p>}

        {!loading && items && items.length > 0 && view === 'list' && (
          <>
            <span className="summary-label" style={{ display: 'block', marginTop: 12 }}>
              Upcoming
            </span>
            {upcoming.length === 0 && <p className="entity-card-meta">No posts scheduled.</p>}
            {upcoming.map(renderItemChip)}

            <span className="summary-label" style={{ display: 'block', marginTop: 16 }}>
              Recently Published
            </span>
            {recentlyPublished.length === 0 && <p className="entity-card-meta">Nothing published in this range yet.</p>}
            {recentlyPublished.map(renderItemChip)}

            {other.length > 0 && (
              <>
                <span className="summary-label" style={{ display: 'block', marginTop: 16 }}>
                  Failed / Cancelled
                </span>
                {other.map(renderItemChip)}
              </>
            )}
          </>
        )}

        {!loading && items && view === 'calendar' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginTop: 12 }}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="entity-card-meta" style={{ fontWeight: 600 }}>
                {d}
              </div>
            ))}
            {monthDays.map((day) => {
              const dayItems = itemsByDay.get(day.toDateString()) ?? [];
              const inMonth = day.getMonth() === monthAnchor.getMonth();
              return (
                <div key={day.toISOString()} style={{ minHeight: 70, padding: 4, border: '1px solid var(--border-color, #eee)', opacity: inMonth ? 1 : 0.45, overflowY: 'auto' }}>
                  <div style={{ fontSize: 11 }}>{day.getDate()}</div>
                  {dayItems.map(renderItemChip)}
                </div>
              );
            })}
          </div>
        )}

        {selected && (
          <div style={{ marginTop: 16, padding: 12, border: '1px solid var(--border-color, #ddd)', borderRadius: 6 }}>
            <div className="tag-list">
              <span className="summary-label">Post Detail</span>
              <button className="btn btn-secondary" onClick={() => setSelected(null)}>
                Close
              </button>
            </div>
            <ErrorMessage message={detailError} />
            <div className="tag-list" style={{ marginTop: 8 }}>
              <span className="tag">{labelize(selected.platform)}</span>
              <span className="tag">{labelize(selected.status)}</span>
              <span className="tag">v{selected.source.contentVersion}</span>
              {selected.connection.accountName && <span className="tag">{selected.connection.accountName}</span>}
              {selected.connection.username && <span className="tag">@{selected.connection.username}</span>}
            </div>
            {selected.scheduledAt && <div className="entity-card-meta">Scheduled: {formatLocal(selected.scheduledAt)}</div>}
            {selected.publishedAt && <div className="entity-card-meta">Published: {formatLocal(selected.publishedAt)}</div>}
            {creativeImages && creativeImages[0]?.asset.url && (
              <img src={creativeImages[0].asset.url} alt="Creative preview" style={{ maxWidth: 240, borderRadius: 4, marginTop: 8, display: 'block' }} />
            )}
            {selected.providerPostUrl && (
              <p style={{ marginTop: 8 }}>
                <a href={selected.providerPostUrl} target="_blank" rel="noopener noreferrer">
                  View Post
                </a>
              </p>
            )}
            {selected.status === 'failed' && (
              <div className="content-warning" style={{ marginTop: 8 }}>
                {selected.errorCode ? `Failed: ${labelize(selected.errorCode)}` : 'Publishing failed.'}
              </div>
            )}
            {selectedPublication?.remoteStatus && (
              <div className="tag-list" style={{ marginTop: 8 }}>
                <span className="tag">Remote: {labelize(selectedPublication.remoteStatus)}</span>
                {selectedPublication.remoteStatusCheckedAt && <span className="entity-card-meta">Checked {formatLocal(selectedPublication.remoteStatusCheckedAt)}</span>}
              </div>
            )}
            {selectedPublication?.remoteStatusErrorCode && !selectedPublication.remoteStatus && (
              <p className="entity-card-meta">Last remote check failed: {labelize(selectedPublication.remoteStatusErrorCode)}</p>
            )}

            <div className="tag-list" style={{ marginTop: 10 }}>
              {selected.status === 'scheduled' && selected.scheduleId && !editing && (
                <>
                  <button className="btn btn-secondary" onClick={() => startEdit(selected)} disabled={detailBusy}>
                    Edit
                  </button>
                  <button className="btn btn-secondary" onClick={() => handleCancel(selected)} disabled={detailBusy}>
                    Cancel
                  </button>
                </>
              )}
              {selected.status === 'published' && selected.publicationId && SYNCABLE_PLATFORMS.has(selected.platform) && (
                <button className="btn btn-secondary" onClick={() => handleSync(selected)} disabled={syncBusy}>
                  {syncBusy ? 'Checking...' : 'Sync Status'}
                </button>
              )}
              {selected.status === 'published' && selected.publicationId && !SYNCABLE_PLATFORMS.has(selected.platform) && (
                <span className="entity-card-meta">Remote status check unavailable for this provider.</span>
              )}
            </div>

            {editing && (
              <div className="form-inline" style={{ marginTop: 8 }}>
                <div className="field" style={{ marginBottom: 0 }}>
                  <input type="datetime-local" value={editLocalDateTime} onChange={(e) => setEditLocalDateTime(e.target.value)} />
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <input type="text" value={editTimezone} onChange={(e) => setEditTimezone(e.target.value)} style={{ width: 160 }} title="IANA timezone" />
                </div>
                <button className="btn btn-primary" onClick={() => handleSaveEdit(selected)} disabled={detailBusy}>
                  Save
                </button>
                <button className="btn btn-link" onClick={() => setEditing(false)} disabled={detailBusy}>
                  Cancel Edit
                </button>
              </div>
            )}
          </div>
        )}
      </Card>
    </AppLayout>
  );
}
