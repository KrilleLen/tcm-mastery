# Mästaren · TCM Study OS

En körbar, mobilanpassad studieapp för traditionell kinesisk medicin, akupunktur, örter och formler. Appen är byggd för att träna strukturerat resonemang och källmedvetenhet — inte för att ge vårdråd.

## Innehåll och funktioner

- 48 kliniska kapitel med sökning på tillstånd, engelska namn och mönster.
- 361 klassiska akupunkturpunktkoder med meridianfilter och sökning.
- 102 örtkort med kategori, mönsterlogik, funktion och säkerhetsfrågor.
- 58 unika formelkort med mönster, kategori och ingrediensstruktur.
- Repetitionsmotor för alla fyra registren. Självbedömning och använd ledtråd styr nästa repetitionsdatum.
- Stegvisa patientfall som sparar valt fall, valda frågor, mönster och skrivna utkast lokalt.
- Muntliga mästarfrågor och svensk taluppläsning där webbläsaren stöder det.
- Tydliga säkerhetsspärrar kring rödflaggor, läkemedel, graviditet, toxicitet och invasiv teknik.
- PWA-stöd för installation och offlineanvändning.

## Viktig avgränsning

Repo:t innehåller inte kopierade boktexter. Innehållet är en pedagogisk studieöversikt. Exakta doser, nåldjup, nålriktningar, interaktioner och anatomiska detaljer ska verifieras i studentens egen upplaga, fysisk atlas och kvalificerad handledning.

Appen är ett utbildningsverktyg. Den ersätter inte legitimerad sjukvård, kvalificerad handledning eller individuell medicinsk bedömning. Traditionell teori, kursbok, modern evidens och klinisk säkerhet ska hållas åtskilda.

## Kör lokalt

Appen är statisk och kräver ingen produktionsbyggnad.

```bash
python3 -m http.server 5173
```

Öppna sedan `http://localhost:5173`.

## Testa

```bash
npm ci
npm test
```

Testsviten kontrollerar JavaScript-syntax, registerstorlek, obligatoriska fält, dubletter, filkopplingar, sökflöden, filter, repetition, patientfall och återställning från lokal lagring.

## Publicering

Push till `main` kör testerna och publicerar därefter endast de filer som behövs av GitHub Pages. Ett enda publiceringsflöde används för att undvika konkurrerande eller avbrutna driftsättningar.
