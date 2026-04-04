import * as React from "react";
import { ArrowLeft, Plus } from "lucide-react";

import type { VinTarget } from "../../lib/types";
import { inferVinTargetDefinition } from "../../lib/vin-patterns";
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

function SummaryTile({
  eyebrow,
  value,
  muted,
}: {
  eyebrow: string;
  value: React.ReactNode;
  muted?: string;
}) {
  return (
    <div className="rounded-[24px] border border-border/70 bg-background/75 p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{eyebrow}</div>
      <div className="mt-2 text-base font-semibold text-foreground">{value}</div>
      {muted ? <div className="mt-1 text-sm text-muted-foreground">{muted}</div> : null}
    </div>
  );
}

function TargetCard({ target }: { target: VinTarget }) {
  const inferred = inferVinTargetDefinition(target.vinPattern);

  return (
    <form
      action={`/admin/targets/${target.id}`}
      className="grid gap-4 rounded-[28px] border border-border/80 bg-card/90 p-5 shadow-[0_24px_80px_-52px_rgba(15,23,42,0.28)]"
      method="post"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={target.active ? "success" : "muted"}>{target.active ? "Active" : "Paused"}</Badge>
            {target.enabledCopart ? <Badge variant="outline">Copart</Badge> : null}
            {target.enabledIaai ? <Badge variant="outline">IAAI</Badge> : null}
          </div>
          <h2 className="mt-3 text-lg font-semibold tracking-tight">{target.label}</h2>
          <p className="text-sm text-muted-foreground">{target.carType}</p>
        </div>
        <Button size="sm" type="submit" variant="outline">Save</Button>
      </div>

      <div className="space-y-2">
        <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground" htmlFor={`vin-${target.id}`}>
          VIN family mask
        </label>
        <Input
          defaultValue={target.vinPattern}
          id={`vin-${target.id}`}
          name="vinPattern"
          placeholder="7SAYGDEE*TF"
          spellCheck={false}
        />
        <p className="text-sm text-muted-foreground">
          Use <code>*</code> for the VIN wildcard. The collector searches from the prefix and resolves the
          remaining serial digits automatically.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <SummaryTile
          eyebrow="Prefix query"
          muted="Used for Copart search narrowing."
          value={<code className="text-[13px]">{target.vinPrefix}</code>}
        />
        <SummaryTile
          eyebrow="Auto-detected"
          muted={`Year window ${formatYearWindow(target)}`}
          value={inferred.modelLabel ?? "Tesla family"}
        />
        <SummaryTile
          eyebrow="Search routes"
          muted={target.iaaiPath || "No IAAI path inferred"}
          value={target.copartSlug || "No Copart slug inferred"}
        />
      </div>

      <div className="flex flex-wrap items-center gap-4 rounded-[24px] border border-border/70 bg-muted/35 px-4 py-3">
        <SourceFlag checked={target.enabledCopart} label="Copart" name="enabledCopart" />
        <SourceFlag checked={target.enabledIaai} label="IAAI" name="enabledIaai" />
        <SourceFlag checked={target.active} label="Target active" name="active" />
      </div>
    </form>
  );
}

export function AdminPage({
  email,
  historyCount,
  targets,
}: {
  email: string;
  historyCount: number;
  targets: VinTarget[];
}) {
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

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Card className="border-none bg-transparent shadow-none ring-0">
            <CardHeader className="px-0 pb-0">
              <CardTitle className="text-3xl tracking-tight sm:text-4xl">Mask-first target setup.</CardTitle>
              <CardDescription className="max-w-2xl text-base leading-7">
                Enter masks like <code>7SAYGDEE*TF</code>. The system derives the model, source routes,
                and search prefix so the runner only needs one VIN family definition.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 px-0 pt-5 sm:grid-cols-3">
              <SummaryTile eyebrow="Total targets" value={targets.length} />
              <SummaryTile eyebrow="Active" value={activeTargets} />
              <SummaryTile eyebrow="Wildcard rule" value={<code className="text-[13px]">* = single VIN wildcard</code>} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Add target</CardTitle>
              <CardDescription>
                Only the VIN family mask is required for new entries.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form action="/admin/targets" className="space-y-4" method="post">
                <div className="space-y-2">
                  <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground" htmlFor="vinPattern">
                    VIN family mask
                  </label>
                  <Input id="vinPattern" name="vinPattern" placeholder="7SAYGDEE*TF" required spellCheck={false} />
                  <p className="text-sm text-muted-foreground">
                    The trailing VIN serial stays implicit. The collector expands it when matching live lots.
                  </p>
                </div>
                <input name="enabledCopart" type="hidden" value="on" />
                <input name="enabledIaai" type="hidden" value="on" />
                <input name="active" type="hidden" value="on" />
                <Button type="submit">
                  <Plus className="size-4" />
                  Add target
                </Button>
              </form>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4">
          {targets.map((target) => (
            <TargetCard key={target.id} target={target} />
          ))}
        </section>
      </div>
    </main>
  );
}
