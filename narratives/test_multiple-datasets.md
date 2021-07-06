---
title: Test narrative to use multiple datasets in a single narrative
authors: "James Hadfield"
authorLinks: "https://twitter.com/hamesjadfield"
affiliations: "Fred Hutch, Seattle, USA"
date: "2020-04-23"
dataset: "https://nextstrain.org/mumps/na?d=tree"
abstract: "Test narrative"
---


# [Opening dataset](https://nextstrain.org/mumps/na?d=tree,frequencies)

The first slide uses the same dataset as the YAML frontmatter, namely it asks for the `/mumps/na` dataset.
However we add a the frequencies panel to the query (`d=tree,frequencies`) which does not exist...

# [Different dataset (zika)](https://nextstrain.org/zika?d=tree,map)

This slide defines a different dataset (`/zika`) with URL query `d=tree,map` and thus the visualisation should change to the zika dataset and show both a tree and a map.(A quick way to check: the zika map includes south america and the pacific, whereas the mumps one is confined to North America.)


# [Invalid dataset](https://nextstrain.org/zika/no?d=tree,entropy)

Dataset defined for this slide doesn't exist.
Unclear whether we should fallback to the frontmatter page (mumps) or the previous slide (zika) or the slide we came from?

P.S. Query is asking for tree+entropy.

# [flu - tree and frequencies](https://nextstrain.org/flu/seasonal/vic/ha/2y?d=tree,frequencies)

"/flu/seasonal/vic/ha/2y" dataset tree + frequencies

# [flu - multiple trees](https://nextstrain.org/flu/seasonal/vic/ha/2y:/flu/seasonal/vic/na/2y)

"/flu/seasonal/vic/ha/2y" + "/flu/seasonal/vic/na/2y"

