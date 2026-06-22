"use client";

import * as React from "react";
import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type ListboxOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

function parseSelectOptions(children: React.ReactNode): ListboxOption[] {
  const options: ListboxOption[] = [];
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    if (child.type === "option") {
      const props = child.props as {
        value?: string;
        disabled?: boolean;
        children?: React.ReactNode;
      };
      const label =
        typeof props.children === "string"
          ? props.children
          : React.Children.toArray(props.children).join("");
      options.push({
        value: props.value ?? "",
        label: label || String(props.value ?? ""),
        disabled: Boolean(props.disabled)
      });
    }
    if (child.type === "optgroup") {
      const groupProps = child.props as { children?: React.ReactNode };
      options.push(...parseSelectOptions(groupProps.children));
    }
  });
  return options;
}

export type ListboxSelectProps = {
  options?: ListboxOption[];
  children?: React.ReactNode;
  value?: string;
  defaultValue?: string;
  onChange?: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  name?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
};

export function ListboxSelect({
  options: optionsProp,
  children,
  value: controlledValue,
  defaultValue = "",
  onChange,
  name,
  id,
  disabled,
  className,
  placeholder
}: ListboxSelectProps) {
  const options = optionsProp ?? parseSelectOptions(children);
  const isControlled = controlledValue !== undefined;
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
  const value = isControlled ? controlledValue : uncontrolledValue;
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", onDocClick);
      return () => document.removeEventListener("mousedown", onDocClick);
    }
  }, [open]);

  const selected = options.find((option) => option.value === value);
  const displayLabel = selected?.label ?? placeholder ?? "Seçin…";

  function selectOption(next: string) {
    if (!isControlled) {
      setUncontrolledValue(next);
    }
    onChange?.({ target: { value: next } } as React.ChangeEvent<HTMLSelectElement>);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative w-full">
      {name ? <input type="hidden" name={name} value={value} readOnly /> : null}
      <button
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={() => !disabled && setOpen((prev) => !prev)}
        className={cn(
          "flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-sm text-slate-100 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/30",
          disabled && "cursor-not-allowed opacity-60",
          className
        )}
      >
        <span className={cn(!selected && placeholder && "text-slate-500")}>
          {displayLabel}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-slate-400 transition-transform",
            open && "rotate-180"
          )}
        />
      </button>
      {open ? (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-white/15 bg-slate-900 py-1 shadow-xl"
        >
          {options.map((option) => (
            <li key={`${option.value}__${option.label}`} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={option.value === value}
                disabled={option.disabled}
                onClick={() => selectOption(option.value)}
                className={cn(
                  "flex w-full items-center justify-between px-3 py-2 text-left text-sm text-slate-100 transition hover:bg-indigo-500/20",
                  option.value === value && "bg-indigo-500/15 font-medium",
                  option.disabled && "cursor-not-allowed opacity-50"
                )}
              >
                <span>{option.label}</span>
                {option.value === value ? (
                  <Check className="h-4 w-4 text-indigo-300" />
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
