# New medicines import report

Source: docs/newdrugs.md. Existing medicines, prices, shelf flags, accounts and permissions were left unchanged.

Added **105 medicines / 140 selling options**; skipped **8 source lines**.

## Problems and handling

- Oxynic, klovinal and amovulin: omitted at the owner's request.
- Aptizooom, Luex, ciprolex: confirmed spelling/name matches were skipped. Luex prices were confirmed at GHS 40, but the existing LEUX entry was not updated.
- Amoksiklav: only suspension 457 and 228.5 were added; capsules 1g/625 were skipped as the confirmed existing AMOSKICLAV entries.
- Menota, Fisherman's friend, Diofen and Flucor: existing entries retained without changing prices, units, names or aliases.
- Box/strip/blister: each listed price buys one named pack. Blister means strip. No box-to-strip conversion was inferred; unknown pack conversions are separate stock options.
- Explicit 2= prices: preserved as one priced **2-unit bundle**, never converted to a one-unit price. Dynewell tablets are a separate 2-unit bundle from its syrup. Stock counts for these options count bundles, not individual tablets.
- Prices without a ghc prefix (Malar suspension, phopain, tothema full, secure strip) were read as GHS from context.
- Leading hyphens identify variants; hyphens next to ghc do not. First listed option appears first. Small/medium/large and distinct forms are separate stock options.
- Underscored aliases were copied, separated with commas; supplied spellings were preserved rather than medically reinterpreted.
- Foligrow jnr syrup, eye drops, and other explicitly different forms/strengths were kept separate from existing broader names.
- Missing prices are GHS 0 and cannot be sold until priced: **Foligrow jnr syrp, Polygel, Morphine tab, letavit, budex, kristen, gogynax, viginax, gyno micolex, polygynax, dermiron plus, eskypan**.

## Every source line

| Line | Medicine | Action | Prices (GHS) | Other names | Handling |
|---|---|---|---|---|---|
| 1 | Feroglobin | add | Default: 120.00; Feroglobin plus: 180.00 |  | New medicine and selling options. |
| 2 | Polyfer | add | Default: 30.00; Polyfer small: 10.00 |  | New medicine and selling options. |
| 3 | Cirotamin | add | Cirotamin syrp: 35.00; Cirotamin caps: 30.00 |  | New medicine and selling options. |
| 4 | Abyvita caps | add | box: 10.00; strip: 5.00 |  | New medicine and selling options. |
| 5 | Abytone caps | add | box: 15.00; strip: 5.00 |  | New medicine and selling options. |
| 6 | Zincofer | add | Zincofer syrp: 30.00; Zincofer caps: 30.00 |  | New medicine and selling options. |
| 7 | Glo power syrp | add | Default: 40.00 |  | New medicine and selling options. |
| 8 | COA mixture | add | Default: 150.00; COA mixture plus: 200.00 |  | New medicine and selling options. |
| 9 | Foligrow jnr syrp | add | Default: 0.00 |  | New medicine and selling options. |
| 10 | Tres-orix | add | Tres-orix small: 50.00; Tres-orix large: 90.00 |  | New medicine and selling options. |
| 11 | Aptizooom | skip | Default: 0.00 |  | Owner confirmed Aptizooom is the existing APITIZOOM; leave it unchanged. |
| 12 | Super apiti | add | Super apiti syrp: 30.00; Super apiti caps: 5.00 |  | New medicine and selling options. |
| 13 | Antacid plus (antacid, antiflatulent) | add | Default: 40.00 |  | New medicine and selling options. |
| 14 | Luex | skip | Luex adult (dry): 40.00; Luex adult (night): 40.00; Luex kids (chest): 40.00; Luex kids (dry): 40.00 |  | Owner confirmed Luex is the existing LEUX COUGH SYRUPS; leave it unchanged. All four listed prices were confirmed as GHS 40, but existing entries must not be updated. |
| 15 | X flux | add | Default: 20.00 | flucoxacillin suspension | New medicine and selling options. |
| 16 | Amoksiklav suspension | add | Amoksiklav suspension 457: 80.00; Amoksiklav suspension 228.5: 60.00 | amoxicillin clanulanic acid | New medicine and selling options. |
| 17 | Oxynic , klovinal, amovulin | skip | Default: 60.00 | amoskiklav 625, amoxicillin clanulanic acid 625 | Owner explicitly deferred Oxynic, klovinal and amovulin. |
| 18 | Amokxinate suspension 228.5 | add | Default: 60.00 | amoxicillin clanulanic acid | New medicine and selling options. |
| 19 | Nugel | add | Default: 60.00 |  | New medicine and selling options. |
| 20 | Nugel O | add | Default: 60.00 |  | New medicine and selling options. |
| 21 | Ancigel O | add | Default: 40.00 |  | New medicine and selling options. |
| 22 | Antacid(entrance) | add | Default: 40.00 |  | New medicine and selling options. |
| 23 | Gastrone | add | Default: 40.00 |  | New medicine and selling options. |
| 24 | Magacid | add | Default: 30.00 |  | New medicine and selling options. |
| 25 | Ciprolex eye drop | add | Default: 40.00 |  | New medicine and selling options. |
| 26 | Chloramphenicol eye drop | add | Default: 20.00 |  | New medicine and selling options. |
| 27 | ECL antacid | add | Default: 40.00 |  | New medicine and selling options. |
| 28 | Pepto bismal | add | Default: 160.00 |  | New medicine and selling options. |
| 29 | Galvus met blister | add | strip: 90.00 |  | New medicine and selling options. |
| 30 | Zyfen 120 | add | Default: 80.00 |  | New medicine and selling options. |
| 31 | Polygel | add | Default: 0.00 |  | New medicine and selling options. |
| 32 | Skydipin 30 | add | Default: 5.00 | nefidipine | New medicine and selling options. |
| 33 | Nifecard XL 30mg | add | Default: 80.00 | nefidipine | New medicine and selling options. |
| 34 | Morphine tab | add | Default: 0.00 |  | New medicine and selling options. |
| 35 | Addyzoa blister | add | strip: 180.00 |  | New medicine and selling options. |
| 36 | Haemoglobin syrp | add | Haemoglobin syrp green: 15.00; Haemoglobin syrp yellow: 20.00 |  | New medicine and selling options. |
| 37 | Dynewell | add | Dynewell syrp: 15.00; Dynewell tab (2 units): 5.00 |  | New medicine and selling options. |
| 38 | Calcium B12 suspension | add | Default: 20.00 |  | New medicine and selling options. |
| 39 | Malar 2 | add | Malar 2 tab: 30.00; Malar 2 suspension: 30.00 |  | New medicine and selling options. |
| 40 | Arfan 20/120 | add | Default: 10.00 | 44, 4 4, four four | New medicine and selling options. |
| 41 | Cartef ds | add | Default: 20.00 |  | New medicine and selling options. |
| 42 | Dicnac SR 75 | add | Default: 20.00 | diclofenac caps | New medicine and selling options. |
| 43 | Asnac | add | Asnac 75: 20.00; Asnac 100: 20.00 |  | New medicine and selling options. |
| 44 | No-spa 40mg | add | Default: 30.00 | Nospa | New medicine and selling options. |
| 45 | Dicnac gel | add | Default: 20.00 | diclofenac gel | New medicine and selling options. |
| 46 | Mupirocine | add | Default: 65.00 |  | New medicine and selling options. |
| 47 | Pilex | add | Pilex ointment: 100.00; Pilex tab: 150.00 |  | New medicine and selling options. |
| 48 | Mercy ointment | add | Mercy ointment large: 50.00; Mercy ointment small: 30.00; Mercy ointment tube: 15.00 |  | New medicine and selling options. |
| 49 | Lofnac gel | add | Default: 20.00 | diclofenac gel | New medicine and selling options. |
| 50 | Ketazol | add | Ketazol shampoo: 60.00; Ketazol cream: 30.00 |  | New medicine and selling options. |
| 51 | Blue Polar ice gel | add | Default: 50.00 |  | New medicine and selling options. |
| 52 | Ronak balm | add | Default: 20.00 |  | New medicine and selling options. |
| 53 | Savlon | add | Savlon small: 35.00; Savlon medium: 50.00; Savlon large: 110.00 |  | New medicine and selling options. |
| 54 | Camel | add | Camel small: 20.00; Camel medium: 35.00; Camel large: 50.00 |  | New medicine and selling options. |
| 55 | Silver bird | add | Default: 70.00 |  | New medicine and selling options. |
| 56 | Mr. Q | add | Default: 15.00 |  | New medicine and selling options. |
| 57 | Milzol plus cream | add | Default: 15.00 |  | New medicine and selling options. |
| 58 | Menota blister | skip | strip: 30.00 |  | Existing MENOTA; do not change its name, unit or price. |
| 59 | Fisherman’s friend pack | skip | pack: 30.00 |  | Existing FISHERMAN’S FRIEND; preserve its packet and price. |
| 60 | Diofen 50 | skip | Default: 5.00 | diclofenac tab | Existing DIOFEN 50; leave its price and other names unchanged. |
| 61 | Efpac | add | Default: 5.00 | fpac | New medicine and selling options. |
| 62 | keffen caps | add | Default: 10.00 |  | New medicine and selling options. |
| 63 | andydol forte | add | Default: 10.00 |  | New medicine and selling options. |
| 64 | redsun (oral gel) | add | pack: 5.00; box: 20.00 |  | New medicine and selling options. |
| 65 | redsun caps | add | Default: 25.00 |  | New medicine and selling options. |
| 66 | amciclox | add | Default: 5.00 |  | New medicine and selling options. |
| 67 | letacam | add | Default: 5.00 |  | New medicine and selling options. |
| 68 | habigal | add | Default: 15.00 |  | New medicine and selling options. |
| 69 | CPM 4mg | add | 2 units: 5.00 |  | New medicine and selling options. |
| 70 | prednisolone 5mg | add | 2 units: 5.00 | piritin | New medicine and selling options. |
| 71 | Enamycin 250mg | add | Default: 10.00 | erythromycine | New medicine and selling options. |
| 72 | panacin | add | Default: 10.00 |  | New medicine and selling options. |
| 73 | snuf | add | snuf green: 7.00; snuf yellow: 7.00; snuf shamor: 10.00; snuf hajia: 15.00 |  | New medicine and selling options. |
| 74 | strobin | add | Default: 5.00 | streptol | New medicine and selling options. |
| 75 | O-formin | add | strip: 5.00; box: 50.00 | metformin | New medicine and selling options. |
| 76 | enaphage 500 | add | Default: 5.00 | metformin | New medicine and selling options. |
| 77 | Metformin Denk 500 | add | strip: 20.00; box: 200.00 |  | New medicine and selling options. |
| 78 | Metformin Denk 1000 | add | Default: 130.00 |  | New medicine and selling options. |
| 79 | ciprolex | skip | Default: 40.00 |  | Owner confirmed ciprolex is this existing tablet entry; eye drops remain a different new entry. |
| 80 | ezipen | add | Default: 5.00 |  | New medicine and selling options. |
| 81 | menstak | add | Default: 20.00 |  | New medicine and selling options. |
| 82 | phopain | add | 2 units: 5.00 | forpain | New medicine and selling options. |
| 83 | flucor | skip | flucor day: 50.00; flucor night: 50.00 |  | Both versions already exist as separate medicines; leave both unchanged. |
| 84 | tothema | add | tothema full: 150.00; tothema half: 75.00 |  | New medicine and selling options. |
| 85 | ebony | add | Default: 10.00 | condom | New medicine and selling options. |
| 86 | kiss | add | kiss condom: 10.00; kiss lubricant: 45.00 |  | New medicine and selling options. |
| 87 | fiesta | add | fiesta condom: 10.00; fiesta lubricant: 45.00 |  | New medicine and selling options. |
| 88 | levon 2 | add | levon 2 lubricant: 40.00; levon 2 contraceptive: 20.00 |  | New medicine and selling options. |
| 89 | lydia | add | Default: 20.00 |  | New medicine and selling options. |
| 90 | secure | add | box: 30.00; strip: 10.00 |  | New medicine and selling options. |
| 91 | contra 72 | add | Default: 20.00 |  | New medicine and selling options. |
| 92 | rough rider | add | Default: 30.00 |  | New medicine and selling options. |
| 93 | condom box | add | condom box big: 150.00; condom box small: 120.00 |  | New medicine and selling options. |
| 94 | teeda syrp | add | Default: 20.00 |  | New medicine and selling options. |
| 95 | FoliVit plus | add | Default: 150.00 | folic acid syrp | New medicine and selling options. |
| 96 | kidivite | add | Default: 50.00 | multivitamin syrup | New medicine and selling options. |
| 97 | tobvital | add | Default: 30.00 | multivitamin syrup | New medicine and selling options. |
| 98 | kidicare | add | Default: 50.00 |  | New medicine and selling options. |
| 99 | letavit | add | Default: 0.00 |  | New medicine and selling options. |
| 100 | budex | add | Default: 0.00 |  | New medicine and selling options. |
| 101 | kristen | add | Default: 0.00 | dexamethasone | New medicine and selling options. |
| 102 | pregnancy test kit | add | Default: 5.00 |  | New medicine and selling options. |
| 103 | gogynax | add | Default: 0.00 |  | New medicine and selling options. |
| 104 | viginax | add | Default: 0.00 |  | New medicine and selling options. |
| 105 | gyno micolex | add | Default: 0.00 |  | New medicine and selling options. |
| 106 | polygynax | add | Default: 0.00 |  | New medicine and selling options. |
| 107 | dermiron plus | add | Default: 0.00 |  | New medicine and selling options. |
| 108 | Rifabon | add | Default: 40.00 | rifampicin caps | New medicine and selling options. |
| 109 | eskypan | add | Default: 0.00 |  | New medicine and selling options. |
| 110 | dragon | add | dragon spray: 65.00; dragon tablet: 60.00 |  | New medicine and selling options. |
| 111 | hiegra | add | Default: 10.00 | tiger | New medicine and selling options. |
| 112 | vegera | add | Default: 10.00 |  | New medicine and selling options. |
| 113 | postinor 2 | add | Default: 5.00 |  | New medicine and selling options. |
