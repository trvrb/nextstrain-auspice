---
title: Simultaneous Updates to Tree State
authors:
  - James Hadfield
authorLinks:
  - https://twitter.com/hamesjadfield
affiliations: "Fred Hutch"
dataset: "http://localhost:4000/flu/seasonal/h3n2/ha/3y?d=tree"
date: June 2020
abstract: "A narrative to explore simultaneous changes to tree state. The aim is both to reveal what's possible, and to prevent future regressions via automated testing."
---


# [P1: Change color-by to num_date](http://localhost:4000/flu/seasonal/h3n2/ha/3y?d=tree&c=num_date)
Check that both the branches and tips update.

# [P2: Zoom into clade A1](http://localhost:4000/flu/seasonal/h3n2/ha/3y?d=tree&c=num_date&label=clade:A1)

# [P3: Zoom into clade A1b _and_ change color](http://localhost:4000/flu/seasonal/h3n2/ha/3y?d=tree&label=clade:A1b)
Check that the coloring of the branches and tips update as we zoom in.

# [P3b: Zoom in slightly more via "zoom to selected"](http://localhost:4000/flu/seasonal/h3n2/ha/3y?d=tree&f_clade_membership=A1b/186D,A1b/197R,A1b/94N&treeZoom=selected)

We're now recreating the functionality of filtering to clades A1b/186D, A1b/197R and A1b/94N then clicking "zoom to selected"

# [P4: Lots of simultaneous changes](http://localhost:4000/flu/seasonal/h3n2/ha/3y?c=lbi&d=tree&dmin=2017-01-01&f_region=North%20America&label=clade:3c2.A&m=div)
* Zoomed out to near the root (clade 3c2.A)
* Changed the horizontal scale to divergence
* Changed the color-by to LBI (and legend should be open)
* Filtered to North American Samples (i.e. the majority of tips are not visible).
* Time slice excludes pre-2017 samples (note that we don't have the grey overlay here since the axis is divergence)

# [P5: Layout change (and others)](http://localhost:4000/flu/seasonal/h3n2/ha/3y?branchLabel=none&d=tree&l=radial&m=div)
Underneath, this uses a different set of d3 calls where instead of transitioning all elements (branches, tips etc), which is too slow, we do a "in-parts" update: we hide the branches, transition the tips, then redraw the branches in their new position.
This slide should
* switch to radial view
* zoom out to show the entire tree, and remove filters so all tips should be shown
* change the coloring to clade