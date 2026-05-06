import type { PrismaClient } from "../app/generated/prisma/client";

interface CuratedTrim {
  code: string;
  bodyStyle?: string;
  drivetrain?: string;
  fuelType: "PETROL" | "DIESEL" | "ELECTRIC" | "HYBRID";
  engineCode?: string;
  displacementL?: number;
  horsepower?: number;
  notes?: string;
}

interface CuratedGeneration {
  modelSlug: string;
  generationCode: string;
  /** Source URL the trim list was compiled from. Each row in `trims` is
   *  expected to be defensible from this single source. */
  source: string;
  trims: CuratedTrim[];
}

/**
 * Hand-picked trims for the most common Russian-market generations. The full
 * Mercedes lineup spans hundreds of variants — this set covers what customers
 * actually drive into the shop. Generations not in this list rely on the
 * isDefault=true fallback ("Все варианты этого поколения").
 *
 * Sourcing policy: each generation block cites a single canonical source URL.
 * Every row in that block must be defensible from that source. Domain-recall
 * trims (engine code + hp from memory, not from a citation) are forbidden —
 * they're how subtle data errors get into production.
 */
const CURATED: CuratedGeneration[] = [
  // G-Class W460 (1979 – 1991) — original civilian
  {
    modelSlug: "g-class",
    generationCode: "W460",
    source: "https://en.wikipedia.org/wiki/Mercedes-Benz_G-Class",
    trims: [
      { code: "200 GE", drivetrain: "4×4", fuelType: "PETROL", engineCode: "M 102.964 E20", displacementL: 2.0, horsepower: 118, notes: "1986–1991" },
      { code: "230 G", drivetrain: "4×4", fuelType: "PETROL", engineCode: "M 115.973", displacementL: 2.3, horsepower: 91, notes: "карбюратор; 1979–1982" },
      { code: "230 GE", drivetrain: "4×4", fuelType: "PETROL", engineCode: "M 115.973 E23", displacementL: 2.3, horsepower: 126, notes: "впрыск; 1982–1990" },
      { code: "280 GE", drivetrain: "4×4", fuelType: "PETROL", engineCode: "M 110.994", displacementL: 2.8, horsepower: 158, notes: "I6; 1979–1990" },
      { code: "320 GE", drivetrain: "4×4", fuelType: "PETROL", engineCode: "M 104.994", displacementL: 3.2, horsepower: 224, notes: "I6; 1979–1990" },
      { code: "240 GD", drivetrain: "4×4", fuelType: "DIESEL", engineCode: "OM 616.936/938/941", displacementL: 2.4, horsepower: 72, notes: "1979–1988" },
      { code: "250 GD", drivetrain: "4×4", fuelType: "DIESEL", engineCode: "OM 602.930", displacementL: 2.5, horsepower: 85, notes: "1988–1991" },
      { code: "300 GD", drivetrain: "4×4", fuelType: "DIESEL", engineCode: "OM 617.931/932", displacementL: 3.0, horsepower: 88, notes: "I5 дизель; 1979–1991" },
    ],
  },
  // G-Class W461 (1985 – 2022) — Puch G / utility & military; civilian through 2019
  {
    modelSlug: "g-class",
    generationCode: "W461",
    source: "https://en.wikipedia.org/wiki/Mercedes-Benz_G-Class",
    trims: [
      { code: "230 GE / G 230", drivetrain: "4×4", fuelType: "PETROL", engineCode: "M 102 E 23", displacementL: 2.3, horsepower: 125, notes: "1992–2001" },
      { code: "250 GD Wolf", drivetrain: "4×4", fuelType: "DIESEL", engineCode: "OM 602.930", displacementL: 2.5, horsepower: 92, notes: "1990–1991" },
      { code: "290 GD / G 290 DIESEL", drivetrain: "4×4", fuelType: "DIESEL", engineCode: "OM 602 D 29", displacementL: 2.9, horsepower: 95, notes: "1992–1997" },
      { code: "290 GD T / G 290 TURBODIESEL", drivetrain: "4×4", fuelType: "DIESEL", engineCode: "OM 602 DE 29 LA", displacementL: 2.9, horsepower: 121, notes: "1998–2001" },
      { code: "300 GD Wolf", drivetrain: "4×4", fuelType: "DIESEL", engineCode: "OM 617.932", displacementL: 3.0, horsepower: 121, notes: "1985–1987" },
      { code: "G 270 CDI Worker", drivetrain: "4×4", fuelType: "DIESEL", engineCode: "OM 612 DE 27 LA", displacementL: 2.7, horsepower: 156, notes: "I5 турбо; 2001–2006" },
      { code: "G 280 CDI Worker / Professional", drivetrain: "4×4", fuelType: "DIESEL", engineCode: "OM 642 DE 30 LA", displacementL: 3.0, horsepower: 184, notes: "V6 турбо; 2007–2014" },
      { code: "G 300 CDI Professional", drivetrain: "4×4", fuelType: "DIESEL", engineCode: "OM 642 DE 30 LA", displacementL: 3.0, notes: "HP not documented in source; 2010–2019" },
    ],
  },
  // G-Class W463 (1990 – 2018) — classic luxury
  {
    modelSlug: "g-class",
    generationCode: "W463",
    source: "https://en.wikipedia.org/wiki/Mercedes-Benz_G-Class",
    trims: [
      { code: "G 300", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 103.987 E 30", displacementL: 3.0, notes: "1990–1994; HP not documented in source" },
      { code: "G 320 (M104)", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 104.996 E 32", displacementL: 3.2, notes: "I6; 1994–2005" },
      { code: "G 320 (V6 M112)", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 112.945 E 32", displacementL: 3.2, notes: "V6; 2005–2012" },
      { code: "G 500 (M117)", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 117.965 E 50", displacementL: 5.0, horsepower: 241, notes: "V8; 1998–2005" },
      { code: "G 550 / G 500 (M113)", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 113.965 E 50", displacementL: 5.0, horsepower: 382, notes: "V8; 2009–2018" },
      { code: "G 250 Diesel", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 602.931 D 25", displacementL: 2.5, notes: "1990s; HP not documented in source" },
      { code: "G 270 CDI", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 612.965 DE 27 LA", displacementL: 2.7, notes: "I5 турбо; 2001–2006" },
      { code: "G 350 CDI", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 642 DE 30 LA", displacementL: 3.0, horsepower: 211, notes: "V6 турбо; 2006–2010" },
      { code: "G 350 BlueTEC", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 642 DE 30 LA", displacementL: 3.0, horsepower: 211, notes: "V6 турбо; 2010–2015 (ребрендинг G 350 CDI)" },
      { code: "G 350 d", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 642 DE 30 LA", displacementL: 3.0, horsepower: 245, notes: "V6 турбо, рестайлинг; 2015–2018" },
      { code: "G 400 CDI", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 606.964 D 30 LA", displacementL: 3.0, notes: "I6 турбо; 2001–2006" },
      { code: "G 36 AMG", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 104.992", displacementL: 3.6, notes: "1994–1997" },
      { code: "G 55 AMG", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 113.965 E 55", displacementL: 5.4, horsepower: 469, notes: "V8 атмо AMG; 2002–2004" },
      { code: "G 55 AMG Kompressor", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 113 E 55 ML", displacementL: 5.4, horsepower: 500, notes: "V8 компрессор AMG; 2004–2012" },
      { code: "G 63 AMG V12 (M137)", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 137 E 63", displacementL: 6.3, horsepower: 443, notes: "V12; 2001–2003" },
      { code: "G 63 AMG (M157)", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 157 DE 55", displacementL: 5.5, horsepower: 544, notes: "V8 битурбо AMG; 2012–2018 (вариации 544/571 л.с. по годам)" },
      { code: "G 65 AMG", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 279 E 60 AL", displacementL: 6.0, horsepower: 612, notes: "V12 битурбо AMG; 2012–2018" },
      { code: "G 500 4×4²", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 176", displacementL: 4.0, horsepower: 416, notes: "V8 битурбо; 2015–2018" },
      { code: "Maybach G 650 Landaulet", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 279", displacementL: 6.0, horsepower: 621, notes: "V12 битурбо; 2017" },
    ],
  },
  // G-Class W463A (2018 – 2024) — second-generation W463 (per Wikipedia, also
  // designated W463A or W464 in different sources). We use W463A for picker
  // consistency with aftermarket-parts naming.
  {
    modelSlug: "g-class",
    generationCode: "W463A",
    source: "https://en.wikipedia.org/wiki/Mercedes-Benz_G-Class",
    trims: [
      { code: "G 350 d", bodyStyle: "long", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 656", displacementL: 3.0, horsepower: 286, notes: "I6 дизель — Mercedes spec sheet, not Wikipedia" },
      { code: "G 400 d", bodyStyle: "long", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 656", displacementL: 3.0, horsepower: 330, notes: "I6 дизель — Mercedes spec sheet, not Wikipedia" },
      { code: "G 500", bodyStyle: "long", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 176", displacementL: 4.0, horsepower: 422, notes: "V8 битурбо — Mercedes spec sheet, not Wikipedia" },
      { code: "G 63 AMG", bodyStyle: "long", drivetrain: "4MATIC+", fuelType: "PETROL", engineCode: "M 177", displacementL: 4.0, horsepower: 585, notes: "AMG handcrafted V8 — Mercedes spec sheet, not Wikipedia" },
    ],
  },
  // G-Class W465 (2024 – present) — facelift second-generation luxury G.
  // Mild-hybrid I6 lineup replaces V8 G 500 with M256 inline-6, adds the
  // electric G 580. AMG G 63 retains the 4.0 V8 biturbo with mild hybrid.
  {
    modelSlug: "g-class",
    generationCode: "W465",
    source: "https://www.auto-data.net/en/mercedes-benz-g-class-long-w465-generation-9955",
    trims: [
      { code: "G 450 d", bodyStyle: "long", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 656", displacementL: 3.0, horsepower: 367, notes: "I6 mild hybrid; 2024–" },
      { code: "G 500", bodyStyle: "long", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 256", displacementL: 3.0, horsepower: 449, notes: "I6 mild hybrid; 2024–" },
      { code: "G 580 with EQ Technology", bodyStyle: "long", drivetrain: "4MATIC", fuelType: "ELECTRIC", horsepower: 587, notes: "4× электромоторы, батарея 116 кВт·ч, запас хода 434–473 км; 2024–" },
      { code: "AMG G 63", bodyStyle: "long", drivetrain: "4MATIC+", fuelType: "PETROL", engineCode: "M 177", displacementL: 4.0, horsepower: 585, notes: "V8 битурбо mild hybrid AMG; 2024–" },
    ],
  },
  // ===== Compact saloons =====
  // A-Class W168 (1997 – 2004) — original hatchback, sandwich-floor platform.
  {
    modelSlug: "a-class",
    generationCode: "W168",
    source: "https://www.auto-data.net/en/mercedes-benz-a-class-w168-generation-2787",
    trims: [
      { code: "A 140", drivetrain: "FWD", fuelType: "PETROL", displacementL: 1.4, horsepower: 82, notes: "I4; 1997–2004" },
      { code: "A 160", drivetrain: "FWD", fuelType: "PETROL", displacementL: 1.6, horsepower: 102, notes: "I4; 1997–2004" },
      { code: "A 190", drivetrain: "FWD", fuelType: "PETROL", displacementL: 1.9, horsepower: 125, notes: "I4; 1997–2004" },
      { code: "A 160 CDI", drivetrain: "FWD", fuelType: "DIESEL", displacementL: 1.7, horsepower: 60, notes: "I4 турбо; 1998–2004" },
      { code: "A 170 CDI", drivetrain: "FWD", fuelType: "DIESEL", displacementL: 1.7, horsepower: 90, notes: "I4 турбо; 1998–2004" },
    ],
  },
  // A-Class W169 (2004 – 2012) — second-gen, lengthened.
  {
    modelSlug: "a-class",
    generationCode: "W169",
    source: "https://www.auto-data.net/en/mercedes-benz-a-class-w169-generation-2786",
    trims: [
      { code: "A 150", drivetrain: "FWD", fuelType: "PETROL", horsepower: 95, notes: "I4; 2004–2008" },
      { code: "A 170", drivetrain: "FWD", fuelType: "PETROL", horsepower: 115, notes: "I4; 2004–2012" },
      { code: "A 200", drivetrain: "FWD", fuelType: "PETROL", horsepower: 136, notes: "I4; 2004–2012" },
      { code: "A 200 Turbo", drivetrain: "FWD", fuelType: "PETROL", horsepower: 193, notes: "I4 турбо; 2005–2012" },
      { code: "A 160 CDI", drivetrain: "FWD", fuelType: "DIESEL", horsepower: 82, notes: "I4 турбо; 2004–2012" },
      { code: "A 180 CDI", drivetrain: "FWD", fuelType: "DIESEL", horsepower: 109, notes: "I4 турбо; 2004–2012" },
      { code: "A 200 CDI", drivetrain: "FWD", fuelType: "DIESEL", horsepower: 140, notes: "I4 турбо; 2007–2012" },
    ],
  },
  // A-Class W176 (2012 – 2018) — switched to conventional hatchback platform (NGCC).
  {
    modelSlug: "a-class",
    generationCode: "W176",
    source: "https://www.auto-data.net/en/mercedes-benz-a-class-w176-generation-4106",
    trims: [
      { code: "A 160 CDI", drivetrain: "FWD", fuelType: "DIESEL", displacementL: 1.5, horsepower: 90, notes: "OM 607 (Renault K9K); 2012–2015" },
      { code: "A 180", drivetrain: "FWD", fuelType: "PETROL", displacementL: 1.6, horsepower: 122, notes: "M 270 турбо I4; 2012–2018" },
      { code: "A 180 CDI", drivetrain: "FWD", fuelType: "DIESEL", displacementL: 1.5, horsepower: 109, notes: "OM 607; 2012–2018" },
      { code: "A 200", drivetrain: "FWD", fuelType: "PETROL", displacementL: 1.6, horsepower: 156, notes: "M 270 турбо; 2012–2018" },
      { code: "A 200 CDI", drivetrain: "FWD", fuelType: "DIESEL", displacementL: 1.5, horsepower: 136, notes: "OM 607; 2012–2018" },
      { code: "A 220 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", displacementL: 2.0, horsepower: 184, notes: "M 270 турбо; 2012–2018" },
      { code: "A 220 CDI", drivetrain: "FWD", fuelType: "DIESEL", displacementL: 2.1, horsepower: 170, notes: "OM 651; 2012–2018" },
      { code: "A 250", drivetrain: "FWD", fuelType: "PETROL", displacementL: 2.0, horsepower: 211, notes: "M 270 турбо; 2012–2018" },
      { code: "A 250 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", displacementL: 2.0, horsepower: 211, notes: "M 270 турбо; 2013–2018" },
      { code: "AMG A 45", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 133", displacementL: 2.0, horsepower: 360, notes: "AMG handcrafted I4 турбо; 2013–2018 (FL: 381 л.с.)" },
    ],
  },
  // A-Class W177 (2018 – present) — current generation (MFA2 platform).
  {
    modelSlug: "a-class",
    generationCode: "W177",
    source: "https://www.auto-data.net/en/mercedes-benz-a-class-w177-generation-6101",
    trims: [
      { code: "A 160", drivetrain: "FWD", fuelType: "PETROL", displacementL: 1.3, horsepower: 109, notes: "M 282 (Mercedes-Renault); 2018–" },
      { code: "A 180", drivetrain: "FWD", fuelType: "PETROL", displacementL: 1.4, horsepower: 136, notes: "M 282; 2018–" },
      { code: "A 180 d", drivetrain: "FWD", fuelType: "DIESEL", displacementL: 1.5, horsepower: 116, notes: "OM 654q (Renault); 2018–" },
      { code: "A 200", drivetrain: "FWD", fuelType: "PETROL", displacementL: 1.4, horsepower: 163, notes: "M 282; 2018–" },
      { code: "A 200 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", displacementL: 1.4, horsepower: 163, notes: "M 282; 2019–" },
      { code: "A 200 d", drivetrain: "FWD", fuelType: "DIESEL", displacementL: 1.5, horsepower: 150, notes: "OM 654q; 2018–" },
      { code: "A 200 d 4MATIC", drivetrain: "4MATIC", fuelType: "DIESEL", displacementL: 1.5, horsepower: 150, notes: "OM 654q; 2019–" },
      { code: "A 220", drivetrain: "FWD", fuelType: "PETROL", displacementL: 2.0, horsepower: 190, notes: "M 260; 2018–" },
      { code: "A 220 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", displacementL: 2.0, horsepower: 190, notes: "M 260; 2018–" },
      { code: "A 220 d", drivetrain: "FWD", fuelType: "DIESEL", displacementL: 2.0, horsepower: 190, notes: "OM 654; 2018–" },
      { code: "A 220 d 4MATIC", drivetrain: "4MATIC", fuelType: "DIESEL", displacementL: 2.0, horsepower: 190, notes: "OM 654; 2018–" },
      { code: "A 250", drivetrain: "FWD", fuelType: "PETROL", displacementL: 2.0, horsepower: 224, notes: "M 260; 2018–" },
      { code: "A 250 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", displacementL: 2.0, horsepower: 224, notes: "M 260; 2018–" },
      { code: "A 250 e", drivetrain: "FWD", fuelType: "HYBRID", displacementL: 1.3, horsepower: 218, notes: "бензин+электро PHEV (M 282 + EM); батарея 15.6 кВт·ч; 2020–" },
      { code: "AMG A 35 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 260", displacementL: 2.0, horsepower: 306, notes: "AMG performance; 2018–" },
      { code: "AMG A 45 4MATIC+", drivetrain: "4MATIC+", fuelType: "PETROL", engineCode: "M 139", displacementL: 2.0, horsepower: 387, notes: "AMG handcrafted I4 турбо; 2019–" },
      { code: "AMG A 45 S 4MATIC+", drivetrain: "4MATIC+", fuelType: "PETROL", engineCode: "M 139", displacementL: 2.0, horsepower: 421, notes: "AMG handcrafted I4 турбо; 2019–" },
    ],
  },
  // B-Class W245 (2005 – 2011) — first Sport Tourer.
  {
    modelSlug: "b-class",
    generationCode: "W245",
    source: "https://www.auto-data.net/en/mercedes-benz-b-class-w245-generation-2726",
    trims: [
      { code: "B 150", drivetrain: "FWD", fuelType: "PETROL", displacementL: 1.5, horsepower: 95, notes: "I4; 2005–2008" },
      { code: "B 170", drivetrain: "FWD", fuelType: "PETROL", displacementL: 1.7, horsepower: 116, notes: "I4; 2005–2011" },
      { code: "B 200", drivetrain: "FWD", fuelType: "PETROL", displacementL: 2.0, horsepower: 136, notes: "I4; 2005–2011" },
      { code: "B 200 Turbo", drivetrain: "FWD", fuelType: "PETROL", displacementL: 2.0, horsepower: 193, notes: "I4 турбо; 2005–2011" },
      { code: "B 180 CDI", drivetrain: "FWD", fuelType: "DIESEL", displacementL: 1.8, horsepower: 109, notes: "OM 640 турбо; 2005–2011" },
      { code: "B 200 CDI", drivetrain: "FWD", fuelType: "DIESEL", displacementL: 2.0, horsepower: 140, notes: "OM 640 турбо; 2005–2011" },
    ],
  },
  // B-Class W246 (2011 – 2018) — switched to NGCC platform (shared with W176).
  {
    modelSlug: "b-class",
    generationCode: "W246",
    source: "https://www.auto-data.net/en/mercedes-benz-b-class-w246-generation-3858",
    trims: [
      { code: "B 160 CDI", drivetrain: "FWD", fuelType: "DIESEL", horsepower: 90, notes: "OM 607; 2011–2018" },
      { code: "B 180", drivetrain: "FWD", fuelType: "PETROL", horsepower: 122, notes: "M 270 турбо; 2011–2018" },
      { code: "B 180 CDI", drivetrain: "FWD", fuelType: "DIESEL", displacementL: 1.8, horsepower: 109, notes: "OM 651 турбо; 2011–2018" },
      { code: "B 200", drivetrain: "FWD", fuelType: "PETROL", horsepower: 156, notes: "M 270 турбо; 2011–2018" },
      { code: "B 200 CDI", drivetrain: "FWD", fuelType: "DIESEL", horsepower: 136, notes: "OM 651 турбо; 2011–2018" },
      { code: "B 220 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", horsepower: 184, notes: "M 270 турбо; 2014–2018" },
      { code: "B 220 CDI", drivetrain: "FWD", fuelType: "DIESEL", horsepower: 170, notes: "OM 651 турбо; 2011–2018" },
      { code: "B 250", drivetrain: "FWD", fuelType: "PETROL", horsepower: 211, notes: "M 270 турбо; 2011–2018" },
    ],
  },
  // B-Class W247 (2018 – present) — current Sport Tourer (MFA2 platform).
  {
    modelSlug: "b-class",
    generationCode: "W247",
    source: "https://www.auto-data.net/en/mercedes-benz-b-class-w247-generation-6581",
    trims: [
      { code: "B 160", drivetrain: "FWD", fuelType: "PETROL", displacementL: 1.3, horsepower: 109, notes: "M 282; 2018–" },
      { code: "B 160 d", drivetrain: "FWD", fuelType: "DIESEL", displacementL: 1.5, horsepower: 95, notes: "OM 654q; 2018–" },
      { code: "B 180", drivetrain: "FWD", fuelType: "PETROL", displacementL: 1.4, horsepower: 136, notes: "M 282; 2018–" },
      { code: "B 180 d", drivetrain: "FWD", fuelType: "DIESEL", displacementL: 1.5, horsepower: 116, notes: "OM 654q; 2018–" },
      { code: "B 200", drivetrain: "FWD", fuelType: "PETROL", displacementL: 1.4, horsepower: 163, notes: "M 282; 2018–" },
      { code: "B 200 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", displacementL: 1.4, horsepower: 163, notes: "M 282; 2019–" },
      { code: "B 200 d", drivetrain: "FWD", fuelType: "DIESEL", displacementL: 1.5, horsepower: 150, notes: "OM 654q; 2018–" },
      { code: "B 200 d 4MATIC", drivetrain: "4MATIC", fuelType: "DIESEL", displacementL: 1.5, horsepower: 150, notes: "OM 654q; 2019–" },
      { code: "B 220", drivetrain: "FWD", fuelType: "PETROL", displacementL: 2.0, horsepower: 190, notes: "M 260; 2018–" },
      { code: "B 220 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", displacementL: 2.0, horsepower: 190, notes: "M 260; 2018–" },
      { code: "B 220 d", drivetrain: "FWD", fuelType: "DIESEL", displacementL: 2.0, horsepower: 190, notes: "OM 654; 2018–" },
      { code: "B 220 d 4MATIC", drivetrain: "4MATIC", fuelType: "DIESEL", displacementL: 2.0, horsepower: 190, notes: "OM 654; 2018–" },
      { code: "B 250", drivetrain: "FWD", fuelType: "PETROL", displacementL: 2.0, horsepower: 224, notes: "M 260; 2018–" },
      { code: "B 250 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", displacementL: 2.0, horsepower: 224, notes: "M 260; 2018–" },
      { code: "B 250 e", drivetrain: "FWD", fuelType: "HYBRID", displacementL: 1.3, horsepower: 218, notes: "бензин+электро PHEV (M 282 + EM); батарея 15.6 кВт·ч; 2019–" },
    ],
  },
  // CLA C117 (2013 – 2019) — first 4-door coupe / compact sedan.
  {
    modelSlug: "cla",
    generationCode: "C117",
    source: "https://www.auto-data.net/en/mercedes-benz-cla-coupe-c117-generation-4116",
    trims: [
      { code: "CLA 180", drivetrain: "FWD", fuelType: "PETROL", horsepower: 122, notes: "M 270 турбо; 2013–2019" },
      { code: "CLA 180 CDI", drivetrain: "FWD", fuelType: "DIESEL", horsepower: 109, notes: "OM 607; 2013–2019" },
      { code: "CLA 200", drivetrain: "FWD", fuelType: "PETROL", horsepower: 156, notes: "M 270 турбо; 2013–2019" },
      { code: "CLA 200 CDI", drivetrain: "FWD", fuelType: "DIESEL", horsepower: 136, notes: "OM 607; 2013–2019" },
      { code: "CLA 220 CDI", drivetrain: "FWD", fuelType: "DIESEL", horsepower: 177, notes: "OM 651 турбо; 2013–2019" },
      { code: "CLA 250", drivetrain: "FWD", fuelType: "PETROL", horsepower: 211, notes: "M 270 турбо; 2013–2019 (FL: 218 л.с.)" },
      { code: "CLA 250 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", horsepower: 211, notes: "M 270 турбо; 2013–2019" },
      { code: "AMG CLA 45", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 133", displacementL: 2.0, horsepower: 360, notes: "AMG handcrafted I4 турбо; 2013–2019 (FL: 381 л.с.)" },
    ],
  },
  // CLA C118 (2019 – present) — second-gen 4-door coupe (MFA2 platform).
  {
    modelSlug: "cla",
    generationCode: "C118",
    source: "https://www.auto-data.net/en/mercedes-benz-cla-coupe-c118-generation-6817",
    trims: [
      { code: "CLA 180", drivetrain: "FWD", fuelType: "PETROL", displacementL: 1.3, horsepower: 136, notes: "M 282; 2019–" },
      { code: "CLA 180 d", drivetrain: "FWD", fuelType: "DIESEL", displacementL: 1.5, horsepower: 116, notes: "OM 654q; 2019–" },
      { code: "CLA 200", drivetrain: "FWD", fuelType: "PETROL", displacementL: 1.3, horsepower: 163, notes: "M 282; 2019–" },
      { code: "CLA 200 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", displacementL: 1.3, horsepower: 163, notes: "M 282; 2019–" },
      { code: "CLA 200 d", drivetrain: "FWD", fuelType: "DIESEL", displacementL: 1.5, horsepower: 150, notes: "OM 654q; 2019–" },
      { code: "CLA 200 d 4MATIC", drivetrain: "4MATIC", fuelType: "DIESEL", displacementL: 1.5, horsepower: 150, notes: "OM 654q; 2019–" },
      { code: "CLA 220", drivetrain: "FWD", fuelType: "PETROL", horsepower: 190, notes: "M 260; 2019–" },
      { code: "CLA 220 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", horsepower: 190, notes: "M 260; 2019–" },
      { code: "CLA 220 d", drivetrain: "FWD", fuelType: "DIESEL", displacementL: 2.0, horsepower: 190, notes: "OM 654; 2019–" },
      { code: "CLA 250", drivetrain: "FWD", fuelType: "PETROL", displacementL: 2.0, horsepower: 224, notes: "M 260; 2019–" },
      { code: "CLA 250 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", displacementL: 2.0, horsepower: 224, notes: "M 260; 2019–" },
      { code: "CLA 250 e", drivetrain: "FWD", fuelType: "HYBRID", displacementL: 1.3, horsepower: 218, notes: "бензин+электро PHEV (M 282 + EM); батарея 15.6 кВт·ч; 2020–" },
      { code: "AMG CLA 35 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 260", displacementL: 2.0, horsepower: 306, notes: "AMG performance; 2019–" },
      { code: "AMG CLA 45 4MATIC+", drivetrain: "4MATIC+", fuelType: "PETROL", engineCode: "M 139", displacementL: 2.0, horsepower: 387, notes: "AMG handcrafted I4 турбо; 2019–" },
      { code: "AMG CLA 45 S 4MATIC+", drivetrain: "4MATIC+", fuelType: "PETROL", engineCode: "M 139", displacementL: 2.0, horsepower: 421, notes: "AMG handcrafted I4 турбо; 2019–" },
    ],
  },
  // GLE V167 (2019 – present) — pre-existing curated set; engine codes/HP
  // sourced from the previously-approved commit (vehicle-trims spec). Kept
  // pending an authoritative re-verification pass against Wikipedia.
  {
    modelSlug: "gle",
    generationCode: "V167",
    source: "previously-approved seed (vehicle-trims spec); needs re-verification",
    trims: [
      { code: "GLE 300 d", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 654", displacementL: 2.0, horsepower: 245 },
      { code: "GLE 350 d", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 656", displacementL: 3.0, horsepower: 272 },
      { code: "GLE 400 d", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 656", displacementL: 3.0, horsepower: 330 },
      { code: "GLE 450", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 256", displacementL: 3.0, horsepower: 367, notes: "I6 + EQ Boost" },
      { code: "AMG GLE 53", drivetrain: "4MATIC+", fuelType: "PETROL", engineCode: "M 256", displacementL: 3.0, horsepower: 435, notes: "AMG performance" },
      { code: "AMG GLE 63 S", drivetrain: "4MATIC+", fuelType: "PETROL", engineCode: "M 177", displacementL: 4.0, horsepower: 612, notes: "V8 битурбо AMG" },
    ],
  },
  // GLS X167 (2019 – present) — pre-existing curated set; needs re-verification.
  {
    modelSlug: "gls",
    generationCode: "X167",
    source: "previously-approved seed (vehicle-trims spec); needs re-verification",
    trims: [
      { code: "GLS 400 d", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 656", displacementL: 3.0, horsepower: 330 },
      { code: "GLS 450", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 256", displacementL: 3.0, horsepower: 367 },
      { code: "GLS 580", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 176", displacementL: 4.0, horsepower: 489, notes: "V8 битурбо" },
      { code: "AMG GLS 63", drivetrain: "4MATIC+", fuelType: "PETROL", engineCode: "M 177", displacementL: 4.0, horsepower: 612, notes: "AMG handcrafted" },
    ],
  },
  // ===== Mid-size saloons =====
  // C-Class W202 (1993 – 2000) — first C-Class.
  {
    modelSlug: "c-class",
    generationCode: "W202",
    source: "https://www.auto-data.net/en/mercedes-benz-c-class-w202-generation-2736",
    trims: [
      { code: "C 180", fuelType: "PETROL", engineCode: "M 111", displacementL: 1.8, horsepower: 122, notes: "I4; 1993–2000" },
      { code: "C 200", fuelType: "PETROL", engineCode: "M 111", displacementL: 2.0, horsepower: 136, notes: "I4; 1993–2000" },
      { code: "C 200 Kompressor", fuelType: "PETROL", engineCode: "M 111", displacementL: 2.0, horsepower: 192, notes: "I4 компрессор; 1995–2000" },
      { code: "C 220", fuelType: "PETROL", engineCode: "M 111", displacementL: 2.2, horsepower: 150, notes: "I4; 1993–1996" },
      { code: "C 230", fuelType: "PETROL", engineCode: "M 111", displacementL: 2.3, horsepower: 150, notes: "I4; 1996–2000" },
      { code: "C 230 Kompressor", fuelType: "PETROL", engineCode: "M 111", displacementL: 2.3, horsepower: 193, notes: "I4 компрессор; 1996–2000" },
      { code: "C 280", fuelType: "PETROL", engineCode: "M 104", displacementL: 2.8, horsepower: 193, notes: "I6; 1993–1997" },
      { code: "C 200 D", fuelType: "DIESEL", engineCode: "OM 601", displacementL: 2.0, horsepower: 88, notes: "I4 атм. дизель; 1993–2000" },
      { code: "C 220 D", fuelType: "DIESEL", engineCode: "OM 604", displacementL: 2.2, horsepower: 95, notes: "I4 атм. дизель; 1993–1996" },
      { code: "C 250 D", fuelType: "DIESEL", engineCode: "OM 605", displacementL: 2.5, horsepower: 113, notes: "I5 атм. дизель; 1993–2000" },
      { code: "C 250 Turbodiesel", fuelType: "DIESEL", engineCode: "OM 605", displacementL: 2.5, horsepower: 150, notes: "I5 турбо дизель; 1995–2000" },
      { code: "AMG C 36", fuelType: "PETROL", engineCode: "M 104", displacementL: 3.6, horsepower: 280, notes: "I6 AMG; 1993–1997" },
      { code: "AMG C 43", fuelType: "PETROL", engineCode: "M 113", displacementL: 4.3, horsepower: 306, notes: "V8 AMG; 1997–2000" },
    ],
  },
  // C-Class W203 (2000 – 2007) — second-gen.
  {
    modelSlug: "c-class",
    generationCode: "W203",
    source: "https://www.auto-data.net/en/mercedes-benz-c-class-w203-generation-2732",
    trims: [
      { code: "C 180", fuelType: "PETROL", engineCode: "M 111", displacementL: 1.8, horsepower: 129, notes: "I4; 2000–2002" },
      { code: "C 180 Kompressor", fuelType: "PETROL", engineCode: "M 271", displacementL: 1.8, horsepower: 143, notes: "I4 компрессор; 2002–2007" },
      { code: "C 200 Kompressor", fuelType: "PETROL", engineCode: "M 271", displacementL: 1.8, horsepower: 163, notes: "I4 компрессор; 2002–2007" },
      { code: "C 200 CGI", fuelType: "PETROL", engineCode: "M 271", displacementL: 1.8, horsepower: 170, notes: "I4 компрессор + DI; 2003–2007" },
      { code: "C 230 Kompressor", fuelType: "PETROL", engineCode: "M 271", displacementL: 1.8, horsepower: 192, notes: "I4 компрессор; 2002–2007" },
      { code: "C 240", fuelType: "PETROL", engineCode: "M 112", displacementL: 2.6, horsepower: 170, notes: "V6; 2000–2005" },
      { code: "C 320", fuelType: "PETROL", engineCode: "M 112", displacementL: 3.2, horsepower: 218, notes: "V6; 2000–2005" },
      { code: "C 200 CDI", fuelType: "DIESEL", engineCode: "OM 611", displacementL: 2.2, horsepower: 122, notes: "I4 турбо дизель; 2000–2007" },
      { code: "C 220 CDI", fuelType: "DIESEL", engineCode: "OM 611", displacementL: 2.2, horsepower: 143, notes: "I4 турбо дизель; 2000–2007" },
      { code: "C 270 CDI", fuelType: "DIESEL", engineCode: "OM 612", displacementL: 2.7, horsepower: 170, notes: "I5 турбо дизель; 2001–2005" },
      { code: "AMG C 30 CDI", fuelType: "DIESEL", engineCode: "OM 612", displacementL: 3.0, horsepower: 231, notes: "I5 турбо дизель AMG; 2003–2005 (редкий)" },
      { code: "AMG C 32", fuelType: "PETROL", engineCode: "M 112", displacementL: 3.2, horsepower: 354, notes: "V6 компрессор AMG; 2001–2004" },
      { code: "AMG C 55", fuelType: "PETROL", engineCode: "M 113", displacementL: 5.4, horsepower: 367, notes: "V8 AMG; 2004–2007" },
    ],
  },
  // C-Class W204 (2007 – 2014) — third-gen.
  {
    modelSlug: "c-class",
    generationCode: "W204",
    source: "https://www.auto-data.net/en/mercedes-benz-c-class-w204-generation-2730",
    trims: [
      { code: "C 180 Kompressor", fuelType: "PETROL", engineCode: "M 271", displacementL: 1.8, horsepower: 156, notes: "I4 компрессор; 2007–2010" },
      { code: "C 180 CGI BlueEFFICIENCY", fuelType: "PETROL", engineCode: "M 271", displacementL: 1.6, horsepower: 156, notes: "I4 турбо + DI; 2011–2014" },
      { code: "C 200 Kompressor", fuelType: "PETROL", engineCode: "M 271", displacementL: 1.8, horsepower: 184, notes: "I4 компрессор; 2007–2010" },
      { code: "C 200 CGI BlueEFFICIENCY", fuelType: "PETROL", engineCode: "M 271", displacementL: 1.8, horsepower: 184, notes: "I4 турбо + DI; 2010–2014" },
      { code: "C 230 V6", fuelType: "PETROL", engineCode: "M 272", displacementL: 2.5, horsepower: 204, notes: "V6; 2007–2009" },
      { code: "C 250 CGI BlueEFFICIENCY", fuelType: "PETROL", engineCode: "M 271", displacementL: 1.8, horsepower: 204, notes: "I4 турбо + DI; 2010–2014" },
      { code: "C 250 V6", fuelType: "PETROL", engineCode: "M 272", displacementL: 2.5, horsepower: 201, notes: "V6; 2007–2009" },
      { code: "C 250 V6 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 272", displacementL: 2.5, horsepower: 201, notes: "V6; 2007–2009" },
      { code: "C 280 V6", fuelType: "PETROL", engineCode: "M 272", displacementL: 3.0, horsepower: 231, notes: "V6; 2007–2009" },
      { code: "C 280 V6 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 272", displacementL: 3.0, horsepower: 231, notes: "V6; 2007–2009" },
      { code: "C 300 V6", fuelType: "PETROL", engineCode: "M 272", displacementL: 3.0, horsepower: 231, notes: "V6; 2007–2014" },
      { code: "C 300 V6 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 272", displacementL: 3.0, horsepower: 231, notes: "V6; 2007–2014" },
      { code: "C 350 V6", fuelType: "PETROL", engineCode: "M 272", displacementL: 3.5, horsepower: 272, notes: "V6; 2007–2011" },
      { code: "C 350 V6 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 272", displacementL: 3.5, horsepower: 272, notes: "V6; 2007–2011" },
      { code: "C 350 CGI BlueEFFICIENCY", fuelType: "PETROL", engineCode: "M 276", displacementL: 3.5, horsepower: 292, notes: "V6 DI; 2011–2014" },
      { code: "C 200 CDI", fuelType: "DIESEL", engineCode: "OM 651", displacementL: 2.2, horsepower: 136, notes: "I4 турбо дизель; 2008–2014" },
      { code: "C 220 CDI", fuelType: "DIESEL", engineCode: "OM 651", displacementL: 2.2, horsepower: 170, notes: "I4 турбо дизель; 2008–2014" },
      { code: "C 250 CDI BlueEFFICIENCY", fuelType: "DIESEL", engineCode: "OM 651", displacementL: 2.2, horsepower: 204, notes: "I4 турбо дизель; 2009–2014" },
      { code: "C 250 CDI BlueEFFICIENCY 4MATIC", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 651", displacementL: 2.2, horsepower: 204, notes: "I4 турбо дизель; 2011–2014" },
      { code: "C 320 CDI V6", fuelType: "DIESEL", engineCode: "OM 642", displacementL: 3.0, horsepower: 224, notes: "V6 турбо дизель; 2007–2010" },
      { code: "C 320 CDI V6 4MATIC", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 642", displacementL: 3.0, horsepower: 224, notes: "V6 турбо дизель; 2008–2010" },
      { code: "C 350 CDI BlueEFFICIENCY", fuelType: "DIESEL", engineCode: "OM 642", displacementL: 3.0, horsepower: 231, notes: "V6 турбо дизель; 2010–2014" },
      { code: "AMG C 63", fuelType: "PETROL", engineCode: "M 156", displacementL: 6.2, horsepower: 457, notes: "V8 атм AMG; 2008–2014 (вариации 451/487 л.с.)" },
    ],
  },
  // C-Class W205 (2014 – 2021) — re-verified against auto-data.net.
  {
    modelSlug: "c-class",
    generationCode: "W205",
    source: "https://www.auto-data.net/en/mercedes-benz-c-class-w205-generation-4111",
    trims: [
      { code: "C 160", fuelType: "PETROL", engineCode: "M 274", displacementL: 1.6, horsepower: 129, notes: "I4 турбо; 2014–2018" },
      { code: "C 180", fuelType: "PETROL", engineCode: "M 274", displacementL: 1.6, horsepower: 156, notes: "I4 турбо; 2014–2018" },
      { code: "C 180 d", fuelType: "DIESEL", engineCode: "OM 626", displacementL: 1.6, horsepower: 116, notes: "I4 турбо дизель; 2014–2018" },
      { code: "C 200", fuelType: "PETROL", engineCode: "M 274", displacementL: 2.0, horsepower: 184, notes: "I4 турбо; 2014–2018 (FL: M 264 EQ Boost 1.5L)" },
      { code: "C 200 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 274", displacementL: 2.0, horsepower: 184, notes: "I4 турбо; 2015–2018" },
      { code: "C 200 d", fuelType: "DIESEL", engineCode: "OM 651", displacementL: 2.1, horsepower: 136, notes: "I4 турбо дизель; 2014–2018" },
      { code: "C 220 d", fuelType: "DIESEL", engineCode: "OM 651", displacementL: 2.1, horsepower: 170, notes: "I4 турбо дизель; 2014–2018 (FL: OM 654 2.0L)" },
      { code: "C 220 d 4MATIC", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 651", displacementL: 2.1, horsepower: 170, notes: "I4 турбо дизель; 2014–2018" },
      { code: "C 250", fuelType: "PETROL", engineCode: "M 274", displacementL: 2.0, horsepower: 211, notes: "I4 турбо; 2014–2018" },
      { code: "C 250 d", fuelType: "DIESEL", engineCode: "OM 651", displacementL: 2.1, horsepower: 204, notes: "I4 турбо дизель; 2014–2018" },
      { code: "C 250 d 4MATIC", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 651", displacementL: 2.1, horsepower: 204, notes: "I4 турбо дизель; 2014–2018" },
      { code: "C 300", fuelType: "PETROL", engineCode: "M 274", displacementL: 2.0, horsepower: 245, notes: "I4 турбо; 2014–2018 (FL: 258 л.с.)" },
      { code: "C 300 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 274", displacementL: 2.0, horsepower: 241, notes: "I4 турбо; 2014–2018" },
      { code: "C 300 h", fuelType: "HYBRID", engineCode: "OM 651", displacementL: 2.1, horsepower: 231, notes: "дизель+электро гибрид (не PHEV); 2014–2017" },
      { code: "C 350 e", fuelType: "HYBRID", engineCode: "M 274", displacementL: 2.0, horsepower: 279, notes: "бензин+электро PHEV; батарея 6.4 кВт·ч; 2015–2018" },
      { code: "C 400 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 276", displacementL: 3.0, horsepower: 333, notes: "V6 битурбо; 2014–2015" },
      { code: "AMG C 43 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 276", displacementL: 3.0, horsepower: 367, notes: "V6 битурбо AMG; 2016–2018 (FL: 390 л.с.)" },
      { code: "AMG C 450 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 276", displacementL: 3.0, horsepower: 367, notes: "V6 битурбо; 2015–2016 (переименован в AMG C 43)" },
      { code: "AMG C 63", fuelType: "PETROL", engineCode: "M 177", displacementL: 4.0, horsepower: 476, notes: "V8 битурбо AMG; 2014–2021" },
      { code: "AMG C 63 S", fuelType: "PETROL", engineCode: "M 177", displacementL: 4.0, horsepower: 510, notes: "V8 битурбо AMG; 2014–2021" },
    ],
  },
  // C-Class W206 (2021 – present) — current generation.
  {
    modelSlug: "c-class",
    generationCode: "W206",
    source: "https://www.auto-data.net/en/mercedes-benz-c-class-w206-generation-8159",
    trims: [
      { code: "C 180", fuelType: "PETROL", engineCode: "M 254", displacementL: 1.5, horsepower: 170, notes: "I4 mild hybrid; 2021–" },
      { code: "C 180 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 254", displacementL: 1.5, horsepower: 170, notes: "I4 mild hybrid; 2021–" },
      { code: "C 200", fuelType: "PETROL", engineCode: "M 254", displacementL: 2.0, horsepower: 204, notes: "I4 mild hybrid; 2021–" },
      { code: "C 200 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 254", displacementL: 2.0, horsepower: 204, notes: "I4 mild hybrid; 2021–" },
      { code: "C 200 d", fuelType: "DIESEL", engineCode: "OM 654", displacementL: 2.0, horsepower: 163, notes: "I4 турбо дизель; 2021–" },
      { code: "C 220 d", fuelType: "DIESEL", engineCode: "OM 654", displacementL: 2.0, horsepower: 200, notes: "I4 турбо дизель mild hybrid; 2021–" },
      { code: "C 220 d 4MATIC", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 654", displacementL: 2.0, horsepower: 200, notes: "I4 турбо дизель mild hybrid; 2021–" },
      { code: "C 300", fuelType: "PETROL", engineCode: "M 254", displacementL: 2.0, horsepower: 258, notes: "I4 mild hybrid; 2021–" },
      { code: "C 300 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 254", displacementL: 2.0, horsepower: 258, notes: "I4 mild hybrid; 2021–" },
      { code: "C 300 d", fuelType: "DIESEL", engineCode: "OM 654", displacementL: 2.0, horsepower: 265, notes: "I4 турбо дизель mild hybrid; 2021–" },
      { code: "C 300 d 4MATIC", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 654", displacementL: 2.0, horsepower: 265, notes: "I4 турбо дизель mild hybrid; 2021–" },
      { code: "C 300 e", fuelType: "HYBRID", engineCode: "M 254", displacementL: 2.0, horsepower: 313, notes: "бензин+электро PHEV; батарея 25.4 кВт·ч; 2021–" },
      { code: "C 300 e 4MATIC", drivetrain: "4MATIC", fuelType: "HYBRID", engineCode: "M 254", displacementL: 2.0, horsepower: 313, notes: "бензин+электро PHEV; батарея 25.4 кВт·ч; 2021–" },
      { code: "C 300 de", fuelType: "HYBRID", engineCode: "OM 654", displacementL: 2.0, horsepower: 313, notes: "дизель+электро PHEV; батарея 25.4 кВт·ч; 2021–" },
      { code: "C 300 de 4MATIC", drivetrain: "4MATIC", fuelType: "HYBRID", engineCode: "OM 654", displacementL: 2.0, horsepower: 313, notes: "дизель+электро PHEV; батарея 25.4 кВт·ч; 2021–" },
      { code: "C 400 e 4MATIC", drivetrain: "4MATIC", fuelType: "HYBRID", engineCode: "M 254", displacementL: 2.0, horsepower: 381, notes: "бензин+электро PHEV; 2024–" },
      { code: "AMG C 43 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 139", displacementL: 2.0, horsepower: 421, notes: "AMG handcrafted I4 турбо + EM; 2022–" },
      { code: "AMG C 63 S E PERFORMANCE", drivetrain: "4MATIC+", fuelType: "HYBRID", engineCode: "M 139", displacementL: 2.0, horsepower: 680, notes: "I4 битурбо AMG + EM PHEV; батарея 6.1 кВт·ч; 2023–" },
    ],
  },
  // E-Class W124 (1985 – 1995) — pre-rebrand sold as 200 E/220 E etc., post-1993 facelift renamed E-Class (E 200/E 220/etc.).
  {
    modelSlug: "e-class",
    generationCode: "W124",
    source: "https://www.auto-data.net/en/mercedes-benz-e-class-w124-generation-2771",
    trims: [
      { code: "E 200", fuelType: "PETROL", engineCode: "M 102", displacementL: 2.0, horsepower: 136, notes: "I4 (продавался как 200 E до 1993)" },
      { code: "E 220", fuelType: "PETROL", engineCode: "M 111", displacementL: 2.2, horsepower: 150, notes: "I4 (220 E)" },
      { code: "E 280", fuelType: "PETROL", engineCode: "M 104", displacementL: 2.8, horsepower: 193, notes: "I6 (280 E)" },
      { code: "E 300 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 103", displacementL: 3.0, horsepower: 180, notes: "I6 (300 E 4MATIC)" },
      { code: "E 320", fuelType: "PETROL", engineCode: "M 104", displacementL: 3.2, horsepower: 220, notes: "I6 (320 E)" },
      { code: "E 420", fuelType: "PETROL", engineCode: "M 119", displacementL: 4.2, horsepower: 279, notes: "V8 (420 E)" },
      { code: "E 500", fuelType: "PETROL", engineCode: "M 119", displacementL: 5.0, horsepower: 320, notes: "V8 (500 E / 500 E AMG)" },
      { code: "E 200 D", fuelType: "DIESEL", engineCode: "OM 601", displacementL: 2.0, horsepower: 75, notes: "I4 атм. дизель (200 D)" },
      { code: "E 250 D", fuelType: "DIESEL", engineCode: "OM 605", displacementL: 2.5, horsepower: 113, notes: "I5 атм. дизель (250 D)" },
      { code: "E 250 Turbodiesel", fuelType: "DIESEL", engineCode: "OM 605", displacementL: 2.5, horsepower: 126, notes: "I5 турбо дизель" },
      { code: "E 300 D", fuelType: "DIESEL", engineCode: "OM 603", displacementL: 3.0, horsepower: 136, notes: "I6 атм. дизель (300 D)" },
      { code: "E 300 Turbodiesel", fuelType: "DIESEL", engineCode: "OM 603", displacementL: 3.0, horsepower: 147, notes: "I6 турбо дизель" },
      { code: "E 300 Turbodiesel 4MATIC", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 603", displacementL: 3.0, horsepower: 147, notes: "I6 турбо дизель 4MATIC" },
      { code: "AMG E 36", fuelType: "PETROL", engineCode: "M 104", displacementL: 3.6, horsepower: 272, notes: "I6 AMG; 1993–1995" },
      { code: "AMG E 60", fuelType: "PETROL", engineCode: "M 119", displacementL: 6.0, horsepower: 381, notes: "V8 AMG (редкий); 1993–1995" },
    ],
  },
  // E-Class W210 (1995 – 2002) — first oval-headlight gen.
  {
    modelSlug: "e-class",
    generationCode: "W210",
    source: "https://www.auto-data.net/en/mercedes-benz-e-class-w210-generation-2769",
    trims: [
      { code: "E 200", fuelType: "PETROL", engineCode: "M 111", displacementL: 2.0, horsepower: 136, notes: "I4; 1995–2002" },
      { code: "E 200 Kompressor", fuelType: "PETROL", engineCode: "M 111", displacementL: 2.0, horsepower: 192, notes: "I4 компрессор; 1997–2002" },
      { code: "E 230", fuelType: "PETROL", engineCode: "M 111", displacementL: 2.3, horsepower: 150, notes: "I4; 1995–1997" },
      { code: "E 240", fuelType: "PETROL", engineCode: "M 112", displacementL: 2.4, horsepower: 170, notes: "V6; 1997–2002" },
      { code: "E 280", fuelType: "PETROL", engineCode: "M 104", displacementL: 2.8, horsepower: 193, notes: "I6; 1995–1997" },
      { code: "E 280 V6", fuelType: "PETROL", engineCode: "M 112", displacementL: 2.8, horsepower: 204, notes: "V6; 1997–2002" },
      { code: "E 280 V6 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 112", displacementL: 2.8, horsepower: 204, notes: "V6; 1997–2002" },
      { code: "E 320", fuelType: "PETROL", engineCode: "M 104", displacementL: 3.2, horsepower: 220, notes: "I6; 1995–1997" },
      { code: "E 320 V6", fuelType: "PETROL", engineCode: "M 112", displacementL: 3.2, horsepower: 224, notes: "V6; 1997–2002" },
      { code: "E 320 V6 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 112", displacementL: 3.2, horsepower: 224, notes: "V6; 1997–2002" },
      { code: "E 420", fuelType: "PETROL", engineCode: "M 119", displacementL: 4.2, horsepower: 279, notes: "V8; 1996–1997" },
      { code: "E 430", fuelType: "PETROL", engineCode: "M 113", displacementL: 4.3, horsepower: 279, notes: "V8; 1997–2002" },
      { code: "AMG E 50", fuelType: "PETROL", engineCode: "M 119", displacementL: 5.0, horsepower: 347, notes: "V8 AMG; 1996–1997" },
      { code: "AMG E 55", fuelType: "PETROL", engineCode: "M 113", displacementL: 5.5, horsepower: 354, notes: "V8 AMG; 1997–2002" },
      { code: "E 200 D", fuelType: "DIESEL", engineCode: "OM 601", displacementL: 2.0, horsepower: 88, notes: "I4 атм. дизель; 1995–1999" },
      { code: "E 200 CDI", fuelType: "DIESEL", engineCode: "OM 611", displacementL: 2.2, horsepower: 102, notes: "I4 турбо дизель; 1999–2002" },
      { code: "E 220 D", fuelType: "DIESEL", engineCode: "OM 604", displacementL: 2.2, horsepower: 95, notes: "I4 атм. дизель; 1995–1999" },
      { code: "E 220 CDI", fuelType: "DIESEL", engineCode: "OM 611", displacementL: 2.2, horsepower: 125, notes: "I4 турбо дизель; 1999–2002" },
      { code: "E 250 D", fuelType: "DIESEL", engineCode: "OM 605", displacementL: 2.5, horsepower: 113, notes: "I5 атм. дизель; 1995–1999" },
      { code: "E 250 Turbodiesel", fuelType: "DIESEL", engineCode: "OM 605", displacementL: 2.5, horsepower: 150, notes: "I5 турбо дизель; 1995–1999" },
      { code: "E 290 Turbodiesel", fuelType: "DIESEL", engineCode: "OM 602", displacementL: 2.9, horsepower: 129, notes: "I5 турбо дизель; 1996–1999" },
      { code: "E 300 D", fuelType: "DIESEL", engineCode: "OM 606", displacementL: 3.0, horsepower: 136, notes: "I6 атм. дизель; 1995–1999" },
      { code: "E 300 Turbodiesel", fuelType: "DIESEL", engineCode: "OM 606", displacementL: 3.0, horsepower: 177, notes: "I6 турбо дизель; 1995–1999" },
    ],
  },
  // E-Class W211 (2002 – 2009) — next-gen with COMAND, 7G-TRONIC.
  {
    modelSlug: "e-class",
    generationCode: "W211",
    source: "https://www.auto-data.net/en/mercedes-benz-e-class-w211-generation-2767",
    trims: [
      { code: "E 200 Kompressor", fuelType: "PETROL", engineCode: "M 271", displacementL: 1.8, horsepower: 163, notes: "I4 компрессор; 2002–2009" },
      { code: "E 200 NGT", fuelType: "PETROL", engineCode: "M 271", displacementL: 1.8, horsepower: 163, notes: "I4 газ/бензин; 2004–2009" },
      { code: "E 240 V6", fuelType: "PETROL", engineCode: "M 112", displacementL: 2.6, horsepower: 177, notes: "V6; 2002–2005" },
      { code: "E 240 V6 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 112", displacementL: 2.6, horsepower: 177, notes: "V6; 2002–2005" },
      { code: "E 320 V6", fuelType: "PETROL", engineCode: "M 112", displacementL: 3.2, horsepower: 224, notes: "V6; 2002–2005" },
      { code: "E 320 V6 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 112", displacementL: 3.2, horsepower: 224, notes: "V6; 2002–2005" },
      { code: "E 350 V6", fuelType: "PETROL", engineCode: "M 272", displacementL: 3.5, horsepower: 272, notes: "V6; 2005–2009" },
      { code: "E 350 V6 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 272", displacementL: 3.5, horsepower: 272, notes: "V6; 2005–2009" },
      { code: "E 500 V8", fuelType: "PETROL", engineCode: "M 113", displacementL: 5.0, horsepower: 306, notes: "V8; 2002–2009" },
      { code: "E 500 V8 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 113", displacementL: 5.0, horsepower: 306, notes: "V8; 2003–2009" },
      { code: "AMG E 55", fuelType: "PETROL", engineCode: "M 113", displacementL: 5.5, horsepower: 476, notes: "V8 компрессор AMG; 2003–2006" },
      { code: "AMG E 63", fuelType: "PETROL", engineCode: "M 156", displacementL: 6.2, horsepower: 514, notes: "V8 атм AMG; 2006–2009" },
      { code: "E 200 CDI", fuelType: "DIESEL", engineCode: "OM 611", displacementL: 2.0, horsepower: 122, notes: "I4 турбо дизель; 2002–2009" },
      { code: "E 220 CDI", fuelType: "DIESEL", engineCode: "OM 646", displacementL: 2.2, horsepower: 150, notes: "I4 турбо дизель; 2002–2009" },
      { code: "E 270 CDI", fuelType: "DIESEL", engineCode: "OM 612", displacementL: 2.7, horsepower: 177, notes: "I5 турбо дизель; 2002–2005" },
      { code: "E 280 CDI V6", fuelType: "DIESEL", engineCode: "OM 642", displacementL: 3.0, horsepower: 190, notes: "V6 турбо дизель; 2005–2009" },
      { code: "E 280 CDI V6 4MATIC", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 642", displacementL: 3.0, horsepower: 190, notes: "V6 турбо дизель; 2005–2009" },
      { code: "E 320 CDI V6", fuelType: "DIESEL", engineCode: "OM 642", displacementL: 3.0, horsepower: 224, notes: "V6 турбо дизель; 2005–2009" },
      { code: "E 320 CDI V6 4MATIC", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 642", displacementL: 3.0, horsepower: 224, notes: "V6 турбо дизель; 2005–2009" },
      { code: "E 400 CDI", fuelType: "DIESEL", engineCode: "OM 628", displacementL: 4.0, horsepower: 260, notes: "V8 турбо дизель; 2002–2006" },
      { code: "E 420 CDI", fuelType: "DIESEL", engineCode: "OM 629", displacementL: 4.2, horsepower: 314, notes: "V8 турбо дизель; 2006–2009" },
    ],
  },
  // E-Class W212 (2009 – 2016) — angular look.
  {
    modelSlug: "e-class",
    generationCode: "W212",
    source: "https://www.auto-data.net/en/mercedes-benz-e-class-w212-generation-2765",
    trims: [
      { code: "E 200 BlueEFFICIENCY", fuelType: "PETROL", engineCode: "M 271", displacementL: 1.8, horsepower: 184, notes: "I4 турбо; 2013–2016" },
      { code: "E 200 CGI BlueEFFICIENCY", fuelType: "PETROL", engineCode: "M 271", displacementL: 1.8, horsepower: 184, notes: "I4 турбо + DI; 2009–2013" },
      { code: "E 250 BlueEFFICIENCY", fuelType: "PETROL", engineCode: "M 271", displacementL: 1.8, horsepower: 204, notes: "I4 турбо; 2013–2016" },
      { code: "E 250 CGI BlueEFFICIENCY", fuelType: "PETROL", engineCode: "M 271", displacementL: 1.8, horsepower: 204, notes: "I4 турбо + DI; 2009–2013" },
      { code: "E 300 V6", fuelType: "PETROL", engineCode: "M 272", displacementL: 3.0, horsepower: 231, notes: "V6; 2009–2011" },
      { code: "E 300 BlueEFFICIENCY V6", fuelType: "PETROL", engineCode: "M 276", displacementL: 3.0, horsepower: 252, notes: "V6 битурбо; 2011–2016" },
      { code: "E 300 BlueEFFICIENCY V6 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 276", displacementL: 3.0, horsepower: 252, notes: "V6 битурбо; 2011–2016" },
      { code: "E 350 V6", fuelType: "PETROL", engineCode: "M 272", displacementL: 3.5, horsepower: 272, notes: "V6; 2009–2011" },
      { code: "E 350 BlueEFFICIENCY V6", fuelType: "PETROL", engineCode: "M 276", displacementL: 3.5, horsepower: 306, notes: "V6 битурбо; 2011–2016" },
      { code: "E 350 BlueEFFICIENCY V6 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 276", displacementL: 3.5, horsepower: 306, notes: "V6 битурбо; 2011–2016" },
      { code: "E 500 V8", fuelType: "PETROL", engineCode: "M 273", displacementL: 5.5, horsepower: 388, notes: "V8; 2009–2011" },
      { code: "E 500 BlueEFFICIENCY V8", fuelType: "PETROL", engineCode: "M 278", displacementL: 4.7, horsepower: 408, notes: "V8 битурбо; 2011–2016" },
      { code: "E 550 V8", fuelType: "PETROL", engineCode: "M 278", displacementL: 4.7, horsepower: 382, notes: "V8 битурбо; 2011–2016" },
      { code: "AMG E 63", fuelType: "PETROL", engineCode: "M 157", displacementL: 5.5, horsepower: 525, notes: "V8 битурбо AMG; 2011–2016 (S: 557 л.с.)" },
      { code: "E 200 CDI BlueEFFICIENCY", fuelType: "DIESEL", engineCode: "OM 651", displacementL: 2.1, horsepower: 136, notes: "I4 турбо дизель; 2009–2013" },
      { code: "E 220 CDI BlueEFFICIENCY", fuelType: "DIESEL", engineCode: "OM 651", displacementL: 2.1, horsepower: 170, notes: "I4 турбо дизель; 2009–2016" },
      { code: "E 250 CDI BlueEFFICIENCY", fuelType: "DIESEL", engineCode: "OM 651", displacementL: 2.1, horsepower: 204, notes: "I4 турбо дизель; 2009–2016" },
      { code: "E 250 CDI BlueEFFICIENCY 4MATIC", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 651", displacementL: 2.1, horsepower: 204, notes: "I4 турбо дизель; 2010–2016" },
      { code: "E 300 CDI BlueEFFICIENCY V6", fuelType: "DIESEL", engineCode: "OM 642", displacementL: 3.0, horsepower: 231, notes: "V6 турбо дизель; 2009–2011" },
      { code: "E 350 CDI BlueEFFICIENCY V6", fuelType: "DIESEL", engineCode: "OM 642", displacementL: 3.0, horsepower: 231, notes: "V6 турбо дизель; 2009–2016 (FL: 265 л.с.)" },
      { code: "E 350 CDI BlueEFFICIENCY V6 4MATIC", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 642", displacementL: 3.0, horsepower: 231, notes: "V6 турбо дизель; 2009–2016" },
      { code: "E 350 BlueTEC V6", fuelType: "DIESEL", engineCode: "OM 642", displacementL: 3.0, horsepower: 211, notes: "V6 турбо дизель; 2011–2013" },
      { code: "E 300 BlueTEC Hybrid", fuelType: "HYBRID", engineCode: "OM 651", displacementL: 2.1, horsepower: 204, notes: "дизель+электро гибрид (не PHEV); 2012–2016" },
      { code: "E 400 V6 Hybrid", fuelType: "HYBRID", engineCode: "M 276", displacementL: 3.5, horsepower: 329, notes: "бензин+электро гибрид (не PHEV); 2013–2016" },
    ],
  },
  // E-Class W213 (2016 – 2023) — re-verified against auto-data.net.
  {
    modelSlug: "e-class",
    generationCode: "W213",
    source: "https://www.auto-data.net/en/mercedes-benz-e-class-w213-generation-4670",
    trims: [
      { code: "E 200", fuelType: "PETROL", engineCode: "M 274", displacementL: 2.0, horsepower: 184, notes: "I4 турбо; 2016–2020" },
      { code: "E 200 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 274", displacementL: 2.0, horsepower: 184, notes: "I4 турбо; 2016–2020" },
      { code: "E 200 EQ Boost", fuelType: "PETROL", engineCode: "M 264", displacementL: 2.0, horsepower: 197, notes: "I4 mild hybrid; 2020–2023" },
      { code: "E 200 EQ Boost 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 264", displacementL: 2.0, horsepower: 197, notes: "I4 mild hybrid; 2020–2023" },
      { code: "E 200 d", fuelType: "DIESEL", engineCode: "OM 654", displacementL: 2.0, horsepower: 160, notes: "I4 турбо дизель; 2016–2023 (вариации 150–160 л.с.)" },
      { code: "E 220 d", fuelType: "DIESEL", engineCode: "OM 654", displacementL: 2.0, horsepower: 194, notes: "I4 турбо дизель; 2016–2023" },
      { code: "E 220 d 4MATIC", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 654", displacementL: 2.0, horsepower: 194, notes: "I4 турбо дизель; 2016–2023" },
      { code: "E 250", fuelType: "PETROL", engineCode: "M 274", displacementL: 2.0, horsepower: 211, notes: "I4 турбо; 2016–2018" },
      { code: "E 300", fuelType: "PETROL", engineCode: "M 274", displacementL: 2.0, horsepower: 245, notes: "I4 турбо; 2016–2020" },
      { code: "E 300 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 274", displacementL: 2.0, horsepower: 241, notes: "I4 турбо; 2016–2020" },
      { code: "E 300 EQ Boost", fuelType: "PETROL", engineCode: "M 264", displacementL: 2.0, horsepower: 258, notes: "I4 mild hybrid; 2020–2023" },
      { code: "E 300 d", fuelType: "DIESEL", engineCode: "OM 654", displacementL: 2.0, horsepower: 245, notes: "I4 турбо дизель; 2018–2023" },
      { code: "E 300 de", fuelType: "HYBRID", engineCode: "OM 654", displacementL: 2.0, horsepower: 306, notes: "дизель+электро PHEV; батарея 13.5 кВт·ч; 2019–2023" },
      { code: "E 300 e", fuelType: "HYBRID", engineCode: "M 274", displacementL: 2.0, horsepower: 320, notes: "бензин+электро PHEV; батарея 13.5 кВт·ч; 2019–2023" },
      { code: "E 350", fuelType: "PETROL", engineCode: "M 264", displacementL: 2.0, horsepower: 299, notes: "I4 mild hybrid; 2020–2023" },
      { code: "E 350 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 264", displacementL: 2.0, horsepower: 255, notes: "I4 mild hybrid; 2018–2023" },
      { code: "E 350 d", fuelType: "DIESEL", engineCode: "OM 656", displacementL: 3.0, horsepower: 286, notes: "I6 турбо дизель; 2017–2023" },
      { code: "E 350 d 4MATIC", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 656", displacementL: 3.0, horsepower: 258, notes: "I6 турбо дизель; 2017–2023" },
      { code: "E 350 e", fuelType: "HYBRID", engineCode: "M 274", displacementL: 2.0, horsepower: 286, notes: "бензин+электро PHEV; 2016–2018" },
      { code: "E 400 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 276", displacementL: 3.0, horsepower: 333, notes: "V6 битурбо; 2016–2018" },
      { code: "E 400 d 4MATIC", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 656", displacementL: 3.0, horsepower: 340, notes: "I6 турбо дизель; 2018–2023" },
      { code: "E 450 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 256", displacementL: 3.0, horsepower: 367, notes: "I6 mild hybrid; 2018–2023" },
      { code: "AMG E 43", drivetrain: "4MATIC+", fuelType: "PETROL", engineCode: "M 276", displacementL: 3.0, horsepower: 401, notes: "V6 битурбо AMG; 2016–2018" },
      { code: "AMG E 53", drivetrain: "4MATIC+", fuelType: "PETROL", engineCode: "M 256", displacementL: 3.0, horsepower: 435, notes: "I6 mild hybrid AMG; 2018–2023" },
      { code: "AMG E 63", drivetrain: "4MATIC+", fuelType: "PETROL", engineCode: "M 177", displacementL: 4.0, horsepower: 571, notes: "V8 битурбо AMG; 2017–2023" },
      { code: "AMG E 63 S", drivetrain: "4MATIC+", fuelType: "PETROL", engineCode: "M 177", displacementL: 4.0, horsepower: 612, notes: "V8 битурбо AMG; 2017–2023" },
    ],
  },
  // E-Class W214 (2023 – present) — current generation; AMG E 53 is now PHEV.
  {
    modelSlug: "e-class",
    generationCode: "W214",
    source: "https://www.auto-data.net/en/mercedes-benz-e-class-w214-generation-9442",
    trims: [
      { code: "E 180", fuelType: "PETROL", engineCode: "M 254", displacementL: 2.0, horsepower: 170, notes: "I4 mild hybrid; 2023–" },
      { code: "E 200", fuelType: "PETROL", engineCode: "M 254", displacementL: 2.0, horsepower: 204, notes: "I4 mild hybrid; 2023–" },
      { code: "E 200 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 254", displacementL: 2.0, horsepower: 204, notes: "I4 mild hybrid; 2023–" },
      { code: "E 200 d", fuelType: "DIESEL", engineCode: "OM 654", displacementL: 2.0, horsepower: 163, notes: "I4 турбо дизель; 2023–" },
      { code: "E 220 d", fuelType: "DIESEL", engineCode: "OM 654", displacementL: 2.0, horsepower: 197, notes: "I4 турбо дизель; 2023–" },
      { code: "E 220 d 4MATIC", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 654", displacementL: 2.0, horsepower: 197, notes: "I4 турбо дизель; 2023–" },
      { code: "E 260", fuelType: "PETROL", engineCode: "M 254", displacementL: 2.0, horsepower: 204, notes: "I4 mild hybrid (для рынка КНР); 2023–" },
      { code: "E 300", fuelType: "PETROL", engineCode: "M 254", displacementL: 2.0, horsepower: 258, notes: "I4 mild hybrid; 2023–" },
      { code: "E 300 e", fuelType: "HYBRID", engineCode: "M 254", displacementL: 2.0, horsepower: 313, notes: "бензин+электро PHEV; батарея 25.4 кВт·ч; 2023–" },
      { code: "E 300 e 4MATIC", drivetrain: "4MATIC", fuelType: "HYBRID", engineCode: "M 254", displacementL: 2.0, horsepower: 313, notes: "бензин+электро PHEV; батарея 25.4 кВт·ч; 2023–" },
      { code: "E 300 de", fuelType: "HYBRID", engineCode: "OM 654", displacementL: 2.0, horsepower: 313, notes: "дизель+электро PHEV; батарея 25.4 кВт·ч; 2023–" },
      { code: "E 300 de 4MATIC", drivetrain: "4MATIC", fuelType: "HYBRID", engineCode: "OM 654", displacementL: 2.0, horsepower: 313, notes: "дизель+электро PHEV; батарея 25.4 кВт·ч; 2023–" },
      { code: "E 350", fuelType: "PETROL", engineCode: "M 254", displacementL: 2.0, horsepower: 255, notes: "I4 mild hybrid; 2023–" },
      { code: "E 350 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 254", displacementL: 2.0, horsepower: 255, notes: "I4 mild hybrid; 2023–" },
      { code: "E 400 e 4MATIC", drivetrain: "4MATIC", fuelType: "HYBRID", engineCode: "M 254", displacementL: 2.0, horsepower: 381, notes: "бензин+электро PHEV; 2024–" },
      { code: "E 450 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 256", displacementL: 3.0, horsepower: 381, notes: "I6 mild hybrid; 2023–" },
      { code: "E 450 d 4MATIC", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 656", displacementL: 3.0, horsepower: 367, notes: "I6 турбо дизель mild hybrid; 2023–" },
      { code: "AMG E 53 4MATIC+", drivetrain: "4MATIC+", fuelType: "HYBRID", engineCode: "M 256", displacementL: 3.0, horsepower: 585, notes: "I6 mild hybrid AMG + EM PHEV; батарея 21.2 кВт·ч; 2024–" },
      { code: "AMG E 53 Dynamic Plus", drivetrain: "4MATIC+", fuelType: "HYBRID", engineCode: "M 256", displacementL: 3.0, horsepower: 612, notes: "I6 mild hybrid AMG + EM PHEV (Dynamic Plus пакет); 2024–" },
    ],
  },
  // CLS C219 (2003 – 2010) — first 4-door coupe.
  {
    modelSlug: "cls",
    generationCode: "C219",
    source: "https://www.auto-data.net/en/mercedes-benz-cls-coupe-c219-generation-5386",
    trims: [
      { code: "CLS 320 CDI", fuelType: "DIESEL", engineCode: "OM 642", displacementL: 3.0, horsepower: 224, notes: "V6 турбо дизель; 2005–2010" },
      { code: "CLS 350", fuelType: "PETROL", engineCode: "M 272", displacementL: 3.5, horsepower: 272, notes: "V6; 2004–2010" },
      { code: "CLS 350 CGI", fuelType: "PETROL", engineCode: "M 272", displacementL: 3.5, horsepower: 292, notes: "V6 DI; 2008–2010" },
      { code: "CLS 500", fuelType: "PETROL", engineCode: "M 273", displacementL: 5.5, horsepower: 388, notes: "V8; 2006–2010" },
      { code: "CLS 550", fuelType: "PETROL", engineCode: "M 273", displacementL: 5.5, horsepower: 382, notes: "V8 (US-spec name; mostly export); 2007–2010" },
      { code: "AMG CLS 55", fuelType: "PETROL", engineCode: "M 113", displacementL: 5.5, horsepower: 476, notes: "V8 компрессор AMG; 2004–2006" },
      { code: "AMG CLS 63", fuelType: "PETROL", engineCode: "M 156", displacementL: 6.2, horsepower: 514, notes: "V8 атм AMG; 2006–2010" },
    ],
  },
  // CLS C218 (2011 – 2018) — second-gen + Shooting Brake (X218 share trims).
  {
    modelSlug: "cls",
    generationCode: "C218",
    source: "https://www.auto-data.net/en/mercedes-benz-cls-coupe-c218-generation-3860",
    trims: [
      { code: "CLS 250 CDI", fuelType: "DIESEL", engineCode: "OM 651", displacementL: 2.1, horsepower: 204, notes: "I4 турбо дизель; 2011–2014" },
      { code: "CLS 350 CDI", fuelType: "DIESEL", engineCode: "OM 642", displacementL: 3.0, horsepower: 265, notes: "V6 турбо дизель; 2011–2014" },
      { code: "CLS 350 CDI 4MATIC", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 642", displacementL: 3.0, horsepower: 265, notes: "V6 турбо дизель; 2011–2014" },
      { code: "CLS 350 BlueTEC", fuelType: "DIESEL", engineCode: "OM 642", displacementL: 3.0, horsepower: 248, notes: "V6 турбо дизель; 2014–2018" },
      { code: "CLS 350 BlueTEC 4MATIC", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 642", displacementL: 3.0, horsepower: 248, notes: "V6 турбо дизель; 2014–2018" },
      { code: "CLS 350", fuelType: "PETROL", engineCode: "M 276", displacementL: 3.5, horsepower: 306, notes: "V6 битурбо; 2011–2018" },
      { code: "CLS 500", fuelType: "PETROL", engineCode: "M 278", displacementL: 4.7, horsepower: 408, notes: "V8 битурбо; 2011–2018" },
      { code: "CLS 500 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 278", displacementL: 4.7, horsepower: 408, notes: "V8 битурбо; 2011–2018" },
      { code: "AMG CLS 63", fuelType: "PETROL", engineCode: "M 157", displacementL: 5.5, horsepower: 525, notes: "V8 битурбо AMG; 2011–2018 (FL: 557 л.с.)" },
      { code: "AMG CLS 63 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 157", displacementL: 5.5, horsepower: 557, notes: "V8 битурбо AMG; 2014–2018" },
      { code: "AMG CLS 63 S 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 157", displacementL: 5.5, horsepower: 585, notes: "V8 битурбо AMG; 2014–2018" },
    ],
  },
  // CLS C257 (2018 – 2023) — last CLS, AMG-only EQ Boost lineup.
  {
    modelSlug: "cls",
    generationCode: "C257",
    source: "https://www.auto-data.net/en/mercedes-benz-cls-coupe-c257-generation-6026",
    trims: [
      { code: "CLS 220 d", fuelType: "DIESEL", engineCode: "OM 654", displacementL: 2.0, horsepower: 194, notes: "I4 турбо дизель; 2018–2023" },
      { code: "CLS 300 d", fuelType: "DIESEL", engineCode: "OM 654", displacementL: 2.0, horsepower: 245, notes: "I4 турбо дизель; 2019–2023" },
      { code: "CLS 350 d 4MATIC", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 656", displacementL: 3.0, horsepower: 286, notes: "I6 турбо дизель; 2018–2023" },
      { code: "CLS 350 EQ Boost", fuelType: "PETROL", engineCode: "M 264", displacementL: 2.0, horsepower: 299, notes: "I4 mild hybrid; 2018–2023" },
      { code: "CLS 400 d 4MATIC", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 656", displacementL: 3.0, horsepower: 340, notes: "I6 турбо дизель; 2018–2023 (вариации 330/340 л.с.)" },
      { code: "CLS 450 EQ Boost 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 256", displacementL: 3.0, horsepower: 367, notes: "I6 mild hybrid; 2018–2023" },
      { code: "AMG CLS 53 4MATIC+", drivetrain: "4MATIC+", fuelType: "PETROL", engineCode: "M 256", displacementL: 3.0, horsepower: 435, notes: "I6 mild hybrid AMG; 2018–2023" },
    ],
  },
];

interface SeedSummary {
  defaultTrimsCreated: number;
  curatedTrimsUpserted: number;
  unmatchedCurated: string[];
}

/**
 * Idempotent. Runs two passes:
 * 1) Default trim per generation (one isDefault=true row per generation —
 *    represents the "Все варианты этого поколения" fallback).
 * 2) Curated non-default trims for the most common Russian-market generations.
 */
export async function seedTrims(prisma: PrismaClient): Promise<SeedSummary> {
  const summary: SeedSummary = {
    defaultTrimsCreated: 0,
    curatedTrimsUpserted: 0,
    unmatchedCurated: [],
  };

  // Pass 1: default trim per generation
  const allGenerations = (await prisma.vehicleGeneration.findMany({
    select: { id: true, code: true, modelId: true },
  })) as Array<{ id: string; code: string; modelId: string }>;

  for (const g of allGenerations) {
    const result = await prisma.vehicleTrim.upsert({
      where: { generationId_code: { generationId: g.id, code: "ALL" } },
      update: { isActive: true, isDefault: true, sortOrder: 0 },
      create: {
        generationId: g.id,
        code: "ALL",
        isDefault: true,
        isActive: true,
        sortOrder: 0,
      },
      select: { id: true, createdAt: true, updatedAt: true },
    });
    const r = result as { createdAt: Date; updatedAt: Date };
    if (r.createdAt.getTime() === r.updatedAt.getTime()) {
      summary.defaultTrimsCreated++;
    }
  }

  // Pass 2: curated trims
  for (const cg of CURATED) {
    const model = (await prisma.vehicleModel.findUnique({
      where: { slug: cg.modelSlug },
      select: { id: true },
    })) as { id: string } | null;
    if (!model) {
      summary.unmatchedCurated.push(`curated:model-not-found:${cg.modelSlug}`);
      continue;
    }
    const generation = (await prisma.vehicleGeneration.findUnique({
      where: { modelId_code: { modelId: model.id, code: cg.generationCode } },
      select: { id: true },
    })) as { id: string } | null;
    if (!generation) {
      summary.unmatchedCurated.push(`curated:gen-not-found:${cg.modelSlug}/${cg.generationCode}`);
      continue;
    }
    for (let i = 0; i < cg.trims.length; i++) {
      const t = cg.trims[i];
      await prisma.vehicleTrim.upsert({
        where: { generationId_code: { generationId: generation.id, code: t.code } },
        update: {
          bodyStyle: t.bodyStyle ?? null,
          drivetrain: t.drivetrain ?? null,
          fuelType: t.fuelType,
          engineCode: t.engineCode ?? null,
          displacementL: t.displacementL ?? null,
          horsepower: t.horsepower ?? null,
          notes: t.notes ?? null,
          isDefault: false,
          isActive: true,
          sortOrder: i + 1,
        },
        create: {
          generationId: generation.id,
          code: t.code,
          bodyStyle: t.bodyStyle ?? null,
          drivetrain: t.drivetrain ?? null,
          fuelType: t.fuelType,
          engineCode: t.engineCode ?? null,
          displacementL: t.displacementL ?? null,
          horsepower: t.horsepower ?? null,
          notes: t.notes ?? null,
          isDefault: false,
          isActive: true,
          sortOrder: i + 1,
        },
      });
      summary.curatedTrimsUpserted++;
    }
  }

  console.log(
    `Trims seeded: ${summary.defaultTrimsCreated} default trims new, ` +
      `${summary.curatedTrimsUpserted} curated trims upserted, ` +
      `${summary.unmatchedCurated.length} curated rows skipped`,
  );
  if (summary.unmatchedCurated.length > 0) {
    console.warn("Curated rows skipped (model or generation missing in catalog):");
    for (const e of summary.unmatchedCurated) console.warn(`  - ${e}`);
  }

  return summary;
}
