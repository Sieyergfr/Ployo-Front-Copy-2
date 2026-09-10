@AGENTS.md

# Ployo — zwei zusammengehörige Projekte

Dieses Repo (`ployo-front`) ist das Next.js-Backend/Web-Dashboard. Es
gehört zusammen mit der Expo/React-Native-App `ployo-mobile`. Beide liegen
auf diesem Server nebeneinander im selben Dateisystem — kein SSH nötig, um
zwischen ihnen zu wechseln:

* Backend/Web-Dashboard (dieses Projekt): `/opt/apps/ployo-front`
* App: `/opt/apps/ployo-mobile`
  Framework: Expo SDK 57 / expo-router. Konsumiert die API dieses Repos
  (Auth über better-auth-Cookies, kein Bearer-Token). Details:
  `/opt/apps/ployo-mobile/README.md`, `/opt/apps/ployo-mobile/app_info.md`.

## Wann in beide Projekte schauen

Bei jeder Änderung, die für die App sichtbar ist — API-Routen unter
`app/api/`, Auth-Flow, Prisma-Modelle, Berechtigungen, Datei-Uploads,
Push-Benachrichtigungen — gilt:

1. Vor dem Ändern oder Entfernen eines bestehenden API-Contracts prüfen,
   ob `ployo-mobile` diesen Endpunkt nutzt (Suche z.B. in
   `/opt/apps/ployo-mobile/src/api/`). Response-Shape und Fehlerfälle
   nicht stillschweigend brechen.
2. Neue Endpunkte für die App nach den bestehenden Konventionen in
   `app/api/` bauen (siehe bestehende Routen als Vorbild).
3. Nach Backend-Änderungen: relevante App-Seite in `ployo-mobile`
   anpassen, falls der Contract sich geändert hat.
4. Beide Seiten getrennt prüfen (dieses Repo: `npm run build`/Typecheck;
   `ployo-mobile`: `npm run typecheck`, `npm run lint`), bevor die Änderung
   als abgeschlossen gilt.

## Produktion — Vorsicht

Dieses Repo läuft produktiv unter PM2 (Prozess `ployo`) und teilt sich
`.next` + Datenbank mit der Live-Umgebung. Niemals `rm -rf .next` oder
`next dev` hier ausführen, ohne das vorher mit dem Nutzer abzuklären.

## Git

Beide Repos sind unabhängige Git-Repositories mit eigener Historie und
eigenem GitHub-Remote (`Sieyergfr/ployo-front` bzw. `Sieyergfr/ployo-app`).
Ein zusammenhängendes Feature kann also zwei getrennte Commits/PRs
erzeugen — einen pro Repo. Immer `git status`/`git diff` in dem Repo
prüfen, in dem gerade gearbeitet wird, bevor committet wird.
