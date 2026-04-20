import { ApiTokensTab } from '@/presentation/features/settings';

export function ApiTokensPage() {
  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="p-6 max-w-4xl">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-gray-900">API & Integraciones</h1>
          <p className="text-sm text-gray-500 mt-1">
            Tokens para integraciones externas (Shopify, VTEX, scripts).
          </p>
        </div>
        <ApiTokensTab />
      </div>
    </div>
  );
}
