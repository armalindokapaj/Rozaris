"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  ExternalLink,
  Link2,
  Link2Off,
  Pause,
  Play,
  RefreshCw,
  Table,
} from "lucide-react";
import { useInventoryConnector, type SyncOutcome } from "@/hooks/useInventoryConnector";
import { useProjectUnits } from "@/hooks/useProjectUnits";
import { useT } from "@/lib/i18n/useT";
import { buildSheetTemplateCsv, sheetEditUrl } from "@/lib/integrations/googleSheets";
import { FIELD_HEADER_ALIASES, FIELD_LABELS, SYNCABLE_FIELDS, type SyncableField } from "@/lib/integrations/normalization";
import type { Project } from "@/lib/types";
import { Badge, Btn, EmptyState, ErrorNote, Panel, SectionHeader, inputClass } from "./kit";

/**
 * Project Manager → "Sheet Sync". The developer keeps their inventory in
 * their own Google Sheet; this points the project at it and pulls
 * AREA / PRICE / BEDROOMS / BATHROOMS / FLOOR / STATUS across onto the
 * real `Unit` rows, matched by unit code.
 *
 * The whole engine (`InventoryConnector` + `InventorySyncRun` +
 * `runInventorySync`) already existed from Multi-Channel Publishing Phase
 * 8 with no UI whatsoever — nothing in the console could create a
 * connector, so nothing could ever sync. This is that missing surface,
 * plus the two things the API needed to be usable by a human: a pasted
 * LINK instead of a bare sheet id, and a dry run so "41 apartments are
 * about to be repriced" is readable before it happens rather than
 * afterwards in the audit log.
 *
 * Sync is admin-triggered, not scheduled — this app has no cron, and
 * pretending otherwise ("syncs every 15 minutes") would be a claim
 * nothing here can keep. Documented as such in the panel itself.
 */
export function ProjectSheetSyncSection({ project }: { project: Project }) {
  const { t } = useT();
  const { connector, runs, loading, busy, connect, update, disconnect, sync } = useInventoryConnector(project.id);
  const { units: liveUnits, refresh: refreshUnits } = useProjectUnits(project.id);
  const units = liveUnits ?? project.units;

  const [linkInput, setLinkInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<SyncOutcome | null>(null);
  /** Headers from a sheet that downloaded fine but couldn't be read as
   * inventory (no unit-code column). Without these the error's own advice
   * — "map one of the columns below" — would point at nothing. */
  const [unmappedHeaders, setUnmappedHeaders] = useState<string[] | null>(null);
  const [editingLink, setEditingLink] = useState(false);

  const gid = connector?.configuration?.gid ?? "0";
  const sheetUrl = connector?.externalResourceId ? sheetEditUrl(connector.externalResourceId, gid) : null;

  function downloadTemplate() {
    const csv = buildSheetTemplateCsv(
      units.map((u) => ({
        code: u.code,
        area: u.area,
        price: u.price,
        bedrooms: u.bedrooms,
        bathrooms: u.bathrooms,
        floor: u.floor,
        status: u.status,
      }))
    );
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.slug}-inventory-sheet.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const result = await connect(linkInput);
    if (result.ok) setLinkInput("");
    else setError(result.error ?? null);
  }

  async function handleRelink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const result = await update({ sheetUrl: linkInput });
    if (result.ok) {
      setLinkInput("");
      setEditingLink(false);
      setOutcome(null);
      setUnmappedHeaders(null);
    } else setError(result.error ?? null);
  }

  async function run(dryRun: boolean) {
    setError(null);
    setOutcome(null);
    setUnmappedHeaders(null);
    const result = await sync(dryRun);
    if (!result.ok) {
      setError(result.error ?? null);
      const headers = (result.data as { sheet?: { headers?: string[] } } | undefined)?.sheet?.headers;
      if (headers?.length) setUnmappedHeaders(headers);
      return;
    }
    setOutcome(result.outcome ?? null);
    // A real run just rewrote units this page is also showing elsewhere.
    if (!dryRun) refreshUnits();
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title={t("projectManager.sheetSyncTitle")}
        description={t("projectManager.sheetSyncDescription")}
        actions={
          <Btn onClick={downloadTemplate} disabled={units.length === 0}>
            <Download className="h-3.5 w-3.5" />
            {t("projectManager.downloadStarterSheet")}
          </Btn>
        }
      />

      {error && <ErrorNote>{error}</ErrorNote>}

      {loading ? (
        <Panel>
          <p className="py-6 text-center text-xs text-neutral-400">{t("admin.loading")}</p>
        </Panel>
      ) : !connector ? (
        <Panel title={t("projectManager.connectSheetTitle")} description={t("projectManager.connectSheetDescription")}>
          <form onSubmit={handleConnect} className="flex flex-wrap gap-1.5">
            <input
              value={linkInput}
              onChange={(e) => setLinkInput(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/…"
              className={`${inputClass} min-w-[260px] flex-1`}
              spellCheck={false}
            />
            <Btn type="submit" variant="primary" disabled={busy || !linkInput.trim()} className="shrink-0">
              <Link2 className="h-3.5 w-3.5" />
              {busy ? t("projectManager.connecting") : t("projectManager.connectSheet")}
            </Btn>
          </form>
          <SheetInstructions />
        </Panel>
      ) : (
        <>
          <Panel
            title={t("projectManager.linkedSheetTitle")}
            actions={
              <>
                <Btn
                  onClick={() => update({ status: connector.status === "paused" ? "active" : "paused" })}
                  disabled={busy}
                >
                  {connector.status === "paused" ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                  {connector.status === "paused" ? t("projectManager.resumeSync") : t("projectManager.pauseSync")}
                </Btn>
                <Btn
                  variant="danger"
                  disabled={busy}
                  onClick={() => {
                    if (confirm(t("projectManager.confirmDisconnect"))) void disconnect();
                  }}
                >
                  <Link2Off className="h-3.5 w-3.5" />
                  {t("projectManager.disconnect")}
                </Btn>
              </>
            }
          >
            <div className="flex flex-wrap items-center gap-3">
              <Badge
                tone={connector.status === "active" ? "positive" : connector.status === "paused" ? "neutral" : "danger"}
              >
                {t(`projectManager.connectorStatus.${connector.status}`)}
              </Badge>
              {sheetUrl && (
                <a
                  href={sheetUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  {t("projectManager.openSheet")}
                </a>
              )}
              <span className="text-xs text-neutral-500">
                {connector.lastSuccessfulSyncAt
                  ? t("projectManager.lastSynced", {
                      when: new Date(connector.lastSuccessfulSyncAt).toLocaleString(),
                    })
                  : t("projectManager.neverSynced")}
              </span>
              <button
                onClick={() => {
                  setEditingLink((v) => !v);
                  setLinkInput(sheetUrl ?? "");
                }}
                className="text-xs font-semibold text-neutral-500 hover:text-neutral-900 hover:underline"
              >
                {t("projectManager.changeSheet")}
              </button>
            </div>

            {editingLink && (
              <form onSubmit={handleRelink} className="mt-3 flex flex-wrap gap-1.5">
                <input
                  value={linkInput}
                  onChange={(e) => setLinkInput(e.target.value)}
                  className={`${inputClass} min-w-[260px] flex-1`}
                  spellCheck={false}
                />
                <Btn type="submit" variant="primary" disabled={busy || !linkInput.trim()} className="shrink-0">
                  {t("common.save")}
                </Btn>
                <Btn type="button" onClick={() => setEditingLink(false)} className="shrink-0">
                  {t("common.cancel")}
                </Btn>
              </form>
            )}

            <div className="mt-4 flex flex-wrap gap-1.5 border-t border-neutral-100 pt-4">
              <Btn onClick={() => void run(true)} disabled={busy}>
                <Table className="h-3.5 w-3.5" />
                {busy ? t("projectManager.reading") : t("projectManager.previewChanges")}
              </Btn>
              <Btn variant="primary" onClick={() => void run(false)} disabled={busy || connector.status === "paused"}>
                <RefreshCw className="h-3.5 w-3.5" />
                {busy ? t("projectManager.syncing") : t("projectManager.syncNow")}
              </Btn>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-neutral-400">{t("projectManager.syncManualNote")}</p>
          </Panel>

          {unmappedHeaders && (
            <Panel title={t("projectManager.columnMappingTitle")} description={t("projectManager.columnMappingDescription")}>
              <ColumnMappingEditor
                headers={unmappedHeaders}
                initial={connector.columnMapping ?? {}}
                busy={busy}
                onSave={async (mapping) => {
                  const result = await update({ columnMapping: mapping });
                  if (!result.ok) setError(result.error ?? null);
                  else {
                    setUnmappedHeaders(null);
                    setError(null);
                    await run(true);
                  }
                }}
              />
            </Panel>
          )}

          {outcome && (
            <SyncOutcomePanel
              outcome={outcome}
              onApply={() => void run(false)}
              busy={busy}
              onSaveMapping={async (mapping) => {
                const result = await update({ columnMapping: mapping });
                if (!result.ok) setError(result.error ?? null);
                else setOutcome(null);
              }}
              currentMapping={connector.columnMapping}
            />
          )}

          <Panel title={t("projectManager.syncHistoryTitle")}>
            {runs.length === 0 ? (
              <EmptyState>{t("projectManager.noSyncRuns")}</EmptyState>
            ) : (
              <div className="overflow-x-auto scroll-thin">
                <table className="w-full min-w-[540px] text-xs">
                  <thead className="border-b border-neutral-100">
                    <tr>
                      <th className="px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                        {t("projectManager.runWhen")}
                      </th>
                      <th className="px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                        {t("projectManager.runStatus")}
                      </th>
                      <th className="px-2 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                        {t("projectManager.runRead")}
                      </th>
                      <th className="px-2 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                        {t("projectManager.runChanged")}
                      </th>
                      <th className="px-2 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                        {t("projectManager.runRejected")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {runs.map((r) => (
                      <tr key={r.id} className="align-top">
                        <td className="px-2 py-2 text-neutral-600">{new Date(r.startedAt).toLocaleString()}</td>
                        <td className="px-2 py-2">
                          <Badge tone={r.status === "success" ? "positive" : r.status === "partial" ? "warning" : "danger"}>
                            {t(`projectManager.runStatusValue.${r.status}`)}
                          </Badge>
                          {r.errors && r.errors.length > 0 && (
                            <ul className="mt-1.5 space-y-0.5 text-[11px] text-neutral-500">
                              {r.errors.slice(0, 4).map((e, i) => (
                                <li key={i}>
                                  <span className="font-semibold">{e.code}</span> — {e.reason}
                                </li>
                              ))}
                              {r.errors.length > 4 && (
                                <li className="text-neutral-400">
                                  {t("projectManager.andMoreErrors", { count: r.errors.length - 4 })}
                                </li>
                              )}
                            </ul>
                          )}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-neutral-600">{r.rowsRead}</td>
                        <td className="px-2 py-2 text-right font-semibold tabular-nums text-neutral-900">{r.rowsChanged}</td>
                        <td className="px-2 py-2 text-right tabular-nums text-neutral-600">{r.rowsRejected}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}

/** What a dry run found, and the mapping table that makes an unrecognised
 * column fixable rather than mysterious. */
function SyncOutcomePanel({
  outcome,
  busy,
  onApply,
  onSaveMapping,
  currentMapping,
}: {
  outcome: SyncOutcome;
  busy: boolean;
  onApply: () => void;
  onSaveMapping: (mapping: Record<string, SyncableField>) => void;
  currentMapping: Record<string, SyncableField> | null;
}) {
  const { t } = useT();

  return (
    <Panel
      title={outcome.dryRun ? t("projectManager.previewResultTitle") : t("projectManager.syncResultTitle")}
      actions={
        outcome.dryRun && outcome.rowsChanged > 0 ? (
          <Btn variant="primary" onClick={onApply} disabled={busy}>
            <CheckCircle2 className="h-3.5 w-3.5" />
            {t("projectManager.applyChanges", { count: outcome.rowsChanged })}
          </Btn>
        ) : undefined
      }
    >
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SmallStat label={t("projectManager.runRead")} value={outcome.rowsRead} />
        <SmallStat label={t("projectManager.runChanged")} value={outcome.rowsChanged} tone="brand" />
        <SmallStat label={t("projectManager.runUnchanged")} value={outcome.rowsUnchanged} />
        <SmallStat label={t("projectManager.runRejected")} value={outcome.rowsRejected} tone={outcome.rowsRejected > 0 ? "danger" : undefined} />
      </div>

      {outcome.changes.length > 0 && (
        <div className="mb-4 overflow-x-auto scroll-thin">
          <table className="w-full min-w-[440px] text-xs">
            <thead className="border-b border-neutral-100">
              <tr>
                <th className="px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                  {t("projectManager.colCode")}
                </th>
                <th className="px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                  {t("projectManager.diffChanges")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {outcome.changes.map((row) => (
                <tr key={row.unitId}>
                  <td className="px-2 py-1.5 font-semibold text-neutral-900">{row.code}</td>
                  <td className="px-2 py-1.5">
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {row.changes.map((c) => (
                        <span key={c.field} className="text-neutral-600">
                          <span className="text-neutral-400">{FIELD_LABELS[c.field as SyncableField] ?? c.field}: </span>
                          <span className="line-through decoration-neutral-300">{String(c.from ?? "—")}</span>
                          <span className="mx-1 text-neutral-400">→</span>
                          <span className="font-semibold text-neutral-900">{String(c.to)}</span>
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {outcome.errors.length > 0 && (
        <div className="mb-4 rounded-control border border-amber-200 bg-amber-50 p-3">
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-amber-800">
            <AlertTriangle className="h-3.5 w-3.5" />
            {t("projectManager.rejectedRowsTitle", { count: outcome.errors.length })}
          </p>
          <ul className="space-y-0.5 text-[11px] text-amber-800">
            {outcome.errors.slice(0, 12).map((e, i) => (
              <li key={i}>
                <span className="font-semibold">{e.code}</span> — {e.reason}
              </li>
            ))}
            {outcome.errors.length > 12 && (
              <li className="text-amber-600">{t("projectManager.andMoreErrors", { count: outcome.errors.length - 12 })}</li>
            )}
          </ul>
        </div>
      )}

      {outcome.changes.length === 0 && outcome.errors.length === 0 && (
        <EmptyState>{t("projectManager.nothingToChange")}</EmptyState>
      )}

      {outcome.sheet && (
        <div className="border-t border-neutral-100 pt-4">
          <h4 className="mb-1 text-xs font-semibold text-neutral-900">{t("projectManager.columnMappingTitle")}</h4>
          <p className="mb-3 text-[11px] leading-relaxed text-neutral-500">{t("projectManager.columnMappingDescription")}</p>
          <ColumnMappingEditor
            headers={outcome.sheet.headers.filter(Boolean)}
            initial={{ ...outcome.sheet.recognized, ...(currentMapping ?? {}) }}
            busy={busy}
            onSave={onSaveMapping}
          />
        </div>
      )}
    </Panel>
  );
}

/** header -> Unit field picker. Shared by the successful-preview panel and
 * the "this sheet has no unit column" failure path, which is the case that
 * needs it MOST. */
function ColumnMappingEditor({
  headers,
  initial,
  busy,
  onSave,
}: {
  headers: string[];
  initial: Record<string, SyncableField>;
  busy: boolean;
  onSave: (mapping: Record<string, SyncableField>) => void;
}) {
  const { t } = useT();
  const [mapping, setMapping] = useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {};
    for (const header of headers) seed[header] = initial[header] ?? "";
    return seed;
  });
  const changed = headers.some((header) => (mapping[header] ?? "") !== (initial[header] ?? ""));

  return (
    <>
      <div className="space-y-1.5">
        {headers.map((header) => (
          <div key={header} className="flex items-center gap-2">
            <span className="w-40 shrink-0 truncate text-xs font-medium text-neutral-700" title={header}>
              {header}
            </span>
            <span className="text-neutral-300">→</span>
            <select
              value={mapping[header] ?? ""}
              onChange={(e) => setMapping({ ...mapping, [header]: e.target.value })}
              className="rounded-control border border-neutral-200 px-2 py-1 text-xs"
            >
              <option value="">{t("projectManager.columnIgnored")}</option>
              {SYNCABLE_FIELDS.map((f) => (
                <option key={f} value={f}>
                  {FIELD_LABELS[f]}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      {changed && (
        <Btn
          variant="primary"
          className="mt-3"
          disabled={busy}
          onClick={() => {
            const cleaned: Record<string, SyncableField> = {};
            for (const [header, field] of Object.entries(mapping)) {
              if (field) cleaned[header] = field as SyncableField;
            }
            onSave(cleaned);
          }}
        >
          {t("projectManager.saveMapping")}
        </Btn>
      )}
    </>
  );
}

function SmallStat({ label, value, tone }: { label: string; value: number; tone?: "brand" | "danger" }) {
  return (
    <div className="rounded-control border border-neutral-200 px-3 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-400">{label}</p>
      <p
        className={`text-lg font-bold tabular-nums ${
          tone === "brand" ? "text-brand-600" : tone === "danger" ? "text-danger" : "text-neutral-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

/** The four steps a developer has to actually perform. Written out rather
 * than linked, because "share it correctly" is the single failure this
 * connector hits and the fix is one specific Google menu. */
function SheetInstructions() {
  const { t } = useT();
  return (
    <div className="mt-4 space-y-2 rounded-control border border-neutral-200 bg-neutral-50 p-3">
      <p className="text-xs font-semibold text-neutral-900">{t("projectManager.howToTitle")}</p>
      <ol className="ml-4 list-decimal space-y-1 text-[11px] leading-relaxed text-neutral-600">
        <li>{t("projectManager.howToStep1")}</li>
        <li>{t("projectManager.howToStep2")}</li>
        <li>{t("projectManager.howToStep3")}</li>
        <li>{t("projectManager.howToStep4")}</li>
      </ol>
      <div className="flex flex-wrap gap-1">
        {SYNCABLE_FIELDS.map((f) => (
          <code key={f} className="rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold text-neutral-700 ring-1 ring-neutral-200">
            {FIELD_HEADER_ALIASES[f][0]}
          </code>
        ))}
      </div>
      <p className="text-[11px] text-neutral-500">{t("projectManager.howToColumnsNote")}</p>
    </div>
  );
}
