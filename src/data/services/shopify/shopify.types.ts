export interface ShopifyInstallation {
  id: string;
  shop_domain: string;
  scopes: string | null;
  status: 'active' | 'uninstalled';
  installed_at: string;
  uninstalled_at: string | null;
}
