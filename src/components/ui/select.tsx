"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { ListboxSelect } from "@/components/ui/listbox-select";

export type SelectProps = Omit<
  React.SelectHTMLAttributes<HTMLSelectElement>,
  "ref"
> & {
  ref?: React.Ref<HTMLSelectElement>;
};

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, value, defaultValue, onChange, name, id, disabled, ...rest }, ref) => {
    void ref;
    void rest;
    return (
      <ListboxSelect
        id={id}
        name={name}
        value={value !== undefined ? String(value) : undefined}
        defaultValue={defaultValue !== undefined ? String(defaultValue) : undefined}
        onChange={onChange}
        disabled={disabled}
        className={cn("input", className)}
      >
        {children}
      </ListboxSelect>
    );
  }
);
Select.displayName = "Select";

export { Select };
