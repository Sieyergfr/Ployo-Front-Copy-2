Prüfe diese Punkte und setze sie bei Bedarf um.

## Performance und Geschwindigkeit
1. Daten fetch: Alles als loop oder eine Anfrage die alle Infos auf einmal holt? Letzteres soll schneller sein
2. Datenbank Indexes vorhanden? Da wo sinnvoll, implementieren falls nicht bereits geschehen
3. Daten fetching: Nur die Daten die man wirklich braucht fetchen
4. Foto komprimierung: Werden die Bilder die von Nutzern hochgeladen werden komprimiert und in Webp umgewandelt? Wenn diese geladen werden von jemanden, soll es nicht zu lange dauern
5. Caching: Die gleichen Daten immer wieder abzurufen ist langweilig. Stattdessen daten die sich unregelmäßig ändern aus dem cache laden und nur aus DB wenn updates

## Security
1. Rate Limiting überall vorhanden?
2. API Keys und Secrets sind immer nur auf Server Seite
3. Validation and Sanitizing of user input
4. Database no public tables by default
5. Authentication auf allen protected routes
6. Fehler Meldungen leaken keine internen infos an nutzer
7. Row Level Security auf jedem Table
8. Logging um attacks sehen zu können
9. Do password reset links expire?
10. API nur von eigener Domain und eigener App erreichbar?
11. Logging and monitoring?
12. Rollback methoden für deployment crashes?
13. SQL injection und XSS abgewehrt?
14. Error handling, statt die richtige fehlermeldung weitergeben richtige Error Screens

## Weiteres
1. Meta Title und description auf jeder Seite
2. Favicon
3. Robots.txt
4. sitemap.xml
5. alt texte auf bildern falls bilder vorhanden sind
6. loading states
7. form error states
8. cookie banner mit Alle akzeptieren und nur notwendige cookies
9. Analytics
