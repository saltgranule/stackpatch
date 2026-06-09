import { useEffect, useMemo, useState } from "react";
import type { Instance, UserRole } from "@stackpatch/shared";
import {
  canDeleteUser,
  formatDateTime,
  formatUserRole,
  type AuthUser,
  type UserWithPermissions,
} from "@stackpatch/shared";
import {
  createUser,
  deleteUser,
  fetchInstances,
  fetchUsers,
  removeUserInstancePermission,
  setUserInstancePermission,
  updateUser,
} from "../../api/client";
import form from "../../styles/consoleForm.module.css";
import { CardDropdown, ConsoleCard } from "../ConsoleCard";
import { PageContent, PageShell, pageShellStyles } from "../PageShell/PageShell";
import styles from "./UsersAdmin.module.css";

const ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "viewer", label: "Viewer" },
] as const;

const PERMISSION_OPTIONS = [
  { value: "", label: "No Access" },
  { value: "viewer", label: "Viewer" },
] as const;

interface UsersAdminProps {
  currentUser: AuthUser;
}

type InstancePermissionRole = "viewer";

interface ChangePasswordFieldProps {
  onSave: (password: string) => Promise<void>;
  saving: boolean;
}

function ChangePasswordField({ onSave, saving }: ChangePasswordFieldProps) {
  const [draft, setDraft] = useState("");
  const [confirm, setConfirm] = useState("");
  const mismatch = confirm.length > 0 && draft !== confirm;
  const canSave = draft.length > 0 && draft === confirm;

  async function handleSave() {
    if (!canSave) {
      return;
    }

    await onSave(draft);
    setDraft("");
    setConfirm("");
  }

  return (
    <div className={styles.passwordRow}>
      <input
        className={form.input}
        type="password"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="New password"
        autoComplete="new-password"
      />
      <input
        className={form.input}
        type="password"
        value={confirm}
        onChange={(event) => setConfirm(event.target.value)}
        placeholder="Confirm password"
        autoComplete="new-password"
      />
      <button
        type="button"
        className={form.actionPrimary}
        disabled={saving || !canSave}
        onClick={() => void handleSave()}
      >
        {saving ? "Saving…" : "Update"}
      </button>
      {mismatch && <span className={styles.policyHint}>Passwords do not match.</span>}
    </div>
  );
}

export function UsersAdmin({ currentUser }: UsersAdminProps) {
  const [users, setUsers] = useState<UserWithPermissions[]>([]);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AuthUser["role"]>("viewer");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [permissionBusy, setPermissionBusy] = useState<string | null>(null);
  const [passwordSaving, setPasswordSaving] = useState(false);

  const adminCount = useMemo(
    () => users.filter((user) => user.role === "admin").length,
    [users],
  );

  async function loadUsers() {
    try {
      const [loadedUsers, loadedInstances] = await Promise.all([fetchUsers(), fetchInstances()]);
      setUsers(loadedUsers);
      setInstances(loadedInstances);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadUsers();
  }, []);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    try {
      await createUser({ username: username.trim(), password, role });
      setUsername("");
      setPassword("");
      setRole("viewer");
      await loadUsers();
      setError(null);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create user");
    }
  }

  async function handlePasswordSave(nextPassword: string) {
    setPasswordSaving(true);
    try {
      await updateUser(currentUser.id, { password: nextPassword });
      await loadUsers();
      setError(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to update password");
    } finally {
      setPasswordSaving(false);
    }
  }

  async function handleDelete(user: UserWithPermissions) {
    const policy = canDeleteUser(currentUser, user, adminCount);
    if (!policy.allowed) {
      setError(policy.reason ?? "Cannot delete user");
      return;
    }

    const confirmed = window.confirm(
      `Delete user "${user.username}"? This cannot be undone.`,
    );
    if (!confirmed) {
      return;
    }

    setPendingDeleteId(user.id);
    try {
      await deleteUser(user.id);
      await loadUsers();
      setError(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete user");
    } finally {
      setPendingDeleteId(null);
    }
  }

  async function handleSetPermission(
    userId: string,
    instanceId: string,
    nextRole: InstancePermissionRole,
  ) {
    const busyKey = `${userId}:${instanceId}`;
    setPermissionBusy(busyKey);
    try {
      await setUserInstancePermission(userId, instanceId, nextRole);
      await loadUsers();
      setError(null);
    } catch (permissionError) {
      setError(
        permissionError instanceof Error ? permissionError.message : "Failed to update permission",
      );
    } finally {
      setPermissionBusy(null);
    }
  }

  async function handleRemovePermission(userId: string, instanceId: string) {
    const busyKey = `${userId}:${instanceId}`;
    setPermissionBusy(busyKey);
    try {
      await removeUserInstancePermission(userId, instanceId);
      await loadUsers();
      setError(null);
    } catch (permissionError) {
      setError(
        permissionError instanceof Error ? permissionError.message : "Failed to remove permission",
      );
    } finally {
      setPermissionBusy(null);
    }
  }

  function getPermissionRole(
    user: UserWithPermissions,
    instanceId: string,
  ): InstancePermissionRole | "" {
    const permission = user.instancePermissions.find((entry) => entry.instanceId === instanceId);
    if (!permission || permission.role !== "viewer") {
      return "";
    }
    return "viewer";
  }

  if (loading) {
    return <div className={pageShellStyles.state}>Loading users…</div>;
  }

  return (
    <PageShell title="Users" subtitle="Manage panel accounts and instance access.">
      {error && <p className={`${form.feedback} ${form.error}`}>{error}</p>}

      <PageContent wide>
        {users.map((user) => {
          const policy = canDeleteUser(currentUser, user, adminCount);
          const deleteDisabled = !policy.allowed || pendingDeleteId === user.id;
          const isExpanded = expandedUserId === user.id;
          const canManagePermissions = user.role !== "admin";
          const isSelf = user.id === currentUser.id;

          return (
            <ConsoleCard
              key={user.id}
              tabLabel={
                <>
                  user {user.username}
                  {isSelf && (
                    <>
                      {" "}
                      <span className={styles.tabYou}>[you]</span>
                    </>
                  )}
                </>
              }
              elevated={isExpanded}
              trackMenus={isExpanded}
            >
              <div className={styles.metaGrid}>
                <p className={styles.meta}>
                  <span className={styles.metaLabel}>Role</span>
                  <span className={styles.metaValue}>{formatUserRole(user.role)}</span>
                </p>
                <p className={styles.meta}>
                  <span className={styles.metaLabel}>Last Login</span>
                  <span className={styles.metaValue}>{formatDateTime(user.lastLoginAt)}</span>
                </p>
                {isSelf && (
                  <p className={`${styles.meta} ${styles.metaWide}`}>
                    <span className={styles.metaLabel}>Password</span>
                    <ChangePasswordField onSave={handlePasswordSave} saving={passwordSaving} />
                  </p>
                )}
              </div>

              {!policy.allowed && policy.reason && !isSelf && (
                <p className={styles.policyHint}>{policy.reason}</p>
              )}

              <div className={form.actions}>
                {canManagePermissions && (
                  <button
                    type="button"
                    className={form.actionSecondary}
                    onClick={() => setExpandedUserId(isExpanded ? null : user.id)}
                  >
                    {isExpanded ? "Hide Access" : "Instance Access"}
                  </button>
                )}
                {!isSelf && (
                  <button
                    type="button"
                    className={form.actionPrimary}
                    disabled={deleteDisabled}
                    title={policy.reason}
                    onClick={() => void handleDelete(user)}
                  >
                    {pendingDeleteId === user.id ? "Deleting…" : "Delete"}
                  </button>
                )}
              </div>

              {isExpanded && canManagePermissions && (
                <div className={styles.permissionsPanel}>
                  {instances.length === 0 ? (
                    <p className={styles.permissionsEmpty}>No instances yet.</p>
                  ) : (
                    <div className={styles.permissionsList}>
                      {instances.map((instance) => {
                        const busyKey = `${user.id}:${instance.id}`;
                        const currentRole = getPermissionRole(user, instance.id);

                        return (
                          <div key={instance.id} className={styles.permissionRow}>
                            <span className={styles.permissionInstance}>{instance.name}</span>
                            <CardDropdown
                              className={styles.permissionDropdown}
                              variant="console"
                              value={currentRole}
                              options={PERMISSION_OPTIONS}
                              disabled={permissionBusy === busyKey}
                              aria-label={`Access for ${instance.name}`}
                              onChange={(nextRole) => {
                                if (!nextRole) {
                                  void handleRemovePermission(user.id, instance.id);
                                  return;
                                }
                                void handleSetPermission(
                                  user.id,
                                  instance.id,
                                  nextRole as InstancePermissionRole,
                                );
                              }}
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </ConsoleCard>
          );
        })}

        <ConsoleCard tabLabel="add user" trackMenus>
          <form className={styles.createForm} onSubmit={handleCreate} autoComplete="off">
            <div className={styles.createFields}>
              <input
                className={form.input}
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Username"
                name="stackpatch-new-user"
                autoComplete="off"
                required
              />
              <input
                className={form.input}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Password"
                name="stackpatch-new-user-password"
                autoComplete="new-password"
                required
              />
              <CardDropdown
                className={styles.roleDropdown}
                variant="console"
                value={role}
                options={ROLE_OPTIONS}
                aria-label="Role"
                onChange={(nextRole) => setRole(nextRole as UserRole)}
              />
              <button type="submit" className={form.actionPrimary}>
                Create User
              </button>
            </div>
          </form>
        </ConsoleCard>
      </PageContent>
    </PageShell>
  );
}
