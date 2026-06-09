import { useMemo, useState } from "react";
import type { AuthUser, Instance, InstanceStatsEntry } from "@stackpatch/shared";
import {
  formatDateTime,
  formatInstanceStatus,
  formatMinecraftPlayers,
  shouldShowMinecraftPlayers,
} from "@stackpatch/shared";
import {
  cloneInstance,
  deleteInstance,
  startInstance,
  stopInstance,
} from "../../api/client";import {
  filterAndSearchInstances,
  INSTANCE_LIST_FILTER_OPTIONS,
  type InstanceListFilter,
} from "../../lib/instance-list";
import {
  canControlInstance,
  canDeleteInstance,
  canStartInstance,
  canStopInstance,
  formatDeleteInstanceConfirm,
  isGlobalAdmin,
} from "../../lib/instance-permissions";
import { Dropdown } from "../Dropdown/Dropdown";
import { ScrollArea } from "../ScrollArea/ScrollArea";
import styles from "./Instances.module.css";

interface InstancesProps {
  user: AuthUser;
  instances: Instance[];
  instanceStats: Record<string, InstanceStatsEntry>;
  loading: boolean;
  onOpenInstance: (instanceId: string) => void;
  onCreateInstance: () => void;
  onInstanceUpdated: (instance: Instance) => void;
  onInstanceRemoved: (instanceId: string) => void;
  onInstanceAdded: (instance: Instance) => void;
}

type InstanceCardAction = "start" | "stop" | "clone" | "delete";

interface InstanceCardProps {
  instance: Instance;
  stats?: InstanceStatsEntry;
  user: AuthUser;
  busy: boolean;
  onOpen: () => void;
  onAction: (action: InstanceCardAction) => Promise<void>;
}

function InstanceCard({ instance, stats, user, busy, onOpen, onAction }: InstanceCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const statusLabel = formatInstanceStatus(instance.status);
  const players = formatMinecraftPlayers(stats?.minecraft);
  const canControl = canControlInstance(user, instance.id);
  const canManage = canDeleteInstance(user);

  const actionOptions = useMemo(() => {
    const options: Array<{ value: InstanceCardAction; label: string; disabled?: boolean }> = [];

    if (canControl) {
      options.push({
        value: "start",
        label: "Start",
        disabled: !canStartInstance(instance.status) || busy,
      });
      options.push({
        value: "stop",
        label: "Stop",
        disabled: !canStopInstance(instance.status) || busy,
      });
    }

    if (canManage) {
      options.push({
        value: "clone",
        label: "Clone",
        disabled: busy,
      });
      options.push({
        value: "delete",
        label: "Delete",
        disabled: busy,
      });
    }

    return options;
  }, [busy, canControl, canManage, instance.status]);

  return (
    <article className={`${styles.card} ${menuOpen ? styles.cardElevated : ""}`.trim()}>
      <div className={styles.cardTabSlot}>
        <span className={styles.statusTab} title={statusLabel}>
          <span className={`${styles.statusDot} ${styles[instance.status]}`} />
          <span className={styles.statusLabel}>{statusLabel}</span>
        </span>
      </div>
      <div className={styles.cardBody}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardTitle} title={instance.name}>
            {instance.name}
          </h3>
        </div>
        <div className={styles.metaGrid}>
          <p className={styles.meta}>
            <span className={styles.metaLabel}>Last Start</span>
            <span className={styles.metaValue} title={formatDateTime(instance.lastStartedAt)}>
              {formatDateTime(instance.lastStartedAt)}
            </span>
          </p>
          {shouldShowMinecraftPlayers(instance.status, stats?.minecraft) && players && (
            <p className={styles.meta}>
              <span className={styles.metaLabel}>Players</span>
              <span className={styles.metaValue} title={players}>
                {players}
              </span>
            </p>
          )}
        </div>
        <div className={styles.actions}>
          {actionOptions.length > 0 && (
            <Dropdown
              className={styles.cardDropdown}
              variant="console"
              triggerLabel={busy ? "Working…" : "Actions"}
              options={actionOptions}
              disabled={busy}
              aria-label={`Actions for ${instance.name}`}
              onOpenChange={setMenuOpen}
              onChange={(action) => void onAction(action as InstanceCardAction)}
            />
          )}
          <button type="button" className={styles.actionPrimary} onClick={onOpen}>
            Open Instance
          </button>
        </div>
      </div>
    </article>
  );
}

export function Instances({
  user,
  instances,
  instanceStats,
  loading,
  onOpenInstance,
  onCreateInstance,
  onInstanceUpdated,
  onInstanceRemoved,
  onInstanceAdded,
}: InstancesProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<InstanceListFilter>("all");
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canCreate = isGlobalAdmin(user);

  const visibleInstances = useMemo(
    () => filterAndSearchInstances(instances, filter, searchQuery),
    [filter, instances, searchQuery],
  );

  async function handleCardAction(instance: Instance, action: InstanceCardAction) {
    setError(null);

    if ((action === "start" || action === "stop") && !canControlInstance(user, instance.id)) {
      return;
    }

    if ((action === "clone" || action === "delete") && !canDeleteInstance(user)) {
      return;
    }

    let cloneName: string | null = null;

    if (action === "start" && !canStartInstance(instance.status)) {
      return;
    }

    if (action === "stop") {
      if (!canStopInstance(instance.status)) {
        return;
      }
      if (!window.confirm(`Stop "${instance.name}"?`)) {
        return;
      }
    }

    if (action === "clone") {
      cloneName = window.prompt(`Clone "${instance.name}" as:`, `${instance.name} copy`)?.trim() ?? null;
      if (!cloneName) {
        return;
      }
    }

    if (action === "delete" && !window.confirm(formatDeleteInstanceConfirm(instance.name))) {
      return;
    }

    setBusyId(instance.id);

    try {
      switch (action) {
        case "start":
          onInstanceUpdated(await startInstance(instance.id));
          break;
        case "stop":
          onInstanceUpdated(await stopInstance(instance.id));
          break;
        case "clone":
          onInstanceAdded(await cloneInstance(instance.id, cloneName!));
          break;
        case "delete":
          await deleteInstance(instance.id);
          onInstanceRemoved(instance.id);
          break;
      }
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return <div className={styles.state}>Loading instances…</div>;
  }

  if (instances.length === 0) {
    return (
      <div className={styles.empty}>
        <h2 className={styles.emptyTitle}>No Instances Yet</h2>
        <p className={styles.emptyText}>
          Create your first instance to start hosting on this machine.
        </p>
        {canCreate && (
          <button type="button" className={styles.actionPrimary} onClick={onCreateInstance}>
            Create Instance
          </button>
        )}
      </div>
    );
  }

  return (
    <ScrollArea className={styles.wrapper}>
      <div className={`${styles.toolbar} ${filterMenuOpen ? styles.toolbarElevated : ""}`.trim()}>
        <h2 className={styles.toolbarTitle}>Instances</h2>
        <div className={styles.toolbarActions}>
          <input
            className={`surfaceControl ${styles.searchInput}`}
            type="search"
            value={searchQuery}
            placeholder="Search instances…"
            aria-label="Search instances"
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          <Dropdown
            className={styles.toolbarDropdown}
            value={filter}
            options={INSTANCE_LIST_FILTER_OPTIONS}
            aria-label="Filter instances"
            onOpenChange={setFilterMenuOpen}
            onChange={(value) => setFilter(value as InstanceListFilter)}
          />
          {canCreate && (
            <button type="button" className={styles.actionPrimary} onClick={onCreateInstance}>
              + New Instance
            </button>
          )}
        </div>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      {visibleInstances.length === 0 ? (
        <p className={styles.emptyFilter}>No instances match your search or filter.</p>
      ) : (
        <div className={styles.grid}>
          {visibleInstances.map((instance) => (
            <InstanceCard
              key={instance.id}
              instance={instance}
              stats={instanceStats[instance.id]}
              user={user}
              busy={busyId === instance.id}
              onOpen={() => onOpenInstance(instance.id)}
              onAction={(action) => handleCardAction(instance, action)}
            />
          ))}
        </div>
      )}
    </ScrollArea>
  );
}
