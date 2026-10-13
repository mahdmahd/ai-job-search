// Offline fixtures mirroring EURAXESS's real card/detail markup (verified
// against live responses, 2026-10-13). No network is used anywhere in tests.

export const CARD_COMPLETE = `
<article class="ecl-content-item"><div class="ecl-content-block ecl-content-item__content-block"><ul class="ecl-content-block__primary-meta-container"><li class="ecl-content-block__primary-meta-item"><a href="/partnering/organisations/profile/tu-delft" hreflang="en">TU Delft</a></li><li class="ecl-content-block__primary-meta-item">Posted on: 13 October 2026</li></ul><h3 class="ecl-content-block__title"><a
  href="/jobs/472465"
  class="ecl-link ecl-link--standalone"

><span>PhD Candidate on Resilient Coastal Structures</span></a></h3><div class="ecl-content-block__description"><p>We are looking for a motivated PhD candidate to work on hydraulic engineering &amp; coastal resilience at Delft University of Technology...</p></div><ul class="ecl-content-block__secondary-meta-container"><li class="ecl-content-block__secondary-meta-item"><span class="ecl-content-block__secondary-meta-label"><div class="id-Department  ecl-u-d-flex" style="gap:1rem;"><div class="ecl-text-standard ecl-u-d-flex ecl-u-flex-column">
          Hydraulic Engineering
        </div></div><div class="id-Work-Locations  ecl-u-d-flex ecl-u-flex-column" style="gap:1rem;"><div class="ecl-text-standard ecl-u-d-flex ecl-u-flex-column">
          Number of offers: 1, Netherlands, TU Delft, 2628 CN, Delft, Stevinweg 1
        </div></div><div class="id-Research-Field  ecl-u-d-flex ecl-u-flex-column" style="gap:1rem;"><div class="ecl-text-standard ecl-u-d-flex ecl-u-flex-column"><div><a href="/jobs/search?f%5B0%5D=job_research_field%3A164" aria-label="Filter by Engineering">Engineering</a></div></div></div><div class="id-Application-Deadline  ecl-u-d-flex ecl-u-flex-column" style="gap:1rem;"><div class="ecl-text-standard ecl-u-d-flex ecl-u-flex-column"><div><time datetime="2026-11-01T23:59:59+00:00">01 Nov 2026 - 23:59 (Europe/Amsterdam)</time></div></div></div></span></li></ul></div></article>`

export const CARD_NO_DEADLINE = `
<article class="ecl-content-item"><div class="ecl-content-block ecl-content-item__content-block"><ul class="ecl-content-block__primary-meta-container"><li class="ecl-content-block__primary-meta-item"><a href="/partnering/organisations/profile/university-aveiro-10" hreflang="en">University of Aveiro</a></li><li class="ecl-content-block__primary-meta-item">Posted on: 13 October 2026</li></ul><h3 class="ecl-content-block__title"><a
  href="/jobs/472460"
  class="ecl-link ecl-link--standalone"

><span>Postdoctoral Researcher in Active Rooftops</span></a></h3><div class="ecl-content-block__description"><p>A tender is hereby opened for the award of one Postdoctoral Fellowship(s) (PDF) under projet Active RoofTops South Europe...</p></div><ul class="ecl-content-block__secondary-meta-container"><li class="ecl-content-block__secondary-meta-item"><span class="ecl-content-block__secondary-meta-label"><div class="id-Work-Locations  ecl-u-d-flex ecl-u-flex-column" style="gap:1rem;"><div class="ecl-text-standard ecl-u-d-flex ecl-u-flex-column">
          Number of offers: 1, Portugal, Universidade de Aveiro, 3810-193, Aveiro, Campus Universit&#225;rio de Santiago
        </div></div></span></li></ul></div></article>`

// A card whose <h3> has no /jobs/<id> anchor — the parser must skip it.
export const CARD_MALFORMED = `
<article class="ecl-content-item"><div class="ecl-content-block ecl-content-item__content-block"><h3 class="ecl-content-block__title"><span>No link here</span></h3></div></article>`

// Search-page wrapper: the list plus the pagination footer EURAXESS renders
// (last-page link carries the final page number).
export const SEARCH_PAGE = `<html><body>
<ul>${CARD_COMPLETE}${CARD_NO_DEADLINE}${CARD_MALFORMED}</ul>
<nav class="ecl-pagination" aria-label="Pagination"><ul class="ecl-pagination__list"><li class="ecl-pagination__item ecl-pagination__item--current"><span class="ecl-pagination__text ecl-pagination__text--summary" aria-current="true">1</span></li><li class="ecl-pagination__item"><a href="?page=1" class="ecl-link ecl-link--standalone" aria-label="Go to page 2">2</a></li><li class="ecl-pagination__item ecl-pagination__item--ellipsis"><span class="ecl-pagination__text ecl-pagination__text--summary">...</span></li><li class="ecl-pagination__item ecl-pagination__item--last"><a href="?page=59" class="ecl-link ecl-link--standalone" aria-label="Go to last page">59</a></li></ul></nav>
</body></html>`

export const SEARCH_PAGE_NO_PAGER = `<html><body><ul>${CARD_COMPLETE}${CARD_MALFORMED}</ul></body></html>`

// Detail page mirroring the live markup: header card (h1), Job Information
// dl, Offer Description, Work Location(s), and the mailto apply CTA.
export const DETAIL_PAGE = `<html><body>
<div class="ecl-container euraxess-page-header">
  <h1 class="ecl-content-block__title">PhD Candidate on Resilient Coastal Structures</h1>
  <div class="ecl-content-item__meta ecl-u-type-s ecl-u-type-color-grey-75 ecl-u-mb-xs">
    <div id="job-status" class="ecl-u-d-flex"></div>
    <div class="ecl-u-mt-xs ">
      13 Oct 2026
    </div>
  </div>
  <a href="mailto:bureau-tud@tudelft.nl?subject=PhD%20Candidate"
     class="ecl-link ecl-link--cta job-apply-button" target="_blank" data-id="472465"><span class="ecl-link__label">Apply now</span></a>
</div>
<main id="main-content"><div class="ecl-container">
  <h2 id="job-information" class="ecl-u-type-heading-2">Job Information</h2>
  <dl class="ecl-description-list"><dt class="ecl-description-list__term">Organisation/Company</dt><dd class="ecl-description-list__definition"><div>TU Delft</div></dd><dt class="ecl-description-list__term">Department</dt><dd class="ecl-description-list__definition"><div>Hydraulic Engineering</div></dd><dt class="ecl-description-list__term">Research Field</dt><dd class="ecl-description-list__definition"><div>Engineering &amp; Civil engineering</div></dd><dt class="ecl-description-list__term">Researcher Profile</dt><dd class="ecl-description-list__definition"><div>First Stage Researcher (R1)</div></dd><dt class="ecl-description-list__term">Positions</dt><dd class="ecl-description-list__definition"><div>PhD Positions</div></dd><dt class="ecl-description-list__term">Application Deadline</dt><dd class="ecl-description-list__definition"><div><time datetime="2026-11-01T23:59:59+00:00">01 Nov 2026 - 23:59 (Europe/Amsterdam)</time></div></dd><dt class="ecl-description-list__term">Country</dt><dd class="ecl-description-list__definition"><div>Netherlands</div></dd><dt class="ecl-description-list__term">Type of Contract</dt><dd class="ecl-description-list__definition"><div>Temporary</div></dd><dt class="ecl-description-list__term">Job Status</dt><dd class="ecl-description-list__definition"><div>Full-time</div></dd></dl>
  <h2 id="offer-description" class="ecl-u-type-heading-2">Offer Description</h2>
  <div class="ecl"><p>We are looking for a motivated PhD candidate to work on hydraulic engineering &amp; coastal resilience.</p><p>The PhD will develop flood-resilient design solutions.</p></div>
  <h2 id="work-locations" class="ecl-u-type-heading-2">Work Location(s)</h2>
  <div>Number of offers available 1 Company/Institute TU Delft Country Netherlands Postal Code 2628 CN Street Stevinweg 1</div>
</div></main>
</body></html>`

// What EURAXESS serves instead of a detail page when it refuses non-browser
// clients: the plain search page (either via 307 redirect or a stub response).
// It has cards but no job-information/offer-description markup.
export const SEARCH_AS_DETAIL = SEARCH_PAGE
