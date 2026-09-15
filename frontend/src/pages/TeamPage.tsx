import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, apiRequest } from '../api/client';
import { AppLayout } from '../components/AppLayout';
import { Badge } from '../components/Badge';
import { Card } from '../components/Card';
import { ErrorMessage } from '../components/ErrorMessage';
import { Loading } from '../components/Loading';
import { PageHeader } from '../components/PageHeader';
import { usePermissions } from '../hooks/usePermissions';
import type {
  OrganizationInvitation,
  OrganizationMember,
  OrganizationRole,
  Product,
  ProductAccessGrant,
  ProductAccessMode,
} from '../types';

type TeamTab = 'members' | 'invitations' | 'roles' | 'access';

const roleFormDefaults = {
  name: '',
  description: '',
  permissions: [] as string[],
  isDefault: false,
};

const inviteFormDefaults = {
  email: '',
  roleId: '',
  productAccessMode: 'all_products' as ProductAccessMode,
  productIds: [] as string[],
};

function permissionLabel(permission: string) {
  return permission
    .split('.')
    .map((part) => part.replace(/_/g, ' '))
    .join(' / ');
}

function roleName(role?: OrganizationRole) {
  return role?.name ?? 'No role';
}

function roleId(role?: OrganizationRole) {
  return role?.id ?? role?._id ?? '';
}

function invitationId(invitation: OrganizationInvitation) {
  return invitation._id;
}

function productAccessLabel(mode: ProductAccessMode, grants?: ProductAccessGrant[], productIds?: string[]) {
  if (mode === 'all_products') return 'All products';
  const count = grants?.length ?? productIds?.length ?? 0;
  return `${count} selected`;
}

export default function TeamPage() {
  const { organizationId } = useParams<{ organizationId: string }>();
  const permissions = usePermissions(organizationId);
  const [tab, setTab] = useState<TeamTab>('members');
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [invitations, setInvitations] = useState<OrganizationInvitation[]>([]);
  const [roles, setRoles] = useState<OrganizationRole[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [allPermissions, setAllPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [inviteForm, setInviteForm] = useState(inviteFormDefaults);
  const [roleForm, setRoleForm] = useState(roleFormDefaults);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string>('');
  const [memberAccess, setMemberAccess] = useState<ProductAccessGrant[]>([]);
  const [accessMode, setAccessMode] = useState<ProductAccessMode>('all_products');
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const canViewTeam = permissions.hasPermission('team.view');
  const canManageMembers = permissions.hasPermission('team.manage');
  const canInvite = permissions.hasPermission('team.invite');
  const canManageRoles = permissions.hasPermission('team.roles.manage');
  const canManageAccess = permissions.hasPermission('team.manage');

  async function loadData() {
    if (!organizationId) return;
    setLoading(true);
    setError(null);
    try {
      const [membersData, invitationsData, rolesData, productsData, permissionsData] = await Promise.all([
        apiRequest<OrganizationMember[]>(`/organizations/${organizationId}/members`),
        apiRequest<OrganizationInvitation[]>(`/organizations/${organizationId}/invitations`),
        apiRequest<OrganizationRole[]>(`/organizations/${organizationId}/roles`),
        apiRequest<Product[]>(`/organizations/${organizationId}/products`),
        apiRequest<string[]>(`/organizations/${organizationId}/permissions`),
      ]);
      setMembers(membersData);
      setInvitations(invitationsData);
      setRoles(rolesData);
      setProducts(productsData);
      setAllPermissions(permissionsData);
      setInviteForm((current) => ({ ...current, roleId: current.roleId || roleId(rolesData.find((role) => role.isDefault)) || roleId(rolesData[0]) }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load team');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (permissions.loading || !canViewTeam) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, permissions.loading, canViewTeam]);

  const permissionGroups = useMemo(() => {
    return allPermissions.reduce<Record<string, string[]>>((groups, permission) => {
      const group = permission.split('.')[0] || 'general';
      groups[group] = [...(groups[group] ?? []), permission];
      return groups;
    }, {});
  }, [allPermissions]);

  const selectedMember = members.find((member) => member.memberId === selectedMemberId);

  useEffect(() => {
    if (!selectedMemberId || !organizationId || !canManageAccess) return;
    apiRequest<ProductAccessGrant[]>(`/organizations/${organizationId}/members/${selectedMemberId}/product-access`)
      .then((grants) => {
        setMemberAccess(grants);
        const member = members.find((item) => item.memberId === selectedMemberId);
        setAccessMode(member?.productAccessMode ?? 'all_products');
        setSelectedProductIds(grants.map((grant) => grant.productId));
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load product access'));
  }, [organizationId, selectedMemberId, canManageAccess, members]);

  function toggleInviteProduct(productId: string) {
    setInviteForm((current) => ({
      ...current,
      productIds: current.productIds.includes(productId)
        ? current.productIds.filter((id) => id !== productId)
        : [...current.productIds, productId],
    }));
  }

  function toggleAccessProduct(productId: string) {
    setSelectedProductIds((current) =>
      current.includes(productId) ? current.filter((id) => id !== productId) : [...current, productId],
    );
  }

  function toggleRolePermission(permission: string) {
    setRoleForm((current) => ({
      ...current,
      permissions: current.permissions.includes(permission)
        ? current.permissions.filter((value) => value !== permission)
        : [...current.permissions, permission],
    }));
  }

  async function runAction(key: string, action: () => Promise<void>) {
    setBusyKey(key);
    setError(null);
    setMessage(null);
    try {
      await action();
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Team action failed');
    } finally {
      setBusyKey(null);
    }
  }

  async function submitInvitation(e: FormEvent) {
    e.preventDefault();
    await runAction('invite', async () => {
      const created = await apiRequest<OrganizationInvitation>(`/organizations/${organizationId}/invitations`, {
        method: 'POST',
        body: inviteForm,
      });
      setInviteForm({ ...inviteFormDefaults, roleId: inviteForm.roleId });
      setMessage(created.inviteUrl ? `Invite created: ${created.inviteUrl}` : 'Invite created.');
    });
  }

  async function submitRole(e: FormEvent) {
    e.preventDefault();
    await runAction('role', async () => {
      const body = {
        name: roleForm.name,
        description: roleForm.description || undefined,
        permissions: roleForm.permissions,
        isDefault: roleForm.isDefault,
      };
      if (editingRoleId) {
        await apiRequest(`/organizations/${organizationId}/roles/${editingRoleId}`, { method: 'PATCH', body });
      } else {
        await apiRequest(`/organizations/${organizationId}/roles`, { method: 'POST', body });
      }
      setRoleForm(roleFormDefaults);
      setEditingRoleId(null);
      setMessage(editingRoleId ? 'Role updated.' : 'Role created.');
    });
  }

  function beginEditRole(role: OrganizationRole) {
    setEditingRoleId(roleId(role));
    setRoleForm({
      name: role.name,
      description: role.description ?? '',
      permissions: role.permissions,
      isDefault: Boolean(role.isDefault),
    });
    setTab('roles');
  }

  async function updateMemberRole(member: OrganizationMember, roleId: string) {
    await runAction(`member-role-${member.memberId}`, async () => {
      await apiRequest(`/organizations/${organizationId}/members/${member.memberId}`, { method: 'PATCH', body: { roleId } });
      setMessage('Member role updated.');
    });
  }

  async function saveMemberAccess() {
    if (!selectedMemberId) return;
    await runAction('member-access', async () => {
      await apiRequest(`/organizations/${organizationId}/members/${selectedMemberId}/product-access`, {
        method: 'PATCH',
        body: { productAccessMode: accessMode, productIds: selectedProductIds },
      });
      setMessage('Product access updated.');
    });
  }

  if (permissions.loading || loading) {
    return (
      <AppLayout>
        <Loading />
      </AppLayout>
    );
  }

  if (!canViewTeam) {
    return (
      <AppLayout>
        <PageHeader backTo={{ to: `/organizations/${organizationId}`, label: 'Organization' }} title="Team" />
        <Card>
          <ErrorMessage message={permissions.error ?? "You don't have permission to access team management."} />
        </Card>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageHeader
        backTo={{ to: `/organizations/${organizationId}`, label: 'Organization' }}
        title="Team"
        subtitle="Manage organization members, roles, invitations, and product access."
      />

      <div className="team-tabs" role="tablist" aria-label="Team sections">
        {(['members', 'invitations', 'roles', 'access'] as TeamTab[]).map((item) => (
          <button
            key={item}
            type="button"
            className={`team-tab ${tab === item ? 'team-tab-active' : ''}`}
            onClick={() => setTab(item)}
          >
            {item}
          </button>
        ))}
      </div>

      <ErrorMessage message={error} />
      {message && <p className="success-message">{message}</p>}

      {tab === 'members' && (
        <Card>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Product Access</th>
                  <th>Joined</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.memberId}>
                    <td>{member.displayName ?? 'Pending user'}</td>
                    <td>{member.email ?? '-'}</td>
                    <td>
                      {canManageMembers ? (
                        <select
                          value={roleId(member.role)}
                          onChange={(e) => updateMemberRole(member, e.target.value)}
                          disabled={busyKey === `member-role-${member.memberId}`}
                        >
                          {roles.map((role) => (
                            <option key={roleId(role)} value={roleId(role)}>
                              {role.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        roleName(member.role)
                      )}
                    </td>
                    <td>
                      <Badge status={member.status} />
                    </td>
                    <td>{member.productAccessSummary ?? productAccessLabel(member.productAccessMode, undefined, member.productIds)}</td>
                    <td>{member.joinedAt ? new Date(member.joinedAt).toLocaleDateString() : '-'}</td>
                    <td>
                      <div className="table-actions">
                        {canManageAccess && (
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => {
                              setSelectedMemberId(member.memberId);
                              setTab('access');
                            }}
                          >
                            Access
                          </button>
                        )}
                        {canManageMembers && member.status === 'active' && (
                          <button
                            type="button"
                            className="btn btn-ghost"
                            disabled={busyKey === `suspend-${member.memberId}`}
                            onClick={() =>
                              runAction(`suspend-${member.memberId}`, async () => {
                                await apiRequest(`/organizations/${organizationId}/members/${member.memberId}/suspend`, { method: 'POST' });
                                setMessage('Member suspended.');
                              })
                            }
                          >
                            Suspend
                          </button>
                        )}
                        {canManageMembers && member.status === 'suspended' && (
                          <button
                            type="button"
                            className="btn btn-secondary"
                            disabled={busyKey === `reactivate-${member.memberId}`}
                            onClick={() =>
                              runAction(`reactivate-${member.memberId}`, async () => {
                                await apiRequest(`/organizations/${organizationId}/members/${member.memberId}/reactivate`, { method: 'POST' });
                                setMessage('Member reactivated.');
                              })
                            }
                          >
                            Reactivate
                          </button>
                        )}
                        {canManageMembers && (
                          <button
                            type="button"
                            className="btn btn-ghost"
                            disabled={busyKey === `remove-${member.memberId}`}
                            onClick={() =>
                              runAction(`remove-${member.memberId}`, async () => {
                                await apiRequest(`/organizations/${organizationId}/members/${member.memberId}`, { method: 'DELETE' });
                                setMessage('Member removed.');
                              })
                            }
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'invitations' && (
        <>
          {canInvite && (
            <Card>
              <h2 className="card-title">Invite Member</h2>
              <form onSubmit={submitInvitation} className="form form-grid-2" style={{ marginTop: 14 }}>
                <div className="field">
                  <label htmlFor="invite-email">Email</label>
                  <input
                    id="invite-email"
                    type="email"
                    value={inviteForm.email}
                    onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="invite-role">Role</label>
                  <select
                    id="invite-role"
                    value={inviteForm.roleId}
                    onChange={(e) => setInviteForm({ ...inviteForm, roleId: e.target.value })}
                    required
                  >
                    {roles.map((role) => (
                      <option key={roleId(role)} value={roleId(role)}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="invite-access-mode">Product access</label>
                  <select
                    id="invite-access-mode"
                    value={inviteForm.productAccessMode}
                    onChange={(e) => setInviteForm({ ...inviteForm, productAccessMode: e.target.value as ProductAccessMode })}
                  >
                    <option value="all_products">All products</option>
                    <option value="selected_products">Selected products</option>
                  </select>
                </div>
                {inviteForm.productAccessMode === 'selected_products' && (
                  <div className="field field-full">
                    <label>Products</label>
                    <div className="checkbox-grid">
                      {products.map((product) => (
                        <label key={product.id} className="check-row">
                          <input
                            type="checkbox"
                            checked={inviteForm.productIds.includes(product.id)}
                            onChange={() => toggleInviteProduct(product.id)}
                          />
                          {product.name}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                <div className="field-full">
                  <button type="submit" className="btn btn-primary" disabled={busyKey === 'invite'}>
                    {busyKey === 'invite' ? 'Sending...' : 'Send Invite'}
                  </button>
                </div>
              </form>
            </Card>
          )}

          <Card>
            <h2 className="card-title">Invitations</h2>
            <div className="table-wrap" style={{ marginTop: 14 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Product Access</th>
                    <th>Expires</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invitations.map((invitation) => (
                    <tr key={invitationId(invitation)}>
                      <td>{invitation.emailNormalized}</td>
                      <td>{roleName(roles.find((role) => roleId(role) === invitation.roleId))}</td>
                      <td>
                        <Badge status={invitation.status} />
                      </td>
                      <td>{productAccessLabel(invitation.productAccessMode, undefined, invitation.productIds)}</td>
                      <td>{new Date(invitation.expiresAt).toLocaleDateString()}</td>
                      <td>
                        <div className="table-actions">
                          {canInvite && invitation.status === 'pending' && (
                            <>
                              <button
                                type="button"
                                className="btn btn-secondary"
                                disabled={busyKey === `resend-${invitationId(invitation)}`}
                                onClick={() =>
                                  runAction(`resend-${invitationId(invitation)}`, async () => {
                                    const resent = await apiRequest<OrganizationInvitation>(
                                      `/organizations/${organizationId}/invitations/${invitationId(invitation)}/resend`,
                                      { method: 'POST' },
                                    );
                                    setMessage(resent.inviteUrl ? `Invite resent: ${resent.inviteUrl}` : 'Invite resent.');
                                  })
                                }
                              >
                                Resend
                              </button>
                              <button
                                type="button"
                                className="btn btn-ghost"
                                disabled={busyKey === `revoke-${invitationId(invitation)}`}
                                onClick={() =>
                                  runAction(`revoke-${invitationId(invitation)}`, async () => {
                                    await apiRequest(`/organizations/${organizationId}/invitations/${invitationId(invitation)}/revoke`, { method: 'POST' });
                                    setMessage('Invite revoked.');
                                  })
                                }
                              >
                                Revoke
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {invitations.length === 0 && (
                    <tr>
                      <td colSpan={6} className="empty-table">
                        No invitations yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {tab === 'roles' && (
        <>
          {canManageRoles && (
            <Card>
              <h2 className="card-title">{editingRoleId ? 'Edit Role' : 'Create Role'}</h2>
              <form onSubmit={submitRole} className="form" style={{ marginTop: 14 }}>
                <div className="form-grid-2">
                  <div className="field">
                    <label htmlFor="role-name">Name</label>
                    <input
                      id="role-name"
                      value={roleForm.name}
                      onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })}
                      required
                    />
                  </div>
                  <label className="check-row" style={{ alignSelf: 'end' }}>
                    <input
                      type="checkbox"
                      checked={roleForm.isDefault}
                      onChange={(e) => setRoleForm({ ...roleForm, isDefault: e.target.checked })}
                    />
                    Default for new invites
                  </label>
                  <div className="field field-full">
                    <label htmlFor="role-description">Description</label>
                    <input
                      id="role-description"
                      value={roleForm.description}
                      onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })}
                    />
                  </div>
                </div>
                <div className="permission-groups">
                  {Object.entries(permissionGroups).map(([group, values]) => (
                    <div key={group} className="permission-group">
                      <h3>{group.replace(/_/g, ' ')}</h3>
                      {values.map((permission) => (
                        <label key={permission} className="check-row">
                          <input
                            type="checkbox"
                            checked={roleForm.permissions.includes(permission)}
                            onChange={() => toggleRolePermission(permission)}
                          />
                          {permissionLabel(permission)}
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
                <div className="form-inline">
                  <button type="submit" className="btn btn-primary" disabled={busyKey === 'role'}>
                    {busyKey === 'role' ? 'Saving...' : editingRoleId ? 'Save Role' : 'Create Role'}
                  </button>
                  {editingRoleId && (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => {
                        setEditingRoleId(null);
                        setRoleForm(roleFormDefaults);
                      }}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            </Card>
          )}

          <Card>
            <h2 className="card-title">Roles</h2>
            <div className="table-wrap" style={{ marginTop: 14 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Members</th>
                    <th>Permissions</th>
                    <th>Default</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {roles.map((role) => (
                    <tr key={roleId(role)}>
                      <td>
                        <strong>{role.name}</strong>
                        {role.description && <p className="muted">{role.description}</p>}
                      </td>
                      <td>{role.type}</td>
                      <td>{role.membersCount ?? 0}</td>
                      <td>{role.permissions.length}</td>
                      <td>{role.isDefault ? 'Yes' : 'No'}</td>
                      <td>
                        <div className="table-actions">
                          {canManageRoles && role.type === 'custom' && (
                            <>
                              <button type="button" className="btn btn-secondary" onClick={() => beginEditRole(role)}>
                                Edit
                              </button>
                              <button
                                type="button"
                                className="btn btn-ghost"
                                disabled={busyKey === `delete-role-${roleId(role)}`}
                                onClick={() =>
                                  runAction(`delete-role-${roleId(role)}`, async () => {
                                    await apiRequest(`/organizations/${organizationId}/roles/${roleId(role)}`, { method: 'DELETE' });
                                    setMessage('Role deleted.');
                                  })
                                }
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {tab === 'access' && (
        <Card>
          <h2 className="card-title">Product Access</h2>
          {!canManageAccess && <ErrorMessage message="You don't have permission to manage product access." />}
          {canManageAccess && (
            <div className="form" style={{ marginTop: 14 }}>
              <div className="field">
                <label htmlFor="access-member">Member</label>
                <select
                  id="access-member"
                  value={selectedMemberId}
                  onChange={(e) => setSelectedMemberId(e.target.value)}
                >
                  <option value="">Select member</option>
                  {members
                    .filter((member) => member.status !== 'removed')
                    .map((member) => (
                      <option key={member.memberId} value={member.memberId}>
                        {member.displayName || member.email || member.memberId} - {roleName(member.role)}
                      </option>
                    ))}
                </select>
              </div>
              {selectedMember && (
                <>
                  <div className="field">
                    <label htmlFor="access-mode">Access mode</label>
                    <select id="access-mode" value={accessMode} onChange={(e) => setAccessMode(e.target.value as ProductAccessMode)}>
                      <option value="all_products">All products</option>
                      <option value="selected_products">Selected products</option>
                    </select>
                  </div>
                  {accessMode === 'selected_products' && (
                    <div className="field">
                      <label>Products</label>
                      <div className="checkbox-grid">
                        {products.map((product) => (
                          <label key={product.id} className="check-row">
                            <input
                              type="checkbox"
                              checked={selectedProductIds.includes(product.id)}
                              onChange={() => toggleAccessProduct(product.id)}
                            />
                            {product.name}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                  <p className="muted">
                    Current saved access: {productAccessLabel(selectedMember.productAccessMode, memberAccess)}
                  </p>
                  <button type="button" className="btn btn-primary" onClick={saveMemberAccess} disabled={busyKey === 'member-access'}>
                    {busyKey === 'member-access' ? 'Saving...' : 'Save Product Access'}
                  </button>
                </>
              )}
            </div>
          )}
        </Card>
      )}

      <p className="muted" style={{ marginTop: 18 }}>
        <Link to={`/organizations/${organizationId}`}>Back to organization</Link>
      </p>
    </AppLayout>
  );
}
