import * as React from "react";
import { Plus } from "lucide-react";

import type { VinTarget } from "../../lib/types";
import { isGenericVinTargetMetadata } from "../../lib/vin-patterns";
import { AdminHeader } from "../components/admin-header";
import { Badge } from "../components/badge";
import { Button } from "../components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/card";
import { Input } from "../components/input";

function formatYearWindow(target: VinTarget): string {
  return target.yearFrom === target.yearTo ? String(target.yearFrom) : `${target.yearFrom}-${target.yearTo}`;
}

function formatFilterList(values: string[]): string {
  return values.join("\n");
}

function SourceFlag({
  checked,
  label,
  name,
}: {
  checked: boolean;
  label: string;
  name: string;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-sm text-foreground">
      <input className="size-4 rounded border-border" defaultChecked={checked} name={name} type="checkbox" />
      {label}
    </label>
  );
}

function FilterTextarea({
  defaultValue,
  id,
  label,
  name,
  placeholder,
}: {
  defaultValue: string;
  id: string;
  label: string;
  name: string;
  placeholder: string;
}) {
  return (
    <div className="space-y-2">
      <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground" htmlFor={id}>
        {label}
      </label>
      <textarea
        className="min-h-26 w-full rounded-[18px] border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/30"
        defaultValue={defaultValue}
        id={id}
        name={name}
        placeholder={placeholder}
        spellCheck={false}
      />
      <p className="text-sm text-muted-foreground">One value per line or comma-separated.</p>
    </div>
  );
}

function TargetCard({ target }: { target: VinTarget }) {
  const awaitingCollectorMetadata = isGenericVinTargetMetadata(target);
  const subtitle = awaitingCollectorMetadata
    ? `Year window ${formatYearWindow(target)}. Waiting for collector metadata.`
    : `${target.carType} · ${formatYearWindow(target)}`;

  return (
    <form
      action={`/admin/targets/${target.id}`}
      className="grid gap-4 rounded-3xl border border-border/80 bg-card/90 p-4 shadow-[0_24px_80px_-52px_rgba(15,23,42,0.28)] sm:p-5"
      data-admin-target-form="true"
      data-admin-target-id={target.id}
      method="post"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={target.active ? "success" : "muted"}>{target.active ? "Active" : "Paused"}</Badge>
            {target.enabledCopart ? <Badge variant="outline">Copart</Badge> : null}
            {target.enabledIaai ? <Badge variant="outline">IAAI</Badge> : null}

            <span data-admin-target-colors-badge hidden={!target.rejectColors.length}>
              <Badge variant="outline">
                <span data-admin-target-colors-badge-label>
                  {target.rejectColors.length} color reject{target.rejectColors.length === 1 ? "" : "s"}
                </span>
              </Badge>
            </span>

            <span data-admin-target-locations-badge hidden={!target.rejectLocations.length}>
              <Badge variant="outline">
                <span data-admin-target-locations-badge-label>
                  {target.rejectLocations.length} location reject{target.rejectLocations.length === 1 ? "" : "s"}
                </span>
              </Badge>
            </span>
          </div>

          <div>
            <h2 className="text-base font-semibold tracking-tight">
              {awaitingCollectorMetadata ? "Pending metadata" : target.label}
            </h2>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>

          <p
            className="min-h-5 text-sm text-muted-foreground"
            data-admin-target-save-status
          />
        </div>

        <div className="flex items-center gap-2">
          <Button data-admin-target-save-button size="sm" type="submit" variant="outline">
            Save
          </Button>
          <Button
            formAction={`/admin/targets/${target.id}/remove`}
            formNoValidate
            size="sm"
            type="submit"
            variant="destructive"
          >
            Remove prefix
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="space-y-2">
          <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground" htmlFor={`vin-${target.id}`}>
            VIN family mask
          </label>
          <Input
            defaultValue={target.vinPattern}
            id={`vin-${target.id}`}
            name="vinPattern"
            placeholder="1FTEW1E5XJK"
            spellCheck={false}
          />
          <p className="text-sm text-muted-foreground">
            Use <code>*</code> for wildcard characters.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4 rounded-[20px] border border-border/70 bg-muted/35 px-4 py-3">
          <SourceFlag checked={target.enabledCopart} label="Copart" name="enabledCopart" />
          <SourceFlag checked={target.enabledIaai} label="IAAI" name="enabledIaai" />
          <SourceFlag checked={target.active} label="Target active" name="active" />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <FilterTextarea
          defaultValue={formatFilterList(target.rejectColors)}
          id={`reject-colors-${target.id}`}
          label="Reject colors"
          name="rejectColors"
          placeholder={"white\nblue\ntwo tone"}
        />
        <FilterTextarea
          defaultValue={formatFilterList(target.rejectLocations)}
          id={`reject-locations-${target.id}`}
          label="Reject locations"
          name="rejectLocations"
          placeholder={"california\nca\nwashington dc"}
        />
      </div>
    </form>
  );
}

export function AdminPage({
  email,
  error,
  historyCount,
  targets,
}: AdminPageProps) {
  const activeTargets = targets.filter((target) => target.active).length;

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex max-w-280 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <AdminHeader active="targets" email={email} historyCount={historyCount} />

        <div>
          <h1 className="text-2xl font-semibold tracking-tight">VIN family targets</h1>
          <p className="text-sm text-muted-foreground">
            {targets.length} total · {activeTargets} active
          </p>
        </div>

        {error ? (
          <div className="rounded-3xl border border-amber-500/30 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            {error}
          </div>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Add target</CardTitle>
            <CardDescription>Enter a mask or concrete VIN prefix.</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              action="/admin/targets"
              className="grid gap-4"
              method="post"
            >
              <div className="space-y-2">
                <label
                  className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground"
                  htmlFor="vinPattern"
                >
                  VIN family mask
                </label>
                <Input
                  id="vinPattern"
                  name="vinPattern"
                  placeholder="1FTEW1E5XJK"
                  required
                  spellCheck={false}
                />
                <p className="text-sm text-muted-foreground">
                  Use <code>*</code> for wildcard characters.
                </p>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <FilterTextarea
                  defaultValue=""
                  id="new-reject-colors"
                  label="Reject colors"
                  name="rejectColors"
                  placeholder={"white\nblue\ntwo tone"}
                />
                <FilterTextarea
                  defaultValue=""
                  id="new-reject-locations"
                  label="Reject locations"
                  name="rejectLocations"
                  placeholder={"california\nca\nwashington dc"}
                />
              </div>
              <div className="flex flex-wrap gap-3">
                <input name="enabledCopart" type="hidden" value="on" />
                <input name="enabledIaai" type="hidden" value="on" />
                <input name="active" type="hidden" value="on" />
                <Button className="sm:self-end" type="submit">
                  <Plus className="size-4" />
                  Add target
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <section className="grid gap-4">
          {targets.length ? (
            targets.map((target) => <TargetCard key={target.id} target={target} />)
          ) : (
            <Card>
              <CardContent className="py-8 text-sm text-muted-foreground">
                No targets yet.
              </CardContent>
            </Card>
          )}
        </section>
      </div>
    </main>
  );
}

export interface AdminPageProps {
  email: string;
  error?: string | null;
  historyCount: number;
  targets: VinTarget[];
}
