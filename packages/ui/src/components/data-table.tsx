"use client";

import {
  forwardRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
  type TableHTMLAttributes,
  type TdHTMLAttributes,
  type ThHTMLAttributes,
} from "react";

import { SortIcon } from "../lib/icons";
import { cn } from "../lib/cn";

export interface DataTableProps extends TableHTMLAttributes<HTMLTableElement> {
  containerClassName?: string;
}

export const DataTable = forwardRef<HTMLTableElement, DataTableProps>(function DataTable(
  { className, containerClassName, ...props },
  ref,
) {
  return (
    <div
      className={cn(
        "w-full overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)]",
        containerClassName,
      )}
      tabIndex={0}
      role="region"
      aria-label="Scrollable data table"
    >
      <table
        ref={ref}
        className={cn("w-full border-collapse text-left text-sm", className)}
        {...props}
      />
    </div>
  );
});

export const DataTableHeader = forwardRef<
  HTMLTableSectionElement,
  HTMLAttributes<HTMLTableSectionElement>
>(function DataTableHeader({ className, ...props }, ref) {
  return (
    <thead
      ref={ref}
      className={cn("bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)]", className)}
      {...props}
    />
  );
});

export const DataTableBody = forwardRef<
  HTMLTableSectionElement,
  HTMLAttributes<HTMLTableSectionElement>
>(function DataTableBody({ className, ...props }, ref) {
  return (
    <tbody
      ref={ref}
      className={cn("divide-y divide-[var(--color-border)]", className)}
      {...props}
    />
  );
});

export const DataTableFooter = forwardRef<
  HTMLTableSectionElement,
  HTMLAttributes<HTMLTableSectionElement>
>(function DataTableFooter({ className, ...props }, ref) {
  return (
    <tfoot
      ref={ref}
      className={cn(
        "border-t border-[var(--color-border-strong)] bg-[var(--color-surface-sunken)] font-semibold",
        className,
      )}
      {...props}
    />
  );
});

export const DataTableRow = forwardRef<HTMLTableRowElement, HTMLAttributes<HTMLTableRowElement>>(
  function DataTableRow({ className, ...props }, ref) {
    return (
      <tr
        ref={ref}
        className={cn(
          "transition-colors hover:bg-[color-mix(in_srgb,var(--color-brand)_4%,transparent)] data-[selected=true]:bg-[color-mix(in_srgb,var(--color-brand)_8%,transparent)] motion-reduce:transition-none",
          className,
        )}
        {...props}
      />
    );
  },
);

export const DataTableHead = forwardRef<
  HTMLTableCellElement,
  ThHTMLAttributes<HTMLTableCellElement>
>(function DataTableHead({ className, scope = "col", ...props }, ref) {
  return (
    <th
      ref={ref}
      scope={scope}
      className={cn(
        "h-11 px-4 py-2 text-xs font-bold tracking-[0.08em] whitespace-nowrap uppercase",
        className,
      )}
      {...props}
    />
  );
});

export const DataTableCell = forwardRef<
  HTMLTableCellElement,
  TdHTMLAttributes<HTMLTableCellElement>
>(function DataTableCell({ className, ...props }, ref) {
  return (
    <td
      ref={ref}
      className={cn("px-4 py-3 align-middle text-[var(--color-text)]", className)}
      {...props}
    />
  );
});

export interface DataTableCaptionProps extends HTMLAttributes<HTMLTableCaptionElement> {
  position?: "top" | "bottom";
  visuallyHidden?: boolean;
}

export const DataTableCaption = forwardRef<HTMLTableCaptionElement, DataTableCaptionProps>(
  function DataTableCaption(
    { className, position = "bottom", visuallyHidden = false, ...props },
    ref,
  ) {
    return (
      <caption
        ref={ref}
        className={cn(
          "px-4 py-3 text-left text-sm text-[var(--color-text-muted)]",
          position === "top" ? "caption-top" : "caption-bottom",
          visuallyHidden && "sr-only",
          className,
        )}
        {...props}
      />
    );
  },
);

export type SortDirection = "ascending" | "descending" | "none";

export interface DataTableSortButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  direction?: SortDirection;
  label: string;
}

export const DataTableSortButton = forwardRef<HTMLButtonElement, DataTableSortButtonProps>(
  function DataTableSortButton(
    { children, className, direction = "none", label, type = "button", ...props },
    ref,
  ) {
    const next = direction === "ascending" ? "descending" : "ascending";
    return (
      <button
        ref={ref}
        type={type}
        aria-label={`${label}, ${direction === "none" ? "not sorted" : `sorted ${direction}`}. Activate to sort ${next}.`}
        className={cn(
          "-mx-2 inline-flex min-h-10 items-center gap-2 rounded-[var(--radius-sm)] bg-transparent px-2 text-inherit outline-none hover:bg-[var(--color-surface)] focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] disabled:opacity-45",
          className,
        )}
        {...props}
      >
        <span>{children ?? label}</span>
        <SortIcon
          aria-hidden="true"
          className={cn(
            "size-4",
            direction === "ascending" && "rotate-0",
            direction === "descending" && "rotate-180",
          )}
        />
      </button>
    );
  },
);

export interface DataTableEmptyProps extends TdHTMLAttributes<HTMLTableCellElement> {
  colSpan: number;
  message?: ReactNode;
}

export function DataTableEmpty({
  className,
  colSpan,
  message = "No rows match this view.",
  ...props
}: DataTableEmptyProps) {
  return (
    <DataTableCell
      colSpan={colSpan}
      className={cn("h-32 text-center text-[var(--color-text-muted)]", className)}
      {...props}
    >
      {message}
    </DataTableCell>
  );
}

export const Table = DataTable;
export const TableHeader = DataTableHeader;
export const TableBody = DataTableBody;
export const TableFooter = DataTableFooter;
export const TableRow = DataTableRow;
export const TableHead = DataTableHead;
export const TableCell = DataTableCell;
export const TableCaption = DataTableCaption;
