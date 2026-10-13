# Nationale Vacaturebank API URL Reference

Public JSON endpoints used or documented by this skill. Base URL:

```
https://api.nationalevacaturebank.nl
```

> Personal, low-volume use only. Respect Nationale Vacaturebank's terms and
> rate limits; do not bulk collect vacancies.

## Vacancy search

```
GET /api/jobs/v3/sites/nationalevacaturebank.nl/jobs?page=1&limit=10&sort=relevance&filters=city:Amsterdam%20latitude:52.359273%20longitude:4.887517%20distance:40%20dcoTitle:developer
```

| Query parameter | Meaning |
|-----------------|---------|
| `page` | One-indexed results page. |
| `limit` | Results per page. |
| `sort` | One of `relevance`, `date`, `distance`, or `random`. |
| `filters` | Space-separated filter expressions; see below. |

The search response has this envelope:

```text
{ page, limit, pages, total, _links, _embedded: { jobs: [...] } }
```

Each job includes `id`, `title`, `dcoTitle`, `description`, `company`, `salary`,
`contractType`, `careerLevel`, `categories`, `industries`, `startDate`, `endDate`,
`status`, `workingHours`, and `workLocation`. Search output uses
`workLocation.displayName` (then `workLocation.city`) rather than labelling every
radius result as the requested search centre.

## Vacancy detail

```
GET /api/jobs/v3/sites/nationalevacaturebank.nl/jobs/{id}
```

The CLI uses this detail endpoint for `detail <id|url>`. A `404` is reported as
`{ "error": "job not found", "code": "NOT_FOUND" }`.

## Lookup endpoints

```text
GET /api/jobs/v3/sites/nationalevacaturebank.nl/function-titles?query=developer
GET /api/v1/cities/nl?startsWith=Ams
GET /api/v1/geolocations/nl/Amsterdam
```

Use function-title lookup to discover title values, city lookup for city spelling,
and geolocation lookup when a caller needs coordinates for geographic filtering.

## Filter grammar

`filters` is one URL-encoded string containing space-separated `key:value` pairs:

```text
filters=city:Amsterdam%20dcoTitle:developer
```

Supported keys are:

| Key | Example |
|-----|---------|
| `city` | `city:Amsterdam` |
| `dcoTitle` | `dcoTitle:developer` |
| `latitude` | `latitude:52.3676` |
| `longitude` | `longitude:4.9041` |
| `distance` | `distance:40` |

For a city-scoped search, the CLI first calls the geolocation lookup endpoint and
builds `city`, `latitude`, `longitude`, and `distance` expressions together. The
jobs endpoint returns `400` when `distance` is sent without coordinates. The CLI
also builds `dcoTitle` from `--query`. With `--jobage`, it requests `sort=date`
and filters the returned jobs by `startDate` where that date is available.
