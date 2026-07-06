import { ApiTokensCard, ShopifyIntegration } from '@/presentation/features/settings';

export function ApiTokensPage() {
  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="p-6 max-w-4xl">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-gray-900">API & Integraciones</h1>
          <p className="text-sm text-gray-500 mt-1">
            Conectá tu tienda Shopify con un clic, o generá tokens para integraciones
            personalizadas (VTEX, scripts).
          </p>
        </div>
        <ShopifyIntegration>
          <ApiTokensCard />
        </ShopifyIntegration>
      </div>
    </div>
  );
}
