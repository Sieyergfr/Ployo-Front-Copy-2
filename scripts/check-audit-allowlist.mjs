#!/usr/bin/env node
/**
 * Prüft `npm audit --json` gegen eine kurze, benannte Ausnahmeliste (Audit-
 * Finding L02): vorher machte die CI JEDEN High-Fund pauschal zur bloßen
 * Warnung, nicht nur die tatsächlich geprüfte/akzeptierte Advisory
 * GHSA-ggr8-5vv4-36mx (deepmerge-ts, Stack-Exhaustion beim Merge rekursiver
 * Objektgraphen) — die transitiv über @prisma/config in `prisma` (Dev-
 * Tooling, Schema-Merging, kein Laufzeitpfad mit untrusted Input) landet.
 * Ein NEUER, unerwarteter High-/Critical-Fund (andere Advisory-ID, auch in
 * einem der drei genannten Pakete) bricht die Pipeline weiterhin ab, statt
 * in derselben pauschalen Warnung unterzugehen.
 *
 * Anker ist absichtlich die GHSA-Advisory-ID der Wurzel-Schwachstelle, nicht
 * die betroffenen Paketnamen: verschiebt sich der Abhängigkeitsbaum (neues
 * Zwischenpaket), bleibt dieselbe bereits geprüfte Schwachstelle weiterhin
 * erkannt, ohne die Liste pflegen zu müssen — eine ANDERE Schwachstelle im
 * selben Paket würde dagegen trotzdem durchschlagen.
 *
 * Erweitern der Ausnahme: nur nach erneuter manueller Prüfung, mit
 * GHSA-ID/Begründung hier eintragen und im Sicherheitsaudit nachführen.
 */
import { execSync } from "node:child_process";

const ACCEPTED_ADVISORY_SOURCE_IDS = new Set([
  1145093, // GHSA-ggr8-5vv4-36mx — deepmerge-ts <8.0.0, Stack-Exhaustion (Dev-Tooling, kein untrusted Input)
  1240992, // GHSA-vfj7-8cjw-p6xm — braces <=3.0.3 (kein Fix verfügbar), nur über eslint-config-next -> @next/eslint-plugin-next -> fast-glob -> micromatch; Lint-Tooling mit eigenen Glob-Mustern, kein untrusted Input
]);

function runAudit() {
  try {
    const output = execSync("npm audit --json", { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
    return JSON.parse(output);
  } catch (error) {
    // `npm audit` beendet sich mit Exit-Code != 0, sobald IRGENDein Fund
    // vorliegt — das ist hier erwartet, stdout enthält trotzdem den JSON-Report.
    const stdout = error.stdout?.toString();
    if (!stdout) {
      throw error;
    }
    return JSON.parse(stdout);
  }
}

/** true, wenn JEDE Advisory-Quelle hinter `name` (rekursiv über transitive "via"-Paketnamen) akzeptiert ist. */
function isFullyAccepted(name, vulnerabilities, visiting = new Set()) {
  if (visiting.has(name)) {
    // Zyklus im Abhängigkeitsgraphen — sollte bei npm audit nicht vorkommen,
    // sicherheitshalber nicht akzeptieren statt in eine Endlosschleife zu laufen.
    return false;
  }
  visiting.add(name);

  const info = vulnerabilities[name];
  if (!info || !Array.isArray(info.via) || info.via.length === 0) {
    return false;
  }

  return info.via.every((via) => {
    if (typeof via === "string") {
      return isFullyAccepted(via, vulnerabilities, visiting);
    }
    return typeof via.source === "number" && ACCEPTED_ADVISORY_SOURCE_IDS.has(via.source);
  });
}

const report = runAudit();
const vulnerabilities = report.vulnerabilities ?? {};
const relevant = Object.entries(vulnerabilities).filter(
  ([, info]) => info.severity === "high" || info.severity === "critical",
);

const unexpected = relevant.filter(([name]) => !isFullyAccepted(name, vulnerabilities));

if (unexpected.length > 0) {
  console.error("Unerwartete High/Critical-Advisories außerhalb der geprüften Ausnahmeliste:");
  for (const [name, info] of unexpected) {
    console.error(`  - ${name} (${info.severity})`);
  }
  process.exit(1);
}

const accepted = relevant.filter(([name]) => isFullyAccepted(name, vulnerabilities));
if (accepted.length > 0) {
  console.log(
    `Nur bekannte, akzeptierte High-Findings (${accepted.map(([name]) => name).join(", ")}) — kein Build-Abbruch.`,
  );
} else {
  console.log("Keine High/Critical-Findings.");
}
