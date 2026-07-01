import { useCallback, useEffect, useState } from 'react';
import { shopifyService, type ShopifyInstallation } from '@/data/services/shopify';

export interface UseShopifyIntegrationReturn {
  installations: ShopifyInstallation[];
  isLoading: boolean;
  error: string | null;
  connecting: boolean;
  /** Inicia el OAuth: obtiene la URL de Shopify y redirige el navegador. */
  connect: (shop: string) => Promise<void>;
  disconnect: (shopDomain: string) => Promise<boolean>;
  refetch: () => Promise<void>;
}

export function useShopifyIntegration(orgId: string | undefined): UseShopifyIntegrationReturn {
  const [installations, setInstallations] = useState<ShopifyInstallation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  const refetch = useCallback(async () => {
    if (!orgId) return;
    setIsLoading(true);
    setError(null);
    const res = await shopifyService.listInstallations(orgId);
    if (!res.success) setError(res.error);
    else setInstallations(res.data);
    setIsLoading(false);
  }, [orgId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const connect = useCallback(
    async (shop: string) => {
      if (!orgId) {
        setError('No hay organización activa.');
        return;
      }
      setConnecting(true);
      setError(null);
      const res = await shopifyService.getConnectUrl(orgId, shop);
      setConnecting(false);
      if (!res.success) {
        setError(res.error);
        return;
      }
      // Redirige a Shopify para el consentimiento del merchant.
      window.location.href = res.data.authorize_url;
    },
    [orgId],
  );

  const disconnect = useCallback(
    async (shopDomain: string): Promise<boolean> => {
      if (!orgId) return false;
      setError(null);
      const res = await shopifyService.disconnect(orgId, shopDomain);
      if (!res.success) {
        setError(res.error);
        return false;
      }
      setInstallations((prev) =>
        prev.map((i) =>
          i.shop_domain === shopDomain
            ? { ...i, status: 'uninstalled', uninstalled_at: new Date().toISOString() }
            : i,
        ),
      );
      return true;
    },
    [orgId],
  );

  return { installations, isLoading, error, connecting, connect, disconnect, refetch };
}
