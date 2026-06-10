import type { ApplicationType } from "@stackpatch/shared";
import { getJavaRuntimeResource } from "@stackpatch/shared";
import form from "../../styles/consoleForm.module.css";
import { ConsoleCard } from "../ConsoleCard";

interface JavaRuntimeCardProps {
  applicationType: ApplicationType;
}

export function JavaRuntimeCard({ applicationType }: JavaRuntimeCardProps) {
  const resource = getJavaRuntimeResource(applicationType);
  if (!resource) {
    return null;
  }

  return (
    <ConsoleCard tabLabel="java runtime" hint={resource.hint}>
      <div className={form.actions}>
        <a
          href={resource.url}
          target="_blank"
          rel="noopener noreferrer"
          className={form.actionPrimary}
        >
          {resource.title}
        </a>
      </div>
    </ConsoleCard>
  );
}
