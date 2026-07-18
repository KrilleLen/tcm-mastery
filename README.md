# Mästaren · TCM Study OS

En körbar, mobilanpassad studieapp för traditionell kinesisk medicin, akupunktur, örter och formler. Projektet är byggt för att göra studentens resonemang synligt och mätbart — inte för att leverera vårdråd.

## Vad som fungerar i version 1

- Sammanhängande kunskapsgraf: symtom → frågor → mönster → mekanism → princip → punkt/ört/formel → säkerhet → uppföljning.
- Diagnostiskt flöde som låser behandlingsval tills resonemanget är genomfört.
- Interaktiv punktatlas med fram-/baksida, självtest och säkerhetsspärr för nålparametrar utan källa.
- Örtjämförelse för två till fem örter.
- Formellaboratorium för rollanalys, borttagning och modifiering utan falskt ”godkännande”.
- Stegvisa patientfall med säkerhetsscreening, anamnes, differentialdiagnostik och uppföljning.
- Muntligt mästarförhör med webbläsarens taluppläsning och, där det stöds, taligenkänning.
- Spaced repetition som väger in första svar, försök, ledtrådar, svarstid och säkerhet.
- Källstatus för varje post: verifierad, pedagogisk, inferens eller saknar stöd.
- Importmall för lagligt införskaffade anteckningar och strukturerat material.
- PWA-stöd och GitHub Pages-workflow.

## Viktig avgränsning

Repo:t innehåller inte kopierade boktexter. Demonstrationsdata är tydligt märkta och exakta doser, nåldjup, interaktioner och bokreferenser lämnas tomma när importerad källa saknas. Appen ska då säga:

> Det går inte att dra en säker slutsats från det tillgängliga källmaterialet.

## Kör lokalt

```bash
npm install
npm run dev
```

Öppna adressen som Vite visar, normalt `http://localhost:5173`.

## Produktionsbygge

```bash
npm run build
npm run preview
```

## Publicera med GitHub Pages

1. Skapa ett nytt GitHub-repo, exempelvis `tcm-mastery`.
2. Lägg in projektfilerna och pusha till `main`.
3. Gå till **Settings → Pages → Build and deployment** och välj **GitHub Actions**.
4. Workflow-filen `.github/workflows/deploy.yml` bygger och publicerar appen automatiskt.

## Importformat

Se `data/import-template.json`. En importerad kunskapspost bör minst ha:

- unik id,
- nodtyp,
- titel och sammanfattning,
- bok, upplaga, kapitel/avsnitt och sida när tillgängligt,
- tydlig källstatus,
- relationer till andra noder,
- bekräftelse att materialet får användas.

## Nästa utvecklingssteg

- Backend med användarkonto och krypterad synkronisering.
- Adminverktyg för OCR-granskning av lagliga utdrag.
- Full anatomisk SVG-modell med regionlager och punktvalidering.
- AI-lärare via serverfunktion där API-nyckeln aldrig exponeras i klienten.
- Versionshanterad källredaktion med dubbelgranskning.
- Fler fallvarianter och examenspipeline.

## Säkerhet

Appen är ett utbildningsverktyg. Den ersätter inte legitimerad sjukvård, kvalificerad handledning eller individuell medicinsk bedömning. Traditionell teori, kursbok, modern evidens och klinisk säkerhet ska hållas åtskilda.

## Förhandsvisning

![Dashboard](docs/preview-dashboard.png)

Mobilversion finns i `docs/preview-mobile.png`.
