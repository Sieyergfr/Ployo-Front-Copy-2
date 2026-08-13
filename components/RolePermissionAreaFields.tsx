"use client";

import { useState } from "react";
import {
  permissionLevelLabels,
  permissionLevels,
  permissionScopeDescriptions,
  permissionScopeLabels,
  permissionScopes,
  type PermissionArea,
  type PermissionLevel,
  type PermissionScope,
} from "@/lib/roles";
import { Users } from "lucide-react";

// Own/team gelten nur, wenn der Bereich die allgemeine own/team/all-Auswahl
// unterstützt — "assigned" wird separat für locations/teams angeboten.
const visibilityScopes = permissionScopes.filter((scope) => scope !== "assigned");
const assignedScopes = ["all", "assigned"] as const;

/**
 * "Rechte"-Radios + zugehöriger "Sichtbarkeit"-Block einer Berechtigungs-
 * fläche — als eigene Client-Komponente, damit der Sichtbarkeits-Block live
 * auf die Radio-Auswahl reagiert (ohne Formular-Absenden). Die `name`/
 * `value`-Attribute der Radios bleiben unverändert, damit
 * `updateRoleAction` weiterhin genauso funktioniert — hier wird nur das
 * Anzeigeverhalten clientseitig gesteuert, keine Submit-Logik.
 */
export default function RolePermissionAreaFields({
  area,
  defaultLevel,
  defaultScope,
}: {
  area: PermissionArea;
  defaultLevel: PermissionLevel;
  defaultScope: PermissionScope;
}) {
  const [level, setLevel] = useState(defaultLevel);
  const hasAccess = level !== "none";

  return (
    <div className="grid min-w-0 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="min-w-0 rounded-xl border border-border-soft bg-bg p-3">
        <div className="mb-3 font-mono text-[9.5px] uppercase tracking-[0.6px] text-muted">
          Rechte
        </div>
        <div className="grid grid-cols-2 gap-2">
          {permissionLevels.map((permission) => (
            <label key={permission} className="checkbox-row relative cursor-pointer">
              <input
                type="radio"
                name={`permission-${area.id}`}
                value={permission}
                className="peer absolute inset-0 cursor-pointer opacity-0"
                defaultChecked={permission === defaultLevel}
                onChange={() => setLevel(permission)}
              />
              <span className="checkbox" />
              <span className="checkbox-label">{permissionLevelLabels[permission]}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="min-w-0 rounded-xl border border-border-soft bg-bg p-3">
        <div className="mb-3 font-mono text-[9.5px] uppercase tracking-[0.6px] text-muted">
          Sichtbarkeit
        </div>
        {!hasAccess ? (
          <p className="text-[12px] leading-[1.5] text-muted">
            Kein Zugriff auf diesen Bereich — Navigation und Route sind für
            diese Rolle automatisch ausgeblendet.
          </p>
        ) : area.supportsScope ? (
          <>
            <div className="grid grid-cols-3 gap-2">
              {visibilityScopes.map((scopeOption) => (
                <label key={scopeOption} className="checkbox-row relative cursor-pointer">
                  <input
                    type="radio"
                    name={`scope-${area.id}`}
                    value={scopeOption}
                    className="peer absolute inset-0 cursor-pointer opacity-0"
                    defaultChecked={scopeOption === defaultScope}
                  />
                  <span className="checkbox" />
                  <span className="checkbox-label">
                    {permissionScopeLabels[scopeOption]}
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-2.5 flex items-start gap-1.5 text-[11.5px] leading-[1.45] text-muted">
              <Users size={13} className="mt-[1px] shrink-0" />
              {permissionScopeDescriptions[defaultScope]}
            </p>
          </>
        ) : area.supportsAssignedScope ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              {assignedScopes.map((scopeOption) => (
                <label key={scopeOption} className="checkbox-row relative cursor-pointer">
                  <input
                    type="radio"
                    name={`scope-${area.id}`}
                    value={scopeOption}
                    className="peer absolute inset-0 cursor-pointer opacity-0"
                    defaultChecked={scopeOption === defaultScope}
                  />
                  <span className="checkbox" />
                  <span className="checkbox-label">
                    {permissionScopeLabels[scopeOption]}
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-2.5 flex items-start gap-1.5 text-[11.5px] leading-[1.45] text-muted">
              <Users size={13} className="mt-[1px] shrink-0" />
              {permissionScopeDescriptions[defaultScope]}
            </p>
          </>
        ) : (
          <p className="text-[12px] leading-[1.5] text-muted">
            Zugriff gilt mandantenweit — für diesen Bereich gibt es keine
            Einschränkung auf eigene oder Team-Daten.
          </p>
        )}
      </div>
    </div>
  );
}
