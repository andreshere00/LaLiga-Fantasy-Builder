# Sign-in artwork

Provider marks identify the provider on sign-in and account-linking controls.
They are decorative beside each button's accessible text label, served locally,
and never fetched from a provider during a page visit.

- Google: https://developers.google.com/static/identity/images/g-logo.png,
  from https://developers.google.com/identity/branding-guidelines.
- Facebook: https://www.facebook.com/images/fb_icon_325x325.png.
- Apple: the unmodified medium, left-aligned black and white SVGs from
  https://devimages-cdn.apple.com/design/resources/download/Logo-Sign-in-with-Apple.dmg.
  The project owner approved acceptance of Apple's artwork license on 2026-10-25.
  The supplied license is preserved in `Apple-Artwork-License.rtf`.

Preserve each mark's aspect ratio, colors and built-in padding. Provider marks
remain the property of their respective owners.

## Browser translation provider

GTranslate Free processes only public FutbolFantasy injury/news prose in
`translation-reader.html`, sandboxed without `allow-same-origin`. Its current
library is loaded from `https://cdn.gtranslate.net/widgets/latest/lib.min.js`;
translation currently uses `https://translate-pa.googleapis.com`. The library's
ready/result/reset interface was inspected and tested on 4 November 2026.
The mutable `latest` URL is vendor-controlled, so retain the opt-in live browser
compatibility test when updating this integration. Attribution is shown beside
the prose. Translation is optional; blocked/failed requests show the original.
No JWT, LaLiga bearer, account fields, or full API payload is sent to the reader.
See [frontend localization](../../../docs/frontend.md#spanish-and-english).
