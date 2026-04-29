import { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useBoardStore } from '../../store/boardStore';
import type { Item } from '../../types';
import ItemModal from './ItemModal';

// ─── Constants ────────────────────────────────────────────────────────────────

const ZOOM_LEVELS = [
  { label: 'Week',    dayW: 36, sub: 'day'   },
  { label: 'Month',   dayW: 12, sub: 'week'  },
  { label: 'Quarter', dayW:  4, sub: 'month' },
] as const;

const TOTAL_DAYS   = 540;   // 18-month canvas
const LEFT_W       = 280;
const ROW_H        = 38;
const GROUP_ROW_H  = 30;
const HEADER_H     = 52;   // month row (26px) + sub row (26px)
const MIN_BAR_W    = 8;    // minimum bar width in px

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAY_ABBR = ['S','M','T','W','T','F','S'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function dayDiff(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s.includes('T') ? s : s + 'T00:00:00');
  return isNaN(d.getTime()) ? null : startOfDay(d);
}

// Build month-segment boundaries across the canvas
function buildMonthSegments(rangeStart: Date, totalDays: number, dayW: number) {
  const segs: { label: string; left: number; width: number }[] = [];
  for (let i = 0; i < totalDays; i++) {
    const d = addDays(rangeStart, i);
    if (i === 0 || d.getDate() === 1) {
      segs.push({ label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`, left: i * dayW, width: 0 });
    }
  }
  for (let i = 0; i < segs.length; i++) {
    const next = segs[i + 1];
    segs[i].width = next ? next.left - segs[i].left : totalDays * dayW - segs[i].left;
  }
  return segs;
}

// Build sub-row tick marks
function buildSubTicks(
  rangeStart: Date,
  totalDays: number,
  dayW: number,
  sub: 'day' | 'week' | 'month',
): { label: string; left: number; width: number; isToday?: boolean }[] {
  const today = startOfDay(new Date());
  const ticks: { label: string; left: number; width: number; isToday?: boolean }[] = [];

  for (let i = 0; i < totalDays; i++) {
    const d = addDays(rangeStart, i);
    const x = i * dayW;
    const isToday = dayDiff(today, d) === 0;

    if (sub === 'day') {
      ticks.push({ label: String(d.getDate()), left: x, width: dayW, isToday });
    } else if (sub === 'week') {
      // Show a tick every Monday
      if (d.getDay() === 1) {
        const daysLeft = Math.min(7, totalDays - i);
        ticks.push({ label: `${d.getDate()}`, left: x, width: daysLeft * dayW });
      }
    } else {
      // 'month': show month name at 1st of month
      if (d.getDate() === 1 || i === 0) {
        const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        const daysLeft = Math.min(daysInMonth - d.getDate() + 1, totalDays - i);
        ticks.push({ label: MONTHS[d.getMonth()], left: x, width: daysLeft * dayW });
      }
    }
  }
  return ticks;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function GanttView() {
  const { board, getValue } = useBoardStore();

  const [zoomIdx, setZoomIdx] = useState(1); // default: Month
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // Fixed canvas start = today - 90 days
  const rangeStart = useRef<Date>(startOfDay(addDays(new Date(), -90))).current;

  const leftRef  = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const syncRef  = useRef(false);

  const zoom   = ZOOM_LEVELS[zoomIdx];
  const dayW   = zoom.dayW;
  const totalW = TOTAL_DAYS * dayW;
  const today  = startOfDay(new Date());
  const todayX = dayDiff(rangeStart, today) * dayW;

  // ── Scroll sync (Y axis) ──────────────────────────────────────────────────
  const onLeftScroll = useCallback(() => {
    if (syncRef.current || !rightRef.current || !leftRef.current) return;
    syncRef.current = true;
    rightRef.current.scrollTop = leftRef.current.scrollTop;
    syncRef.current = false;
  }, []);

  const onRightScroll = useCallback(() => {
    if (syncRef.current || !rightRef.current || !leftRef.current) return;
    syncRef.current = true;
    leftRef.current.scrollTop = rightRef.current.scrollTop;
    syncRef.current = false;
  }, []);

  // ── Jump to today ─────────────────────────────────────────────────────────
  const scrollToToday = useCallback(() => {
    if (!rightRef.current) return;
    const vw = rightRef.current.clientWidth;
    rightRef.current.scrollLeft = Math.max(0, todayX - vw / 3);
  }, [todayX]);

  // On mount and zoom change: scroll to show today
  useEffect(() => { scrollToToday(); }, [zoomIdx]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const t = setTimeout(scrollToToday, 50); // after layout
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Navigation buttons (shift scrollLeft) ────────────────────────────────
  const pan = useCallback((dir: 1 | -1) => {
    if (!rightRef.current) return;
    const amount = rightRef.current.clientWidth * 0.6;
    rightRef.current.scrollLeft += dir * amount;
  }, []);

  if (!board) return null;

  // ── Identify date columns ─────────────────────────────────────────────────
  const dateCols     = board.columns.filter(c => c.type === 'date');
  const timelineCol  = board.columns.find(c => c.type === 'timeline') ?? null;
  const statusCol    = board.columns.find(c => c.type === 'status' || c.type === 'priority') ?? null;

  const hasTwoDates  = dateCols.length >= 2;
  const hasOneDate   = dateCols.length === 1;
  const hasTimeline  = !!timelineCol;
  const noDates      = !hasTwoDates && !hasOneDate && !hasTimeline;

  const startDateCol = hasTwoDates ? dateCols[0] : null;
  const endDateCol   = dateCols.length > 0 ? dateCols[dateCols.length - 1] : null;

  // ── Get start/end date for item ───────────────────────────────────────────
  const getItemDates = (item: Item): { start: Date | null; end: Date | null } => {
    if (hasTimeline) {
      const val = getValue(item.id, timelineCol!.id);
      if (val?.includes('/')) {
        const [s, e] = val.split('/');
        return { start: parseDate(s), end: parseDate(e) };
      }
    }
    if (hasTwoDates) {
      return {
        start: parseDate(getValue(item.id, startDateCol!.id)),
        end:   parseDate(getValue(item.id, endDateCol!.id)),
      };
    }
    if (hasOneDate) {
      const d = parseDate(getValue(item.id, endDateCol!.id));
      return { start: d, end: d };
    }
    return { start: null, end: null };
  };

  // ── Status color for bar ──────────────────────────────────────────────────
  const getStatusColor = (item: Item): string | null => {
    if (!statusCol) return null;
    const val = getValue(item.id, statusCol.id);
    return statusCol.settings?.options?.find(o => o.label === val)?.color ?? null;
  };

  // ── Build header data ─────────────────────────────────────────────────────
  const monthSegs = buildMonthSegments(rangeStart, TOTAL_DAYS, dayW);
  const subTicks  = buildSubTicks(rangeStart, TOTAL_DAYS, dayW, zoom.sub);

  // ── Sorted groups / items ─────────────────────────────────────────────────
  const sortedGroups = [...board.groups].sort((a, b) => a.position - b.position);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white select-none">

      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 bg-gray-50 flex-shrink-0">
        <button
          onClick={() => pan(-1)}
          className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-500 transition-colors"
        >
          <ChevronLeft size={16} />
        </button>
        <button
          onClick={scrollToToday}
          className="px-3 py-1 text-sm font-medium rounded-lg border border-gray-300 hover:bg-white text-gray-700 transition-colors"
        >
          Today
        </button>
        <button
          onClick={() => pan(1)}
          className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-500 transition-colors"
        >
          <ChevronRight size={16} />
        </button>

        <div className="w-px h-5 bg-gray-200 mx-1" />

        {/* Zoom selector */}
        <div className="flex items-center gap-0.5 bg-gray-200 rounded-lg p-0.5">
          {ZOOM_LEVELS.map((z, i) => (
            <button
              key={z.label}
              onClick={() => setZoomIdx(i)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                i === zoomIdx
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              {z.label}
            </button>
          ))}
        </div>

        {/* Column legend / no-date warning */}
        <div className="ml-auto">
          {noDates ? (
            <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1 rounded-lg">
              Add a <strong>Date</strong> column to display items on the Gantt
            </span>
          ) : (
            <div className="flex items-center gap-3 text-xs text-gray-400">
              {startDateCol && (
                <span>Start: <strong className="text-gray-600">{startDateCol.name}</strong></span>
              )}
              {endDateCol && startDateCol && (
                <span>End: <strong className="text-gray-600">{endDateCol.name}</strong></span>
              )}
              {hasOneDate && !hasTwoDates && (
                <span>Date: <strong className="text-gray-600">{endDateCol!.name}</strong></span>
              )}
              {timelineCol && (
                <span>Timeline: <strong className="text-gray-600">{timelineCol.name}</strong></span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left panel — item names */}
        <div
          ref={leftRef}
          onScroll={onLeftScroll}
          className="flex-shrink-0 overflow-y-scroll overflow-x-hidden border-r border-gray-200"
          style={{ width: LEFT_W }}
        >
          {/* Header placeholder */}
          <div
            style={{ height: HEADER_H }}
            className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200 flex items-end px-3 pb-1.5"
          >
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Item</span>
          </div>

          {sortedGroups.map(group => {
            const groupItems = board.items
              .filter(it => it.group_id === group.id && !it.parent_item_id)
              .sort((a, b) => a.position - b.position);
            const isCollapsed = !!collapsed[group.id];

            return (
              <div key={group.id}>
                {/* Group header */}
                <div
                  style={{ height: GROUP_ROW_H }}
                  className="flex items-center gap-2 px-3 cursor-pointer hover:bg-gray-50 border-b border-gray-100"
                  onClick={() => setCollapsed(c => ({ ...c, [group.id]: !c[group.id] }))}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                    style={{ backgroundColor: group.color }}
                  />
                  <span className="text-xs font-semibold text-gray-700 flex-1 truncate">{group.name}</span>
                  <span className="text-gray-400" style={{ fontSize: 9 }}>{isCollapsed ? '▶' : '▼'}</span>
                </div>

                {/* Items */}
                {!isCollapsed && groupItems.map(item => (
                  <div
                    key={item.id}
                    style={{ height: ROW_H }}
                    className="flex items-center px-4 border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                    onClick={() => setSelectedItem(item)}
                  >
                    <span className="text-sm text-gray-800 truncate">{item.name}</span>
                  </div>
                ))}
              </div>
            );
          })}
          {/* Bottom padding so scrolling feels natural */}
          <div style={{ height: 80 }} />
        </div>

        {/* Right panel — timeline */}
        <div
          ref={rightRef}
          onScroll={onRightScroll}
          className="flex-1 overflow-auto"
        >
          {/* Canvas */}
          <div style={{ width: totalW, minWidth: totalW, position: 'relative' }}>

            {/* ── Sticky header ─────────────────────────────────────────── */}
            <div
              style={{ height: HEADER_H, position: 'sticky', top: 0, zIndex: 10 }}
              className="bg-gray-50 border-b border-gray-200"
            >
              {/* Month row */}
              <div className="relative" style={{ height: 26, borderBottom: '1px solid #e5e7eb' }}>
                {monthSegs.map((seg, i) => (
                  <div
                    key={i}
                    style={{ position: 'absolute', left: seg.left, width: seg.width, height: 26 }}
                    className="flex items-center px-2 text-xs font-semibold text-gray-600 overflow-hidden border-r border-gray-200"
                  >
                    {seg.label}
                  </div>
                ))}
                {/* Today indicator in header */}
                {todayX >= 0 && todayX <= totalW && (
                  <div
                    style={{ position: 'absolute', left: todayX - 1, top: 0, bottom: 0, width: 2, backgroundColor: '#e2445c' }}
                  />
                )}
              </div>

              {/* Sub row (days / weeks / months) */}
              <div className="relative" style={{ height: 26 }}>
                {subTicks.map((tick, i) => (
                  tick.label ? (
                    <div
                      key={i}
                      style={{ position: 'absolute', left: tick.left, width: tick.width, height: 26 }}
                      className={`flex items-center justify-center text-xs border-r border-gray-100 overflow-hidden ${
                        tick.isToday ? 'text-monday-blue font-bold' : 'text-gray-400'
                      }`}
                    >
                      {tick.label}
                    </div>
                  ) : null
                ))}
              </div>
            </div>

            {/* ── Row content ───────────────────────────────────────────── */}
            <div style={{ position: 'relative' }}>

              {/* Background grid — month separator lines */}
              {monthSegs.map((seg, i) => (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    left: seg.left,
                    top: 0,
                    bottom: 0,
                    width: 1,
                    backgroundColor: '#e5e7eb',
                    pointerEvents: 'none',
                  }}
                />
              ))}

              {/* Today vertical line */}
              {todayX >= 0 && todayX <= totalW && (
                <div
                  style={{
                    position: 'absolute',
                    left: todayX - 1,
                    top: 0,
                    bottom: 0,
                    width: 2,
                    backgroundColor: '#e2445c',
                    opacity: 0.35,
                    pointerEvents: 'none',
                    zIndex: 1,
                  }}
                />
              )}

              {/* Rows */}
              {sortedGroups.map(group => {
                const groupItems = board.items
                  .filter(it => it.group_id === group.id && !it.parent_item_id)
                  .sort((a, b) => a.position - b.position);
                const isCollapsed = !!collapsed[group.id];

                return (
                  <div key={group.id}>
                    {/* Group row */}
                    <div
                      style={{ height: GROUP_ROW_H, position: 'relative' }}
                      className="border-b border-gray-100"
                    >
                      {/* Weekend shading bands: subtle */}
                      {zoom.sub === 'day' && Array.from({ length: TOTAL_DAYS }, (_, i) => {
                        const d = addDays(rangeStart, i);
                        const dow = d.getDay();
                        if (dow === 0 || dow === 6) {
                          return (
                            <div
                              key={i}
                              style={{
                                position: 'absolute',
                                left: i * dayW,
                                top: 0,
                                width: dayW,
                                bottom: 0,
                                backgroundColor: '#f9fafb',
                                pointerEvents: 'none',
                              }}
                            />
                          );
                        }
                        return null;
                      })}
                      {/* Group label stripe */}
                      <div
                        style={{
                          position: 'absolute',
                          left: 0,
                          top: 6,
                          bottom: 6,
                          width: 3,
                          backgroundColor: group.color,
                          borderRadius: 2,
                        }}
                      />
                    </div>

                    {/* Item rows */}
                    {!isCollapsed && groupItems.map(item => {
                      const { start, end } = getItemDates(item);
                      const barColor = getStatusColor(item) ?? group.color;

                      let barLeft: number | null = null;
                      let barWidth: number | null = null;

                      if (start && end) {
                        const s = dayDiff(rangeStart, start);
                        const e = dayDiff(rangeStart, end);
                        barLeft  = s * dayW;
                        barWidth = Math.max((e - s + 1) * dayW, MIN_BAR_W);
                      }

                      const showLabel = barWidth !== null && barWidth > 50;

                      return (
                        <div
                          key={item.id}
                          style={{ height: ROW_H, position: 'relative' }}
                          className="border-b border-gray-100"
                        >
                          {/* Weekend shading */}
                          {zoom.sub === 'day' && Array.from({ length: TOTAL_DAYS }, (_, i) => {
                            const d = addDays(rangeStart, i);
                            const dow = d.getDay();
                            if (dow === 0 || dow === 6) {
                              return (
                                <div
                                  key={i}
                                  style={{
                                    position: 'absolute',
                                    left: i * dayW,
                                    top: 0,
                                    width: dayW,
                                    bottom: 0,
                                    backgroundColor: '#f9fafb',
                                    pointerEvents: 'none',
                                  }}
                                />
                              );
                            }
                            return null;
                          })}

                          {/* The bar */}
                          {barLeft !== null && barWidth !== null && (
                            <div
                              onClick={() => setSelectedItem(item)}
                              style={{
                                position: 'absolute',
                                left:   barLeft,
                                top:    6,
                                height: ROW_H - 12,
                                width:  barWidth,
                                backgroundColor: barColor,
                                zIndex: 2,
                              }}
                              className="rounded-md cursor-pointer hover:brightness-110 transition-all flex items-center px-2 overflow-hidden shadow-sm"
                            >
                              {showLabel && (
                                <span className="text-white text-xs font-medium truncate leading-none">
                                  {item.name}
                                </span>
                              )}
                            </div>
                          )}

                          {/* No date indicator */}
                          {barLeft === null && !noDates && (
                            <div className="absolute inset-0 flex items-center px-3">
                              <span
                                className="text-xs text-gray-300 italic cursor-pointer hover:text-gray-400"
                                onClick={() => setSelectedItem(item)}
                              >
                                No dates set
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}

              <div style={{ height: 80 }} />
            </div>
          </div>
        </div>
      </div>

      {selectedItem && (
        <ItemModal item={selectedItem} onClose={() => setSelectedItem(null)} />
      )}
    </div>
  );
}
