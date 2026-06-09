import type { AuthUser, Instance } from "@stackpatch/shared";
import type { InstanceNavItem } from "../InstanceSidebar/InstanceSidebar";
import {
  canControlInstance,
  canDeleteInstance,
  canEditInstance,
} from "../../lib/instance-permissions";
import { Console } from "../Console/Console";
import { FileManager } from "../FileManager/FileManager";
import { InstanceSettings } from "../InstanceSettings/InstanceSettings";
import { InstanceEvents } from "../InstanceEvents/InstanceEvents";

interface InstanceViewProps {
  instance: Instance;
  activeNav: InstanceNavItem;
  currentUser: AuthUser;
  onInstanceUpdated: (instance: Instance) => void;
  onInstanceDeleted: () => void;
  onNavChange: (nav: InstanceNavItem) => void;
  onOpenUsers: () => void;
}

export function InstanceView({
  instance,
  activeNav,
  currentUser,
  onInstanceUpdated,
  onInstanceDeleted,
  onNavChange,
  onOpenUsers,
}: InstanceViewProps) {
  const canEdit = canEditInstance(currentUser, instance.id);
  const canDelete = canDeleteInstance(currentUser);
  const canSendInput = canControlInstance(currentUser, instance.id);

  if (activeNav === "console") {
    return (
      <Console
        instance={instance}
        canSendInput={canSendInput}
        onOpenSettings={() => onNavChange("settings")}
        onOpenFiles={() => onNavChange("files")}
        onOpenUsers={onOpenUsers}
      />
    );
  }

  if (activeNav === "settings") {
    return (
      <InstanceSettings
        instance={instance}
        canEdit={canEdit}
        canDelete={canDelete}
        onUpdated={onInstanceUpdated}
        onDeleted={onInstanceDeleted}
      />
    );
  }

  if (activeNav === "events") {
    return <InstanceEvents instance={instance} canEdit={canEdit} />;
  }

  return <FileManager instance={instance} canWrite={canEdit} />;
}
