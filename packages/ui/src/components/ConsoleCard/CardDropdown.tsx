import type { ComponentProps } from "react";
import { Dropdown } from "../Dropdown/Dropdown";
import { useConsoleCardMenuOpen } from "./ConsoleCard";

export function CardDropdown(props: ComponentProps<typeof Dropdown>) {
  const notifyCardMenuOpen = useConsoleCardMenuOpen();
  const { onOpenChange, ...rest } = props;

  return (
    <Dropdown
      {...rest}
      onOpenChange={(open) => {
        notifyCardMenuOpen(open);
        onOpenChange?.(open);
      }}
    />
  );
}
