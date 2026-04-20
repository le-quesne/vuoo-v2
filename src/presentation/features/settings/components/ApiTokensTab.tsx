import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  KeyRound,
  Loader2,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useAuth } from '@/application/hooks/useAuth';
import { useApiTokens } from '@/presentation/features/settings/hooks';
import type {
  ApiTokenCreateResult,
  ApiTokenRow,
  ApiTokenScope,
} from '@/data/services/apiTokens';
import { SectionCard } from './FormUi';

const ALL_SCOPES: Array<{ id: ApiTokenScope; label: string; description: string }> = [
  {
    id: 'orders:write',
    label: 'orders:write',
    description: 'Crear órdenes via POST /api/v1/orders',
  },
  {
    id: 'shopify_webhook',
    label: 'shopify_webhook',
    description: 'Recibir webhooks Shopify (source=shopify)',
  },
  {
    id: 'vtex_webhook',
    label: 'vtex_webhook',
    description: 'Recibir webhooks VTEX (source=vtex)',
  },
];

export function ApiTokensTab() {
  const { currentOrg } = useAuth();
  const {
    tokens,
    isLoading,
    error,
    lastCreated,
    create,
    revoke,
    clearLastCreated,
  } = useApiTokens(currentOrg?.id);
  const [showCreateModal, setShowCreateModal] = useState(false);

  return (
    <div className="space-y-4">
      <SectionCard
        title="API & Integraciones"
        description="Tokens de acceso para el endpoint público POST /api/v1/orders y webhooks (Shopify, VTEX). Los tokens se muestran en claro una única vez al crearlos."
      >
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs text-gray-500">
            {tokens.length === 0
              ? 'Aún no creaste ningún token.'
              : `${tokens.filter((t) => !t.revoked_at).length} token(s) activo(s) · ${tokens.filter((t) => t.revoked_at).length} revocado(s)`}
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus size={14} /> Crear token
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 mb-3 bg-red-50 rounded-lg text-xs text-red-700">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 size={20} className="animate-spin text-gray-400" />
          </div>
        ) : tokens.length === 0 ? (
          <EmptyTokens />
        ) : (
          <div className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
            {tokens.map((t) => (
              <TokenRow key={t.id} token={t} onRevoke={() => revoke(t.id)} />
            ))}
          </div>
        )}
      </SectionCard>

      {showCreateModal && (
        <CreateTokenModal
          onClose={() => setShowCreateModal(false)}
          onCreate={async (name, scopes) => {
            const res = await create({ name, scopes });
            if (res) setShowCreateModal(false);
            return res;
          }}
        />
      )}

      {lastCreated && <NewTokenRevealModal result={lastCreated} onClose={clearLastCreated} />}
    </div>
  );
}

function EmptyTokens() {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mb-3">
        <KeyRound size={18} className="text-gray-400" />
      </div>
      <p className="text-sm font-medium text-gray-700">Todavía no hay tokens</p>
      <p className="text-xs text-gray-500 mt-1 max-w-sm">
        Creá un token para que Shopify, VTEX u otros sistemas puedan crear órdenes
        automáticamente vía <code className="font-mono">POST /api/v1/orders</code>.
      </p>
    </div>
  );
}

function TokenRow({ token, onRevoke }: { token: ApiTokenRow; onRevoke: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const isRevoked = !!token.revoked_at;

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="shrink-0 w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
        <KeyRound size={14} className="text-gray-500" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-900 truncate">{token.name}</span>
          {isRevoked && (
            <span className="text-[10px] uppercase font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
              revocado
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
          <code className="font-mono text-gray-600">{token.token_prefix}…</code>
          <span>·</span>
          <span>{(token.scopes ?? []).join(', ') || 'sin scopes'}</span>
        </div>
        <div className="text-[11px] text-gray-400 mt-0.5">
          Creado {formatDate(token.created_at)}
          {token.last_used_at
            ? ` · Último uso ${formatDate(token.last_used_at)}`
            : ' · Sin uso registrado'}
        </div>
      </div>
      {!isRevoked && (
        <div className="shrink-0">
          {confirming ? (
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  setConfirming(false);
                  void onRevoke();
                }}
                className="px-2 py-1 text-xs font-semibold bg-red-600 text-white rounded hover:bg-red-700"
              >
                Confirmar
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:text-red-600 hover:bg-red-50 rounded"
            >
              <Trash2 size={12} /> Revocar
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function CreateTokenModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (name: string, scopes: ApiTokenScope[]) => Promise<ApiTokenCreateResult | null>;
}) {
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<Set<ApiTokenScope>>(new Set(['orders:write']));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(
    () => name.trim().length > 0 && scopes.size > 0 && !submitting,
    [name, scopes, submitting],
  );

  function toggleScope(s: ApiTokenScope) {
    setScopes((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    const res = await onCreate(name.trim(), Array.from(scopes));
    setSubmitting(false);
    if (!res) setError('No se pudo crear el token.');
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Crear token API</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Nombre</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Shopify Producción"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <p className="text-[11px] text-gray-500 mt-1">
              Usá un nombre descriptivo. No se puede cambiar después.
            </p>
          </div>

          <div>
            <div className="block text-xs font-medium text-gray-700 mb-2">Scopes</div>
            <div className="space-y-2">
              {ALL_SCOPES.map((s) => {
                const checked = scopes.has(s.id);
                return (
                  <label
                    key={s.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      checked
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleScope(s.id)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 font-mono">{s.label}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{s.description}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 rounded-lg text-xs text-red-700">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100 bg-gray-50 rounded-b-xl">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting && <Loader2 size={14} className="animate-spin" />}
            Crear
          </button>
        </div>
      </div>
    </div>
  );
}

function NewTokenRevealModal({
  result,
  onClose,
}: {
  result: ApiTokenCreateResult;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(result.plaintext);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // no-op
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Token creado</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg text-xs text-amber-800">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <span>
              <strong>Guardá este token ahora mismo.</strong> No se volverá a mostrar. Si lo
              perdés, deberás crear uno nuevo.
            </span>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Nombre</label>
            <div className="text-sm text-gray-900">{result.token.name}</div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Token</label>
            <div className="flex items-center gap-2">
              <code className="flex-1 font-mono text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 overflow-x-auto whitespace-nowrap">
                {result.plaintext}
              </code>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 px-3 py-2 text-xs font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Copiado' : 'Copiar'}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Scopes</label>
            <div className="text-sm text-gray-900 font-mono">
              {(result.token.scopes ?? []).join(', ')}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100 bg-gray-50 rounded-b-xl">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold bg-gray-900 text-white rounded-lg hover:bg-gray-800"
          >
            Listo
          </button>
        </div>
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('es-CL', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}
