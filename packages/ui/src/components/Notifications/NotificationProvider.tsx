import {
  createContext,
  useContext,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createNotificationStore, type NotificationStore } from "./notificationStore";
import { NotificationStack } from "./NotificationStack";

const NotificationContext = createContext<NotificationStore | null>(null);

interface NotificationProviderProps {
  children: ReactNode;
}

function NotificationStackHost({ store }: { store: NotificationStore }) {
  const notifications = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );

  return <NotificationStack notifications={notifications} onDismiss={store.dismiss} />;
}

export function NotificationProvider({ children }: NotificationProviderProps) {
  const storeRef = useRef<NotificationStore>();
  if (!storeRef.current) {
    storeRef.current = createNotificationStore();
  }
  const store = storeRef.current;

  return (
    <NotificationContext.Provider value={store}>
      {children}
      <NotificationStackHost store={store} />
    </NotificationContext.Provider>
  );
}

export function useNotificationContext() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotificationContext must be used within NotificationProvider");
  }
  return context;
}
