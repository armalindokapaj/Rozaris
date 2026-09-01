"use client";

import { useT } from "@/lib/i18n/useT";

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function BeforeAfterDiff({
  before,
  after,
}: {
  before: Record<string, unknown> | null | undefined;
  after: Record<string, unknown> | null | undefined;
}) {
  const { t } = useT();
  const beforeObj = before ?? {};
  const afterObj = after ?? {};
  const keys = Array.from(new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)]))
    .filter((k) => JSON.stringify(beforeObj[k]) !== JSON.stringify(afterObj[k]))
    .sort();

  if (keys.length === 0) {
    return <p className="text-xs text-neutral-400">{t("admin.superAdmin.diffNoChanges")}</p>;
  }

  return (
    <div className="overflow-hidden rounded-control border border-neutral-200">
      <table className="w-full text-xs">
        <thead className="bg-neutral-50 text-left text-neutral-500">
          <tr>
            <th className="px-3 py-1.5 font-medium">{t("admin.superAdmin.diffField")}</th>
            <th className="px-3 py-1.5 font-medium">{t("admin.superAdmin.diffBefore")}</th>
            <th className="px-3 py-1.5 font-medium">{t("admin.superAdmin.diffAfter")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {keys.map((key) => (
            <tr key={key}>
              <td className="whitespace-nowrap px-3 py-1.5 font-medium text-neutral-700">{key}</td>
              <td className="max-w-xs truncate px-3 py-1.5 text-red-600">{formatValue(beforeObj[key])}</td>
              <td className="max-w-xs truncate px-3 py-1.5 text-green-700">{formatValue(afterObj[key])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
