/** Kategori özelliklerinde zorunlu Menşei attribute'u var mı? */
export function categoryRequiresOrigin(
  defs: Array<{ attributeName: string; isRequired: boolean }>
): boolean {
  return defs.some(
    (d) =>
      d.isRequired &&
      /menşei|mensei|^origin$/i.test(String(d.attributeName ?? "").trim())
  );
}
