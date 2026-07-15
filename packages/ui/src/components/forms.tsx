"use client";

import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import * as SelectPrimitive from "@radix-ui/react-select";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import {
  createContext,
  forwardRef,
  useContext,
  useId,
  type ComponentPropsWithoutRef,
  type FieldsetHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";

import { CheckIcon, ChevronDownIcon, DotIcon } from "../lib/icons";
import { cn } from "../lib/cn";

interface FormFieldContextValue {
  controlId: string;
  descriptionId: string | undefined;
  error: string | undefined;
  errorId: string | undefined;
  required: boolean;
}

const FormFieldContext = createContext<FormFieldContextValue | null>(null);

export interface FormFieldProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  children: ReactNode;
  controlId?: string;
  description?: ReactNode;
  error?: string;
  group?: boolean;
  label: ReactNode;
  required?: boolean;
}

export function FormField({
  children,
  className,
  controlId,
  description,
  error,
  group = false,
  label,
  required = false,
  ...props
}: FormFieldProps) {
  const generatedId = useId();
  const id = controlId ?? `field-${generatedId}`;
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const context: FormFieldContextValue = { controlId: id, descriptionId, error, errorId, required };
  const content = (
    <FormFieldContext.Provider value={context}>
      {group ? (
        <legend className="mb-2 block text-sm font-semibold text-[var(--color-text)]">
          {label}
          {required && (
            <span aria-hidden="true" className="ml-1 text-[var(--color-danger)]">
              *
            </span>
          )}
        </legend>
      ) : (
        <label htmlFor={id} className="mb-2 block text-sm font-semibold text-[var(--color-text)]">
          {label}
          {required && (
            <span aria-hidden="true" className="ml-1 text-[var(--color-danger)]">
              *
            </span>
          )}
        </label>
      )}
      {children}
      {description && (
        <p
          id={descriptionId}
          className="mt-2 mb-0 text-sm leading-relaxed text-[var(--color-text-muted)]"
        >
          {description}
        </p>
      )}
      {error && (
        <p
          id={errorId}
          role="alert"
          className="mt-2 mb-0 text-sm font-medium text-[var(--color-danger)]"
        >
          {error}
        </p>
      )}
    </FormFieldContext.Provider>
  );

  if (group) {
    const fieldsetProps = props as FieldsetHTMLAttributes<HTMLFieldSetElement>;
    return (
      <fieldset className={cn("min-w-0 border-0 p-0", className)} {...fieldsetProps}>
        {content}
      </fieldset>
    );
  }

  return (
    <div className={cn("min-w-0", className)} {...props}>
      {content}
    </div>
  );
}

function mergeDescriptionIds(...ids: Array<string | undefined>): string | undefined {
  const value = ids.filter(Boolean).join(" ");
  return value || undefined;
}

function useFieldControl(
  explicitId: string | undefined,
  explicitDescription: string | undefined,
  explicitInvalid: boolean | "false" | "true" | "grammar" | "spelling" | undefined,
) {
  const field = useContext(FormFieldContext);
  return {
    id: explicitId ?? field?.controlId,
    describedBy: mergeDescriptionIds(explicitDescription, field?.descriptionId, field?.errorId),
    invalid: explicitInvalid ?? (field?.error ? true : undefined),
    required: field?.required,
  };
}

const controlClasses = [
  "min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 text-base text-[var(--color-text)] shadow-[var(--shadow-sm)]",
  "placeholder:text-[var(--color-text-subtle)] transition-[border-color,box-shadow,background-color] duration-[var(--duration-fast)]",
  "hover:border-[var(--color-border-strong)] focus:border-[var(--color-brand)] focus:outline-none focus:ring-2 focus:ring-[var(--color-focus)] focus:ring-offset-1",
  "disabled:cursor-not-allowed disabled:bg-[var(--color-surface-sunken)] disabled:text-[var(--color-text-subtle)] disabled:opacity-70",
  "aria-invalid:border-[var(--color-danger)] aria-invalid:ring-1 aria-invalid:ring-[var(--color-danger)] motion-reduce:transition-none",
].join(" ");

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    "aria-describedby": ariaDescribedBy,
    "aria-invalid": ariaInvalid,
    className,
    error,
    id,
    required,
    ...props
  },
  ref,
) {
  const field = useFieldControl(id, ariaDescribedBy, ariaInvalid ?? error);
  return (
    <input
      ref={ref}
      id={field.id}
      aria-describedby={field.describedBy}
      aria-invalid={field.invalid}
      className={cn(controlClasses, className)}
      required={required ?? field.required}
      {...props}
    />
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  {
    "aria-describedby": ariaDescribedBy,
    "aria-invalid": ariaInvalid,
    className,
    error,
    id,
    required,
    rows = 4,
    ...props
  },
  ref,
) {
  const field = useFieldControl(id, ariaDescribedBy, ariaInvalid ?? error);
  return (
    <textarea
      ref={ref}
      id={field.id}
      aria-describedby={field.describedBy}
      aria-invalid={field.invalid}
      className={cn(controlClasses, "resize-y py-3 leading-relaxed", className)}
      required={required ?? field.required}
      rows={rows}
      {...props}
    />
  );
});

export interface SelectOption {
  disabled?: boolean;
  label: string;
  value: string;
}

export interface SelectProps {
  "aria-label"?: string;
  className?: string;
  contentClassName?: string;
  defaultValue?: string;
  disabled?: boolean;
  error?: boolean;
  id?: string;
  name?: string;
  onValueChange?: (value: string) => void;
  options: readonly SelectOption[];
  placeholder?: string;
  required?: boolean;
  value?: string;
}

export const Select = forwardRef<HTMLButtonElement, SelectProps>(function Select(
  {
    "aria-label": ariaLabel,
    className,
    contentClassName,
    defaultValue,
    disabled,
    error,
    id,
    name,
    onValueChange,
    options,
    placeholder = "Choose an option",
    required,
    value,
  },
  ref,
) {
  const field = useFieldControl(id, undefined, error);
  const resolvedRequired = required ?? field.required;
  return (
    <SelectPrimitive.Root
      {...(defaultValue === undefined ? {} : { defaultValue })}
      {...(disabled === undefined ? {} : { disabled })}
      {...(name === undefined ? {} : { name })}
      {...(onValueChange === undefined ? {} : { onValueChange })}
      {...(resolvedRequired === undefined ? {} : { required: resolvedRequired })}
      {...(value === undefined ? {} : { value })}
    >
      <SelectPrimitive.Trigger
        ref={ref}
        id={field.id}
        aria-label={ariaLabel}
        aria-describedby={field.describedBy}
        aria-invalid={field.invalid}
        className={cn(
          controlClasses,
          "flex items-center justify-between gap-3 text-left",
          className,
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon>
          <ChevronDownIcon className="size-4" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          className={cn(
            "z-[var(--z-popover)] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-1 shadow-[var(--shadow-md)]",
            "data-[state=open]:animate-in data-[state=closed]:animate-out motion-reduce:animate-none",
            contentClassName,
          )}
        >
          <SelectPrimitive.Viewport>
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={option.value}
                {...(option.disabled === undefined ? {} : { disabled: option.disabled })}
                className="relative flex min-h-10 cursor-default items-center rounded-[var(--radius-sm)] py-2 pr-3 pl-9 text-sm outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-45 data-[highlighted]:bg-[var(--color-surface-sunken)]"
              >
                <SelectPrimitive.ItemIndicator className="absolute left-3 grid size-4 place-items-center">
                  <CheckIcon />
                </SelectPrimitive.ItemIndicator>
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
});

export interface CheckboxProps extends Omit<
  ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>,
  "children"
> {
  description?: ReactNode;
  error?: string;
  label: ReactNode;
}

export const Checkbox = forwardRef<HTMLButtonElement, CheckboxProps>(function Checkbox(
  { className, description, error, id, label, ...props },
  ref,
) {
  const generatedId = useId();
  const controlId = id ?? `checkbox-${generatedId}`;
  const descriptionId = description ? `${controlId}-description` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  return (
    <div>
      <div className="flex items-start gap-3">
        <CheckboxPrimitive.Root
          ref={ref}
          id={controlId}
          aria-describedby={mergeDescriptionIds(descriptionId, errorId)}
          aria-invalid={error ? true : undefined}
          className={cn(
            "mt-0.5 grid size-5 shrink-0 place-items-center rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] text-[var(--color-brand-contrast)] shadow-[var(--shadow-sm)] outline-none",
            "focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-[var(--color-brand)] data-[state=checked]:bg-[var(--color-brand)]",
            className,
          )}
          {...props}
        >
          <CheckboxPrimitive.Indicator>
            <CheckIcon className="size-4" />
          </CheckboxPrimitive.Indicator>
        </CheckboxPrimitive.Root>
        <label
          htmlFor={controlId}
          className="cursor-pointer text-sm leading-6 font-medium text-[var(--color-text)]"
        >
          {label}
        </label>
      </div>
      {description && (
        <p id={descriptionId} className="mt-1 mb-0 ml-8 text-sm text-[var(--color-text-muted)]">
          {description}
        </p>
      )}
      {error && (
        <p
          id={errorId}
          role="alert"
          className="mt-1 mb-0 ml-8 text-sm font-medium text-[var(--color-danger)]"
        >
          {error}
        </p>
      )}
    </div>
  );
});

export interface RadioOption {
  description?: string;
  disabled?: boolean;
  label: string;
  value: string;
}

export interface RadioProps extends Omit<
  ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>,
  "children"
> {
  error?: boolean;
  options: readonly RadioOption[];
}

export const Radio = forwardRef<HTMLDivElement, RadioProps>(function Radio(
  { className, error, options, ...props },
  ref,
) {
  const field = useContext(FormFieldContext);
  return (
    <RadioGroupPrimitive.Root
      ref={ref}
      aria-describedby={mergeDescriptionIds(field?.descriptionId, field?.errorId)}
      aria-invalid={error ?? (field?.error ? true : undefined)}
      aria-required={field?.required || undefined}
      className={cn("grid gap-2", className)}
      {...props}
    >
      {options.map((option) => {
        const id = `${field?.controlId ?? "radio"}-${option.value}`;
        return (
          <label
            key={option.value}
            htmlFor={id}
            className="flex min-h-11 cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border border-transparent p-2 hover:bg-[var(--color-surface-sunken)] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--color-focus)]"
          >
            <RadioGroupPrimitive.Item
              id={id}
              value={option.value}
              disabled={option.disabled}
              className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border border-[var(--color-border-strong)] bg-[var(--color-surface)] text-[var(--color-brand)] outline-none disabled:opacity-50 data-[state=checked]:border-[var(--color-brand)]"
            >
              <RadioGroupPrimitive.Indicator>
                <DotIcon className="size-4" />
              </RadioGroupPrimitive.Indicator>
            </RadioGroupPrimitive.Item>
            <span>
              <span className="block text-sm font-semibold text-[var(--color-text)]">
                {option.label}
              </span>
              {option.description && (
                <span className="mt-0.5 block text-sm text-[var(--color-text-muted)]">
                  {option.description}
                </span>
              )}
            </span>
          </label>
        );
      })}
    </RadioGroupPrimitive.Root>
  );
});

export interface SwitchProps extends Omit<
  ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>,
  "children"
> {
  description?: ReactNode;
  label: ReactNode;
}

export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(function Switch(
  { className, description, id, label, ...props },
  ref,
) {
  const generatedId = useId();
  const controlId = id ?? `switch-${generatedId}`;
  const descriptionId = description ? `${controlId}-description` : undefined;
  return (
    <div className="flex min-h-11 items-start justify-between gap-4">
      <div>
        <label
          htmlFor={controlId}
          className="cursor-pointer text-sm leading-6 font-semibold text-[var(--color-text)]"
        >
          {label}
        </label>
        {description && (
          <p
            id={descriptionId}
            className="mt-0.5 mb-0 text-sm leading-relaxed text-[var(--color-text-muted)]"
          >
            {description}
          </p>
        )}
      </div>
      <SwitchPrimitive.Root
        ref={ref}
        id={controlId}
        aria-describedby={descriptionId}
        className={cn(
          "relative mt-0.5 h-7 w-12 shrink-0 rounded-full border border-[var(--color-border-strong)] bg-[var(--color-surface-sunken)] p-0.5 transition-colors outline-none data-[state=checked]:border-[var(--color-brand)] data-[state=checked]:bg-[var(--color-brand)]",
          "focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none",
          className,
        )}
        {...props}
      >
        <SwitchPrimitive.Thumb className="block size-5 rounded-full bg-white shadow-[var(--shadow-sm)] transition-transform data-[state=checked]:translate-x-5 motion-reduce:transition-none" />
      </SwitchPrimitive.Root>
    </div>
  );
});
