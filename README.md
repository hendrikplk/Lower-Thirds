# LowerThird Studio

Lokales MVP für Bauchbinden mit OBS-Browser-Ausgabe und Companion-Modul.

## Start (Windows / macOS / Linux)
1. Node.js 18 oder neuer installieren.
2. Im Projektordner ein Terminal öffnen.
3. `npm install`
4. `npm start`
5. Control: http://localhost:3000
6. OBS Browser Source: http://localhost:3000/output.html

Die OBS-Quelle auf 1920 × 1080 einstellen. Der Hintergrund ist absichtlich `#00FF00` (Chroma-Key). In OBS danach den Chroma-Key-Filter auf die Browser-Quelle anwenden. Alternativ kann in `public/output.css` die Hintergrundfarbe angepasst werden.

## Companion
Das eigenständige Companion-Modul liegt im Ordner `companion/`. Build-Anleitung siehe `companion/README.md`. In Companion als Modul-URL `http://127.0.0.1:3000` konfigurieren. Läuft Companion auf einem anderen Rechner, muss statt localhost die LAN-IP des Rechners mit LowerThird Studio verwendet werden.

## API
- `GET /api/state`
- `POST /api/prepare/:id`
- `POST /api/show/:id`
- `POST /api/take`
- `POST /api/hide`
- `POST /api/next`
- `POST /api/previous`
- `POST /api/items`
- `PUT /api/items/:id`
- `DELETE /api/items/:id`

## Hinweise zum Stand
Dies ist ein funktionsfähiger erster Prototyp mit lokaler JSON-Speicherung, Control-Webseite, OBS-Ausgabe, WebSocket-Updates und Companion-Modul-Quellcode. Das Companion-Modul ist für Companion 4.x vorbereitet (SDK-Basis 1.12.x); der Build und die Installation müssen auf der konkreten Companion-Unterversion getestet werden. Für den Live-Betrieb empfiehlt sich außerdem ein eigener Rechner-/Netzwerk-Test, insbesondere wenn Companion nicht auf demselben Rechner läuft.

## Companion-Modul bauen (Windows)

In PowerShell:

```powershell
cd companion
corepack enable
yarn install
yarn package
```

Siehe `companion/README.md` und `companion/companion/HELP.md`.


## Netzwerkzugriff im LAN

Der Server bindet an `0.0.0.0`, damit andere Geräte im selben lokalen Netzwerk zugreifen können.
Ermittle auf dem Windows-PC mit `ipconfig` die IPv4-Adresse und öffne auf anderen Geräten `http://<IPv4-Adresse>:3000`.
Für OBS lautet die Ausgabe `http://<IPv4-Adresse>:3000/output.html`. Falls Windows nachfragt, den Zugriff im privaten Netzwerk erlauben bzw. TCP-Port 3000 in der Windows-Firewall freigeben. Den Port nicht am Router ins Internet weiterleiten.

## Neue Layouts und Logo

Verfügbare Layouts: klassische Leiste, Akzent links, minimalistisch, Kartenstil, gestapelt, Schlagzeile und Logo-Badge. Logos können als PNG, JPG oder SVG bis 8 MB geladen und in der Vorschau kontrolliert bzw. entfernt werden. Änderungen an einer bereits live geschalteten Bauchbinde werden jetzt auch ohne Wechsel der Bauchbinden-ID in der Ausgabe aktualisiert.


## Standardlayout festlegen

Das Standardlayout für neu angelegte Bauchbinden ist zunächst **Kompakt / Kartenstil**.
Im Editor kann bei einer ausgewählten Bauchbinde über „Diesen Stil als Standard festlegen“
ein anderes Layout dauerhaft als Standard gespeichert werden. Bereits bestehende Bauchbinden
werden dabei nicht verändert. Die Einstellung liegt in `data/state.json`.


### Standardvorlage inklusive Logo und Farben
Im Editor kannst du mit „Diesen Stil inkl. Farben & Logo als Standard festlegen“ das komplette Erscheinungsbild der ausgewählten Bauchbinde als Vorlage speichern: Layout, Akzentfarbe, Flächenfarbe, Haupttextfarbe, Unterzeilenfarbe und Logo. Neu angelegte Bauchbinden übernehmen diese Einstellungen automatisch. Bereits bestehende Bauchbinden bleiben unverändert.


## Komplettes Projekt exportieren und importieren

Im Kopfbereich der Steueroberfläche gibt es **Projekt exportieren** und **Projekt importieren**.
Der Export erzeugt eine einzelne ZIP-Datei mit `project.json` und einer kurzen README. Die Bauchbinden, Texte, Layouts, Farben, Standardvorlage und Logos sind vollständig in `project.json` enthalten; Logos werden als eingebettete Data-URLs mitgesichert und benötigen beim Import keine separaten Bilddateien.

So kannst du zu Hause exportieren, die ZIP-Datei auf einen USB-Stick oder in einen freigegebenen Ordner kopieren und sie bei der Arbeit importieren. Beim Import wird das dort vorhandene Projekt ersetzt. Der Live-Zustand wird aus Sicherheitsgründen zurückgesetzt (nichts wird automatisch auf Sendung geschaltet); die erste Bauchbinde wird vorbereitet. Vor dem Import am Arbeitsplatz empfiehlt sich ein Export des dortigen Projekts als Sicherung.

Für die neue ZIP-Export-/Importfunktion wird zusätzlich `jszip` installiert. Nach dem Aktualisieren einmal `npm install` im Projektordner ausführen.
