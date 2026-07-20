"use client";

import { Button, PaletteIcon, Popover } from "@lumen/ui";

import { AppearanceMenu } from "./appearance-controls.client";

export function WorkspaceAppearanceControls() {
  return (
    <div className="workspace-appearance">
      <Popover
        align="start"
        className="workspace-appearance__popover"
        side="top"
        title="Appearance"
        trigger={
          <Button className="workspace-appearance__trigger" variant="ghost">
            <PaletteIcon aria-hidden="true" className="size-5" />
            Appearance
          </Button>
        }
      >
        <AppearanceMenu persistToAccount />
      </Popover>
    </div>
  );
}
