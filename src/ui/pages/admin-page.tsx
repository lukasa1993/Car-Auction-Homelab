import * as React from "react";
import { ArrowLeft, LockKeyhole, Plus, Settings2 } from "lucide-react";

import type { VinTarget } from "../../lib/types";
import { Badge } from "../components/badge";
import { Button } from "../components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/card";
import { Input } from "../components/input";
import { Label } from "../components/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/table";

export function AdminPage({
  email,
  targets,
}: {
  email: string;
  targets: VinTarget[];
}) {
  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,rgba(253,250,244,0.96),rgba(246,240,230,0.94))]">
      <div className="mx-auto flex max-w-[1320px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-3">
          <a href="/">
            <Button variant="outline">
              <ArrowLeft className="size-4" />
              Back to table
            </Button>
          </a>
          <div className="flex items-center gap-2">
            <Badge variant="success">Admin</Badge>
            <span className="text-sm text-muted-foreground">{email}</span>
          </div>
        </div>

        <header className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              <Settings2 className="size-3.5" />
              Registry control
            </div>
            <h1 className="font-display text-4xl tracking-[-0.05em] sm:text-5xl">
              Configure VIN targets without baking scope into every runner.
            </h1>
            <p className="max-w-3xl text-base leading-7 text-muted-foreground">
              Runners now fetch these definitions from the server before they scrape. That keeps
              coverage, year ranges, and source flags centralized and auditable.
            </p>
          </div>

          <Card className="bg-card/92">
            <CardHeader>
              <CardTitle className="font-display text-2xl tracking-[-0.04em]">Auth boundary</CardTitle>
              <CardDescription>
                Better Auth handles the session. Admin authorization is still a separate allowlist decision.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <div className="rounded-[24px] border border-border/70 bg-background/70 p-4">
                <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.18em]">
                  <LockKeyhole className="size-3.5" />
                  Current operator
                </div>
                <div className="font-medium text-foreground">{email}</div>
              </div>
              <p>
                If you want stricter control, set <code>AUCTION_ADMIN_EMAILS</code> on the deployment
                instead of relying on the fallback behavior.
              </p>
            </CardContent>
          </Card>
        </header>

        <Card className="bg-card/92">
          <CardHeader>
            <CardTitle className="font-display text-3xl tracking-[-0.04em]">VIN target matrix</CardTitle>
            <CardDescription>Table-first editor for active scrape scope.</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Table className="min-w-[1250px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Key</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead>Car type</TableHead>
                  <TableHead>VIN pattern</TableHead>
                  <TableHead>Years</TableHead>
                  <TableHead>Copart</TableHead>
                  <TableHead>IAAI</TableHead>
                  <TableHead>Flags</TableHead>
                  <TableHead className="text-right">Save</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {targets.map((target) => (
                  <TableRow key={target.id}>
                    <TableCell className="align-top" colSpan={9}>
                      <form action={`/admin/targets/${target.id}`} className="grid gap-3 xl:grid-cols-[1fr_0.8fr_1.1fr_1fr_0.7fr_0.8fr_0.8fr_1fr_auto]" method="post">
                        <Input defaultValue={target.key} name="key" />
                        <Input defaultValue={target.label} name="label" />
                        <Input defaultValue={target.carType} name="carType" />
                        <Input defaultValue={target.vinPattern} name="vinPattern" />
                        <div className="grid grid-cols-2 gap-2">
                          <Input defaultValue={String(target.yearFrom)} name="yearFrom" />
                          <Input defaultValue={String(target.yearTo)} name="yearTo" />
                        </div>
                        <Input defaultValue={target.copartSlug} name="copartSlug" />
                        <Input defaultValue={target.iaaiPath} name="iaaiPath" />
                        <div className="flex flex-wrap gap-3 rounded-2xl border border-border bg-background/70 px-3 py-2 text-sm">
                          <label className="inline-flex items-center gap-2">
                            <input defaultChecked={target.enabledCopart} name="enabledCopart" type="checkbox" />
                            copart
                          </label>
                          <label className="inline-flex items-center gap-2">
                            <input defaultChecked={target.enabledIaai} name="enabledIaai" type="checkbox" />
                            iaai
                          </label>
                          <label className="inline-flex items-center gap-2">
                            <input defaultChecked={target.active} name="active" type="checkbox" />
                            active
                          </label>
                        </div>
                        <Button type="submit" variant="outline">Save</Button>
                      </form>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="bg-card/92">
          <CardHeader>
            <CardTitle className="font-display text-2xl tracking-[-0.04em]">Add target</CardTitle>
            <CardDescription>Create new VIN scope without editing runner code.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action="/admin/targets" className="grid gap-3 xl:grid-cols-[1fr_0.8fr_1.1fr_1fr_0.7fr_0.8fr_0.8fr_1fr_auto]" method="post">
              <div className="space-y-2">
                <Label htmlFor="key">Key</Label>
                <Input id="key" name="key" placeholder="model-z-abcd" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="label">Label</Label>
                <Input id="label" name="label" placeholder="Model Z" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="carType">Car type</Label>
                <Input id="carType" name="carType" placeholder="Tesla Model Z" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vinPattern">VIN pattern</Label>
                <Input id="vinPattern" name="vinPattern" placeholder="5YJ..." required />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <Label htmlFor="yearFrom">From</Label>
                  <Input id="yearFrom" name="yearFrom" placeholder="2024" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="yearTo">To</Label>
                  <Input id="yearTo" name="yearTo" placeholder="2027" required />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="copartSlug">Copart slug</Label>
                <Input id="copartSlug" name="copartSlug" placeholder="model-z" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="iaaiPath">IAAI path</Label>
                <Input id="iaaiPath" name="iaaiPath" placeholder="Model%20Z" />
              </div>
              <div className="flex flex-wrap items-end gap-3 rounded-[24px] border border-border bg-background/70 px-3 py-3 text-sm">
                <label className="inline-flex items-center gap-2">
                  <input defaultChecked name="enabledCopart" type="checkbox" />
                  copart
                </label>
                <label className="inline-flex items-center gap-2">
                  <input defaultChecked name="enabledIaai" type="checkbox" />
                  iaai
                </label>
                <label className="inline-flex items-center gap-2">
                  <input defaultChecked name="active" type="checkbox" />
                  active
                </label>
              </div>
              <div className="flex items-end">
                <Button type="submit">
                  <Plus className="size-4" />
                  Create
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
