import * as React from "react";
import { hydrateRoot } from "react-dom/client";

import { AppShell } from "./app-shell";
import { renderAppPage, type AppPage } from "./page-registry";

const rootElement = document.getElementById("app-root");
const pageDataElement = document.getElementById("app-page-data");

const targetSaveTimers = new WeakMap<HTMLFormElement, number>();

function clearTargetSaveTimer(form: HTMLFormElement) {
  const timer = targetSaveTimers.get(form);
  if (timer != null) {
    window.clearTimeout(timer);
    targetSaveTimers.delete(form);
  }
}

function setTargetSaveStatus(
  form: HTMLFormElement,
  message: string,
  tone: "muted" | "success" | "error" = "muted",
) {
  const status = form.querySelector<HTMLElement>("[data-admin-target-save-status]");
  if (!status) return;

  status.textContent = message;
  status.classList.remove("text-muted-foreground", "text-emerald-600", "text-destructive");

  if (tone === "success") {
    status.classList.add("text-emerald-600");
  } else if (tone === "error") {
    status.classList.add("text-destructive");
  } else {
    status.classList.add("text-muted-foreground");
  }
}

function setTargetSaveButtonState(form: HTMLFormElement, saving: boolean, success = false) {
  const button = form.querySelector<HTMLButtonElement>("[data-admin-target-save-button]");
  if (!button) return;

  const idleLabel = button.dataset.idleLabel || "Save";
  button.disabled = saving;

  if (saving) {
    button.textContent = "Saving...";
    return;
  }

  button.textContent = success ? "Saved" : idleLabel;
}

function updateRejectBadge(
  form: HTMLFormElement,
  kind: "colors" | "locations",
  count: number,
) {
  const wrapper = form.querySelector<HTMLElement>(`[data-admin-target-${kind}-badge]`);
  const label = form.querySelector<HTMLElement>(`[data-admin-target-${kind}-badge-label]`);
  if (!wrapper || !label) return;

  wrapper.hidden = count <= 0;
  if (count <= 0) return;

  if (kind === "colors") {
    label.textContent = `${count} color reject${count === 1 ? "" : "s"}`;
  } else {
    label.textContent = `${count} location reject${count === 1 ? "" : "s"}`;
  }
}

function updateTargetCardFromResponse(
  form: HTMLFormElement,
  target: {
    rejectColors?: string[];
    rejectLocations?: string[];
  } | null | undefined,
) {
  if (!target) return;

  updateRejectBadge(form, "colors", Array.isArray(target.rejectColors) ? target.rejectColors.length : 0);
  updateRejectBadge(
    form,
    "locations",
    Array.isArray(target.rejectLocations) ? target.rejectLocations.length : 0,
  );
}

function isSaveSubmit(
  form: HTMLFormElement,
  submitter: HTMLElement | null,
) {
  if (!submitter) return true;

  const submitterFormAction =
    submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement
      ? submitter.getAttribute("formaction")
      : null;

  if (!submitterFormAction) {
    return true;
  }

  const formAction = new URL(form.getAttribute("action") || window.location.href, window.location.href).toString();
  const submitterAction = new URL(submitterFormAction, window.location.href).toString();

  return submitterAction === formAction;
}

function enhanceAdminTargetForms() {
  const forms = document.querySelectorAll<HTMLFormElement>('form[data-admin-target-form="true"]');

  for (const form of forms) {
    if (form.dataset.adminTargetEnhanced === "true") continue;
    form.dataset.adminTargetEnhanced = "true";

    const saveButton = form.querySelector<HTMLButtonElement>("[data-admin-target-save-button]");
    if (saveButton && !saveButton.dataset.idleLabel) {
      saveButton.dataset.idleLabel = (saveButton.textContent || "Save").trim();
    }

    form.addEventListener("submit", async (event) => {
      const submitEvent = event as SubmitEvent;
      const submitter = submitEvent.submitter as HTMLElement | null;

      if (!isSaveSubmit(form, submitter)) {
        return;
      }

      event.preventDefault();

      clearTargetSaveTimer(form);
      setTargetSaveStatus(form, "Saving...", "muted");
      setTargetSaveButtonState(form, true);

      try {
        const response = await fetch(form.action, {
          method: (form.method || "POST").toUpperCase(),
          body: new FormData(form),
          headers: {
            "x-auction-request": "async",
            Accept: "application/json",
          },
        });

        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("application/json")) {
          throw new Error("Unexpected response from server");
        }

        const result = await response.json() as {
          ok?: boolean;
          error?: string;
          target?: {
            rejectColors?: string[];
            rejectLocations?: string[];
          } | null;
        };

        if (!response.ok || !result.ok) {
          throw new Error(result.error || "Failed to save target");
        }

        updateTargetCardFromResponse(form, result.target);
        setTargetSaveStatus(form, "Saved", "success");
        setTargetSaveButtonState(form, false, true);

        const timer = window.setTimeout(() => {
          setTargetSaveButtonState(form, false, false);
          setTargetSaveStatus(form, "", "muted");
          targetSaveTimers.delete(form);
        }, 1600);

        targetSaveTimers.set(form, timer);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to save target";
        setTargetSaveButtonState(form, false, false);
        setTargetSaveStatus(form, message, "error");
      }
    });
  }
}

enhanceAdminTargetForms();

if (rootElement && pageDataElement?.textContent) {
  try {
    const page = JSON.parse(pageDataElement.textContent) as AppPage;
    hydrateRoot(rootElement, <AppShell isAdmin={page.isAdmin}>{renderAppPage(page)}</AppShell>);
  } catch (error) {
    console.error("App hydration failed", error);
  }
}
