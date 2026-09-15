import { useEffect, useState } from 'react';
import { apiRequest } from '../api/client';
import type { CurrentUserAccess } from '../types';

export function usePermissions(organizationId?: string) {
  const [access, setAccess] = useState<CurrentUserAccess | null>(null);
  const [loading, setLoading] = useState(Boolean(organizationId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!organizationId) return;
    setLoading(true);
    apiRequest<CurrentUserAccess>(`/organizations/${organizationId}/me/access`)
      .then(setAccess)
      .catch(() => setError("You don't have permission to access this area."))
      .finally(() => setLoading(false));
  }, [organizationId]);

  function hasPermission(permission: string) {
    return !!access?.permissions.includes(permission);
  }

  function hasProductAccess(productId?: string) {
    if (!productId || !access) return false;
    return access.productAccess.mode === 'all_products' || access.productAccess.productIds.includes(productId);
  }

  return { access, loading, error, hasPermission, hasProductAccess };
}
