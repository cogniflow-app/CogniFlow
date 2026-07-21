"use client";

import { Button, PaletteIcon, Popover } from "@lumen/ui";
import { useState, type KeyboardEvent } from "react";

import { AppearanceMenu } from "./appearance-controls.client";

export function WorkspaceAppearanceControls() {
  const [open, setOpen] = useState(false);

  function closeBeforeDrawer(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    setOpen(false);
  }

  return (
    <div className="workspace-appearance">
      <Popover
        align="start"
        className="workspace-appearance__popover"
        onOpenChange={setOpen}
        open={open}
        side="top"
        title="Appearance"
        trigger={
          <Button className="workspace-appearance__trigger" variant="ghost">
            <PaletteIcon aria-hidden="true" className="size-5" />
            Appearance
          </Button>
        }
      >
        <div onKeyDownCapture={closeBeforeDrawer}>
          <AppearanceMenu persistToAccount />
        </div>
      </Popover>
    </div>
  );
}
