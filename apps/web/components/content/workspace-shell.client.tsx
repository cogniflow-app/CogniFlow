"use client";

import { IconButton, MenuIcon, Sheet } from "@lumen/ui";
import type { ReactNode } from "react";
import { useState } from "react";

import { GuardianExitAction } from "@/components/guardian-exit-action.client";
import { SessionAction } from "@/components/session-action.client";
import { WorkspaceAppearanceControls } from "@/components/workspace-appearance-controls.client";

import { WorkspaceNavigation } from "./workspace-navigation.client";

interface WorkspaceShellProps {
  readonly brandName: string;
  readonly children: ReactNode;
  readonly learnerContext: string;
  readonly learnerName: string;
  readonly selfMode: boolean;
}

function WorkspaceIdentity({ context, name }: { readonly context: string; readonly name: string }) {
  return (
    <div className="workspace-identity" aria-label={`Active learner: ${name}`}>
      <span aria-hidden="true" className="workspace-identity__avatar">
        {name.slice(0, 1).toUpperCase()}
      </span>
      <span className="workspace-identity__copy">
        <strong>{name}</strong>
        <small>{context}</small>
      </span>
    </div>
  );
}

function WorkspaceRailContent({
  brandName,
  learnerContext,
  learnerName,
  onNavigate,
  selfMode,
}: Omit<WorkspaceShellProps, "children"> & { readonly onNavigate?: (() => void) | undefined }) {
  return (
    <>
      <div className="workspace-rail__top">
        <a
          className="workspace-home"
          href="/app"
          onClick={onNavigate}
          aria-label="Open your deck library"
        >
          <span aria-hidden="true">{brandName.slice(0, 1)}</span>
          <strong>{brandName}</strong>
        </a>
        <WorkspaceIdentity context={learnerContext} name={learnerName} />
        <WorkspaceNavigation onNavigate={onNavigate} selfMode={selfMode} />
      </div>
      <div className="workspace-rail__actions">
        <WorkspaceAppearanceControls />
        {!selfMode && <GuardianExitAction />}
        <SessionAction>Sign out</SessionAction>
      </div>
    </>
  );
}

export function WorkspaceShell(props: WorkspaceShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="workspace-frame">
      <aside className="workspace-rail workspace-rail--desktop" aria-label="Workspace">
        <WorkspaceRailContent {...props} />
      </aside>
      <header className="workspace-mobile-bar">
        <a className="workspace-mobile-brand" href="/app">
          <span aria-hidden="true">{props.brandName.slice(0, 1)}</span>
          <strong>{props.brandName}</strong>
        </a>
        <Sheet
          className="workspace-drawer"
          onOpenChange={setDrawerOpen}
          open={drawerOpen}
          side="left"
          title="Workspace"
          trigger={
            <IconButton label="Open workspace navigation" variant="ghost">
              <MenuIcon />
            </IconButton>
          }
        >
          <WorkspaceRailContent {...props} onNavigate={() => setDrawerOpen(false)} />
        </Sheet>
      </header>
      <main className="workspace-main" id="main-content" tabIndex={-1}>
        {props.children}
      </main>
    </div>
  );
}
