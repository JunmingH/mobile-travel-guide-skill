# Gateway failure recovery

Use this only for platform-level failures such as HTTP 500 responses or a sensitive-content rejection applied to ordinary destination, venue, opening-hour or review research. Do not treat the error as evidence that a language, restaurant name or user request is actually sensitive.

## Query hygiene

- Start with a short exact-place query: official English or romanized venue name plus city. Add one fact such as `hours` or `Google Maps`, not a long stack of local-language terms.
- Use the local-script name only when it is needed to disambiguate the exact venue. Native-language text is valid; the shorter English-first form is merely a recovery tactic for a malfunctioning gateway.
- Keep identity, hours, rating and image discovery as bounded requests. Do not combine every desired attribute into one long query.

## Stop condition

1. On the first platform-level 500 or sensitive-content rejection, do not resend the same text and do not send the unchanged task to another agent.
2. Make at most one recovery attempt for that lookup: shorten it to the official English or romanized venue name plus city, or use a different already-available research surface.
3. If the recovery attempt receives the same class of rejection, stop that lookup. Do not cycle through agents, languages, keyword variants or mirrors.
4. For an optional field, omit it and continue. For a required venue, use an already verified official source or replace the venue through one bounded selection decision. If the whole research surface rejects unrelated ordinary requests, leave the current pack incomplete, preserve every completed JSON pack and resume from disk when the service recovers.

Never erase or regenerate validated packs because one later pack fails. Never mark an incomplete required pack complete, and never block unrelated progress that the controller safely permits.
