import { useState } from 'react';
import { X } from 'lucide-react';
import { useAuth } from '@/application/hooks/useAuth';
import { useCustomerMutations } from '../hooks/useCustomerMutations';
import type { Customer, CustomerFormValues } from '../types/customer.types';

interface CustomerFormProps {
  customer?: Customer;
  onClose: () => void;
  onSaved: (customer: Customer) => void;
}

const EMPTY_FORM: CustomerFormValues = {
  customer_code: '',
  name: '',
  email: '',
  phone: '',
  default_time_window_start: '',
  default_time_window_end: '',
  default_service_minutes: 5,
  default_required_skills: [],
  notes: '',
  is_active: true,
};

function toFormValues(customer: Customer | undefined): CustomerFormValues {
  if (!customer) return EMPTY_FORM;
  return {
    customer_code: customer.customer_code ?? '',
    name: customer.name ?? '',
    email: customer.email ?? '',
    phone: customer.phone ?? '',
    default_time_window_start: customer.default_time_window_start ?? '',
    default_time_window_end: customer.default_time_window_end ?? '',
    default_service_minutes: customer.default_service_minutes ?? 5,
    default_required_skills: customer.default_required_skills ?? [],
    notes: customer.notes ?? '',
    is_active: customer.is_active ?? true,
  };
}

export function CustomerForm({ customer, onClose, onSaved }: CustomerFormProps) {
  const { currentOrg } = useAuth();
  const isEditing = Boolean(customer);
  const { create, update, isPending, error } = useCustomerMutations();

  const [form, setForm] = useState<CustomerFormValues>(toFormValues(customer));
  const [skillInput, setSkillInput] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  function addSkill(raw: string) {
    const v = raw.trim();
    if (!v) return;
    if (form.default_required_skills.includes(v)) return;
    setForm({ ...form, default_required_skills: [...form.default_required_skills, v] });
  }

  function removeSkill(skill: string) {
    setForm({
      ...form,
      default_required_skills: form.default_required_skills.filter((s) => s !== skill),
    });
  }

  function handleSkillKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addSkill(skillInput);
      setSkillInput('');
    } else if (e.key === 'Backspace' && skillInput === '' && form.default_required_skills.length > 0) {
      const last = form.default_required_skills[form.default_required_skills.length - 1];
      removeSkill(last);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);
    if (!currentOrg?.id) {
      setLocalError('No hay organización seleccionada.');
      return;
    }
    if (!form.name.trim()) {
      setLocalError('El nombre es obligatorio.');
      return;
    }

    const payload = {
      org_id: currentOrg.id,
      customer_code: form.customer_code.trim() || null,
      name: form.name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      default_time_window_start: form.default_time_window_start || null,
      default_time_window_end: form.default_time_window_end || null,
      default_service_minutes: form.default_service_minutes,
      default_required_skills: form.default_required_skills,
      notes: form.notes.trim() || null,
      is_active: form.is_active,
    };

    let saved: Customer | null = null;
    if (isEditing && customer) {
      saved = await update(customer.id, payload);
    } else {
      saved = await create(payload);
    }
    if (saved) onSaved(saved);
  }

  const displayError = localError ?? error;

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="customer-form-title"
    >
      <form
        onSubmit={handleSubmit}
        noValidate
        className="bg-white rounded-xl p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 id="customer-form-title" className="text-lg font-semibold">
            {isEditing ? 'Editar cliente' : 'Nuevo cliente'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Código</label>
              <input
                type="text"
                value={form.customer_code}
                onChange={(e) => setForm({ ...form, customer_code: e.target.value })}
                placeholder="Opcional"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Nombre *</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Teléfono</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Hora inicio (default)
              </label>
              <input
                type="time"
                value={form.default_time_window_start}
                onChange={(e) =>
                  setForm({ ...form, default_time_window_start: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Hora fin (default)
              </label>
              <input
                type="time"
                value={form.default_time_window_end}
                onChange={(e) => setForm({ ...form, default_time_window_end: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Minutos de servicio (default)
            </label>
            <input
              type="number"
              min={0}
              max={480}
              value={form.default_service_minutes}
              onChange={(e) =>
                setForm({
                  ...form,
                  default_service_minutes: Number.isNaN(e.target.valueAsNumber)
                    ? 5
                    : e.target.valueAsNumber,
                })
              }
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Skills requeridos (default)
            </label>
            <div className="flex flex-wrap gap-1.5 px-2 py-2 border border-gray-200 rounded-lg min-h-[42px] focus-within:ring-2 focus-within:ring-blue-400">
              {form.default_required_skills.map((skill) => (
                <span
                  key={skill}
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-full"
                >
                  {skill}
                  <button
                    type="button"
                    onClick={() => removeSkill(skill)}
                    aria-label={`Quitar skill ${skill}`}
                    className="hover:text-blue-900"
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
              <input
                type="text"
                value={skillInput}
                onChange={(e) => setSkillInput(e.target.value)}
                onKeyDown={handleSkillKeyDown}
                onBlur={() => {
                  if (skillInput.trim()) {
                    addSkill(skillInput);
                    setSkillInput('');
                  }
                }}
                placeholder={
                  form.default_required_skills.length === 0
                    ? 'refrigerado, fragil, lift-gate…'
                    : ''
                }
                className="flex-1 min-w-[120px] text-sm focus:outline-none bg-transparent"
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">Presiona Enter o coma para añadir.</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Notas</label>
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
            />
          </div>

          {isEditing && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              />
              <span>Activo</span>
            </label>
          )}
        </div>

        {displayError && (
          <div
            role="alert"
            className="mt-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700"
          >
            {displayError}
          </div>
        )}

        <div className="flex gap-2 mt-6">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isPending ? 'Guardando…' : isEditing ? 'Guardar' : 'Crear cliente'}
          </button>
        </div>
      </form>
    </div>
  );
}
