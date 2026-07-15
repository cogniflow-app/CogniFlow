"use client";

import * as ContextMenuPrimitive from "@radix-ui/react-context-menu";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import type { ReactElement, ReactNode } from "react";

import { Button, IconButton } from "./button";
import { CheckIcon, CloseIcon, MoreIcon } from "../lib/icons";
import { cn } from "../lib/cn";

const overlayClasses =
  "fixed inset-0 z-[var(--z-modal)] bg-[var(--color-overlay)] backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out motion-reduce:backdrop-blur-none motion-reduce:animate-none";
const dialogClasses =
  "fixed left-1/2 top-1/2 z-[calc(var(--z-modal)+1)] max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-6 text-[var(--color-text)] shadow-[var(--shadow-lg)] data-[state=open]:animate-in data-[state=closed]:animate-out motion-reduce:animate-none sm:max-w-lg";
const floatingContentClasses =
  "z-[var(--z-popover)] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-2 text-[var(--color-text)] shadow-[var(--shadow-md)] data-[state=open]:animate-in data-[state=closed]:animate-out motion-reduce:animate-none";

export interface DialogProps {
  children: ReactNode;
  className?: string;
  defaultOpen?: boolean;
  description?: ReactNode;
  footer?: ReactNode;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  title: ReactNode;
  trigger?: ReactElement;
}

export function Dialog({
  children,
  className,
  defaultOpen,
  description,
  footer,
  onOpenChange,
  open,
  title,
  trigger,
}: DialogProps) {
  return (
    <DialogPrimitive.Root
      {...(defaultOpen === undefined ? {} : { defaultOpen })}
      {...(onOpenChange === undefined ? {} : { onOpenChange })}
      {...(open === undefined ? {} : { open })}
    >
      {trigger && <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>}
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={overlayClasses} />
        <DialogPrimitive.Content className={cn(dialogClasses, className)}>
          <div className="pr-10">
            <DialogPrimitive.Title className="m-0 text-xl font-bold tracking-[-0.015em]">
              {title}
            </DialogPrimitive.Title>
            {description && (
              <DialogPrimitive.Description className="mt-2 mb-0 leading-relaxed text-[var(--color-text-muted)]">
                {description}
              </DialogPrimitive.Description>
            )}
          </div>
          <div className="mt-6">{children}</div>
          {footer && (
            <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-[var(--color-border)] pt-5">
              {footer}
            </div>
          )}
          <DialogPrimitive.Close asChild>
            <IconButton
              label="Close dialog"
              variant="ghost"
              size="sm"
              className="absolute top-4 right-4"
            >
              <CloseIcon />
            </IconButton>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export type SheetSide = "left" | "right" | "top" | "bottom";

const sheetPosition: Record<SheetSide, string> = {
  left: "inset-y-0 left-0 h-dvh w-[min(90vw,28rem)] border-r data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left",
  right:
    "inset-y-0 right-0 h-dvh w-[min(90vw,28rem)] border-l data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right",
  top: "inset-x-0 top-0 max-h-[85dvh] border-b data-[state=open]:slide-in-from-top data-[state=closed]:slide-out-to-top",
  bottom:
    "inset-x-0 bottom-0 max-h-[85dvh] rounded-t-[var(--radius-xl)] border-t data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom",
};

export interface SheetProps extends Omit<DialogProps, "className"> {
  className?: string;
  side?: SheetSide;
}

export function Sheet({
  children,
  className,
  defaultOpen,
  description,
  footer,
  onOpenChange,
  open,
  side = "right",
  title,
  trigger,
}: SheetProps) {
  return (
    <DialogPrimitive.Root
      {...(defaultOpen === undefined ? {} : { defaultOpen })}
      {...(onOpenChange === undefined ? {} : { onOpenChange })}
      {...(open === undefined ? {} : { open })}
    >
      {trigger && <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>}
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={overlayClasses} />
        <DialogPrimitive.Content
          className={cn(
            "data-[state=open]:animate-in data-[state=closed]:animate-out fixed z-[calc(var(--z-modal)+1)] overflow-y-auto border-[var(--color-border)] bg-[var(--color-surface-raised)] p-6 text-[var(--color-text)] shadow-[var(--shadow-lg)] motion-reduce:animate-none",
            sheetPosition[side],
            className,
          )}
        >
          <div className="pr-10">
            <DialogPrimitive.Title className="m-0 text-xl font-bold">{title}</DialogPrimitive.Title>
            {description && (
              <DialogPrimitive.Description className="mt-2 mb-0 leading-relaxed text-[var(--color-text-muted)]">
                {description}
              </DialogPrimitive.Description>
            )}
          </div>
          <div className="mt-6">{children}</div>
          {footer && (
            <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-[var(--color-border)] pt-5">
              {footer}
            </div>
          )}
          <DialogPrimitive.Close asChild>
            <IconButton
              label="Close panel"
              variant="ghost"
              size="sm"
              className="absolute top-4 right-4"
            >
              <CloseIcon />
            </IconButton>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export interface PopoverProps {
  align?: "start" | "center" | "end";
  children: ReactNode;
  className?: string;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  side?: "top" | "right" | "bottom" | "left";
  title?: string;
  trigger: ReactElement;
}

export function Popover({
  align = "center",
  children,
  className,
  defaultOpen,
  onOpenChange,
  open,
  side = "bottom",
  title,
  trigger,
}: PopoverProps) {
  return (
    <PopoverPrimitive.Root
      {...(defaultOpen === undefined ? {} : { defaultOpen })}
      {...(onOpenChange === undefined ? {} : { onOpenChange })}
      {...(open === undefined ? {} : { open })}
    >
      <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align={align}
          side={side}
          sideOffset={8}
          className={cn(floatingContentClasses, "w-72 p-4", className)}
        >
          {title && <h2 className="mt-0 mb-3 text-sm font-bold">{title}</h2>}
          {children}
          <PopoverPrimitive.Arrow className="fill-[var(--color-surface-raised)]" />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

export interface TooltipProps {
  children: ReactElement;
  content: ReactNode;
  delayDuration?: number;
  side?: "top" | "right" | "bottom" | "left";
}

export function Tooltip({ children, content, delayDuration = 350, side = "top" }: TooltipProps) {
  return (
    <TooltipPrimitive.Provider delayDuration={delayDuration} skipDelayDuration={150}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            sideOffset={7}
            className="data-[state=delayed-open]:animate-in z-[var(--z-toast)] max-w-64 rounded-[var(--radius-sm)] bg-[var(--color-text)] px-3 py-2 text-xs leading-relaxed font-medium text-[var(--color-text-inverse)] shadow-[var(--shadow-md)] motion-reduce:animate-none"
          >
            {content}
            <TooltipPrimitive.Arrow className="fill-[var(--color-text)]" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

export type MenuItem =
  | {
      type?: "item";
      label: ReactNode;
      onSelect?: () => void;
      disabled?: boolean;
      destructive?: boolean;
      icon?: ReactNode;
    }
  | {
      type: "checkbox";
      label: ReactNode;
      checked: boolean;
      onCheckedChange: (checked: boolean) => void;
      disabled?: boolean;
    }
  | { type: "label"; label: ReactNode }
  | { type: "separator" };

export interface DropdownProps {
  align?: "start" | "center" | "end";
  items: readonly MenuItem[];
  label?: string;
  trigger?: ReactElement;
}

export function Dropdown({ align = "end", items, label = "Open menu", trigger }: DropdownProps) {
  return (
    <DropdownMenuPrimitive.Root>
      <DropdownMenuPrimitive.Trigger asChild>
        {trigger ?? (
          <IconButton label={label} variant="ghost">
            <MoreIcon />
          </IconButton>
        )}
      </DropdownMenuPrimitive.Trigger>
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          align={align}
          sideOffset={6}
          className={cn(floatingContentClasses, "min-w-48 p-1")}
        >
          {items.map((item, index) => {
            if (item.type === "separator")
              return (
                <DropdownMenuPrimitive.Separator
                  key={index}
                  className="my-1 h-px bg-[var(--color-border)]"
                />
              );
            if (item.type === "label")
              return (
                <DropdownMenuPrimitive.Label
                  key={index}
                  className="px-3 py-2 text-xs font-bold tracking-wider text-[var(--color-text-subtle)] uppercase"
                >
                  {item.label}
                </DropdownMenuPrimitive.Label>
              );
            if (item.type === "checkbox") {
              return (
                <DropdownMenuPrimitive.CheckboxItem
                  key={index}
                  checked={item.checked}
                  {...(item.disabled === undefined ? {} : { disabled: item.disabled })}
                  onCheckedChange={(checked) => item.onCheckedChange(checked === true)}
                  className="relative flex min-h-10 cursor-default items-center rounded-[var(--radius-sm)] py-2 pr-3 pl-9 text-sm outline-none select-none data-[disabled]:opacity-45 data-[highlighted]:bg-[var(--color-surface-sunken)]"
                >
                  <DropdownMenuPrimitive.ItemIndicator className="absolute left-3 size-4">
                    <CheckIcon />
                  </DropdownMenuPrimitive.ItemIndicator>
                  {item.label}
                </DropdownMenuPrimitive.CheckboxItem>
              );
            }
            return (
              <DropdownMenuPrimitive.Item
                key={index}
                {...(item.disabled === undefined ? {} : { disabled: item.disabled })}
                {...(item.onSelect === undefined ? {} : { onSelect: item.onSelect })}
                className={cn(
                  "flex min-h-10 cursor-default items-center gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-sm outline-none select-none data-[disabled]:opacity-45 data-[highlighted]:bg-[var(--color-surface-sunken)]",
                  item.destructive && "text-[var(--color-danger)]",
                )}
              >
                {item.icon && (
                  <span aria-hidden="true" className="size-4">
                    {item.icon}
                  </span>
                )}
                {item.label}
              </DropdownMenuPrimitive.Item>
            );
          })}
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  );
}

export interface ContextMenuProps {
  children: ReactElement;
  items: readonly MenuItem[];
}

export function ContextMenu({ children, items }: ContextMenuProps) {
  return (
    <ContextMenuPrimitive.Root>
      <ContextMenuPrimitive.Trigger asChild>{children}</ContextMenuPrimitive.Trigger>
      <ContextMenuPrimitive.Portal>
        <ContextMenuPrimitive.Content className={cn(floatingContentClasses, "min-w-48 p-1")}>
          {items.map((item, index) => {
            if (item.type === "separator")
              return (
                <ContextMenuPrimitive.Separator
                  key={index}
                  className="my-1 h-px bg-[var(--color-border)]"
                />
              );
            if (item.type === "label")
              return (
                <ContextMenuPrimitive.Label
                  key={index}
                  className="px-3 py-2 text-xs font-bold tracking-wider text-[var(--color-text-subtle)] uppercase"
                >
                  {item.label}
                </ContextMenuPrimitive.Label>
              );
            if (item.type === "checkbox") {
              return (
                <ContextMenuPrimitive.CheckboxItem
                  key={index}
                  checked={item.checked}
                  {...(item.disabled === undefined ? {} : { disabled: item.disabled })}
                  onCheckedChange={(checked) => item.onCheckedChange(checked === true)}
                  className="relative flex min-h-10 cursor-default items-center rounded-[var(--radius-sm)] py-2 pr-3 pl-9 text-sm outline-none select-none data-[disabled]:opacity-45 data-[highlighted]:bg-[var(--color-surface-sunken)]"
                >
                  <ContextMenuPrimitive.ItemIndicator className="absolute left-3 size-4">
                    <CheckIcon />
                  </ContextMenuPrimitive.ItemIndicator>
                  {item.label}
                </ContextMenuPrimitive.CheckboxItem>
              );
            }
            return (
              <ContextMenuPrimitive.Item
                key={index}
                {...(item.disabled === undefined ? {} : { disabled: item.disabled })}
                {...(item.onSelect === undefined ? {} : { onSelect: item.onSelect })}
                className={cn(
                  "flex min-h-10 cursor-default items-center gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-sm outline-none select-none data-[disabled]:opacity-45 data-[highlighted]:bg-[var(--color-surface-sunken)]",
                  item.destructive && "text-[var(--color-danger)]",
                )}
              >
                {item.icon && (
                  <span aria-hidden="true" className="size-4">
                    {item.icon}
                  </span>
                )}
                {item.label}
              </ContextMenuPrimitive.Item>
            );
          })}
        </ContextMenuPrimitive.Content>
      </ContextMenuPrimitive.Portal>
    </ContextMenuPrimitive.Root>
  );
}

export const DialogClose = DialogPrimitive.Close;
export const PopoverClose = PopoverPrimitive.Close;
export const MenuButton = Button;
