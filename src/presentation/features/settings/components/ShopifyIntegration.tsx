import { type ReactNode, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ExternalLink,
  Loader2,
  Settings2,
  Store,
  Trash2,
  X,
} from 'lucide-react';
import { useAuth } from '@/application/hooks/useAuth';
import { useShopifyIntegration } from '@/presentation/features/settings/hooks';
import type { ShopifyInstallation } from '@/data/services/shopify';

/** Logo de Shopify (bolsa verde). */
function ShopifyLogo({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 448 512" className={className} aria-hidden>
      <path
        fill="#95BF47"
        d="M388.32 104.1a4.68 4.68 0 0 0-4.4-4c-2 0-37.23-.8-37.23-.8s-29.62-28.83-32.83-32a8 8 0 0 0-7.21-1c-.4 0-6.41 2-16 5-9.61-27.65-26.62-53.09-56.85-53.09h-2.8C222.8 8 214 0 206.79 0c-56.05 0-83-70.11-83-105.3M256.79 92.09c-8.41 2.61-18 5.61-28.42 8.82 0-6.42-.81-15.44-.81-24.28 0-30.18 4.19-45.61 9.44-53.28 8.34 9.65 15.16 27.19 19.79 68.74m-58.44-79.15c-6.41 0-12.82 5.61-17.63 15.63-6.44 13.7-11 34.51-11 65.57v3l-45.22 14.01c8.02-38.87 34.63-96.61 73.85-98.21m-24.63 210.32c-1.81 3-13.13 22.86-13.13 22.86-3.61 1.6-30.83 12.42-30.83 12.42l40.86-129.53s6.61 6 15.62 15.24c-6.4 34.03-12.51 78.77-12.52 79.01"
      />
      <path
        fill="#5E8E3E"
        d="M383.92 100.05c-2 0-37.23-.8-37.23-.8s-29.62-28.83-32.83-32a7.28 7.28 0 0 0-4-1.86L224 512l160.13-34.55S388.72 106.86 388.72 104a4.36 4.36 0 0 0-4.8-3.95"
      />
      <path
        fill="#fff"
        d="M275.16 202.53l-19.75 58.75s-17.42-9.4-38.85-9.4c-31.36 0-32.95 19.71-32.95 24.68 0 27.12 70.66 37.52 70.66 101 0 50-31.66 82.14-74.42 82.14-51.32 0-77.28-31.94-77.28-31.94l13.74-45.53s26.66 22.86 49.16 22.86a20 20 0 0 0 20.79-20.19c0-35.4-58-37-58-95.1 0-48.91 35.13-96.34 106-96.34 27.33 0 40.79 7.87 40.79 7.87"
      />
    </svg>
  );
}

export function ShopifyIntegration({ children }: { children?: ReactNode }) {
  const { currentOrg } = useAuth();
  const shopify = useShopifyIntegration(currentOrg?.id);
  const [modalOpen, setModalOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const justConnected = searchParams.get('shopify') === 'connected';
  const connectedShop = searchParams.get('shop');

  const active = shopify.installations.filter((i) => i.status === 'active');
  const connected = active.length > 0;

  function dismissBanner() {
    const next = new URLSearchParams(searchParams);
    next.delete('shopify');
    next.delete('shop');
    setSearchParams(next, { replace: true });
  }

  return (
    <div>
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
        E-commerce
      </h2>

      {justConnected && (
        <div className="flex items-start gap-2 p-3 mb-4 bg-green-50 rounded-lg text-xs text-green-700">
          <Check size={14} className="shrink-0 mt-0.5" />
          <span className="flex-1">
            <strong>¡Tienda conectada!</strong>
            {connectedShop ? ` ${connectedShop}` : ''} — los nuevos pedidos aparecerán en Pedidos.
          </span>
          <button onClick={dismissBanner} className="text-green-600 hover:text-green-800">
            <X size={14} />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="relative flex flex-col rounded-2xl border border-gray-200 bg-white p-5 hover:border-gray-300 transition-colors">
          {connected && (
            <span
              className="absolute top-4 right-4 w-2.5 h-2.5 rounded-full bg-green-500"
              title={`${active.length} tienda(s) conectada(s)`}
            />
          )}
          <div className="w-12 h-12 rounded-xl bg-[#95BF47]/15 flex items-center justify-center mb-4">
            <ShopifyLogo className="w-7 h-7" />
          </div>
          <h3 className="text-base font-semibold text-gray-900">Shopify</h3>
          <p className="text-sm text-gray-500 mt-1 flex-1">
            {connected
              ? `${active.length} tienda${active.length > 1 ? 's' : ''} conectada${active.length > 1 ? 's' : ''}. Los pedidos entran automáticamente a Vuoo.`
              : 'Conectá tu tienda para que los pedidos entren automáticamente a Vuoo, geocodificados y listos para rutear.'}
          </p>
          <button
            onClick={() => setModalOpen(true)}
            className="mt-4 self-start inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            {connected ? (
              <>
                <Settings2 size={15} /> Gestionar
              </>
            ) : (
              <>
                Conectar <ArrowRight size={15} />
              </>
            )}
          </button>
        </div>

        {children}
      </div>

      {modalOpen && <ShopifyModal shopify={shopify} onClose={() => setModalOpen(false)} />}
    </div>
  );
}

function ShopifyModal({
  shopify,
  onClose,
}: {
  shopify: ReturnType<typeof useShopifyIntegration>;
  onClose: () => void;
}) {
  const [shop, setShop] = useState('');
  const { installations, error, connecting, connect, disconnect } = shopify;
  const active = installations.filter((i) => i.status === 'active');
  const canConnect = useMemo(() => shop.trim().length > 0 && !connecting, [shop, connecting]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
          <div className="w-8 h-8 rounded-lg bg-[#95BF47]/15 flex items-center justify-center">
            <ShopifyLogo className="w-5 h-5" />
          </div>
          <h2 className="text-base font-semibold text-gray-900 flex-1">Conectar Shopify</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Dominio de tu tienda
            </label>
            <div className="flex items-center rounded-lg border border-gray-200 focus-within:ring-2 focus-within:ring-blue-400 overflow-hidden">
              <input
                autoFocus
                value={shop}
                onChange={(e) => setShop(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && canConnect) void connect(shop.trim());
                }}
                placeholder="tu-tienda"
                className="flex-1 px-3 py-2 text-sm focus:outline-none"
              />
              <span className="px-3 py-2 text-sm text-gray-400 bg-gray-50 border-l border-gray-200 whitespace-nowrap">
                .myshopify.com
              </span>
            </div>
            <p className="text-[11px] text-gray-500 mt-1">
              Te vamos a llevar a Shopify para aprobar los permisos. Después volvés acá.
            </p>
          </div>

          <button
            onClick={() => void connect(shop.trim())}
            disabled={!canConnect}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold bg-[#5E8E3E] text-white rounded-lg hover:bg-[#4d7533] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {connecting ? <Loader2 size={15} className="animate-spin" /> : <Store size={15} />}
            Conectar con Shopify
          </button>

          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 rounded-lg text-xs text-red-700">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {active.length > 0 && (
            <div>
              <div className="text-xs font-medium text-gray-700 mb-2">Tiendas conectadas</div>
              <div className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
                {active.map((inst) => (
                  <StoreRow
                    key={inst.id}
                    inst={inst}
                    onDisconnect={() => disconnect(inst.shop_domain)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StoreRow({
  inst,
  onDisconnect,
}: {
  inst: ShopifyInstallation;
  onDisconnect: () => Promise<boolean>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <Store size={14} className="shrink-0 text-[#5E8E3E]" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-gray-900 truncate">{inst.shop_domain}</span>
          <a
            href={`https://${inst.shop_domain}/admin`}
            target="_blank"
            rel="noreferrer"
            className="text-gray-400 hover:text-gray-600"
          >
            <ExternalLink size={11} />
          </a>
        </div>
      </div>
      {confirming ? (
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={async () => {
              setBusy(true);
              await onDisconnect();
              setBusy(false);
              setConfirming(false);
            }}
            disabled={busy}
            className="flex items-center gap-1 px-2 py-1 text-xs font-semibold bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
          >
            {busy && <Loader2 size={11} className="animate-spin" />}
            Sí
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded"
          >
            No
          </button>
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          className="shrink-0 flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"
        >
          <Trash2 size={11} /> Desconectar
        </button>
      )}
    </div>
  );
}
