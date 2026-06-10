import { useCallback, useEffect, useState } from "react";
import type { AuthUser, HealthResponse, Instance, InstanceStatsEntry } from "@stackpatch/shared";
import { STATUS_RECONCILE_INTERVAL_MS } from "@stackpatch/shared";
import {
  fetchCurrentUser,
  fetchHealth,
  getInstanceStatusWsUrl,
  logout,
  syncInstances,
  restartInstance,
  startInstance,
  stopInstance,
  terminateInstance,
} from "./api/client";
import { CreateInstanceForm } from "./components/CreateInstanceForm/CreateInstanceForm";
import { ActivityLogs } from "./components/ActivityLogs/ActivityLogs";
import { Instances } from "./components/Instances/Instances";
import { GlobalLayout } from "./components/GlobalLayout/GlobalLayout";
import { Overview } from "./components/Overview/Overview";
import { InstanceLayout } from "./components/InstanceLayout/InstanceLayout";
import {
  InstanceSidebar,
  type InstanceNavItem,
} from "./components/InstanceSidebar/InstanceSidebar";
import { InstanceView } from "./components/InstanceView/InstanceView";
import { BrandLogo } from "./components/BrandLogo/BrandLogo";
import { Login } from "./components/Login/Login";
import { NotificationProvider } from "./components/Notifications";
import { TopBar, type GlobalNavItem } from "./components/TopBar/TopBar";
import { SystemSettings } from "./components/SystemSettings/SystemSettings";
import { UsersAdmin } from "./components/UsersAdmin/UsersAdmin";
import { useInstanceNotifications } from "./hooks/useInstanceNotifications";
import { useTheme } from "./hooks/useTheme";
import { useNotifications } from "./hooks/useNotifications";
import { canControlInstance, isGlobalAdmin } from "./lib/instance-permissions";

type AppRoute =
  | { level: "global"; view: GlobalNavItem }
  | { level: "instance"; instanceId: string; view: InstanceNavItem };

const DEFAULT_ROUTE: AppRoute = { level: "global", view: "instances" };

export function App() {
  const { preference, setTheme } = useTheme();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [route, setRoute] = useState<AppRoute>(DEFAULT_ROUTE);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [instanceStats, setInstanceStats] = useState<Record<string, InstanceStatsEntry>>({});
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);

  useEffect(() => {
    fetchCurrentUser()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setAuthLoading(false));
  }, []);

  const reconcileInstances = useCallback(async () => {
    if (!user) return;

    try {
      const [healthData, instanceData] = await Promise.all([
        fetchHealth(),
        syncInstances(),
      ]);
      setHealth(healthData);
      setInstances(instanceData);
    } catch {
      setHealth(null);
      setInstances([]);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconcileTimer: ReturnType<typeof setInterval> | null = null;

    function connectStatusSocket() {
      if (cancelled) return;

      socket = new WebSocket(getInstanceStatusWsUrl());

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data as string) as {
            type?: string;
            instances?: Instance[];
            instance?: Instance;
            stats?: Record<string, InstanceStatsEntry>;
            instanceId?: string;
          };

          if (message.type === "snapshot" && Array.isArray(message.instances)) {
            setInstances(message.instances);
            if (message.stats) {
              setInstanceStats(message.stats);
            }
            return;
          }

          if (message.type === "stats" && message.instanceId) {
            const statsEntry = message.stats as InstanceStatsEntry | undefined;
            if (!statsEntry) {
              return;
            }
            setInstanceStats((current) => ({
              ...current,
              [message.instanceId!]: statsEntry,
            }));
            return;
          }

          if (message.type === "update" && message.instance) {
            setInstances((current) =>
              current.map((instance) =>
                instance.id === message.instance!.id ? message.instance! : instance,
              ),
            );
          }
        } catch {
        }
      };

      socket.onclose = () => {
        if (cancelled) return;
        reconnectTimer = setTimeout(connectStatusSocket, 3000);
      };
    }

    async function load() {
      await reconcileInstances();
      if (!cancelled) {
        setLoading(false);
        connectStatusSocket();
      }
    }

    void load();
    reconcileTimer = setInterval(() => void reconcileInstances(), STATUS_RECONCILE_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      if (reconcileTimer) {
        clearInterval(reconcileTimer);
      }
      if (socket) {
        socket.onclose = null;
        socket.onmessage = null;
        socket.close();
      }
    };
  }, [reconcileInstances, user]);

  function openInstance(instanceId: string) {
    setRoute({ level: "instance", instanceId, view: "console" });
  }

  async function handleLogout() {
    await logout();
    setUser(null);
    setInstances([]);
    setInstanceStats({});
    setRoute(DEFAULT_ROUTE);
  }

  async function handleInstanceCreated(instance: Instance) {
    setInstances((current) => [instance, ...current]);
    setShowCreateForm(false);
    openInstance(instance.id);
  }

  if (authLoading) {
    return (
      <div
        style={{
          minHeight: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          color: "var(--color-text-muted)",
        }}
      >
        <BrandLogo size="lg" />
        <span>Loading…</span>
      </div>
    );
  }

  if (!user) {
    return <Login onLogin={setUser} />;
  }

  return (
    <NotificationProvider>
      <AuthenticatedApp
        user={user}
        route={route}
        setRoute={setRoute}
        health={health}
        instances={instances}
        instanceStats={instanceStats}
        loading={loading}
        actionLoading={actionLoading}
        showCreateForm={showCreateForm}
        preference={preference}
        setTheme={setTheme}
        setShowCreateForm={setShowCreateForm}
        setInstances={setInstances}
        setActionLoading={setActionLoading}
        onLogout={() => void handleLogout()}
        onOpenInstance={openInstance}
        onCreateInstanceCreated={(instance) => void handleInstanceCreated(instance)}
      />
    </NotificationProvider>
  );
}

interface AuthenticatedAppProps {
  user: AuthUser;
  route: AppRoute;
  setRoute: (route: AppRoute) => void;
  health: HealthResponse | null;
  instances: Instance[];
  instanceStats: Record<string, InstanceStatsEntry>;
  loading: boolean;
  actionLoading: boolean;
  showCreateForm: boolean;
  preference: ReturnType<typeof useTheme>["preference"];
  setTheme: ReturnType<typeof useTheme>["setTheme"];
  setShowCreateForm: (show: boolean) => void;
  setInstances: React.Dispatch<React.SetStateAction<Instance[]>>;
  setActionLoading: (loading: boolean) => void;
  onLogout: () => void;
  onOpenInstance: (instanceId: string) => void;
  onCreateInstanceCreated: (instance: Instance) => void;
}

function AuthenticatedApp({
  user,
  route,
  setRoute,
  health,
  instances,
  instanceStats,
  loading,
  actionLoading,
  showCreateForm,
  preference,
  setTheme,
  setShowCreateForm,
  setInstances,
  setActionLoading,
  onLogout,
  onOpenInstance,
  onCreateInstanceCreated,
}: AuthenticatedAppProps) {
  const { notifySuccess, notifyError } = useNotifications();
  const instanceNotifications = useInstanceNotifications(instances, {
    notifySuccess,
    notifyError,
  });

  function handleCreateInstanceCreated(instance: Instance) {
    notifySuccess(`${instance.name} created`, "Your new instance is ready.");
    onCreateInstanceCreated(instance);
  }

  const selectedInstance =
    route.level === "instance"
      ? instances.find((instance) => instance.id === route.instanceId)
      : undefined;

  const topBarProps = {
    health,
    username: user.username,
    onLogout,
  };

  function backToInstances() {
    setRoute({ level: "global", view: "instances" });
  }

  async function runInstanceAction(action: "start" | "stop" | "terminate" | "restart") {
    if (route.level !== "instance" || !selectedInstance) return;

    setActionLoading(true);
    const instanceName = selectedInstance.name;

    try {
      const actionFn =
        action === "start"
          ? startInstance
          : action === "stop"
            ? stopInstance
            : action === "terminate"
              ? terminateInstance
              : restartInstance;

      const updated = await actionFn(route.instanceId);
      setInstances((current) =>
        current.map((instance) => (instance.id === updated.id ? updated : instance)),
      );

      if (action === "start") {
        instanceNotifications.notifyStartResult(updated);
      } else if (action === "restart") {
        instanceNotifications.notifyRestartResult(updated);
      } else if (action === "stop") {
        instanceNotifications.notifyStopResult(instanceName);
      } else {
        instanceNotifications.notifyTerminateResult(instanceName);
      }
    } catch (error) {
      instanceNotifications.notifyActionFailed(error);
    } finally {
      setActionLoading(false);
    }
  }

  if (route.level === "instance") {
    if (!selectedInstance) {
      return (
        <GlobalLayout
          topBar={
            <TopBar
              variant="global"
              activeNav="overview"
              showAdminNav={isGlobalAdmin(user)}
              onNavChange={(view) => setRoute({ level: "global", view })}
              {...topBarProps}
            />
          }
        >
          <div style={{ padding: 24, color: "var(--color-text-muted)" }}>
            {loading ? "Loading instance…" : "Instance not found."}
          </div>
        </GlobalLayout>
      );
    }

    return (
      <InstanceLayout
        sidebar={
          <InstanceSidebar
            instance={selectedInstance}
            activeNav={route.view}
            onNavChange={(view) =>
              setRoute({ level: "instance", instanceId: route.instanceId, view })
            }
            onBack={() => backToInstances()}
          />
        }
        topBar={
          <TopBar
            variant="instance"
            instance={selectedInstance}
            actionLoading={actionLoading}
            canControl={canControlInstance(user, route.instanceId)}
            onStart={() => runInstanceAction("start")}
            onStop={() => runInstanceAction("stop")}
            onTerminate={() => runInstanceAction("terminate")}
            onRestart={() => runInstanceAction("restart")}
            {...topBarProps}
          />
        }
      >
        <div className="instance-content">
          <InstanceView
            instance={selectedInstance}
            activeNav={route.view}
            currentUser={user}
            onInstanceUpdated={(updated) =>
              setInstances((current) =>
                current.map((instance) => (instance.id === updated.id ? updated : instance)),
              )
            }
            onInstanceDeleted={() => {
              setInstances((current) =>
                current.filter((instance) => instance.id !== route.instanceId),
              );
              backToInstances();
            }}
            onNavChange={(view) =>
              setRoute({ level: "instance", instanceId: route.instanceId, view })
            }
            onOpenUsers={() => setRoute({ level: "global", view: "users" })}
          />
        </div>
      </InstanceLayout>
    );
  }

  const globalView = route.view;

  const globalContent =
    globalView === "overview" ? (
      <Overview instances={instances} loading={loading} health={health} />
    ) : globalView === "instances" ? (
      showCreateForm ? (
        <CreateInstanceForm
          onCreated={handleCreateInstanceCreated}
          onCancel={() => setShowCreateForm(false)}
        />
      ) : (
        <Instances
          user={user}
          instances={instances}
          instanceStats={instanceStats}
          loading={loading}
          instanceNotifications={instanceNotifications}
          onOpenInstance={onOpenInstance}
          onCreateInstance={() => setShowCreateForm(true)}
          onInstanceUpdated={(updated) =>
            setInstances((current) =>
              current.map((instance) => (instance.id === updated.id ? updated : instance)),
            )
          }
          onInstanceRemoved={(instanceId) =>
            setInstances((current) => current.filter((instance) => instance.id !== instanceId))
          }
          onInstanceAdded={(instance) =>
            setInstances((current) => [instance, ...current])
          }
        />
      )
    ) : globalView === "logs" && isGlobalAdmin(user) ? (
      <ActivityLogs onOpenUsers={() => setRoute({ level: "global", view: "users" })} />
    ) : globalView === "users" && isGlobalAdmin(user) ? (
      <UsersAdmin currentUser={user} />
    ) : globalView === "settings" && isGlobalAdmin(user) ? (
      <SystemSettings themePreference={preference} onThemeChange={setTheme} />
    ) : (
      <div style={{ padding: 24, color: "var(--color-text-muted)" }}>
        Admin access required.
      </div>
    );

  return (
    <GlobalLayout
      topBar={
        <TopBar
          variant="global"
          activeNav={globalView}
          showAdminNav={isGlobalAdmin(user)}
          onNavChange={(view) => {
            setShowCreateForm(false);
            setRoute({ level: "global", view });
          }}
          {...topBarProps}
        />
      }
    >
      {globalContent}
    </GlobalLayout>
  );
}
