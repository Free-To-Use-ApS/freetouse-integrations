# Directory listing — submission kit

Everything needed to submit the Free To Use MCP server to the **ChatGPT Apps
directory** and the **Claude Connectors directory**. Copy the metadata below
verbatim; the checklist at the end flags the few items only you (the account
owner) can complete.

> Replace `https://<your-domain>` throughout with the deployed HTTPS origin
> (e.g. the Render URL `https://ftu-mcp-server.onrender.com`). The MCP endpoint
> is that origin + `/mcp`.

---

## Listing copy

| Field | Value |
|-------|-------|
| **Name** | Free To Use Music |
| **Tagline** (≤ 40 chars) | Royalty-free music, right in the chat |
| **Category** | Music / Creativity |
| **Primary color** | `#7569DE` (FTU purple) |
| **Homepage** | https://freetouse.com |
| **Privacy policy** | `https://<your-domain>/privacy` |
| **Support / contact** | hello@freetouse.com |
| **MCP endpoint** | `https://<your-domain>/mcp` |
| **Auth** | OAuth 2.1 (anonymous — no login screen; every client is approved) |

### Short description (≤ 150 chars)

> Find royalty-free Free To Use tracks by mood, genre, or artist and play them
> inline. Free to use in your videos with attribution.

### Long description

> Free To Use Music brings the entire royalty-free [freetouse.com](https://freetouse.com)
> catalog (~1,500 tracks) into your assistant. Ask for a vibe — "calm piano for a
> studying video", "upbeat corporate", "epic cinematic trailer" — and get back
> interactive players you can preview, scrub, and download without leaving the
> chat. Browse by category or artist, find more tracks like one you love, and
> narrow by instrumental-vs-vocal or length when you need to.
>
> Every track is free to use in your content as long as you credit it in your
> description; monetized or commercial use (or skipping attribution) may need a
> Free To Use subscription or a single-track license. The connector requires no
> account and collects no personal data.

### Example prompts (for the "Try asking…" section)

- "Find me some calm lofi for a study video"
- "Upbeat corporate music under 30 seconds"
- "Instrumental cinematic tracks for a trailer"
- "More tracks like [track] by [artist]"
- "What music categories do you have?"

---

## Tools exposed

| Tool | What it does |
|------|--------------|
| `search_music` | Search the catalog by mood / genre / activity / artist / title. Optional askable filters: `vocals` (instrumental/vocal) and `min_seconds`/`max_seconds`. |
| `find_similar` | More tracks with a similar vibe to a given track (by id, "Artist – Title", or URL). |
| `browse_category` | All tracks in a genre / mood / video use-case. |
| `browse_artist` | An artist's full catalog. |
| `list_categories` | The browse vocabulary (category names), text-only. |

All five are read-only, open-world, and render the same inline player widget on
hosts that support MCP Apps UI (ChatGPT); text-only hosts (Claude today) get a
clean list with listen/download links.

---

## Assets to produce  ⚠️ *(your action — not in this repo)*

| Asset | Spec | Notes |
|-------|------|-------|
| **App icon** | 512×512 PNG, no transparency padding issues | Use the FTU mark on a `#7569DE` or white background. Both directories require it. |
| **Screenshots** | 1–4, ~1600×1000 PNG/JPG | Show the inline player in ChatGPT (light **and** dark — the widget now themes to the host). Grab from a real `search_music` result, not `/preview`. |
| **Demo video** *(optional, ChatGPT)* | ≤ 30s | A search → play → download flow reads well. |

The widget itself already ships the brand font, waveform player, attribution
modal, and (as of this batch) dark-theme support — so screenshots need no
post-processing.

---

## Pre-submission checklist

### Shared (both directories)

- [ ] Deploy to a stable HTTPS origin (Render blueprint at repo root). **Set a
      persistent `AUTH_SECRET`** — the server now refuses to boot in production
      without one (≥ 32 chars).
- [ ] Confirm `https://<your-domain>/mcp` connects from a fresh
      ChatGPT/Claude custom-connector before submitting.
- [ ] `https://<your-domain>/privacy` loads and lists hello@freetouse.com.
- [ ] `https://<your-domain>/healthz` returns `200 {ok:true}` once warm
      (it returns `503` only during the initial catalog load).
- [ ] App icon (512×512) and at least one screenshot ready.

### ChatGPT Apps directory  ⚠️ *(account-owner steps)*

- [ ] **OpenAI verified organization / business** on the developer account that
      submits the app (required to publish). Verify at platform.openai.com.
- [ ] Widget CSP is declared (already done in code: `openai/widgetCSP` +
      `openai/widgetDomain`) — no action, just don't remove it.
- [ ] Fill the app-submission form with the copy above; attach icon +
      screenshots; link the privacy policy.
- [ ] Confirm the digital-content policy: the premium badge links to a track's
      **licensing info page** (informational), and no purchase/checkout happens
      inside the widget — keep it that way to stay policy-compliant.

### Claude Connectors directory  ⚠️ *(account-owner steps)*

- [ ] Submit from the **Free To Use ApS** Anthropic org/workspace.
- [ ] Provide name, description (above), icon, and the `…/mcp` URL.
- [ ] OAuth handshake works (anonymous auto-approve — already implemented).

---

## Notes for reviewers (paste into the submission "notes" field if asked)

- **No authentication data collected.** OAuth is a required handshake only; the
  provider approves every client anonymously (the catalog and the underlying
  [api.freetouse.com](https://api.freetouse.com) are fully public).
- **No user data stored.** Only short-lived operational logs (search terms +
  timing) for reliability/abuse prevention; see the privacy policy.
- **Licensing.** Tracks are free to use with attribution; the connector reminds
  users of this in both the text response and the in-widget attribution modal,
  and links premium tracks to their licensing page.
</content>
</invoke>
