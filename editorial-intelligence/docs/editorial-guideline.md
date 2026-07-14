# TNC Editorial Guideline v1.0

This is a **structural draft** (section XI) — every heading below is
required, the content under each is a starting point for the editorial
team to refine, not a finished style bible. `prompt/generator.py` embeds
this entire file, verbatim, into every generated Prompt, so whatever is
written here is what every future draft gets measured against — keep it
short enough that an external writing tool can actually follow all of it
at once.

## Voice

The New Culture speaks as an insider of Vietnamese hip-hop/underground
culture, not an outside observer reporting on it. Confident, direct,
specific — named people, named places, named releases, never vague
industry-speak ("một sản phẩm âm nhạc mới", "giới trẻ Việt Nam").

## Tone

Respectful of the culture and the artists covered, critical when
warranted, never sensationalist or clickbait. Serious analysis can still
read casually; it should never read like a press release copy-pasted
from a label.

## Fact Checking

Every factual claim in a draft must trace back to at least one Source
attached to the Editorial Event behind it (see the "Sources" section of
the generated Prompt). No claim should be stated more confidently than
its weakest cited Source supports. If sources conflict, say so instead of
picking one silently.

## Headline

Lead with the specific (artist, release, event), not a generic label.
Vietnamese by default; a bilingual headline is acceptable when the
English term is already how fans refer to the release/event.

## SEO

One clear primary keyword per article, used naturally in the headline
and first paragraph. Avoid keyword stuffing. Prefer specific artist/
release/event names as the primary keyword over generic genre terms —
they have far less competition and match how people actually search.

## Excerpt

1–2 sentences, states what happened and why it matters, no clickbait
("Điều gì đã xảy ra sẽ khiến bạn bất ngờ"-style framing is never
acceptable). Maps to the `dek` frontmatter field.

## Frontmatter

Fill in every field from the Prompt's "Frontmatter" section exactly as
named — do not invent new field names, do not remove fields. Leave a
field exactly as `""` (empty string) rather than guessing a value the
Prompt did not provide (e.g. `cover`, `date`, `read_time` are populated by
the CMS pipeline itself, not by the writer).

## Citation

When a claim comes from a specific quote or specific data point (chart
position, streaming numbers, an official statement), name the source
inline in prose ("theo trang Spotify for Artists của...", "theo thông báo
chính thức trên Instagram của..."). Do not present a single unverified
source's framing as settled fact.

## Artist Naming

Use the artist's own stage-name capitalization and spelling exactly as
they present it on their official channels (Tier 1 sources) — do not
"correct" stylization. On first mention in a piece, use the full
stage-name; later mentions may shorten only if that shortened form is
itself how the artist is commonly known.

## Internal Linking

Link the first mention of any artist/label/collective that already has a
TNC Profile (see the Prompt's "Related Profiles" section) directly to
that profile page. Link the first mention of a directly-related past
article (see "Internal Linking Suggestions") where it adds context,
never as a forced/unnatural insertion.
