"use client";

import * as AccordionPrimitive from "@radix-ui/react-accordion";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { forwardRef, type ReactNode } from "react";

import { ChevronDownIcon } from "../lib/icons";
import { cn } from "../lib/cn";

export interface TabItem {
  content: ReactNode;
  disabled?: boolean;
  label: ReactNode;
  value: string;
}

export interface TabsProps {
  activationMode?: "automatic" | "manual";
  className?: string;
  defaultValue?: string;
  items: readonly TabItem[];
  label: string;
  onValueChange?: (value: string) => void;
  orientation?: "horizontal" | "vertical";
  value?: string;
}

export function Tabs({
  activationMode = "automatic",
  className,
  defaultValue,
  items,
  label,
  onValueChange,
  orientation = "horizontal",
  value,
}: TabsProps) {
  const initial = defaultValue ?? items.find((item) => !item.disabled)?.value;
  return (
    <TabsPrimitive.Root
      activationMode={activationMode}
      className={cn(orientation === "vertical" && "grid gap-5 sm:grid-cols-[auto_1fr]", className)}
      {...(initial === undefined ? {} : { defaultValue: initial })}
      {...(onValueChange === undefined ? {} : { onValueChange })}
      orientation={orientation}
      {...(value === undefined ? {} : { value })}
    >
      <TabsPrimitive.List
        aria-label={label}
        className={cn(
          "flex w-fit gap-1 rounded-[var(--radius-lg)] bg-[var(--color-surface-sunken)] p-1",
          orientation === "horizontal" ? "max-w-full overflow-x-auto" : "flex-col self-start",
        )}
      >
        {items.map((item) => (
          <TabsPrimitive.Trigger
            key={item.value}
            value={item.value}
            {...(item.disabled === undefined ? {} : { disabled: item.disabled })}
            className="min-h-10 rounded-[var(--radius-md)] px-3.5 text-sm font-semibold text-[var(--color-text-muted)] transition-[background-color,color,box-shadow] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] disabled:opacity-45 data-[state=active]:bg-[var(--color-surface)] data-[state=active]:text-[var(--color-text)] data-[state=active]:shadow-[var(--shadow-sm)] motion-reduce:transition-none"
          >
            {item.label}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
      {items.map((item) => (
        <TabsPrimitive.Content
          key={item.value}
          value={item.value}
          className="mt-5 min-w-0 outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] data-[orientation=vertical]:mt-0"
        >
          {item.content}
        </TabsPrimitive.Content>
      ))}
    </TabsPrimitive.Root>
  );
}

export interface SegmentedControlOption {
  disabled?: boolean;
  label: ReactNode;
  value: string;
}

export interface SegmentedControlProps {
  className?: string;
  defaultValue?: string;
  disabled?: boolean;
  label: string;
  name?: string;
  onValueChange?: (value: string) => void;
  options: readonly SegmentedControlOption[];
  value?: string;
}

export const SegmentedControl = forwardRef<HTMLDivElement, SegmentedControlProps>(
  function SegmentedControl(
    { className, defaultValue, disabled, label, name, onValueChange, options, value },
    ref,
  ) {
    return (
      <RadioGroupPrimitive.Root
        ref={ref}
        aria-label={label}
        className={cn(
          "inline-flex max-w-full gap-1 overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-sunken)] p-1",
          className,
        )}
        {...(defaultValue === undefined ? {} : { defaultValue })}
        {...(disabled === undefined ? {} : { disabled })}
        {...(name === undefined ? {} : { name })}
        {...(onValueChange === undefined ? {} : { onValueChange })}
        {...(value === undefined ? {} : { value })}
      >
        {options.map((option) => (
          <RadioGroupPrimitive.Item
            key={option.value}
            value={option.value}
            {...(option.disabled === undefined ? {} : { disabled: option.disabled })}
            className="min-h-10 rounded-[var(--radius-md)] border-0 px-3.5 text-sm font-semibold whitespace-nowrap text-[var(--color-text-muted)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] disabled:opacity-45 data-[state=checked]:bg-[var(--color-surface)] data-[state=checked]:text-[var(--color-text)] data-[state=checked]:shadow-[var(--shadow-sm)]"
          >
            {option.label}
          </RadioGroupPrimitive.Item>
        ))}
      </RadioGroupPrimitive.Root>
    );
  },
);

export interface AccordionItem {
  content: ReactNode;
  disabled?: boolean;
  title: ReactNode;
  value: string;
}

export interface AccordionProps {
  className?: string;
  collapsible?: boolean;
  defaultValue?: string;
  items: readonly AccordionItem[];
  onValueChange?: (value: string) => void;
  value?: string;
}

export function Accordion({
  className,
  collapsible = true,
  defaultValue,
  items,
  onValueChange,
  value,
}: AccordionProps) {
  return (
    <AccordionPrimitive.Root
      type="single"
      collapsible={collapsible}
      {...(defaultValue === undefined ? {} : { defaultValue })}
      {...(onValueChange === undefined ? {} : { onValueChange })}
      {...(value === undefined ? {} : { value })}
      className={cn(
        "overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)]",
        className,
      )}
    >
      {items.map((item) => (
        <AccordionPrimitive.Item
          key={item.value}
          value={item.value}
          {...(item.disabled === undefined ? {} : { disabled: item.disabled })}
          className="border-b border-[var(--color-border)] last:border-b-0"
        >
          <AccordionPrimitive.Header className="m-0">
            <AccordionPrimitive.Trigger className="group flex min-h-12 w-full items-center justify-between gap-4 bg-transparent px-4 py-3 text-left font-semibold text-[var(--color-text)] outline-none hover:bg-[var(--color-surface-sunken)] focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] focus-visible:ring-inset disabled:opacity-45">
              {item.title}
              <ChevronDownIcon className="size-5 shrink-0 transition-transform duration-[var(--duration-base)] group-data-[state=open]:rotate-180 motion-reduce:transition-none" />
            </AccordionPrimitive.Trigger>
          </AccordionPrimitive.Header>
          <AccordionPrimitive.Content className="data-[state=open]:animate-in data-[state=closed]:animate-out overflow-hidden text-[var(--color-text-muted)] motion-reduce:animate-none">
            <div className="px-4 pb-5 leading-relaxed">{item.content}</div>
          </AccordionPrimitive.Content>
        </AccordionPrimitive.Item>
      ))}
    </AccordionPrimitive.Root>
  );
}
