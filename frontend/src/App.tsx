import { useEffect, useState } from 'react';
import { ApiError, getDay } from './api';
import TripDialog from './TripDialog';
import type { DayResponse, Payment, TripResult } from './types';

const TZ = 'Asia/Almaty';
const PAYMENT_LABEL: Record<Payment, string> = { cash: 'Наличные', card: 'Карта' };

const money = (n: number) => `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n)} ₸`;

// en-CA formats as YYYY-MM-DD.
const ymdInAlmaty = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);

const timeFmt = new Intl.DateTimeFormat('ru-RU', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
const dateTimeFmt = new Intl.DateTimeFormat('ru-RU', {
  timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
});
// Show the date only when the moment is not on the selected day (e.g. trip ending after midnight).
const fmtTime = (iso: string, day: string) => {
  const d = new Date(iso);
  return ymdInAlmaty(d) === day ? timeFmt.format(d) : dateTimeFmt.format(d);
};

const durationMin = (start: string, end: string) => Math.round((Date.parse(end) - Date.parse(start)) / 60000);
const fmtDuration = (min: number) => (min < 60 ? `${min} мин` : `${Math.floor(min / 60)} ч ${min % 60} мин`);

// Date-only value: format in UTC so the calendar day never shifts.
const dayTitleFmt = new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const dayTitle = (ymd: string) => dayTitleFmt.format(new Date(`${ymd}T00:00:00Z`));

function shiftDay(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

type Load = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ok'; data: DayResponse };
type Toast = { kind: 'success' | 'info'; text: string } | null;

export default function App() {
  const today = ymdInAlmaty(new Date());
  const [date, setDate] = useState(today);
  const [reload, setReload] = useState(0);
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [toast, setToast] = useState<Toast>(null);

  useEffect(() => {
    if (!date) return;
    const ctrl = new AbortController();
    setLoad({ state: 'loading' });
    getDay(date, ctrl.signal)
      .then((data) => setLoad({ state: 'ok', data }))
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        setLoad({ state: 'error', message: e instanceof ApiError ? e.message : 'сервер недоступен' });
      });
    return () => ctrl.abort();
  }, [date, reload]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  function onSaved({ trip, duplicate }: TripResult) {
    setDialogOpen(false);
    const tripDay = ymdInAlmaty(new Date(trip.start));
    const where = tripDay === date ? '' : ` — на дату ${tripDay}`;
    setToast(
      duplicate
        ? { kind: 'info', text: `Такая поездка уже есть, дубль не создан${where}` }
        : { kind: 'success', text: `Поездка добавлена${where}` },
    );
    if (tripDay === date) setReload((n) => n + 1);
  }

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <span className="logo" aria-hidden>🚕</span>
            <h1>Дневник смен водителя</h1>
          </div>
          <button className="btn primary" onClick={() => setDialogOpen(true)}>
            <span aria-hidden>＋</span> Новая поездка
          </button>
        </div>
      </header>

      <main className="page">
        <section className="day-head">
          <div>
            <p className="eyebrow">{date === today ? 'Сегодня' : 'Отчёт за день'} · Asia/Almaty</p>
            <h2 className="day-title">{date ? dayTitle(date) : 'Выберите дату'}</h2>
          </div>
          <div className="day-nav">
            <button className="btn ghost" onClick={() => setDate(shiftDay(date, -1))} disabled={!date} aria-label="Предыдущий день">
              ‹ <span className="lbl">Предыдущий день</span>
            </button>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Дата" required />
            <button className="btn ghost" onClick={() => setDate(shiftDay(date, 1))} disabled={!date} aria-label="Следующий день">
              <span className="lbl">Следующий день</span> ›
            </button>
            {date !== today && <button className="btn ghost" onClick={() => setDate(today)}>Сегодня</button>}
          </div>
        </section>

        {date && load.state === 'loading' && (
          <div aria-busy="true" aria-label="Загрузка">
            <div className="summary">{[0, 1, 2].map((i) => <div key={i} className="card skeleton" />)}</div>
            <p className="muted small">Загрузка…</p>
          </div>
        )}

        {date && load.state === 'error' && (
          <div className="state error">
            <p className="state-title">Не удалось загрузить данные</p>
            <p className="muted">{load.message}</p>
            <button className="btn primary" onClick={() => setReload((n) => n + 1)}>Повторить</button>
          </div>
        )}

        {date && load.state === 'ok' && <DayView data={load.data} onAdd={() => setDialogOpen(true)} />}
      </main>

      <TripDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onSaved={onSaved} />

      {toast && <div className={`toast ${toast.kind}`} role="status">{toast.text}</div>}
    </>
  );
}

function DayView({ data, onAdd }: { data: DayResponse; onAdd: () => void }) {
  const s = data.summary;
  const { cash, card } = s.payment_breakdown;
  const cashPct = s.revenue ? (cash / s.revenue) * 100 : 0;

  return (
    <>
      <section className="summary">
        <div className="card hero">
          <span className="label">На руки</span>
          <span className="value">{money(s.net)}</span>
          <span className="sub">выручка − комиссия</span>
        </div>
        <div className="card">
          <span className="label">Выручка</span>
          <span className="value">{money(s.revenue)}</span>
        </div>
        <div className="card">
          <span className="label">Комиссия</span>
          <span className="value">{money(s.commission)}</span>
        </div>
        <div className="card count">
          <span className="label">Поездок</span>
          <span className="value">{s.trip_count}</span>
        </div>
        <div className="card payments">
          <span className="label">Оплата (выручка до комиссии)</span>
          <div className={s.revenue ? 'bar' : 'bar empty'} aria-hidden>
            <span className="bar-cash" style={{ width: `${cashPct}%` }} />
          </div>
          <div className="legend">
            <span><i className="dot pay-cash" />Наличные <b>{money(cash)}</b></span>
            <span><i className="dot pay-card" />Карта <b>{money(card)}</b></span>
          </div>
        </div>
      </section>

      <section className="trips">
        <h3>Поездки</h3>
        {data.trips.length === 0 ? (
          <div className="state">
            <p className="state-title">Нет поездок за выбранный день</p>
            <button className="btn primary" onClick={onAdd}>＋ Добавить поездку</button>
          </div>
        ) : (
          <ul className="trip-list">
            {data.trips.map((t) => (
              <li key={t.id} className="trip">
                <div className="trip-time">
                  <span className="time">{fmtTime(t.start, data.date)} – {fmtTime(t.end, data.date)}</span>
                  <span className="muted small">{fmtDuration(durationMin(t.start, t.end))} · <span className="trip-id" title={t.id}>{t.id}</span></span>
                </div>
                <span className={`chip pay-${t.payment}`}>{PAYMENT_LABEL[t.payment]}</span>
                <div className="trip-money">
                  <span className="amount">{money(t.amount)}</span>
                  <span className="muted small">комиссия {money(t.commission)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
