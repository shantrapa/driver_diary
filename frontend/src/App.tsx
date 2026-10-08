import { FormEvent, useEffect, useState } from 'react';
import { ApiError, createTrip, getDay } from './api';
import type { DayResponse, Payment } from './types';

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

function shiftDay(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

// datetime-local value "YYYY-MM-DDTHH:mm[:ss]" is entered as Almaty time.
const toAlmatyIso = (local: string) => `${local.length === 16 ? `${local}:00` : local}+05:00`;

type Load = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ok'; data: DayResponse };
type Notice = { kind: 'success' | 'info' | 'error'; text: string } | null;

// New UUID per trip; kept until the trip is created, so a resend after a network error stays idempotent.
const newForm = () => ({ id: crypto.randomUUID(), start: '', end: '', amount: '', payment: 'cash' as Payment, commission: '' });
type Form = ReturnType<typeof newForm>;

export default function App() {
  const [date, setDate] = useState(() => ymdInAlmaty(new Date()));
  const [reload, setReload] = useState(0);
  const [load, setLoad] = useState<Load>({ state: 'loading' });

  const [form, setForm] = useState(newForm);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  useEffect(() => {
    if (!date) return;
    const ctrl = new AbortController();
    setLoad({ state: 'loading' });
    getDay(date, ctrl.signal)
      .then((data) => setLoad({ state: 'ok', data }))
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        setLoad({ state: 'error', message: e instanceof ApiError ? e.message : 'Сервер недоступен' });
      });
    return () => ctrl.abort();
  }, [date, reload]);

  const set = (k: keyof Form) => (e: { target: { value: string } }) =>
    setForm({ ...form, [k]: e.target.value });

  function validate(): string | null {
    const amount = Number(form.amount);
    const commission = Number(form.commission);
    if (!form.id.trim() || form.id !== form.id.trim()) return 'ID не должен быть пустым или с пробелами по краям';
    if (!form.start || !form.end) return 'Укажите начало и окончание';
    if (form.end <= form.start) return 'Окончание должно быть позже начала';
    if (!Number.isInteger(amount) || amount <= 0) return 'Сумма должна быть целым числом больше 0';
    if (!Number.isInteger(commission) || commission < 0 || commission > amount)
      return 'Комиссия — целое число от 0 до суммы поездки';
    return null;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const err = validate();
    if (err) return setNotice({ kind: 'error', text: err });
    setSaving(true);
    setNotice(null);
    try {
      const { status, data } = await createTrip({
        id: form.id,
        start: toAlmatyIso(form.start),
        end: toAlmatyIso(form.end),
        amount: Number(form.amount),
        payment: form.payment,
        commission: Number(form.commission),
      });
      const tripDay = ymdInAlmaty(new Date(data.trip.start));
      const where = tripDay === date ? '' : ` (дата ${tripDay})`;
      setNotice(
        status === 201
          ? { kind: 'success', text: `Поездка «${data.trip.id}» добавлена${where}` }
          : { kind: 'info', text: `Такая поездка «${data.trip.id}» уже есть — дубль не создан${where}` },
      );
      if (status === 201) setForm(newForm());
      if (tripDay === date) setReload((n) => n + 1);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setNotice({ kind: 'error', text: `Поездка с ID «${form.id}» уже существует с другими данными. Сгенерируйте новый ID.` });
      } else if (e instanceof ApiError && e.status === 422) {
        setNotice({ kind: 'error', text: `Сервер отклонил данные: ${e.message}` });
      } else {
        setNotice({ kind: 'error', text: e instanceof ApiError ? e.message : 'Не удалось связаться с сервером' });
      }
    } finally {
      setSaving(false);
    }
  }

  const s = load.state === 'ok' ? load.data.summary : null;
  const cards: [string, string][] = s
    ? [
        ['Поездок', String(s.trip_count)],
        ['Выручка', money(s.revenue)],
        ['Комиссия', money(s.commission)],
        ['На руки', money(s.net)],
        ['Наличные', money(s.payment_breakdown.cash)],
        ['Карта', money(s.payment_breakdown.card)],
      ]
    : [];

  return (
    <main>
      <h1>Дневник смен водителя</h1>

      <div className="day-nav">
        <button onClick={() => setDate(shiftDay(date, -1))} disabled={!date}>← Предыдущий день</button>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Дата" required />
        <button onClick={() => setDate(shiftDay(date, 1))} disabled={!date}>Следующий день →</button>
      </div>
      <p className="hint">Время Алматы (UTC+05:00). Поездка относится к дню своего начала.</p>

      {!date && <p className="status">Выберите дату</p>}
      {date && load.state === 'loading' && <p className="status">Загрузка…</p>}
      {date && load.state === 'error' && (
        <div className="status error">
          Не удалось загрузить данные: {load.message}{' '}
          <button onClick={() => setReload((n) => n + 1)}>Повторить</button>
        </div>
      )}

      {date && load.state === 'ok' && (
        <>
          <section className="cards">
            {cards.map(([label, value]) => (
              <div className="card" key={label}>
                <div className="label">{label}</div>
                <div className="value">{value}</div>
              </div>
            ))}
          </section>
          <p className="hint">«Наличные» и «Карта» — выручка до вычета комиссии; «На руки» = выручка − комиссия.</p>

          <section>
            <h2>Поездки</h2>
            {load.data.trips.length === 0 ? (
              <p className="status">Нет поездок за выбранный день</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Начало</th><th>Окончание</th><th>Сумма</th><th>Оплата</th><th>Комиссия</th><th>ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {load.data.trips.map((t) => (
                      <tr key={t.id}>
                        <td>{fmtTime(t.start, date)}</td>
                        <td>{fmtTime(t.end, date)}</td>
                        <td className="num">{money(t.amount)}</td>
                        <td>{PAYMENT_LABEL[t.payment]}</td>
                        <td className="num">{money(t.commission)}</td>
                        <td className="muted">{t.id}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      <section>
        <h2>Добавить поездку</h2>
        <form onSubmit={onSubmit} className="trip-form">
          <label className="id-field">ID (UUID)
            <span className="id-row">
              <input value={form.id} onChange={set('id')} maxLength={100} required />
              <button type="button" onClick={() => setForm({ ...form, id: crypto.randomUUID() })} title="Новый ID">↻</button>
            </span>
          </label>
          <label>Начало (время Алматы, UTC+05:00)
            <input type="datetime-local" value={form.start} onChange={set('start')} required />
          </label>
          <label>Окончание (время Алматы, UTC+05:00)
            <input type="datetime-local" value={form.end} onChange={set('end')} required />
          </label>
          <label>Сумма, ₸<input type="number" min={1} step={1} value={form.amount} onChange={set('amount')} required /></label>
          <label>Оплата
            <select value={form.payment} onChange={set('payment')}>
              <option value="cash">Наличные</option>
              <option value="card">Карта</option>
            </select>
          </label>
          <label>Комиссия, ₸<input type="number" min={0} step={1} value={form.commission} onChange={set('commission')} required /></label>
          <button type="submit" disabled={saving}>{saving ? 'Сохранение…' : 'Добавить поездку'}</button>
        </form>
        {notice && <p className={`notice ${notice.kind}`}>{notice.text}</p>}
      </section>
    </main>
  );
}
