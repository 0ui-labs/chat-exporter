# CLAUDE.md

Diese Datei gibt Claude Code Orientierung bei der Arbeit in diesem Repository.

---

## Was ist dieses Projekt?

Chat Exporter ist ein performance-first Tool für AI-Konversations-Portabilität. Es ist ein TypeScript-Monorepo mit drei Packages:

- **apps/web** — React 18 Frontend mit Vite, Tailwind CSS v4, shadcn/ui Components, React Router
- **apps/server** — Hono-basierte Backend API mit SQLite (Drizzle ORM), AI-gesteuerte Adjustment Agents
- **packages/shared** — Geteilte Zod-Schemas und Type Contracts zwischen Frontend und Backend

Importiert Chat-Verläufe von mehreren Providern (ChatGPT, Claude, Gemini, Grok, DeepSeek) via Playwright-basierter Extraktion von öffentlichen Share-Seiten. Bietet Export-Formate: Markdown, JSON, Handover, Reader View. Optionaler AI Repair Pass für Schema-Validierung.

### Projekt starten

```bash
# ─── Setup ────────────────────────────────────────────────
pnpm install                             # Alle Dependencies installieren
pnpm dev                                 # Alle Apps im Dev-Modus starten (Turborepo)

# ─── Einzelne Apps ────────────────────────────────────────
pnpm --filter @chat-exporter/web dev     # Nur Frontend
pnpm --filter @chat-exporter/server dev  # Nur Backend

# ─── Tests ────────────────────────────────────────────────
pnpm test                                # Alle Vitest Tests
pnpm --filter @chat-exporter/web test    # Nur Frontend Tests
pnpm --filter @chat-exporter/server test # Nur Backend Tests
pnpm e2e                                 # Playwright E2E Tests

# ─── Code-Qualität ────────────────────────────────────────
pnpm check                               # Biome Lint + Format Check
pnpm check --write                       # Auto-Fix Lint + Format
```

---

## Wie denken wir bei der Planung neuer fetaures, ganzer apps oder beim Refactoring 

## AI-First Philosophie (MANDATORY)

### Das Problem: Trainings-Bias

LLMs sind vorwiegend auf Code trainiert der aus einer Ära vor leistungsfähiger AI stammt. Dadurch entsteht ein systematischer Bias: Bei der Planung werden reflexartig programmatische Methoden vorgeschlagen (Regex, Keyword-Matching, Template-Systeme, Rule Engines, Heuristiken), obwohl AI-basierte Lösungen heute robuster, flexibler und oft einfacher sind.

Dieser Bias ist besonders gefährlich bei der **Planerstellung**, weil er die gesamte Architektur in eine unnötig komplexe Richtung lenkt.

### Die Entscheidungsregel

**AI einsetzen wenn** die Aufgabe *semantisches Verständnis* erfordert:

- Natürliche Sprache interpretieren (Benutzer-Intention, Kontext, Ambiguität)
- Unstrukturierte oder semi-strukturierte Daten verstehen
- Qualitative Bewertungen treffen (Sentiment, Relevanz, Ähnlichkeit)
- Flexible Ausgaben generieren (CSS, Code, Text) basierend auf Kontext
- Entscheidungen treffen die Domänenwissen erfordern

**Programmatisch lösen wenn** die Aufgabe *strukturell definiert* ist:

- Daten transformieren, filtern, sortieren nach festen Regeln
- Schema-Validierung (Zod, TypeScript Types)
- Datenbankoperationen (SQL/Drizzle Queries)
- Deterministische Berechnungen
- Performance-kritische Operationen (Loops über große Datenmengen)

### Der optimale Ansatz: AI im programmatischen Harness

Die beste Architektur kombiniert beides: AI für Verständnis und Entscheidung, eingebettet in einen programmatischen Rahmen für Validierung, Persistenz und Zuverlässigkeit.

```text
User-Input → [AI: Verstehen & Entscheiden] → [Programmatisch: Validieren & Speichern]
```

Nicht: AI *oder* Code. Sondern: AI für das *Was*, Code für das *Wie sicher*.

### AI als Steuerer, nicht als Generator

Nicht alles was AI *kann* sollte generativ gelöst werden. Ein Gegenbeispiel zum programmatischen Bias:

**Anti-Pattern: Generative UI** — AI generiert UI-Komponenten on-the-fly (HTML/JSX). Das ist nicht performant, nicht robust, nicht konsistent. Jeder Render-Call produziert leicht unterschiedliche Ergebnisse, Styling ist inkonsistent, und die Latenz ist inakzeptabel.

**Besser: AI als Orchestrator** — AI entscheidet *welche* fertige Komponente mit *welchen* Props gerendert wird. Die Komponenten selbst sind handgeschrieben, getestet, performant. Die AI steuert über Tool-Calling die Komposition.

```text
❌ AI generiert: "<div class='card'><h2>...</h2><p>...</p></div>"
✅ AI steuert:   tool_call("render_card", { title: "...", body: "..." })
```

**Leitsatz: AI ist ein smarter Driver, aber nicht das Auto selbst.** AI entscheidet und steuert — deterministische Systeme führen aus. Generativ nur dort wo der Output inhärent variabel sein *muss* (z.B. natürlichsprachliche Antworten, CSS-Werte basierend auf Kontext).

### Konkretes Projektbeispiel: Adjustment-System

**Vorher (Anti-Pattern — programmatischer Bias):**
User sagt "Mach die Überschrift größer" → AI generiert Instruction-String → Zweite AI "kompiliert" in starres Template (`increase_heading_emphasis: "md"`) → Bei Scheitern: Keyword-Regex-Fallback (`mentionsHeadingEmphasisRequest()`) → Oft leere CSS oder falsche Properties.

Das System hatte 9 vorgefertigte Effect-Templates, Keyword-Heuristiken als Fallback, und zwei AI-Calls in Serie — alles weil die Planung den AI-Fähigkeiten nicht vertraut und sie in ein starres programmatisches Korsett gezwängt hat.

**Nachher (AI-First):**
User sagt "Mach die Überschrift größer" → AI schreibt direkt `{ fontSize: "1.25rem" }` → Zod validiert das Schema → Datenbank speichert.

Ein AI-Call, keine Templates, keine Heuristiken. Die AI nutzt ihre Stärke (CSS verstehen und schreiben), der Code seine (Schema validieren, persistieren).

### Selbst-Check bei der Planung

Bei jedem Plan-Schritt diese Fragen stellen:

1. **Baue ich gerade ein starres Template-System** wo AI direkt die Ausgabe generieren könnte?
2. **Schreibe ich Keyword-Matching/Regex** für etwas das semantisches Verständnis erfordert?
3. **Zwänge ich AI-Output in vordefinierte Kategorien** statt ihr flexible Ausgabe zu erlauben?
4. **Baue ich eine Multi-Stage-Pipeline** (AI → Parser → AI → Compiler) wo ein einzelner AI-Agent mit direkten Tools reichen würde?

Wenn ja: Architektur überdenken und im Interview mit dem User besprechen.

### Gegenprobe: Zu viel AI?

Gleichzeitig prüfen ob AI-Einsatz übertrieben ist:

1. **Ist das Ergebnis deterministisch?** (z.B. Datumsformatierung, Array-Sortierung) → Programmatisch
2. **Muss es in <10ms passieren?** → Programmatisch
3. **Ist es ein gelöstes Problem mit einer 3-Zeilen-Lösung?** → Programmatisch
4. **Brauche ich 100% Reproduzierbarkeit?** (z.B. Hashing, ID-Generierung) → Programmatisch

---

## Wie planen wir? — Plan-First Workflow (MANDATORY)

Wir bauen **nichts ohne detaillierten Implementierungsplan**. Niemals eigenmächtig zur Umsetzung übergehen — erst planen, dann bestätigen lassen, dann bauen.

**Ausnahme:** Triviale Einzeiler-Änderungen, die der User direkt und eindeutig anweist (z.B. "Ändere die Überschrift zu X").

### Schritt 0: Interview

Vor jeder Plan-Erstellung ein **ausführliches Interview** mit dem User führen um alle Aspekte zu diskutieren. Fragen klären wie:

- Was genau soll erreicht werden? Was ist das gewünschte Endresultat?
- Gibt es Designentscheidungen die der User treffen muss?
- Welche Randfälle sind relevant?
- Gibt es bestehende Patterns im Projekt die befolgt werden sollen?

**Niemals eigenmächtig konzeptionelle Entscheidungen treffen.** Immer den User einbeziehen.

### Die 4 Planungsphasen

Jede Phase wird als **eigener Subagent** ausgeführt — sequentiell, niemals alle in einem Thread. Maximaler Fokus auf EINE Aufgabe pro Agent.

**Phase 1 — Plan erstellen** (Subagent 1)

- Plan in möglichst kleine, aber noch sinnvoll testbare Schritte aufteilen
- Plan als Markdown in `docs/pläne/` schreiben (`docs/pläne/plan-{name}.md`)
- Betroffene Dateien, erwartete Änderungen und Test-Kriterien pro Schritt angeben

**Phase 2 — Parallelisierung analysieren** (Subagent 2)

- Welche Arbeitsschritte sind absolut sicher parallel durch Subagents ausführbar?
- Keine Dateikonflikte, keine Datenabhängigkeiten
- Optimale Reihenfolge für sequentielle Schritte bestimmen
- Wave-Execution-Plan in die Plan-Datei ergänzen

**Phase 3 — Technische Validierung** (Subagent 3)

- Plan gegen aktuellste Dokumentation und Best Practices prüfen
- 2-facher Check: context7 MCP + Web-Recherche
- Prüfen ob der Plan optimal, auf dem neuesten Stand der Technik und frei von AI-Halluzinationen ist
- Korrekturen direkt in die Plan-Datei einarbeiten

**Phase 4 — Validierungs-Workflow erstellen** (Subagent 4)

- Workflow schreiben mit dem validiert werden kann ob der Plan exakt und vollständig umgesetzt wurde
- Template verwenden: `docs/templates/validierung-template.md`
- Validierungs-Datei als `docs/pläne/plan-{name}-validierung.md` speichern

### Nach Abschluss der Planung

1. **Plan dem User vorstellen** — Zusammenfassung der Schritte, Waves, und Validierung
2. **Explizit fragen:** "Der Plan ist fertig. Soll ich mit der Implementierung beginnen?"
3. **Erst nach OK umsetzen** — Nur nach ausdrücklicher Zustimmung Code ändern

---

## Wie bauen wir? — Zuerst planen dann Implementierung (MANDATORY)

Wenn ein Implementierungsplan vorliegt, wird dieser **wörtlich befolgt** — die Dateien und Referenzen im Plan sind vertrauenswürdig. Nicht erneut verifizieren. Nur explorieren wenn absolut nötig.

### Ausführungs-Strategie

1. `TESTING.md` lesen bevor Tests geschrieben werden!
2. **Plan auf Parallelisierung analysieren** — unabhängige Schritte identifizieren (keine geteilten Dateien, keine Datenabhängigkeit). In Waves gruppieren.
3. **Subagents für jede Wave dispatchen** — unabhängige Schritte parallel über Agent-Tool ausführen
4. Nur sequentiell arbeiten bei expliziten Abhängigkeiten auf vorherige Schritte

### Parallelisierungs-Regeln

**Subagents MÜSSEN eingesetzt werden wenn:**

- 2+ Plan-Schritte parallel laufen können (verschiedene Dateien, keine Datenabhängigkeit)
- Ein Plan-Schritt selbstständig ist (klare Inputs, Outputs, Test-Kriterien)
- Du dabei bist, einen 3. sequentiellen Schritt zu starten — stopp und prüfe ob kommende Schritte parallelisierbar sind

**Anti-Pattern: 4+ Plan-Schritte sequentiell ausführen wenn sie verschiedene Dateien betreffen.** Das verschwendet Context Window und verlangsamt die Ausführung.

**Jeder Subagent ist autonom:** Jeder Subagent folgt dem vollen TDD-Zyklus (RED → GREEN → REFACTOR) eigenständig und committet seine eigene Arbeit.

### Subagent-Delegation

Beim Spawnen eines Subagents für einen Plan-Schritt im Prompt mitgeben:

1. Den exakten Plan-Schritt-Text
2. "Follow strict TDD: write failing tests first, then implement, then refactor"
3. "Commit your changes atomically when tests pass (stage files by name, never `git add .`)"
4. "Read TESTING.md before writing tests"
5. Kontext über Dateien oder Interfaces von denen der Schritt abhängt

### Wave-Execution-Muster

```text
Wave 1 (parallel): Schritte 1, 2, 3  → 3 Subagents spawnen
  ↓ warten auf Abschluss
Wave 2 (parallel): Schritte 4, 5     → 2 Subagents (abhängig von Wave 1)
  ↓ warten auf Abschluss
Wave 3 (sequentiell): Schritt 6      → selbst ausführen (Integration, abhängig von allem)
```

### TDD-Protokoll

Jede Arbeitseinheit — ob selbst oder via Subagent — folgt TDD:

1. **RED**: Fehlschlagende Tests zuerst schreiben
2. **GREEN**: Implementieren bis Tests grün sind
3. **REFACTOR**: Aufräumen bei grünen Tests
4. **COMMIT**: Relevante Dateien einzeln stagen, mit Conventional Commit Message committen

Ziel: 100% Test-Coverage. Jeder Subagent ist für seinen eigenen TDD-Zyklus End-to-End verantwortlich.

### Abschluss

Nach Implementierung aller Plan-Schritte:

1. Alle Tests laufen lassen und bestätigen dass sie grün sind
2. Zusammenfassung aller erstellten Commits mit Messages berichten
3. User fragen ob `/finish` ausgeführt werden soll um zu pushen und PR zu erstellen

---

## Wie testen wir? — Testing-Referenz (MANDATORY)

Vor dem Schreiben von Tests **muss** die Datei `TESTING.md` im Projekt-Root gelesen werden. Diese enthält:

- **Aufgabenbasiertes Routing** — Welche Detail-Module je nach Test-Art geladen werden müssen
- **Kern-Prinzipien** — AAA-Pattern, Verhalten testen statt Implementierung, Tests als Dokumentation
- **Anti-Patterns** — Verbotene Muster (Overmocking, tautologische Tests, etc.)
- **Namenskonventionen** — TypeScript: `<Component>.test.tsx` / `<module>.test.ts`
- **Detail-Module** unter `docs/testing/` — Fixtures, Mocking, Frontend, Server-Patterns, E2E, Coverage

Zusätzlich IMMER die jeweils relevanten Detail-Module aus `docs/testing/` laden, gemäß der Routing-Tabelle in TESTING.md.

---

## Wie debuggen wir? — Phasen-isoliertes Debugging (MANDATORY)

Vor jedem Debugging **muss** der Workflow in `docs/debugging-workflow.md` befolgt werden. Dieser erzwingt:

- **5 isolierte Phasen**: Reproduzieren → Isolieren → Hypothesen testen → Fix → E2E-Guard
- **Strikte Trennung**: Phase 1-3 dürfen keinen Code ändern — nur beobachten und diagnostizieren
- **Parallele Hypothesen**: Jede Hypothese wird von einem eigenen Agent geprüft (1 Agent = 1 Hypothese)
- **Bedingte E2E-Phase**: Playwright-Test als Regressionsschutz wenn der Bug UI-sichtbar war

**Kernregel: Erst verstehen, dann fixen.** Niemals Code ändern bevor die Root Cause durch Phase 1-3 bestätigt ist.

**Anti-Pattern: Direkt zu Phase 4 springen.** Das ist Shotgun-Debugging — es fühlt sich schnell an, dauert aber im Schnitt länger und erzeugt neue Bugs.

---

## Wie committen wir? — Atomare Commits (MANDATORY)

Während der Arbeit **regelmäßig und selbstständig** atomare Commits erstellen — nicht erst am Ende. Jeder logisch abgeschlossene Schritt wird sofort committet.

### Commit-Regeln

- **Ein Commit = eine logische Änderung** — Wenn die Message schwer zu schreiben ist, ist der Commit zu groß
- **Dateien einzeln stagen** (`git add <file1> <file2> ...`) — NIEMALS `git add .` oder `git add -A`
- **Alle Commit-Messages in Englisch**

### Commit-Message-Format

```text
<type>(<scope>): Kurze Zusammenfassung (max ~50 Zeichen)

Ausführliche Erklärung WARUM diese Änderung nötig war.
Was war das Problem? Welche Alternative wurde verworfen?
Max 72 Zeichen pro Zeile im Body.
```

- **Subject Line** — Imperativ ("Add", "Fix", "Refactor"), nicht Vergangenheit
- **Body** — Erklärt das WARUM, nicht das WAS (das zeigt das Diff)

### Typ-Prefixe

| Prefix      | Bedeutung                   |
|-------------|-----------------------------|
| `feat:`     | Neues Feature               |
| `fix:`      | Bugfix                      |
| `refactor:` | Keine Verhaltensänderung    |
| `perf:`     | Performance-Verbesserung    |
| `docs:`     | Nur Dokumentation           |
| `test:`     | Nur Tests                   |
| `chore:`    | Build, Dependencies, Config |

### Anti-Patterns

- `"Fix bug"` — Welcher Bug? Wo? Warum trat er auf?
- `"Update code"` — Das sagt git diff schon
- `"WIP"` — Sollte nie in main landen
- `"misc changes"` — Verschleiert, was passiert ist
- Riesige Commits — Wenn die Message schwer zu schreiben ist, ist der Commit zu groß

### Litmus-Test

Stell dir vor, ein Kollege liest in 6 Monaten `git log` und sucht, wann ein bestimmtes Verhalten eingeführt wurde. Findet er deinen Commit? Versteht er sofort, warum die Änderung gemacht wurde?

### Issue-Referenzen

`Closes #142` und `Refs #87` am Ende des Body verbinden Code-Geschichte mit Projekt-Geschichte.

---

## Wann parallelisieren wir? — Agent Teams (MANDATORY)

Claude Code entscheidet selbstständig, ob ein Agent Team gespawnt wird. Folgende Matrix gilt:

**Team spawnen wenn:**

- 3+ unabhängige Arbeitsbereiche parallel bearbeitbar sind (z.B. Backend + Frontend + Tests)
- Jeder Teammate eigene Dateien bearbeitet (keine Dateikonflikte)
- Cross-Layer-Aufgaben vorliegen (z.B. API-Endpoint + UI-Komponente + Tests gleichzeitig)
- Mehrere konkurrierende Hypothesen beim Debugging getestet werden sollen
- Code-Review aus verschiedenen Perspektiven gleichzeitig nötig ist (Security, Performance, Tests)
- Geschätzter Aufwand > 30 Minuten sequentieller Arbeit, der durch Parallelisierung signifikant verkürzt wird

**Kein Team nötig wenn:**

- Aufgabe sequentielle Abhängigkeiten hat (Schritt B braucht Ergebnis von A)
- Gleiche Dateien von mehreren Agents bearbeitet werden müssten
- Einzelner Bugfix, kleine Ergänzung, einfaches Refactoring
- Eine einzelne Perspektive ausreicht
- Subagents (Agent-Tool) den gleichen Nutzen bringen ohne Team-Overhead

**Typische Team-Szenarien:**

- **Cross-Layer Feature**: Backend-Dev (router.ts, agents) + Frontend-Dev (components/, hooks/) + Test-Writer (*.test.ts) — parallel, keine Dateikonflikte
- **Multi-Provider Debugging**: Je ein Debugger pro Provider-Hypothese + Architektur-Reviewer für gemeinsame Ursachen — konkurrierende Theorien parallel testen
- **Großes Refactoring**: Extractor (neues Modul bauen) + Migratoren (je eine Quelldatei umstellen) + Verifier (Biome/TypeScript als Quality-Gate, keine Edits)
- **PR-Review (20+ Dateien)**: Security-Reviewer + Architecture-Reviewer + Test-Reviewer — drei Perspektiven gleichzeitig

**Regeln:**

- Kein Team ohne kurze Begründung an den User (1 Satz warum Team sinnvoll ist)
- Delegate Mode bevorzugen wenn Lead nur koordinieren soll
- Teammates immer sauber herunterfahren und Team aufräumen nach Abschluss

---

## Was gilt immer? — Wichtige Patterns

- **Keine README.md als Orientierung**: README-Dateien können veraltet sein. Zur Codebase-Orientierung ausschließlich den tatsächlichen Code lesen (Imports, Klassen, Funktionen, Tests). Der Code ist die einzige verlässliche Source of Truth.
- **Monorepo-Imports**: Shared-Package wird als `@chat-exporter/shared` importiert — niemals relative Pfade über Package-Grenzen hinweg verwenden.
- **Biome statt ESLint/Prettier**: Code-Qualität wird ausschließlich über Biome geprüft und formatiert.

---

## Tooling — Entire.io Integration

Dieses Repository nutzt `entire.io` um AI-Agent-Sessions zu tracken. Entire zeichnet automatisch alle Prompts, Reasoning und Tool-Ausführungen im Hintergrund auf.

Regeln für nahtloses autonomes Arbeiten:

1. **Häufig committen:** Standard `git commit`s erstellen wenn ein logischer Arbeitsabschnitt abgeschlossen oder ein Bug erfolgreich gefixt ist. Entire nutzt Git-Commits um vollständige "Checkpoints" der Konversation zu speichern.
2. **Selbst-Korrektur via Rewind:** Bei schwerwiegenden Fehlern (Dateien korrumpiert, wichtiger Code gelöscht, falscher Weg eingeschlagen) NICHT manuell reparieren. Stattdessen `entire rewind` im Terminal ausführen — das stellt die Codebase auf den letzten funktionierenden Checkpoint zurück.
3. **Initialisierung:** Wenn Entire nicht aktiv ist, darf `entire enable --agent claude` im Terminal ausgeführt werden.
4. **Status prüfen:** `entire status` zeigt ob die Session korrekt aufgezeichnet wird.
