"use client";

import { ListboxSelect } from "@/components/ui/listbox-select";

const STATUS_OPTIONS = [
  { value: "", label: "Tümü" },
  { value: "Created", label: "Oluşturuldu" },
  { value: "Picking", label: "Hazırlanıyor" },
  { value: "Invoiced", label: "Faturalandı" },
  { value: "Shipped", label: "Kargoya verildi" },
  { value: "Delivered", label: "Teslim edildi" },
  { value: "Cancelled", label: "İptal edildi" },
  { value: "UnSupplied", label: "Tedarik edilmedi" },
  { value: "UnPacked", label: "Parçalandı" }
];

export function OrderStatusFilterSelect({ defaultValue }: { defaultValue?: string }) {
  return (
    <ListboxSelect
      id="status"
      name="status"
      defaultValue={defaultValue ?? ""}
      options={STATUS_OPTIONS}
      className="input"
    />
  );
}