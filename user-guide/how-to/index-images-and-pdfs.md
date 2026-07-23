# Index images and PDFs

Local Search's index is built on `.md`/`.mdx`/`.txt` text — it doesn't OCR an image or parse a PDF's binary content. But diagrams and scanned documents are exactly the kind of thing you want to find later, so there's a deliberate pattern for it: pair the media file with a plain markdown **sidecar** that describes it, and the sidecar's content becomes what's actually searchable.

## Before you start

You'll need a repo already registered that contains (or will contain) the images/PDFs you want findable.

## The rule: same folder, same name, `.md` extension

Local Search recognizes these media types: `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.svg`, `.pdf`. A media file is only indexed if there's a companion markdown file sitting right next to it, with the identical base name:

```
architecture/
  drive-license-front.jpg     ← the image itself
  drive-license-front.md      ← its companion — same name, .md instead of .jpg
```

`FilingInfo-2.pdf` needs `FilingInfo-2.md` next to it — not `FilingInfo-2-notes.md`, not one folder up, not with a different case. The match is purely mechanical: strip the media file's extension, append `.md`.

## Write the sidecar

The sidecar is a normal spec file — frontmatter plus a body:

```markdown
---
title: Driver License — Front
tags: identity, kyc, sample-document
---

# Driver License — Front

A description of what the image shows: field layout, what data it's meant to
capture, and why it's relevant to onboarding/KYC review.
```

Everything searchable about the image — its title, tags, and body text — comes from this file, not from the image itself. Write it the way you'd want to find it later: describe what's in the picture or scanned page, not just "diagram of X."

## Add the repo and check it worked

```bash
$ local-search repo add /path/to/docs
...
Done. N specs indexed.

$ local-search list your-repo
[your-repo]
  architecture/
    drive-license-front  Driver License — Front  .jpg
```

Notice the entry is listed with the **image's** extension (`.jpg`), even though every word of its title and tags came from the `.md` sidecar. Search works exactly the same way:

```bash
$ local-search search "identity kyc" --repos your-repo
Specs (1):
  [your-repo · FTS] architecture/drive-license-front.jpg
    Driver License — Front  (identity, kyc, sample-document)  .jpg
```

## What happens without a sidecar

Nothing — silently. An image or PDF with no matching `.md` file next to it is skipped during the scan, with no warning and no error. It simply doesn't show up in `list`, `search`, or anywhere else, and the scan's "N files indexed" count doesn't include it. This is intentional: unpaired media isn't treated as broken, just as "nothing to index yet."

> **Note:** The sidecar file itself is never indexed a second time as its own separate text spec. `drive-license-front.md` doesn't appear in `local-search list` as a standalone entry — it's folded entirely into the `drive-license-front.jpg` record. If you want a folder of unrelated diagrams and a genuinely separate markdown doc to both be independently searchable, give the doc a name that doesn't collide with any image's basename in the same folder.

## Done-check

- `local-search list <repo>` shows your media file with its real extension (`.jpg`/`.pdf`/etc.) and the sidecar's title.
- Searching for words that only appear in the sidecar's body returns that media file as a hit.
- An image you deliberately left without a sidecar does not appear anywhere in `list` or `search`.

## See also

- [../reference/cli-commands.md](../reference/cli-commands.md) — supported file types, listed in `local-search help`
- [manage-repos.md](manage-repos.md) — registering the folder that holds your images/PDFs in the first place
