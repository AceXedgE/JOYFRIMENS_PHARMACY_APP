# Tomjoy price-list import

516 non-empty medicine rows; 489 unique medicine entries; 503 selling options.

252 medicines have no stated price and remain at GH₵0.

## Three-asterisk entries

- CLINDAMYCIN 300mg: 30ghc*** (source row 51)
- MUCOTIN ADULT: 35ghc*** (source row 107)

## Interpretation and review notes

- Row 3: AMOXICILLIN is a parent heading; its variants become medicine entries.
- Row 16: METRONIDAZOLE is a parent heading; its variants become medicine entries.
- Row 22: METROLEX F is a parent heading; its variants become medicine entries.
- Row 25: SEPTRIN / CO TRIMOXAZOLE is a parent heading; its variants become medicine entries.
- Row 29: AZITHROMYCIN is a parent heading; its variants become medicine entries.
- Row 36: CIPROFLOXACIN is a parent heading; its variants become medicine entries.
- Row 44: FLUCLOXACIN is a parent heading; its variants become medicine entries.
- Row 48: repeated FLUCLOXACIN SUSPENSION; merged with row 47. A stated price takes precedence over a blank price.
- Row 49: CLINDAMYCIN is a parent heading; its variants become medicine entries.
- Row 53: “250mg” is a strength, not a price; CLINDAMYCIN suspension 250mg imported at zero.
- Row 54: CEFIXIME is a parent heading; its variants become medicine entries.
- Row 57: CEFUROXIME is a parent heading; its variants become medicine entries.
- Row 62: LEVOFLOXACIN is a parent heading; its variants become medicine entries.
- Row 67: TEVA retained exactly as named, GH₵30; the document does not explicitly identify its medicine. Please review.
- Row 142: SALO COLD TABLETS “1=5ghc1” read as 1 unit = GH₵5; trailing 1 ignored.
- Row 149: COLGATE MOUTH WASH “6Oghc” read as GH₵60 (letter O).
- Row 167: unpriced parent BRUFEN/IBUPROFEN omitted because its named variants follow.
- Row 179: repeated IBUCAP; merged with row 178. A stated price takes precedence over a blank price.
- Row 184: unpriced parent PARACETAMOL omitted because its named variants follow.
- Row 265: repeated PREGNACARE; merged with row 264. A stated price takes precedence over a blank price.
- Row 266: repeated PREGNACARE; merged with row 264. A stated price takes precedence over a blank price.
- Row 267: repeated PREGNACARE; merged with row 264. A stated price takes precedence over a blank price.
- Row 271: repeated VALUPAK; merged with row 270. A stated price takes precedence over a blank price.
- Row 279: repeated WELLWOMAN/WELLMAN; merged with row 278. A stated price takes precedence over a blank price.
- Row 292: DISPERSIBLE retained under preceding COARTEM family, price missing.
- Row 319: repeated MORPHINE INJ; merged with row 225. A stated price takes precedence over a blank price.
- Row 321: repeated PETHIDINE INJ; merged with row 226. A stated price takes precedence over a blank price.
- Row 379: repeated AMLODIPINE 10mg; merged with row 378. A stated price takes precedence over a blank price.
- Row 381: repeated AMLODIPINE 5mg; merged with row 380. A stated price takes precedence over a blank price.
- Row 502: repeated M2-TONE; merged with row 263. A stated price takes precedence over a blank price.
- Row 506: repeated LEVOTHYROXINE; merged with row 440. A stated price takes precedence over a blank price.
- Row 531: repeated AUGMENTIN 625mg; merged with row 388. A stated price takes precedence over a blank price.
- Row 540: repeated SYMBICORT; merged with row 494. A stated price takes precedence over a blank price.
- METHODEX SIZE/BIG remains GH₵50 and SIZE/SMALL GH₵80, exactly as supplied; verify the apparent size/price reversal.
- Unspecified quantities are generic units, not assumed tablets, strips or bottles. Quantity deals are explicit selling options; selecting 3 single units does not automatically substitute the 3-unit deal.

Categories are not imported. Each medicine is listed as available on both shops' shelves, with no shelf or storeroom quantities. Exact repeated names are merged; different named variants remain separate. See the CSV for every imported selling option.
