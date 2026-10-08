import { FormEvent, useEffect, useRef, useState } from 'react';
import { ApiError, createTrip } from './api';
import type { Payment, TripResult } from './types';

// datetime-local value "YYYY-MM-DDTHH:mm[:ss]" is entered as Almaty time.
const toAlmatyIso = (local: string) => `${local.length === 16 ? `${local}:00` : local}+05:00`;

// New UUID per trip; kept until the server accepts it, so a resend after a network error stays idempotent.
const newForm = () => ({ id: crypto.randomUUID(), start: '', end: '', amount: '', payment: 'cash' as Payment, commission: '' });
type Form = ReturnType<typeof newForm>;

function validate(form: Form): string | null {
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

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: (result: TripResult) => void;
}

export default function TripDialog({ open, onClose, onSaved }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState(newForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dlg = ref.current;
    if (open && !dlg?.open) {
      setError(null);
      dlg?.showModal();
    }
    if (!open && dlg?.open) dlg.close();
  }, [open]);

  const set = (k: keyof Form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const err = validate(form);
    if (err) return setError(err);
    setSaving(true);
    setError(null);
    try {
      const { data } = await createTrip({
        id: form.id,
        start: toAlmatyIso(form.start),
        end: toAlmatyIso(form.end),
        amount: Number(form.amount),
        payment: form.payment,
        commission: Number(form.commission),
      });
      setForm(newForm());
      onSaved(data);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setError(`Поездка с ID «${form.id}» уже существует с другими данными. Сгенерируйте новый ID.`);
      } else if (e instanceof ApiError && e.status === 422) {
        setError(`Сервер отклонил данные: ${e.message}`);
      } else {
        setError(e instanceof ApiError ? e.message : 'Не удалось связаться с сервером');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      <form onSubmit={onSubmit} className="trip-form">
        <header className="dialog-head">
          <h2>Новая поездка</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">✕</button>
        </header>

        <label className="field full">
          <span>ID поездки</span>
          <span className="id-row">
            <input value={form.id} onChange={set('id')} maxLength={100} required spellCheck={false} />
            <button type="button" className="btn ghost" onClick={() => setForm({ ...form, id: crypto.randomUUID() })} title="Сгенерировать новый UUID">
              ↻ Новый
            </button>
          </span>
        </label>

        <label className="field">
          <span>Начало</span>
          <input type="datetime-local" value={form.start} onChange={set('start')} required />
        </label>
        <label className="field">
          <span>Окончание</span>
          <input type="datetime-local" value={form.end} onChange={set('end')} required />
        </label>
        <p className="hint full">Время Алматы (UTC+05:00)</p>

        <label className="field">
          <span>Сумма, ₸</span>
          <input type="number" inputMode="numeric" min={1} step={1} value={form.amount} onChange={set('amount')} required />
        </label>
        <label className="field">
          <span>Комиссия, ₸</span>
          <input type="number" inputMode="numeric" min={0} step={1} value={form.commission} onChange={set('commission')} required />
        </label>

        <fieldset className="field full">
          <span>Оплата</span>
          <div className="segmented">
            {(['cash', 'card'] as const).map((p) => (
              <label key={p} className={form.payment === p ? 'active' : ''}>
                <input type="radio" name="payment" value={p} checked={form.payment === p} onChange={set('payment')} />
                {p === 'cash' ? 'Наличные' : 'Карта'}
              </label>
            ))}
          </div>
        </fieldset>

        {error && <p className="form-error full" role="alert">{error}</p>}

        <footer className="dialog-foot full">
          <button type="button" className="btn ghost" onClick={onClose}>Отмена</button>
          <button type="submit" className="btn primary" disabled={saving}>{saving ? 'Сохранение…' : 'Добавить поездку'}</button>
        </footer>
      </form>
    </dialog>
  );
}
