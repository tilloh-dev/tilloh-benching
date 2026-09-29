---
name: create-prompt
description: Erzeugt einen neuen Benchy-Bench-Test (Prompt, erwartete Dateien, Checks, Judge-Kriterien) in library/tests/ mit fortlaufender Nummer. Auslösen bei Anfragen wie "neuen Prompt erstellen", "Prompt hinzufügen", "Benchmark-Aufgabe anlegen", "Test anlegen", "leg einen Prompt für X an" oder dem Befehl /create-prompt.
---

Lege einen neuen Bench-Test für Benchy an. Falls `$ARGUMENTS` übergeben wurde, ist das die Aufgabenidee. Sonst frage knapp nach dem Thema und nach dem erwarteten Ergebnistyp.

## Was ein Test ist

Ein Test liegt unter `library/tests/NN-slug/`:

| Datei | Inhalt |
|---|---|
| `prompt.md` | die Aufgabe, wörtlich so, wie das Modell sie bekommt (Englisch) |
| `test.yaml` | id, title, erwartete Dateien, Checks, Judge-Kriterien |

Benchy hängt selbst eine Formatregel an ("Datei in genau einem Codeblock liefern"). **Der Prompt enthält deshalb keine Formatierungsregeln** wie "Output ONLY the HTML" oder "no markdown fences".

Das Schema ist strikt (unbekannte Schlüssel sind Fehler): `src/engine/core/schema.ts` (`TestFile`). Gute Vorlagen: `library/tests/09-violin-3d/`, `12-word-frequency-cli/`, `13-essay-local-llms/`.

## Schritte

1. **Nummer und Slug:** höchste vorhandene Nummer in `library/tests/` + 1, zweistellig. Slug in `kebab-case` (`a-z0-9-`). Verzeichnis darf noch nicht existieren.
2. **Ergebnistyp festlegen** und die passenden Checks wählen:

   | Ergebnis | `output` | Checks |
   |---|---|---|
   | Web-Seite | `files: [{path: index.html}]` | `html.parse`, `html.render` (screenshots, generische interactions per Koordinaten) |
   | Programm | `files: [{path: main.py}]` | `program.run` mit `cases` und exakten Erwartungen |
   | 3D-Modell | `files: [{path: model.obj}]` | `model3d.render` |
   | SVG | `files: [{path: image.svg}]` | `svg.render` |
   | Text | `mode: text` | `text.stats` (min_words, max_words) |
   | mehrere Dateien | mehrere `files`, `mode: files` | je Datei passende Checks |

3. **`prompt.md` schreiben:** ein Satz Aufgabe, dann `Requirements:` mit konkreten, prüfbaren Punkten. Fordernd, aber fair. Bei Web-Seiten: "Single .html file. Inline CSS and JS only. No external resources." und "Must not throw any JavaScript errors when loaded."
4. **Judge-Kriterien schreiben** (5–8):
   - alle expliziten Anforderungen abdecken, zusammengehörige Punkte gruppieren
   - dazu die Qualitätsdimensionen, die der Prompt impliziert (Gestaltung, Robustheit, Kreativität, falls verlangt)
   - `weight` 1–3 (3 = zentral), `required: true` nur für harte Anforderungen
   - `description` so formulieren, dass ein strenger Judge es an Code, Screenshots und Logs belegen kann
   - `judge.mode: interactive` nur, wenn sich Anforderungen nur durch Benutzen prüfen lassen
   - Alternativ: `./bin/benchy criteria NN-slug --write` lässt Claude einen Entwurf schreiben
5. **Programmfälle verifizieren:** jede erwartete Ausgabe mit einer eigenen Referenzimplementierung im Scratchpad nachrechnen, nie schätzen.
6. **Prüfen:**

   ```bash
   ./bin/benchy list tests
   ```

   Es darf kein Abschnitt "Library issues" erscheinen. Danach optional ein Smoke-Lauf ohne Kosten:

   ```bash
   ./bin/benchy run -t NN-slug -b dry-run-good --judge dry-run
   ```

7. Falls der Test in eine Suite gehört, die Test-Id in `library/suites/*.yaml` ergänzen.

Bestätige zum Schluss knapp: Pfad, eine Zeile Zusammenfassung, Anzahl Kriterien, Judge-Modus.

## Regeln

- Prompt, Titel und Kriterien auf **Englisch**.
- Bestehende Tests nie überschreiben oder umnummerieren.
- Die id in `test.yaml` muss dem Verzeichnisnamen entsprechen.
