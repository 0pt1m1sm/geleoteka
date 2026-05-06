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
  // ===== Full-size saloon + grand tourers =====
  // S-Class W140 (1991 – 1998) — flagship 1990s.
  {
    modelSlug: "s-class",
    generationCode: "W140",
    source: "https://www.auto-data.net/en/mercedes-benz-s-class-w140-generation-2778",
    trims: [
      { code: "S 280", fuelType: "PETROL", engineCode: "M 104", displacementL: 2.8, horsepower: 193, notes: "I6; 1993–1998" },
      { code: "300 SE", fuelType: "PETROL", engineCode: "M 104", displacementL: 3.0, horsepower: 231, notes: "I6 (продавался как 300 SE до 1993)" },
      { code: "S 320", fuelType: "PETROL", engineCode: "M 104", displacementL: 3.2, horsepower: 231, notes: "I6; 1993–1998" },
      { code: "S 350 Turbodiesel", fuelType: "DIESEL", engineCode: "OM 603", displacementL: 3.4, horsepower: 150, notes: "I6 турбо дизель; 1993–1995" },
      { code: "400 SE / S 420", fuelType: "PETROL", engineCode: "M 119", displacementL: 4.2, horsepower: 279, notes: "V8 (продавался как 400 SE до 1993, S 420 после)" },
      { code: "500 SE / S 500", fuelType: "PETROL", engineCode: "M 119", displacementL: 5.0, horsepower: 320, notes: "V8 (продавался как 500 SE до 1993, S 500 после)" },
      { code: "600 SE / S 600", fuelType: "PETROL", engineCode: "M 120", displacementL: 6.0, horsepower: 408, notes: "V12 (продавался как 600 SE до 1993, S 600 после)" },
    ],
  },
  // S-Class W220 (1998 – 2005) — air-suspension AIRMATIC era.
  {
    modelSlug: "s-class",
    generationCode: "W220",
    source: "https://www.auto-data.net/en/mercedes-benz-s-class-w220-generation-2776",
    trims: [
      { code: "S 280", fuelType: "PETROL", engineCode: "M 112", displacementL: 2.8, horsepower: 204, notes: "V6; 1998–2005" },
      { code: "S 320", fuelType: "PETROL", engineCode: "M 112", displacementL: 3.2, horsepower: 224, notes: "V6; 1998–2005" },
      { code: "S 320 CDI", fuelType: "DIESEL", engineCode: "OM 613", displacementL: 3.2, horsepower: 197, notes: "I6 турбо дизель; 1999–2005" },
      { code: "S 400 CDI", fuelType: "DIESEL", engineCode: "OM 628", displacementL: 4.0, horsepower: 250, notes: "V8 турбо дизель; 1999–2005" },
      { code: "S 430", fuelType: "PETROL", engineCode: "M 113", displacementL: 4.3, horsepower: 279, notes: "V8; 1998–2005" },
      { code: "S 500", fuelType: "PETROL", engineCode: "M 113", displacementL: 5.0, horsepower: 306, notes: "V8; 1998–2005" },
      { code: "S 600", fuelType: "PETROL", engineCode: "M 137", displacementL: 5.8, horsepower: 367, notes: "V12; 1999–2005 (FL: M 275 5.5 битурбо, 500 л.с.)" },
      { code: "AMG S 55", fuelType: "PETROL", engineCode: "M 113", displacementL: 5.5, horsepower: 360, notes: "V8 AMG; 1999–2002 (FL: компрессор 500+ л.с.)" },
      { code: "AMG S 65", fuelType: "PETROL", engineCode: "M 275", displacementL: 6.0, horsepower: 612, notes: "V12 битурбо AMG; 2003–2005" },
    ],
  },
  // S-Class W221 (2005 – 2013) — Distronic, Pre-Safe, hybrid debut.
  {
    modelSlug: "s-class",
    generationCode: "W221",
    source: "https://www.auto-data.net/en/mercedes-benz-s-class-w221-generation-2775",
    trims: [
      { code: "S 320 CDI", fuelType: "DIESEL", engineCode: "OM 642", displacementL: 3.0, horsepower: 235, notes: "V6 турбо дизель; 2006–2009" },
      { code: "S 320 CDI 4MATIC", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 642", displacementL: 3.0, horsepower: 235, notes: "V6 турбо дизель; 2006–2009" },
      { code: "S 350", fuelType: "PETROL", engineCode: "M 272", displacementL: 3.5, horsepower: 272, notes: "V6; 2005–2013 (FL: BlueTEC дизель)" },
      { code: "S 350 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 272", displacementL: 3.5, horsepower: 272, notes: "V6; 2005–2013" },
      { code: "S 400 Hybrid", fuelType: "HYBRID", engineCode: "M 272", displacementL: 3.5, horsepower: 299, notes: "бензин+электро гибрид (не PHEV); 2009–2013" },
      { code: "S 420 CDI", fuelType: "DIESEL", engineCode: "OM 629", displacementL: 4.0, horsepower: 320, notes: "V8 турбо дизель; 2006–2010" },
      { code: "S 450", fuelType: "PETROL", engineCode: "M 273", displacementL: 4.7, horsepower: 340, notes: "V8; 2006–2009" },
      { code: "S 450 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 273", displacementL: 4.7, horsepower: 340, notes: "V8; 2006–2009" },
      { code: "S 500", fuelType: "PETROL", engineCode: "M 273", displacementL: 5.5, horsepower: 388, notes: "V8; 2005–2013 (FL: M 278 битурбо)" },
      { code: "S 500 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 273", displacementL: 5.5, horsepower: 388, notes: "V8; 2005–2013" },
      { code: "S 600", fuelType: "PETROL", engineCode: "M 275", displacementL: 5.5, horsepower: 517, notes: "V12 битурбо; 2005–2013" },
      { code: "AMG S 63", fuelType: "PETROL", engineCode: "M 156", displacementL: 6.2, horsepower: 525, notes: "V8 атм AMG; 2006–2013 (FL: M 157 битурбо 585 л.с.)" },
      { code: "AMG S 65", fuelType: "PETROL", engineCode: "M 275", displacementL: 6.0, horsepower: 612, notes: "V12 битурбо AMG; 2006–2013 (FL: 630 л.с.)" },
    ],
  },
  // S-Class W222 (2013 – 2020) — first with Magic Body Control.
  {
    modelSlug: "s-class",
    generationCode: "W222",
    source: "https://www.auto-data.net/en/mercedes-benz-s-class-w222-generation-4130",
    trims: [
      { code: "S 300 BlueTEC Hybrid", fuelType: "HYBRID", engineCode: "OM 651", displacementL: 2.1, horsepower: 231, notes: "дизель+электро гибрид (не PHEV); 2013–2017" },
      { code: "S 350 d", fuelType: "DIESEL", engineCode: "OM 642", displacementL: 3.0, horsepower: 258, notes: "V6 турбо дизель; 2014–2020" },
      { code: "S 350 d 4MATIC", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 642", displacementL: 3.0, horsepower: 258, notes: "V6 турбо дизель; 2014–2020" },
      { code: "S 400", fuelType: "PETROL", engineCode: "M 276", displacementL: 3.0, horsepower: 333, notes: "V6 битурбо; 2013–2017" },
      { code: "S 400 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 276", displacementL: 3.0, horsepower: 333, notes: "V6 битурбо; 2013–2017" },
      { code: "S 400 Hybrid", fuelType: "HYBRID", engineCode: "M 276", displacementL: 3.5, horsepower: 333, notes: "бензин+электро гибрид (не PHEV); 2013–2017" },
      { code: "S 450 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 256", displacementL: 3.0, horsepower: 367, notes: "I6 mild hybrid; 2017–2020 (FL)" },
      { code: "S 500", fuelType: "PETROL", engineCode: "M 278", displacementL: 4.7, horsepower: 455, notes: "V8 битурбо; 2013–2017 (FL: M 176 4.0L)" },
      { code: "S 500 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 278", displacementL: 4.7, horsepower: 455, notes: "V8 битурбо; 2013–2017" },
      { code: "S 500 e", fuelType: "HYBRID", engineCode: "M 276", displacementL: 3.0, horsepower: 442, notes: "бензин+электро PHEV; батарея 8.7 кВт·ч; 2014–2017" },
      { code: "S 560", fuelType: "PETROL", engineCode: "M 176", displacementL: 4.0, horsepower: 469, notes: "V8 битурбо; 2017–2020 (FL)" },
      { code: "S 560 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 176", displacementL: 4.0, horsepower: 469, notes: "V8 битурбо; 2017–2020" },
      { code: "S 600", fuelType: "PETROL", engineCode: "M 277", displacementL: 6.0, horsepower: 530, notes: "V12 битурбо; 2014–2017" },
      { code: "AMG S 63", fuelType: "PETROL", engineCode: "M 157", displacementL: 5.5, horsepower: 585, notes: "V8 битурбо AMG; 2013–2017 (FL: M 177 4.0L 612 л.с.)" },
      { code: "AMG S 63 4MATIC+", drivetrain: "4MATIC+", fuelType: "PETROL", engineCode: "M 177", displacementL: 4.0, horsepower: 612, notes: "V8 битурбо AMG; 2017–2020" },
      { code: "AMG S 65", fuelType: "PETROL", engineCode: "M 279", displacementL: 6.0, horsepower: 630, notes: "V12 битурбо AMG; 2013–2020" },
      { code: "Maybach S 600", fuelType: "PETROL", engineCode: "M 277", displacementL: 6.0, horsepower: 530, notes: "V12 битурбо Maybach; 2015–2017" },
      { code: "Maybach S 650", fuelType: "PETROL", engineCode: "M 279", displacementL: 6.0, horsepower: 630, notes: "V12 битурбо Maybach; 2017–2020" },
    ],
  },
  // S-Class W223 (2020 – present) — current generation, all-electric option pending.
  {
    modelSlug: "s-class",
    generationCode: "W223",
    source: "https://www.auto-data.net/en/mercedes-benz-s-class-w223-generation-7908",
    trims: [
      { code: "S 350 d", fuelType: "DIESEL", engineCode: "OM 656", displacementL: 3.0, horsepower: 286, notes: "I6 турбо дизель mild hybrid; 2020–" },
      { code: "S 350 d 4MATIC", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 656", displacementL: 3.0, horsepower: 286, notes: "I6 турбо дизель mild hybrid; 2020–" },
      { code: "S 400 d 4MATIC", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 656", displacementL: 3.0, horsepower: 330, notes: "I6 турбо дизель mild hybrid; 2020–" },
      { code: "S 450 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 256", displacementL: 3.0, horsepower: 367, notes: "I6 mild hybrid; 2020–" },
      { code: "S 450 d 4MATIC", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 656", displacementL: 3.0, horsepower: 367, notes: "I6 турбо дизель mild hybrid; 2023–" },
      { code: "S 450 e", fuelType: "HYBRID", engineCode: "M 256", displacementL: 3.0, horsepower: 408, notes: "бензин+электро PHEV; батарея 28.6 кВт·ч; 2023–" },
      { code: "S 500", fuelType: "PETROL", engineCode: "M 256", displacementL: 3.0, horsepower: 435, notes: "I6 mild hybrid; 2020– (FL: 449 л.с.)" },
      { code: "S 500 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 256", displacementL: 3.0, horsepower: 435, notes: "I6 mild hybrid; 2020– (FL: 449 л.с.)" },
      { code: "S 580 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 176", displacementL: 4.0, horsepower: 503, notes: "V8 битурбо mild hybrid; 2020–" },
      { code: "S 580 e", fuelType: "HYBRID", engineCode: "M 256", displacementL: 3.0, horsepower: 510, notes: "бензин+электро PHEV; батарея 28.6 кВт·ч; 2021–" },
      { code: "AMG S 63 E PERFORMANCE", drivetrain: "4MATIC+", fuelType: "HYBRID", engineCode: "M 177", displacementL: 4.0, horsepower: 802, notes: "V8 битурбо AMG + EM PHEV; батарея 13.1 кВт·ч; 2022–" },
      { code: "Maybach S 580 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 176", displacementL: 4.0, horsepower: 503, notes: "V8 битурбо Maybach; 2021–" },
      { code: "Maybach S 680 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 279", displacementL: 6.0, horsepower: 612, notes: "V12 битурбо Maybach; 2021–" },
    ],
  },
  // AMG GT C190 (2014 – 2022) — 2-door coupe/roadster (per Wikipedia for full lineup).
  {
    modelSlug: "amg-gt",
    generationCode: "C190",
    source: "https://www.auto-data.net/en/mercedes-benz-amg-gt-c190-generation-4380 (+ Wikipedia for late-generation variants)",
    trims: [
      { code: "AMG GT", fuelType: "PETROL", engineCode: "M 178", displacementL: 4.0, horsepower: 462, notes: "V8 битурбо AMG handcrafted; 2014–2021 (FL: 476 л.с.)" },
      { code: "AMG GT S", fuelType: "PETROL", engineCode: "M 178", displacementL: 4.0, horsepower: 510, notes: "V8 битурбо AMG; 2014–2020 (FL: 522 л.с.)" },
      { code: "AMG GT C", fuelType: "PETROL", engineCode: "M 178", displacementL: 4.0, horsepower: 557, notes: "V8 битурбо AMG; 2017–2021" },
      { code: "AMG GT R", fuelType: "PETROL", engineCode: "M 178", displacementL: 4.0, horsepower: 585, notes: "V8 битурбо AMG; 2017–2021" },
      { code: "AMG GT R Pro", fuelType: "PETROL", engineCode: "M 178", displacementL: 4.0, horsepower: 585, notes: "V8 битурбо AMG (трековая модификация); 2019–2020" },
      { code: "AMG GT Black Series", fuelType: "PETROL", engineCode: "M 178", displacementL: 4.0, horsepower: 730, notes: "V8 битурбо AMG (плоский коленвал); 2020–2022" },
    ],
  },
  // AMG GT 4-Door X290 (2018 – present) — 4-door coupe (different chassis from C190).
  {
    modelSlug: "amg-gt",
    generationCode: "X290",
    source: "https://www.auto-data.net/en/mercedes-benz-amg-gt-4-door-coupe-x290-generation-6161",
    trims: [
      { code: "AMG GT 43 4MATIC+", drivetrain: "4MATIC+", fuelType: "PETROL", engineCode: "M 256", displacementL: 3.0, horsepower: 367, notes: "I6 mild hybrid AMG; 2019–" },
      { code: "AMG GT 53 4MATIC+", drivetrain: "4MATIC+", fuelType: "PETROL", engineCode: "M 256", displacementL: 3.0, horsepower: 435, notes: "I6 mild hybrid AMG; 2018–" },
      { code: "AMG GT 63 4MATIC+", drivetrain: "4MATIC+", fuelType: "PETROL", engineCode: "M 177", displacementL: 4.0, horsepower: 585, notes: "V8 битурбо AMG; 2018–" },
      { code: "AMG GT 63 S 4MATIC+", drivetrain: "4MATIC+", fuelType: "PETROL", engineCode: "M 177", displacementL: 4.0, horsepower: 639, notes: "V8 битурбо AMG; 2018–" },
      { code: "AMG GT 63 S E PERFORMANCE", drivetrain: "4MATIC+", fuelType: "HYBRID", engineCode: "M 177", displacementL: 4.0, horsepower: 843, notes: "V8 битурбо AMG + EM PHEV; батарея 6.1 кВт·ч; 2022–" },
    ],
  },
  // AMG GT C192 (2023 – present) — 2nd-gen 2-door, replaces C190.
  {
    modelSlug: "amg-gt",
    generationCode: "C192",
    source: "https://www.auto-data.net/en/mercedes-benz-amg-gt-c192-generation-9604",
    trims: [
      { code: "AMG GT 43", fuelType: "PETROL", engineCode: "M 139", displacementL: 2.0, horsepower: 421, notes: "I4 mild hybrid AMG; 2024–" },
      { code: "AMG GT 55 4MATIC+", drivetrain: "4MATIC+", fuelType: "PETROL", engineCode: "M 177", displacementL: 4.0, horsepower: 476, notes: "V8 битурбо AMG; 2023–" },
      { code: "AMG GT 63 4MATIC+", drivetrain: "4MATIC+", fuelType: "PETROL", engineCode: "M 177", displacementL: 4.0, horsepower: 585, notes: "V8 битурбо AMG; 2023–" },
      { code: "AMG GT 63 PRO 4MATIC+", drivetrain: "4MATIC+", fuelType: "PETROL", engineCode: "M 177", displacementL: 4.0, horsepower: 612, notes: "V8 битурбо AMG; 2024–" },
      { code: "AMG GT 63 S E PERFORMANCE", drivetrain: "4MATIC+", fuelType: "HYBRID", engineCode: "M 177", displacementL: 4.0, horsepower: 816, notes: "V8 битурбо AMG + EM PHEV; 2024–" },
    ],
  },
  // SL R129 (1988 – 2001) — first modern SL with adaptive chassis.
  {
    modelSlug: "sl",
    generationCode: "R129",
    source: "https://www.auto-data.net/en/mercedes-benz-sl-r129-generation-7878",
    trims: [
      { code: "SL 280", fuelType: "PETROL", engineCode: "M 104", displacementL: 2.8, horsepower: 193, notes: "I6; 1993–2001" },
      { code: "SL 300", fuelType: "PETROL", engineCode: "M 103", displacementL: 3.0, horsepower: 190, notes: "I6 (SOHC); 1989–1993 (продавался как 300 SL)" },
      { code: "SL 320", fuelType: "PETROL", engineCode: "M 104", displacementL: 3.2, horsepower: 231, notes: "I6 24-клапанный; 1993–2001 (продавался как 300 SL-24 до 1993)" },
      { code: "SL 500", fuelType: "PETROL", engineCode: "M 119", displacementL: 5.0, horsepower: 320, notes: "V8; 1989–2001 (продавался как 500 SL до 1993)" },
      { code: "SL 600", fuelType: "PETROL", engineCode: "M 120", displacementL: 6.0, horsepower: 394, notes: "V12; 1992–2001 (продавался как 600 SL до 1993)" },
      { code: "AMG SL 60", fuelType: "PETROL", engineCode: "M 119", displacementL: 6.0, horsepower: 381, notes: "V8 AMG; 1993–1998" },
      { code: "AMG SL 70", fuelType: "PETROL", engineCode: "M 120", displacementL: 7.0, horsepower: 496, notes: "V12 AMG (редкий); 1995–1998" },
      { code: "AMG SL 73", fuelType: "PETROL", engineCode: "M 120", displacementL: 7.3, horsepower: 525, notes: "V12 AMG (топовый, очень редкий); 1999–2001" },
    ],
  },
  // SL R230 (2001 – 2011) — folding hardtop.
  {
    modelSlug: "sl",
    generationCode: "R230",
    source: "https://www.auto-data.net/en/mercedes-benz-sl-r230-generation-7874",
    trims: [
      { code: "SL 280", fuelType: "PETROL", engineCode: "M 272", displacementL: 3.0, horsepower: 231, notes: "V6; FL 2008–2011" },
      { code: "SL 300", fuelType: "PETROL", engineCode: "M 272", displacementL: 3.0, horsepower: 231, notes: "V6; FL 2008–2011" },
      { code: "SL 350", fuelType: "PETROL", engineCode: "M 272", displacementL: 3.5, horsepower: 245, notes: "V6; 2001–2011 (FL: 316 л.с.)" },
      { code: "SL 500", fuelType: "PETROL", engineCode: "M 113", displacementL: 5.0, horsepower: 306, notes: "V8; 2001–2006 (FL: M 273 5.5 388 л.с.)" },
      { code: "SL 600", fuelType: "PETROL", engineCode: "M 275", displacementL: 5.5, horsepower: 500, notes: "V12 битурбо; 2003–2011 (FL: 517 л.с.)" },
      { code: "AMG SL 55", fuelType: "PETROL", engineCode: "M 113", displacementL: 5.5, horsepower: 476, notes: "V8 компрессор AMG; 2002–2008" },
      { code: "AMG SL 63", fuelType: "PETROL", engineCode: "M 156", displacementL: 6.2, horsepower: 525, notes: "V8 атм AMG; 2008–2011" },
      { code: "AMG SL 65", fuelType: "PETROL", engineCode: "M 275", displacementL: 6.0, horsepower: 612, notes: "V12 битурбо AMG; 2004–2011 (FL: 670 л.с. Black Series)" },
    ],
  },
  // SL R231 (2012 – 2020) — Aluminium structure debut.
  {
    modelSlug: "sl",
    generationCode: "R231",
    source: "https://www.auto-data.net/en/mercedes-benz-sl-r231-generation-3869",
    trims: [
      { code: "SL 350 BlueEFFICIENCY", fuelType: "PETROL", engineCode: "M 276", displacementL: 3.5, horsepower: 306, notes: "V6 битурбо; 2012–2015" },
      { code: "SL 400", fuelType: "PETROL", engineCode: "M 276", displacementL: 3.0, horsepower: 333, notes: "V6 битурбо; 2014–2020" },
      { code: "SL 500", fuelType: "PETROL", engineCode: "M 278", displacementL: 4.7, horsepower: 435, notes: "V8 битурбо; 2012–2020 (вариации 435–455 л.с.)" },
      { code: "AMG SL 63", fuelType: "PETROL", engineCode: "M 157", displacementL: 5.5, horsepower: 537, notes: "V8 битурбо AMG; 2012–2020 (вариации 537–585 л.с.)" },
      { code: "AMG SL 65", fuelType: "PETROL", engineCode: "M 279", displacementL: 6.0, horsepower: 630, notes: "V12 битурбо AMG; 2012–2020" },
    ],
  },
  // SL R232 (2021 – present) — AMG-developed, fabric soft-top, +2 seats.
  {
    modelSlug: "sl",
    generationCode: "R232",
    source: "https://www.auto-data.net/en/mercedes-benz-sl-r232-generation-8669",
    trims: [
      { code: "AMG SL 43", fuelType: "PETROL", engineCode: "M 139", displacementL: 2.0, horsepower: 381, notes: "I4 mild hybrid AMG (M 139 ESG); 2022–2024" },
      { code: "AMG SL 43 (FL)", fuelType: "PETROL", engineCode: "M 139", displacementL: 2.0, horsepower: 421, notes: "I4 mild hybrid AMG (FL); 2024–" },
      { code: "AMG SL 55 4MATIC+", drivetrain: "4MATIC+", fuelType: "PETROL", engineCode: "M 177", displacementL: 4.0, horsepower: 476, notes: "V8 битурбо AMG; 2021–" },
      { code: "AMG SL 63 4MATIC+", drivetrain: "4MATIC+", fuelType: "PETROL", engineCode: "M 177", displacementL: 4.0, horsepower: 585, notes: "V8 битурбо AMG; 2021–" },
      { code: "AMG SL 63 S E PERFORMANCE", drivetrain: "4MATIC+", fuelType: "HYBRID", engineCode: "M 177", displacementL: 4.0, horsepower: 816, notes: "V8 битурбо AMG + EM PHEV; батарея 6.1 кВт·ч; 2023–" },
    ],
  },
  // SLK R170 (1995 – 2004) — first SLK, folding hardtop.
  {
    modelSlug: "slk-slc",
    generationCode: "R170",
    source: "https://www.auto-data.net/en/mercedes-benz-slk-r170-generation-7883",
    trims: [
      { code: "SLK 200", fuelType: "PETROL", engineCode: "M 111", displacementL: 2.0, horsepower: 136, notes: "I4; 1996–2000" },
      { code: "SLK 200 Kompressor", fuelType: "PETROL", engineCode: "M 111", displacementL: 2.0, horsepower: 192, notes: "I4 компрессор; 1996–2000" },
      { code: "SLK 230 Kompressor", fuelType: "PETROL", engineCode: "M 111", displacementL: 2.3, horsepower: 193, notes: "I4 компрессор; 1996–2000 (FL: 197 л.с.)" },
      { code: "SLK 320", fuelType: "PETROL", engineCode: "M 112", displacementL: 3.2, horsepower: 218, notes: "V6; 2000–2004" },
      { code: "AMG SLK 32", fuelType: "PETROL", engineCode: "M 112", displacementL: 3.2, horsepower: 354, notes: "V6 компрессор AMG; 2001–2004 (редкий)" },
    ],
  },
  // SLK R171 (2004 – 2011) — second-gen.
  {
    modelSlug: "slk-slc",
    generationCode: "R171",
    source: "https://www.auto-data.net/en/mercedes-benz-slk-r171-generation-7885",
    trims: [
      { code: "SLK 200 Kompressor", fuelType: "PETROL", engineCode: "M 271", displacementL: 1.8, horsepower: 163, notes: "I4 компрессор; 2003–2011" },
      { code: "SLK 280", fuelType: "PETROL", engineCode: "M 272", displacementL: 3.0, horsepower: 231, notes: "V6; 2005–2008 (переименован в SLK 300 в FL)" },
      { code: "SLK 300", fuelType: "PETROL", engineCode: "M 272", displacementL: 3.0, horsepower: 231, notes: "V6; 2008–2011" },
      { code: "SLK 350", fuelType: "PETROL", engineCode: "M 272", displacementL: 3.5, horsepower: 272, notes: "V6; 2004–2011 (FL: 305 л.с.)" },
      { code: "AMG SLK 55", fuelType: "PETROL", engineCode: "M 113", displacementL: 5.5, horsepower: 360, notes: "V8 атм AMG; 2004–2011" },
    ],
  },
  // SLK/SLC R172 (2011 – 2020) — rebranded SLC in 2016.
  {
    modelSlug: "slk-slc",
    generationCode: "R172",
    source: "https://www.auto-data.net/en/mercedes-benz-slk-r172-generation-4131",
    trims: [
      { code: "SLK 200", fuelType: "PETROL", engineCode: "M 271", displacementL: 1.8, horsepower: 184, notes: "I4 турбо; 2011–2015 (FL: SLC 200 M 274 2.0L)" },
      { code: "SLK 250", fuelType: "PETROL", engineCode: "M 271", displacementL: 1.8, horsepower: 204, notes: "I4 турбо; 2011–2015" },
      { code: "SLK 250 CDI", fuelType: "DIESEL", engineCode: "OM 651", displacementL: 2.2, horsepower: 204, notes: "I4 турбо дизель; 2011–2015 (переименован в SLC 250 d)" },
      { code: "SLK 350", fuelType: "PETROL", engineCode: "M 276", displacementL: 3.5, horsepower: 306, notes: "V6 битурбо; 2011–2015" },
      { code: "SLC 180", fuelType: "PETROL", engineCode: "M 274", displacementL: 1.6, horsepower: 156, notes: "I4 турбо; FL 2016–2020 (SLC ребрендинг)" },
      { code: "SLC 200", fuelType: "PETROL", engineCode: "M 274", displacementL: 2.0, horsepower: 184, notes: "I4 турбо; FL 2016–2020" },
      { code: "SLC 250 d", fuelType: "DIESEL", engineCode: "OM 651", displacementL: 2.2, horsepower: 204, notes: "I4 турбо дизель; FL 2016–2020" },
      { code: "SLC 300", fuelType: "PETROL", engineCode: "M 274", displacementL: 2.0, horsepower: 245, notes: "I4 турбо; FL 2016–2020" },
      { code: "SLC 43 AMG", fuelType: "PETROL", engineCode: "M 276", displacementL: 3.0, horsepower: 367, notes: "V6 битурбо AMG; FL 2016–2020 (заменил AMG SLC 55)" },
      { code: "AMG SLK 55", fuelType: "PETROL", engineCode: "M 152", displacementL: 5.5, horsepower: 421, notes: "V8 атм AMG; 2011–2015" },
    ],
  },
  // ===== SUVs =====
  // GLA X156 (2014 – 2020) — first GLA, hatchback-based crossover.
  {
    modelSlug: "gla",
    generationCode: "X156",
    source: "https://www.auto-data.net/en/mercedes-benz-gla-x156-generation-4127",
    trims: [
      { code: "GLA 180", drivetrain: "FWD", fuelType: "PETROL", engineCode: "M 270", displacementL: 1.6, horsepower: 122, notes: "I4 турбо; 2013–2020" },
      { code: "GLA 180 CDI", drivetrain: "FWD", fuelType: "DIESEL", engineCode: "OM 607", displacementL: 1.5, horsepower: 109, notes: "I4 турбо дизель; 2013–2020" },
      { code: "GLA 200", drivetrain: "FWD", fuelType: "PETROL", engineCode: "M 270", displacementL: 1.6, horsepower: 156, notes: "I4 турбо; 2013–2020" },
      { code: "GLA 200 CDI", drivetrain: "FWD", fuelType: "DIESEL", engineCode: "OM 607", displacementL: 2.1, horsepower: 136, notes: "I4 турбо дизель; 2013–2020" },
      { code: "GLA 220 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 270", displacementL: 2.0, horsepower: 184, notes: "I4 турбо; FL 2017–2020" },
      { code: "GLA 220 CDI 4MATIC", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 651", displacementL: 2.1, horsepower: 170, notes: "I4 турбо дизель; 2014–2020 (FL: 177 л.с.)" },
      { code: "GLA 250", drivetrain: "FWD", fuelType: "PETROL", engineCode: "M 270", displacementL: 2.0, horsepower: 211, notes: "I4 турбо; 2014–2020" },
      { code: "GLA 250 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 270", displacementL: 2.0, horsepower: 211, notes: "I4 турбо; 2014–2020" },
      { code: "AMG GLA 45", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 133", displacementL: 2.0, horsepower: 360, notes: "AMG handcrafted I4 турбо; 2014–2020 (FL: 381 л.с.)" },
    ],
  },
  // GLA H247 (2020 – present) — second-gen on MFA2 platform.
  {
    modelSlug: "gla",
    generationCode: "H247",
    source: "https://www.auto-data.net/en/mercedes-benz-gla-h247-generation-7468",
    trims: [
      { code: "GLA 180", drivetrain: "FWD", fuelType: "PETROL", engineCode: "M 282", displacementL: 1.3, horsepower: 136, notes: "I4 турбо; 2020–" },
      { code: "GLA 180 d", drivetrain: "FWD", fuelType: "DIESEL", engineCode: "OM 654q", displacementL: 1.5, horsepower: 116, notes: "I4 турбо дизель; 2020–" },
      { code: "GLA 200", drivetrain: "FWD", fuelType: "PETROL", engineCode: "M 282", displacementL: 1.3, horsepower: 163, notes: "I4 турбо; 2020–" },
      { code: "GLA 200 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 282", displacementL: 1.3, horsepower: 163, notes: "I4 турбо; 2020–" },
      { code: "GLA 200 d", drivetrain: "FWD", fuelType: "DIESEL", engineCode: "OM 654q", displacementL: 1.5, horsepower: 150, notes: "I4 турбо дизель; 2020–" },
      { code: "GLA 200 d 4MATIC", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 654q", displacementL: 1.5, horsepower: 150, notes: "I4 турбо дизель; 2020–" },
      { code: "GLA 220 d", drivetrain: "FWD", fuelType: "DIESEL", engineCode: "OM 654", displacementL: 2.0, horsepower: 190, notes: "I4 турбо дизель; 2020–" },
      { code: "GLA 220 d 4MATIC", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 654", displacementL: 2.0, horsepower: 190, notes: "I4 турбо дизель; 2020–" },
      { code: "GLA 250", drivetrain: "FWD", fuelType: "PETROL", engineCode: "M 260", displacementL: 2.0, horsepower: 224, notes: "I4 турбо; 2020–" },
      { code: "GLA 250 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 260", displacementL: 2.0, horsepower: 224, notes: "I4 турбо; 2020–" },
      { code: "GLA 250 e", drivetrain: "FWD", fuelType: "HYBRID", engineCode: "M 282", displacementL: 1.3, horsepower: 218, notes: "бензин+электро PHEV; батарея 15.6 кВт·ч; 2020–" },
      { code: "AMG GLA 35 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 260", displacementL: 2.0, horsepower: 306, notes: "AMG performance; 2020–" },
      { code: "AMG GLA 45 4MATIC+", drivetrain: "4MATIC+", fuelType: "PETROL", engineCode: "M 139", displacementL: 2.0, horsepower: 387, notes: "AMG handcrafted I4 турбо; 2020–" },
      { code: "AMG GLA 45 S 4MATIC+", drivetrain: "4MATIC+", fuelType: "PETROL", engineCode: "M 139", displacementL: 2.0, horsepower: 421, notes: "AMG handcrafted I4 турбо; 2020–" },
    ],
  },
  // GLB X247 (2019 – present) — 7-seater compact SUV.
  {
    modelSlug: "glb",
    generationCode: "X247",
    source: "https://www.auto-data.net/en/mercedes-benz-glb-x247-generation-7171",
    trims: [
      { code: "GLB 180 d", drivetrain: "FWD", fuelType: "DIESEL", engineCode: "OM 654q", displacementL: 1.5, horsepower: 116, notes: "I4 турбо дизель; 2019–" },
      { code: "GLB 200", drivetrain: "FWD", fuelType: "PETROL", engineCode: "M 282", displacementL: 1.3, horsepower: 163, notes: "I4 турбо; 2019–" },
      { code: "GLB 200 d", drivetrain: "FWD", fuelType: "DIESEL", engineCode: "OM 654q", displacementL: 2.0, horsepower: 150, notes: "I4 турбо дизель; 2019–" },
      { code: "GLB 200 d 4MATIC", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 654q", displacementL: 2.0, horsepower: 150, notes: "I4 турбо дизель; 2019–" },
      { code: "GLB 220 d", drivetrain: "FWD", fuelType: "DIESEL", engineCode: "OM 654", displacementL: 2.0, horsepower: 190, notes: "I4 турбо дизель; 2019–" },
      { code: "GLB 220 d 4MATIC", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 654", displacementL: 2.0, horsepower: 190, notes: "I4 турбо дизель; 2019–" },
      { code: "GLB 250", drivetrain: "FWD", fuelType: "PETROL", engineCode: "M 260", displacementL: 2.0, horsepower: 224, notes: "I4 турбо; 2019–" },
      { code: "GLB 250 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 260", displacementL: 2.0, horsepower: 224, notes: "I4 турбо; 2019–" },
      { code: "AMG GLB 35 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 260", displacementL: 2.0, horsepower: 306, notes: "AMG performance; 2020–" },
    ],
  },
  // GLC X204 (2008 – 2015) — sold as GLK-Class until 2015 rename.
  {
    modelSlug: "glc",
    generationCode: "X204",
    source: "https://www.auto-data.net/en/mercedes-benz-glk-x204-generation-2744",
    trims: [
      { code: "GLK 200 CDI", drivetrain: "FWD", fuelType: "DIESEL", engineCode: "OM 651", displacementL: 2.1, horsepower: 143, notes: "I4 турбо дизель; продавался как GLK; 2010–2015" },
      { code: "GLK 220 CDI 4MATIC", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 651", displacementL: 2.1, horsepower: 170, notes: "I4 турбо дизель; продавался как GLK; 2008–2015" },
      { code: "GLK 250 CDI 4MATIC", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 651", displacementL: 2.1, horsepower: 204, notes: "I4 турбо дизель; продавался как GLK; 2010–2015" },
      { code: "GLK 280 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 272", displacementL: 3.0, horsepower: 231, notes: "V6; продавался как GLK; 2008–2009" },
      { code: "GLK 300 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 272", displacementL: 3.0, horsepower: 231, notes: "V6; продавался как GLK; 2008–2015" },
      { code: "GLK 320 CDI 4MATIC", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 642", displacementL: 3.0, horsepower: 224, notes: "V6 турбо дизель; продавался как GLK; 2008–2015" },
      { code: "GLK 350 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 272", displacementL: 3.5, horsepower: 272, notes: "V6; продавался как GLK; 2008–2015 (FL: 306 л.с.)" },
      { code: "GLK 350 CDI 4MATIC", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 642", displacementL: 3.0, horsepower: 224, notes: "V6 турбо дизель; продавался как GLK; 2008–2012 (FL: 231 л.с.)" },
    ],
  },
  // GLC X253 (2015 – 2022) — first to bear GLC nameplate.
  {
    modelSlug: "glc",
    generationCode: "X253",
    source: "https://www.auto-data.net/en/mercedes-benz-glc-suv-x253-generation-4568",
    trims: [
      { code: "GLC 220 d 4MATIC", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 651", displacementL: 2.1, horsepower: 170, notes: "I4 турбо дизель; 2015–2019 (FL: OM 654 2.0L 194 л.с.)" },
      { code: "GLC 250 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 274", displacementL: 2.0, horsepower: 211, notes: "I4 турбо; 2015–2019" },
      { code: "GLC 250 d 4MATIC", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 651", displacementL: 2.1, horsepower: 204, notes: "I4 турбо дизель; 2015–2019" },
      { code: "GLC 300", drivetrain: "RWD", fuelType: "PETROL", engineCode: "M 274", displacementL: 2.0, horsepower: 241, notes: "I4 турбо; 2015–2022" },
      { code: "GLC 300 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 274", displacementL: 2.0, horsepower: 245, notes: "I4 турбо; 2015–2022" },
      { code: "GLC 350 d 4MATIC", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 642", displacementL: 3.0, horsepower: 258, notes: "V6 турбо дизель; 2015–2019" },
      { code: "GLC 350 e 4MATIC", drivetrain: "4MATIC", fuelType: "HYBRID", engineCode: "M 274", displacementL: 2.0, horsepower: 320, notes: "бензин+электро PHEV; батарея 8.7 кВт·ч; 2016–2019" },
      { code: "AMG GLC 43 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 276", displacementL: 3.0, horsepower: 367, notes: "V6 битурбо AMG; 2016–2022 (FL: 390 л.с.)" },
      { code: "AMG GLC 63 4MATIC+", drivetrain: "4MATIC+", fuelType: "PETROL", engineCode: "M 177", displacementL: 4.0, horsepower: 476, notes: "V8 битурбо AMG; 2017–2022" },
      { code: "AMG GLC 63 S 4MATIC+", drivetrain: "4MATIC+", fuelType: "PETROL", engineCode: "M 177", displacementL: 4.0, horsepower: 510, notes: "V8 битурбо AMG; 2017–2022" },
    ],
  },
  // GLC X254 (2022 – present) — current generation, fully mild-hybrid.
  {
    modelSlug: "glc",
    generationCode: "X254",
    source: "https://www.auto-data.net/en/mercedes-benz-glc-suv-x254-generation-8900",
    trims: [
      { code: "GLC 200 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 254", displacementL: 2.0, horsepower: 204, notes: "I4 mild hybrid; 2022–" },
      { code: "GLC 200 d 4MATIC", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 654", displacementL: 2.0, horsepower: 163, notes: "I4 турбо дизель; 2022–" },
      { code: "GLC 220 d 4MATIC", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 654", displacementL: 2.0, horsepower: 197, notes: "I4 турбо дизель mild hybrid; 2022–" },
      { code: "GLC 300 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 254", displacementL: 2.0, horsepower: 258, notes: "I4 mild hybrid; 2022–" },
      { code: "GLC 300 d 4MATIC", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 654", displacementL: 2.0, horsepower: 269, notes: "I4 турбо дизель mild hybrid; 2022–" },
      { code: "GLC 300 e 4MATIC", drivetrain: "4MATIC", fuelType: "HYBRID", engineCode: "M 254", displacementL: 2.0, horsepower: 313, notes: "бензин+электро PHEV; батарея 31.2 кВт·ч; 2022–" },
      { code: "GLC 300 de 4MATIC", drivetrain: "4MATIC", fuelType: "HYBRID", engineCode: "OM 654", displacementL: 2.0, horsepower: 335, notes: "дизель+электро PHEV; батарея 31.2 кВт·ч; 2023–" },
      { code: "GLC 350 e 4MATIC", drivetrain: "4MATIC", fuelType: "HYBRID", engineCode: "M 254", displacementL: 2.0, horsepower: 313, notes: "бензин+электро PHEV; батарея 31.2 кВт·ч; 2023–" },
      { code: "GLC 400 e 4MATIC", drivetrain: "4MATIC", fuelType: "HYBRID", engineCode: "M 254", displacementL: 2.0, horsepower: 381, notes: "бензин+электро PHEV; батарея 31.2 кВт·ч; 2023–" },
      { code: "GLC 450 d 4MATIC", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 656", displacementL: 3.0, horsepower: 367, notes: "I6 турбо дизель mild hybrid; 2023–" },
      { code: "AMG GLC 43 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 139", displacementL: 2.0, horsepower: 421, notes: "AMG handcrafted I4 турбо + EM; 2022–" },
      { code: "AMG GLC 53 4MATIC+", drivetrain: "4MATIC+", fuelType: "PETROL", engineCode: "M 256", displacementL: 3.0, horsepower: 449, notes: "I6 mild hybrid AMG; 2024–" },
      { code: "AMG GLC 63 S E PERFORMANCE", drivetrain: "4MATIC+", fuelType: "HYBRID", engineCode: "M 139", displacementL: 2.0, horsepower: 680, notes: "I4 битурбо AMG + EM PHEV; батарея 6.1 кВт·ч; 2023–" },
    ],
  },
  // GLE W163 (1997 – 2004) — sold as M-Class / ML.
  {
    modelSlug: "gle",
    generationCode: "W163",
    source: "https://www.auto-data.net/en/mercedes-benz-m-class-w163-generation-2752",
    trims: [
      { code: "ML 230", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 111", displacementL: 2.3, horsepower: 150, notes: "I4; продавался как M-Class / ML; 1997–2002" },
      { code: "ML 270 CDI", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 612", displacementL: 2.7, horsepower: 163, notes: "I5 турбо дизель; продавался как ML; 1999–2004" },
      { code: "ML 320", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 112", displacementL: 3.2, horsepower: 218, notes: "V6; продавался как ML; 1997–2004" },
      { code: "ML 350", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 112", displacementL: 3.7, horsepower: 235, notes: "V6; продавался как ML; FL 2002–2004" },
      { code: "ML 400 CDI", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 628", displacementL: 4.0, horsepower: 250, notes: "V8 турбо дизель; продавался как ML; 2001–2004" },
      { code: "ML 430", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 113", displacementL: 4.3, horsepower: 272, notes: "V8; продавался как ML; 1998–2001" },
      { code: "ML 500", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 113", displacementL: 5.0, horsepower: 292, notes: "V8; продавался как ML; FL 2002–2004" },
      { code: "AMG ML 55", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 113", displacementL: 5.5, horsepower: 347, notes: "V8 AMG; продавался как ML; 2000–2003" },
    ],
  },
  // GLE W164 (2005 – 2011) — second-gen ML; introduced AIRMATIC option.
  {
    modelSlug: "gle",
    generationCode: "W164",
    source: "https://www.auto-data.net/en/mercedes-benz-m-class-w164-generation-2751",
    trims: [
      { code: "ML 280 CDI 4MATIC", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 642", displacementL: 3.0, horsepower: 190, notes: "V6 турбо дизель; продавался как ML; 2005–2009" },
      { code: "ML 300 CDI 4MATIC", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 642", displacementL: 3.0, horsepower: 204, notes: "V6 турбо дизель; продавался как ML; FL 2009–2011" },
      { code: "ML 320 CDI 4MATIC", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 642", displacementL: 3.0, horsepower: 224, notes: "V6 турбо дизель; продавался как ML; 2005–2009" },
      { code: "ML 350 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 272", displacementL: 3.5, horsepower: 272, notes: "V6; продавался как ML; 2005–2011" },
      { code: "ML 350 CDI 4MATIC", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 642", displacementL: 3.0, horsepower: 224, notes: "V6 турбо дизель; продавался как ML; FL 2009–2011 (231 л.с. вариант)" },
      { code: "ML 420 CDI 4MATIC", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 629", displacementL: 4.0, horsepower: 306, notes: "V8 турбо дизель; продавался как ML; 2006–2010" },
      { code: "ML 450 Hybrid 4MATIC", drivetrain: "4MATIC", fuelType: "HYBRID", engineCode: "M 272", displacementL: 3.5, horsepower: 340, notes: "бензин+электро гибрид (не PHEV); 2009–2011" },
      { code: "ML 500 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 273", displacementL: 5.5, horsepower: 388, notes: "V8; FL 2007–2011 (ранний M 113 5.0L 306 л.с.)" },
      { code: "ML 550 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 273", displacementL: 5.5, horsepower: 388, notes: "V8; 2007–2011" },
      { code: "AMG ML 63 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 156", displacementL: 6.2, horsepower: 510, notes: "V8 атм AMG; 2006–2011" },
    ],
  },
  // GLE W166 (2011 – 2019) — third-gen ML, renamed GLE in 2015 facelift.
  {
    modelSlug: "gle",
    generationCode: "W166",
    source: "https://www.auto-data.net/en/mercedes-benz-gle-suv-w166-generation-4570",
    trims: [
      { code: "GLE 250 d", drivetrain: "RWD", fuelType: "DIESEL", engineCode: "OM 651", displacementL: 2.1, horsepower: 204, notes: "I4 турбо дизель; FL 2015–2019" },
      { code: "GLE 250 d 4MATIC", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 651", displacementL: 2.1, horsepower: 204, notes: "I4 турбо дизель; FL 2015–2019" },
      { code: "GLE 300 d 4MATIC", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 651", displacementL: 2.1, horsepower: 201, notes: "I4 турбо дизель; FL 2018–2019" },
      { code: "GLE 320 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 276", displacementL: 3.0, horsepower: 272, notes: "V6 битурбо; FL 2018–2019" },
      { code: "GLE 350 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 276", displacementL: 3.5, horsepower: 302, notes: "V6 битурбо; FL 2015–2019" },
      { code: "GLE 350 d 4MATIC", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 642", displacementL: 3.0, horsepower: 258, notes: "V6 турбо дизель; FL 2015–2019" },
      { code: "GLE 400 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 276", displacementL: 3.0, horsepower: 333, notes: "V6 битурбо; FL 2015–2019" },
      { code: "GLE 500 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 278", displacementL: 4.7, horsepower: 455, notes: "V8 битурбо; FL 2015–2019 (ранний 435 л.с.)" },
      { code: "GLE 500 e 4MATIC", drivetrain: "4MATIC", fuelType: "HYBRID", engineCode: "M 276", displacementL: 3.0, horsepower: 442, notes: "бензин+электро PHEV; батарея 8.7 кВт·ч; 2015–2019" },
      { code: "AMG GLE 43", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 276", displacementL: 3.0, horsepower: 390, notes: "V6 битурбо AMG; 2016–2019" },
      { code: "AMG GLE 63", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 157", displacementL: 5.5, horsepower: 557, notes: "V8 битурбо AMG; 2015–2019" },
      { code: "AMG GLE 63 S", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 157", displacementL: 5.5, horsepower: 585, notes: "V8 битурбо AMG; 2015–2019" },
    ],
  },
  // GLE V167 (2019 – present) — re-verified against auto-data.net.
  {
    modelSlug: "gle",
    generationCode: "V167",
    source: "https://www.auto-data.net/en/mercedes-benz-gle-suv-v167-generation-6596",
    trims: [
      { code: "GLE 300 d", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 654", displacementL: 2.0, horsepower: 245, notes: "I4 турбо дизель; 2019– (FL: 272 л.с. EQ Boost)" },
      { code: "GLE 350", drivetrain: "RWD", fuelType: "PETROL", engineCode: "M 264", displacementL: 2.0, horsepower: 255, notes: "I4 mild hybrid; 2019–" },
      { code: "GLE 350 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 264", displacementL: 2.0, horsepower: 255, notes: "I4 mild hybrid; 2019–" },
      { code: "GLE 350 d", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 656", displacementL: 3.0, horsepower: 272, notes: "I6 турбо дизель mild hybrid; 2019–" },
      { code: "GLE 350 de", drivetrain: "4MATIC", fuelType: "HYBRID", engineCode: "OM 654", displacementL: 2.0, horsepower: 320, notes: "дизель+электро PHEV; батарея 31.2 кВт·ч; 2019–" },
      { code: "GLE 350 e", drivetrain: "4MATIC", fuelType: "HYBRID", engineCode: "M 264", displacementL: 2.0, horsepower: 333, notes: "бензин+электро PHEV; батарея 31.2 кВт·ч; 2020–" },
      { code: "GLE 400 d", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 656", displacementL: 3.0, horsepower: 330, notes: "I6 турбо дизель mild hybrid; 2019–" },
      { code: "GLE 450", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 256", displacementL: 3.0, horsepower: 367, notes: "I6 mild hybrid; 2019– (FL 2.5L M 254)" },
      { code: "GLE 580", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 176", displacementL: 4.0, horsepower: 489, notes: "V8 битурбо mild hybrid; 2020–" },
      { code: "AMG GLE 53", drivetrain: "4MATIC+", fuelType: "PETROL", engineCode: "M 256", displacementL: 3.0, horsepower: 435, notes: "I6 mild hybrid AMG; 2019– (FL: PHEV 544 л.с.)" },
      { code: "AMG GLE 63", drivetrain: "4MATIC+", fuelType: "PETROL", engineCode: "M 177", displacementL: 4.0, horsepower: 571, notes: "V8 битурбо AMG; 2020–" },
      { code: "AMG GLE 63 S", drivetrain: "4MATIC+", fuelType: "PETROL", engineCode: "M 177", displacementL: 4.0, horsepower: 612, notes: "V8 битурбо AMG; 2020–" },
    ],
  },
  // GLS X164 (2006 – 2012) — sold as GL-Class.
  {
    modelSlug: "gls",
    generationCode: "X164",
    source: "https://www.auto-data.net/en/mercedes-benz-gl-x164-generation-3865",
    trims: [
      { code: "GL 320 CDI 4MATIC", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 642", displacementL: 3.0, horsepower: 224, notes: "V6 турбо дизель; продавался как GL-Class; 2006–2008" },
      { code: "GL 350 BlueTEC 4MATIC", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 642", displacementL: 3.0, horsepower: 211, notes: "V6 турбо дизель; продавался как GL-Class; 2009–2012" },
      { code: "GL 350 CDI 4MATIC", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 642", displacementL: 3.0, horsepower: 265, notes: "V6 турбо дизель; продавался как GL-Class; 2009–2012" },
      { code: "GL 420 CDI 4MATIC", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 629", displacementL: 4.0, horsepower: 306, notes: "V8 турбо дизель; продавался как GL-Class; 2006–2009" },
      { code: "GL 450 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 273", displacementL: 4.7, horsepower: 340, notes: "V8; продавался как GL-Class; 2006–2008" },
      { code: "GL 500 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 273", displacementL: 5.0, horsepower: 388, notes: "V8; продавался как GL-Class; 2006–2008" },
    ],
  },
  // GLS X166 (2012 – 2019) — second-gen GL-Class, renamed GLS in 2016.
  {
    modelSlug: "gls",
    generationCode: "X166",
    source: "https://www.auto-data.net/en/mercedes-benz-gls-x166-generation-4650",
    trims: [
      { code: "GL 350 BlueTEC 4MATIC", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 642", displacementL: 3.0, horsepower: 258, notes: "V6 турбо дизель; продавался как GL до 2016; 2012–2016" },
      { code: "GL 400 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 276", displacementL: 3.0, horsepower: 333, notes: "V6 битурбо; продавался как GL до 2016; 2014–2016" },
      { code: "GL 500 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 278", displacementL: 4.7, horsepower: 435, notes: "V8 битурбо; продавался как GL до 2016; 2012–2016" },
      { code: "AMG GL 63", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 157", displacementL: 5.5, horsepower: 557, notes: "V8 битурбо AMG; продавался как GL до 2016; 2012–2016" },
      { code: "GLS 350 d 4MATIC", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 642", displacementL: 3.0, horsepower: 258, notes: "V6 турбо дизель; FL 2016–2019" },
      { code: "GLS 400 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 276", displacementL: 3.0, horsepower: 333, notes: "V6 битурбо; FL 2016–2019" },
      { code: "GLS 500 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 278", displacementL: 4.7, horsepower: 456, notes: "V8 битурбо; FL 2016–2019" },
      { code: "AMG GLS 63", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 157", displacementL: 5.5, horsepower: 585, notes: "V8 битурбо AMG; FL 2016–2019" },
    ],
  },
  // GLS X167 (2019 – present) — re-verified against auto-data.net.
  {
    modelSlug: "gls",
    generationCode: "X167",
    source: "https://www.auto-data.net/en/mercedes-benz-gls-x167-generation-7091",
    trims: [
      { code: "GLS 350 d", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 656", displacementL: 3.0, horsepower: 286, notes: "I6 турбо дизель mild hybrid; 2019–" },
      { code: "GLS 400 d", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM 656", displacementL: 3.0, horsepower: 330, notes: "I6 турбо дизель mild hybrid; 2019–" },
      { code: "GLS 450", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 256", displacementL: 3.0, horsepower: 367, notes: "I6 mild hybrid; 2019–" },
      { code: "GLS 580", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 176", displacementL: 4.0, horsepower: 489, notes: "V8 битурбо mild hybrid; 2019–" },
      { code: "GLS 600 (Maybach)", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M 176", displacementL: 4.0, horsepower: 558, notes: "V8 битурбо Maybach; 2020–" },
      { code: "AMG GLS 63", drivetrain: "4MATIC+", fuelType: "PETROL", engineCode: "M 177", displacementL: 4.0, horsepower: 612, notes: "V8 битурбо AMG handcrafted; 2019–" },
    ],
  },
  // ===== EVs =====
  // EQA H243 (2021 – present) — first compact electric SUV (sister of GLA).
  {
    modelSlug: "eqa",
    generationCode: "H243",
    source: "https://www.auto-data.net/en/mercedes-benz-eqa-h243-generation-8069",
    trims: [
      { code: "EQA 250", drivetrain: "FWD", fuelType: "ELECTRIC", horsepower: 190, notes: "1 двигатель PSM; батарея 69.7 кВт·ч; запас хода 426–496 км; 2021–" },
      { code: "EQA 250+", drivetrain: "FWD", fuelType: "ELECTRIC", horsepower: 190, notes: "1 двигатель PSM; батарея 73.9 кВт·ч; запас хода 490–532 км; 2022–" },
      { code: "EQA 300 4MATIC", drivetrain: "4MATIC", fuelType: "ELECTRIC", horsepower: 228, notes: "2 двигателя (PSM+ASM); батарея 69.7 кВт·ч; запас хода 411–438 км; 2021–" },
      { code: "EQA 350 4MATIC", drivetrain: "4MATIC", fuelType: "ELECTRIC", horsepower: 292, notes: "2 двигателя (PSM+ASM); батарея 69.7 кВт·ч; запас хода 411–438 км; 2021–" },
    ],
  },
  // EQB X243 (2021 – present) — 7-seater electric SUV (sister of GLB).
  {
    modelSlug: "eqb",
    generationCode: "X243",
    source: "https://www.auto-data.net/en/mercedes-benz-eqb-x243-generation-8323",
    trims: [
      { code: "EQB 250", drivetrain: "FWD", fuelType: "ELECTRIC", horsepower: 190, notes: "1 двигатель PSM; батарея 69.7 кВт·ч; до 7 мест; 2021–" },
      { code: "EQB 250+", drivetrain: "FWD", fuelType: "ELECTRIC", horsepower: 190, notes: "1 двигатель PSM; батарея 73.9 кВт·ч; 2022–" },
      { code: "EQB 300 4MATIC", drivetrain: "4MATIC", fuelType: "ELECTRIC", horsepower: 228, notes: "2 двигателя (PSM+ASM); батарея 69.7 кВт·ч; 2021–" },
      { code: "EQB 350 4MATIC", drivetrain: "4MATIC", fuelType: "ELECTRIC", horsepower: 292, notes: "2 двигателя (PSM+ASM); батарея 69.7 кВт·ч; 2021–" },
    ],
  },
  // EQC N293 (2019 – 2023) — first dedicated EV (mid-size SUV).
  {
    modelSlug: "eqc",
    generationCode: "N293",
    source: "https://www.auto-data.net/en/mercedes-benz-eqc-n293-generation-6575",
    trims: [
      { code: "EQC 400 4MATIC", drivetrain: "4MATIC", fuelType: "ELECTRIC", horsepower: 408, notes: "2 двигателя ASM (Asynchronous); батарея 85 кВт·ч; запас хода 373–437 км; 2019–2023" },
    ],
  },
  // EQE V295 (2022 – present) — sedan, EVA platform.
  {
    modelSlug: "eqe",
    generationCode: "V295",
    source: "https://www.auto-data.net/en/mercedes-benz-eqe-v295-generation-8561",
    trims: [
      { code: "EQE 300", drivetrain: "RWD", fuelType: "ELECTRIC", horsepower: 245, notes: "1 двигатель PSM; батарея 98 кВт·ч; седан; 2022– (FL: 100 кВт·ч 265 л.с.)" },
      { code: "EQE 320+", drivetrain: "RWD", fuelType: "ELECTRIC", horsepower: 315, notes: "1 двигатель PSM; батарея 105 кВт·ч; седан; 2024–" },
      { code: "EQE 350", drivetrain: "RWD", fuelType: "ELECTRIC", horsepower: 292, notes: "1 двигатель PSM; батарея 98 кВт·ч; седан; 2022–" },
      { code: "EQE 350+", drivetrain: "RWD", fuelType: "ELECTRIC", horsepower: 292, notes: "1 двигатель PSM; батарея 105 кВт·ч; седан; 2023– (FL: 320 л.с.)" },
      { code: "EQE 350 4MATIC", drivetrain: "4MATIC", fuelType: "ELECTRIC", horsepower: 292, notes: "2 двигателя (PSM+ASM); батарея 98 кВт·ч; седан; 2022– (FL: 320 л.с.)" },
      { code: "EQE 500 4MATIC", drivetrain: "4MATIC", fuelType: "ELECTRIC", horsepower: 408, notes: "2 двигателя (PSM+ASM); батарея 100 кВт·ч; седан; 2022– (FL: 449 л.с.)" },
      { code: "AMG EQE 43 4MATIC", drivetrain: "4MATIC", fuelType: "ELECTRIC", horsepower: 476, notes: "2 двигателя AMG; батарея 100 кВт·ч; седан; 2023–" },
      { code: "AMG EQE 53 4MATIC+", drivetrain: "4MATIC+", fuelType: "ELECTRIC", horsepower: 625, notes: "2 двигателя AMG; батарея 100 кВт·ч; седан; 2023– (Dynamic Plus: 687 л.с.)" },
    ],
  },
  // EQE X294 (2022 – present) — SUV (separate chassis from V295 sedan).
  {
    modelSlug: "eqe",
    generationCode: "X294",
    source: "https://www.auto-data.net/en/mercedes-benz-eqe-suv-x294-generation-9056",
    trims: [
      { code: "EQE 300", drivetrain: "RWD", fuelType: "ELECTRIC", horsepower: 245, notes: "1 двигатель PSM; батарея 98 кВт·ч; SUV; 2023– (FL: 100 кВт·ч 265 л.с.)" },
      { code: "EQE 320+", drivetrain: "RWD", fuelType: "ELECTRIC", horsepower: 315, notes: "1 двигатель PSM; батарея 105 кВт·ч; SUV; 2024–" },
      { code: "EQE 350", drivetrain: "RWD", fuelType: "ELECTRIC", horsepower: 292, notes: "1 двигатель PSM; батарея 98 кВт·ч; SUV; 2023–" },
      { code: "EQE 350+", drivetrain: "RWD", fuelType: "ELECTRIC", horsepower: 292, notes: "1 двигатель PSM; батарея 105 кВт·ч; SUV; 2023– (FL: 320 л.с.)" },
      { code: "EQE 350 4MATIC", drivetrain: "4MATIC", fuelType: "ELECTRIC", horsepower: 292, notes: "2 двигателя (PSM+ASM); батарея 100 кВт·ч; SUV; 2023– (FL: 320 л.с.)" },
      { code: "EQE 500 4MATIC", drivetrain: "4MATIC", fuelType: "ELECTRIC", horsepower: 408, notes: "2 двигателя (PSM+ASM); батарея 100 кВт·ч; SUV; 2023– (FL: 449 л.с.)" },
      { code: "AMG EQE 43 4MATIC", drivetrain: "4MATIC", fuelType: "ELECTRIC", horsepower: 476, notes: "2 двигателя AMG; батарея 100 кВт·ч; SUV; 2023–" },
      { code: "AMG EQE 53 4MATIC+", drivetrain: "4MATIC+", fuelType: "ELECTRIC", horsepower: 626, notes: "2 двигателя AMG; батарея 100 кВт·ч; SUV; 2023– (Dynamic Plus: 687 л.с.)" },
    ],
  },
  // EQS V297 (2021 – present) — flagship sedan, EVA platform.
  {
    modelSlug: "eqs",
    generationCode: "V297",
    source: "https://www.auto-data.net/en/mercedes-benz-eqs-v297-generation-8321",
    trims: [
      { code: "EQS 350", drivetrain: "RWD", fuelType: "ELECTRIC", horsepower: 292, notes: "1 двигатель PSM; батарея 100 кВт·ч; седан; 2022–" },
      { code: "EQS 450+", drivetrain: "RWD", fuelType: "ELECTRIC", horsepower: 333, notes: "1 двигатель PSM; батарея 120 кВт·ч; седан; 2021– (FL: 360 л.с.)" },
      { code: "EQS 450 4MATIC", drivetrain: "4MATIC", fuelType: "ELECTRIC", horsepower: 360, notes: "2 двигателя (PSM+ASM); батарея 120 кВт·ч; седан; 2022–" },
      { code: "EQS 500 4MATIC", drivetrain: "4MATIC", fuelType: "ELECTRIC", horsepower: 449, notes: "2 двигателя (PSM+ASM); батарея 120 кВт·ч; седан; 2022–" },
      { code: "EQS 580 4MATIC", drivetrain: "4MATIC", fuelType: "ELECTRIC", horsepower: 523, notes: "2 двигателя (PSM+ASM); батарея 120 кВт·ч; седан; 2021– (FL: 544 л.с.)" },
      { code: "AMG EQS 53 4MATIC+", drivetrain: "4MATIC+", fuelType: "ELECTRIC", horsepower: 658, notes: "2 двигателя AMG; батарея 120 кВт·ч; седан; 2022– (Dynamic Plus: 761 л.с.)" },
    ],
  },
  // EQS X296 (2022 – present) — flagship electric SUV.
  {
    modelSlug: "eqs",
    generationCode: "X296",
    source: "https://www.auto-data.net/en/mercedes-benz-eqs-suv-x296-generation-8844",
    trims: [
      { code: "EQS 400 4MATIC", drivetrain: "4MATIC", fuelType: "ELECTRIC", horsepower: 355, notes: "2 двигателя (PSM+ASM); батарея 125 кВт·ч; SUV; FL 2024–" },
      { code: "EQS 450+", drivetrain: "RWD", fuelType: "ELECTRIC", horsepower: 360, notes: "1 двигатель PSM; батарея 120/125 кВт·ч; SUV; 2022–" },
      { code: "EQS 450 4MATIC", drivetrain: "4MATIC", fuelType: "ELECTRIC", horsepower: 360, notes: "2 двигателя (PSM+ASM); батарея 120/125 кВт·ч; SUV; 2022–" },
      { code: "EQS 500 4MATIC", drivetrain: "4MATIC", fuelType: "ELECTRIC", horsepower: 449, notes: "2 двигателя (PSM+ASM); батарея 120/125 кВт·ч; SUV; 2022–" },
      { code: "EQS 550 4MATIC", drivetrain: "4MATIC", fuelType: "ELECTRIC", horsepower: 536, notes: "2 двигателя (PSM+ASM); батарея 125 кВт·ч; SUV; FL 2024–" },
      { code: "EQS 580 4MATIC", drivetrain: "4MATIC", fuelType: "ELECTRIC", horsepower: 544, notes: "2 двигателя (PSM+ASM); батарея 120/125 кВт·ч; SUV; 2022–" },
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
