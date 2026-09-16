# Destination isolation contract

The canonical Bali product is the interaction and layout source. It is never the content source for another destination.

## Build one destination dataset

Before editing the page, create `destination-profile.json` with:

```json
{
  "destination": "Example City, Testland",
  "display_name": "示例城",
  "aliases": ["Example City", "示例城"],
  "country": "Japan",
  "transport": {
    "status": "pending",
    "legs": []
  },
  "forbidden_reference_terms": ["Ubud", "Seminyak", "Threads of Life"],
  "places": []
}
```

`transport.status` is mandatory and is either `pending` or `confirmed`. Pending uses two generic page cards and an empty `legs` array. Confirmed stores one record per actual leg, including direction, date, service/flight number, origin, destination, departure/arrival time and verified terminal when known. Render the large transport headline, cards and fine print from this one array.

`stays` uses an explicit status contract. A pending stay renders one canonical-shaped neutral accommodation placeholder, contains no invented property/address/map link and requires no property images. A confirmed stay references an exact hotel `place_id`, dates, address/map query and at least two distinct verified exact-property images; use three when reliable assets are readily available. Never turn “hotel unknown” into a fictional recommendation.

The profile also names `render_bindings_file`. Bindings may target only the registered destination roots: `.hero`, `.flight-band`, `#stay`, `#route`, `#sights`, `#shops`, `#move`, `#food`, `#booking`, `#words`, `#tips` and destination-bearing runtime data files documented by the renderer. Each HTML binding replaces the complete inner fragment of that root while preserving its canonical outer element and classes.

Every named hotel, route stop, sight, shop, market, souvenir seller, experience and restaurant is one place record. Give it a stable ID, type, display name, exact local/English query, coordinates or verified map URL, official/source URL, rating source, hours and local image files. Render the HTML, Mini Routes, Trip Mode, Adjust Itinerary and Google route queries from this same place set. Do not hand-maintain competing copies of the destination data.

Put the stable ID on every place-bearing card as `data-place-id`. The exact same ID must appear on every corresponding image entry in `asset-manifest.json`. This is the machine-checkable link that prevents one restaurant, shop or attraction from borrowing another place's photograph.

## Replace content atomically

For a non-Bali export, replace all of these before styling:

- cover place and destination copy;
- hotel properties and galleries;
- every day, route stop, transfer and map query;
- modules 02–05 and every rating, review count, hour and link;
- preparation, language and local-life content;
- every destination-bearing image and its manifest entry.

Also replace semantic template residue that may not be a named venue: forest/sea phase slogans, fixed Bali day themes, neighborhood labels such as Berawa, yoga/SPA taxonomy, Indonesian menu vocabulary, tropical packing assumptions and Bali excursion reservation prompts. These are contamination even when they are not caught by a venue-name search.

Do not use string replacement to adapt the canonical HTML. Build a complete destination record set first, then replace every repeated record family from that set. String replacement produces hybrid values such as a new hotel name joined to an old Bali address/query and is prohibited.

Runtime filenames should be destination-neutral. Visible copy, data objects, links, routes and local media may not retain demo venues or imagery in a completed destination export.

## Image acquisition and identity

Research each exact place independently. Prefer official sites, official social pages, reputable exact-property listings, public map/business material, Wikimedia Commons with clear licensing or reputable local publications. Save selected images locally and record them in `asset-manifest.json`.

For each asset, verify all of the following before use:

1. the page title or listing names the exact venue;
2. the image visibly depicts that venue, its food/product or an official interior/exterior;
3. the file decodes and is large enough for its card crop;
4. it is not byte-identical to another gallery image;
5. venue, source page, source type, retrieval date and filename are in the manifest.

Never copy a canonical reference image into a target-destination card. Never use an unrelated market, restaurant or landscape because its colors fit. If exact-place imagery cannot be verified, replace the recommendation or keep it out of the release candidate.

## Contamination gate

Before browser QA, search the candidate HTML, data files and referenced media paths for canonical reference terms. For a non-Bali destination, the following are examples of hard failures: `Ubud`, `Seminyak`, `Threads of Life`, `Bali Pulina`, `Hujan Locale`, `Sacred Monkey Forest`, `Tirta Empul`, `FINNS`, `Merah Putih`, `Mahandita` and `iSuite`.

Also inspect modules 03–05 visually. Correct headings with a wrong venue photo still fail. A localized title over a Bali photograph is contamination, not adaptation.

Inspect Modules 01, 04, 05 and 06 semantically as well: each heading must describe its records, menu guidance must match the destination, and checklist/reservation items must match the actual itinerary. Empty cards or sections caused by inherited reference tokens (for example a `Berawa` selector with no target record) are hard failures.

Every rendered shopping/experience/food disclosure must contain at least one target-destination record. Never render an inherited region/category heading with an empty body. Its label, filter key and contained records must all be generated from the destination dataset.

The gate scans visible HTML, JavaScript data/fallbacks, JSON datasets, CSS `content:` strings and every raster file in the export. Unreferenced Bali images are still contamination: a non-Bali export may contain only raster files listed in its destination asset manifest. Shared runtime code may not contain a hidden Bali venue fallback.

The strict product audit checks the machine-testable part of this contract. The final desktop/mobile visual pass must verify subject identity and crop quality.
