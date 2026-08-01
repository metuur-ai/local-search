# Sample upload files

Two files to exercise **Upload JSON** in the Graph Explorer, one per accepted shape.

| File | Shape | What it produces |
| --- | --- | --- |
| `sample-graph.json` | node-link object (`{`) | 18 nodes, authored links — declared, dangling and unresolved families all present |
| `sample-files.json` | flat array of file records (`[`) | 12 file records → 25 nodes (13 synthesized repo/project/tag hubs), 44 similarity links |

Their ids do not overlap, so uploading one and then the other with **Blend** on
merges both onto the canvas with no id collisions.

`sample-files.json` carries tags, but on the flat shape tags become hub nodes
rather than node properties, so the Tag filter stays empty for it — that is the
documented behaviour of the shape, not a defect in the file.
