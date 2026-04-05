import * as React from "react";
import { ArrowLeft, Plus } from "lucide-react";

import type { VinTarget } from "../../lib/types";
import { isGenericVinTargetMetadata } from "../../lib/vin-patterns";
import { Badge } from "../components/badge";
import { Button } from "../components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/card";
import { Input } from "../components/input";

function formatYearWindow(target: VinTarget): string {
  return target.yearFrom === target.yearTo ? String(target.yearFrom) : `${target.yearFrom}-${target.yearTo}`;
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

function TargetCard({ target }: { target: VinTarget }) {
  const awaitingCollectorMetadata = isGenericVinTargetMetadata(target);
  const subtitle = awaitingCollectorMetadata
    ? `Year window ${formatYearWindow(target)}. Waiting for collector metadata.`
    : `${target.carType} · ${formatYearWindow(target)}`;

  return (
    <form
      action={`/admin/targets/${target.id}`}
      className="grid gap-4 rounded-[24px] border border-border/80 bg-card/90 p-4 shadow-[0_24px_80px_-52px_rgba(15,23,42,0.28)] sm:p-5"
      method="post"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={target.active ? "success" : "muted"}>{target.active ? "Active" : "Paused"}</Badge>
            {target.enabledCopart ? <Badge variant="outline">Copart</Badge> : null}
            {target.enabledIaai ? <Badge variant="outline">IAAI</Badge> : null}
          </div>
          <div>
            <h2 className="text-base font-semibold tracking-tight">
              {awaitingCollectorMetadata ? "Pending metadata" : target.label}
            </h2>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        <Button size="sm" type="submit" variant="outline">Save</Button>
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
          <p className="text-sm text-muted-foreground">Use <code>*</code> for wildcard characters.</p>
        </div>

        <div className="flex flex-wrap items-center gap-4 rounded-[20px] border border-border/70 bg-muted/35 px-4 py-3">
          <SourceFlag checked={target.enabledCopart} label="Copart" name="enabledCopart" />
          <SourceFlag checked={target.enabledIaai} label="IAAI" name="enabledIaai" />
          <SourceFlag checked={target.active} label="Target active" name="active" />
        </div>
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
      <div className="mx-auto flex max-w-[1120px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <a href="/">
              <Button size="sm" variant="outline"><ArrowLeft className="size-3.5" /> Back</Button>
            </a>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Admin registry</div>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">VIN family targets</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a href="/admin/history">
              <Button size="sm" variant="outline">History{historyCount ? ` (${historyCount})` : ""}</Button>
            </a>
            <Badge variant="success">Admin</Badge>
            <span className="text-sm text-muted-foreground">{email}</span>
          </div>
        </header>

        {error ? (
          <div className="rounded-[24px] border border-amber-500/30 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            {error}
          </div>
        ) : null}

        <section className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start">
          <Card>
            <CardHeader>
              <CardTitle>Add target</CardTitle>
              <CardDescription>Enter a mask or concrete VIN prefix.</CardDescription>
            </CardHeader>
            <CardContent>
              <form action="/admin/targets" className="space-y-4" method="post">
                <div className="space-y-2">
                  <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground" htmlFor="vinPattern">
                    VIN family mask
                  </label>
                  <Input id="vinPattern" name="vinPattern" placeholder="1FTEW1E5XJK" required spellCheck={false} />
                  <p className="text-sm text-muted-foreground">Use <code>*</code> for wildcard characters.</p>
                </div>
                <input name="enabledCopart" type="hidden" value="on" />
                <input name="active" type="hidden" value="on" />
                <Button type="submit">
                  <Plus className="size-4" />
                  Add target
                </Button>
              </form>
            </CardContent>
          </Card>

          <div className="grid gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">Targets</h2>
                <p className="text-sm text-muted-foreground">
                  {targets.length} total · {activeTargets} active
                </p>
              </div>
            </div>
            {targets.length ? (
              targets.map((target) => (
                <TargetCard key={target.id} target={target} />
              ))
            ) : (
              <Card>
                <CardContent className="py-8 text-sm text-muted-foreground">
                  No targets yet.
                </CardContent>
              </Card>
            )}
          </div>
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
