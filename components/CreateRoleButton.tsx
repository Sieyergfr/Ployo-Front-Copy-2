"use client";

import { useUniversalPopup } from "@/components/UniversalPopup";
import { permissionAreas } from "@/lib/roles";
import { Plus, ShieldCheck } from "lucide-react";

export default function CreateRoleButton() {
  const { openPopup, closePopup } = useUniversalPopup();

  return (
    <button
      type="button"
      className="btn btn-primary"
      onClick={() =>
        openPopup({
          title: "Rolle erstellen",
          className: "max-w-[760px]",
          content: (
            <form
              className="flex flex-col gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                closePopup();
              }}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="field">
                  <label htmlFor="role-name" className="label">
                    Rollenname
                  </label>
                  <input
                    id="role-name"
                    name="name"
                    className="input"
                    placeholder="z. B. Standortleitung"
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="role-description" className="label">
                    Beschreibung
                  </label>
                  <input
                    id="role-description"
                    name="description"
                    className="input"
                    placeholder="Kurzbeschreibung"
                  />
                </div>
              </div>

              <section className="rounded-xl border border-border bg-bg p-4">
                <div className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">
                  Rechte anhaken
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {permissionAreas.map((area) => (
                    <div
                      key={area.id}
                      className="rounded-[10px] border border-border bg-white p-3"
                    >
                      <div className="text-[13px] font-semibold text-ink">
                        {area.label}
                      </div>
                      <div className="mt-0.5 min-h-8 text-[11.5px] leading-[1.4] text-muted">
                        {area.description}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-3">
                        {["Lesen", "Schreiben", "Admin"].map((permission) => (
                          <label key={permission} className="checkbox-row">
                            <input
                              type="checkbox"
                              name={`${area.id}-${permission}`}
                              className="peer sr-only"
                            />
                            <span className="checkbox" />
                            <span className="checkbox-label">{permission}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <div className="mt-1 flex justify-end gap-2.5 border-t border-border-soft pt-4">
                <button type="button" className="btn btn-secondary" onClick={closePopup}>
                  Abbrechen
                </button>
                <button type="submit" className="btn btn-primary">
                  <ShieldCheck size={15} />
                  Rolle erstellen
                </button>
              </div>
            </form>
          ),
        })
      }
    >
      <Plus size={15} />
      Rolle erstellen
    </button>
  );
}
