import { updateVisibleTipsAndBranchThicknesses, applyFilter } from "../../../actions/tree";
import { NODE_VISIBLE, strainSymbol } from "../../../util/globals";
import { getDomId, getParentBeyondPolytomy, getIdxOfInViewRootNode } from "../phyloTree/helpers";
import { branchStrokeForHover, branchStrokeForLeave } from "../phyloTree/renderers";

/* Callbacks used by the tips / branches when hovered / selected */

export const onTipHover = function onTipHover(d) {
  if (d.visibility !== NODE_VISIBLE) return;
  const phylotree = d.that.params.orientation[0] === 1 ?
    this.state.tree :
    this.state.treeToo;
  phylotree.svg.select(getDomId("#tip", d.n.name))
    .attr("r", (e) => e["r"] + 4);
  this.setState({
    hovered: {d, type: ".tip"}
  });
};

export const onTipClick = function onTipClick(d) {
  if (d.visibility !== NODE_VISIBLE) return;
  if (this.props.narrativeMode) return;
  this.setState({
    hovered: null,
    selectedTip: d
  });
  this.props.dispatch(applyFilter("add", strainSymbol, [d.n.name]));
};


export const onBranchHover = function onBranchHover(d) {
  if (d.visibility !== NODE_VISIBLE) return;

  branchStrokeForHover(d);

  /* if temporal confidence bounds are defined for this branch, then display them on hover */
  if (this.props.temporalConfidence.exists && this.props.temporalConfidence.display && !this.props.temporalConfidence.on) {
    const tree = d.that.params.orientation[0] === 1 ? this.state.tree : this.state.treeToo;
    if (!("confidenceIntervals" in tree.groups)) {
      tree.groups.confidenceIntervals = tree.svg.append("g").attr("id", "confidenceIntervals");
    }
    tree.groups.confidenceIntervals
      .selectAll(".conf")
      .data([d])
      .enter()
        .call((sel) => tree.drawSingleCI(sel, 0.5));
  }

  /* Set the hovered state so that an info box can be displayed */
  this.setState({
    hovered: {d, type: ".branch"}
  });
};

export const onBranchClick = function onBranchClick(d) {
  if (d.visibility !== NODE_VISIBLE) return;
  if (this.props.narrativeMode) return;
  const root = [undefined, undefined];
  let cladeSelected;
  // Branches with multiple labels will be used in the order specified by this.props.tree.availableBranchLabels
  // (The order of the drop-down on the menu)
  // Can't use AA mut lists as zoom labels currently - URL is bad, but also, means every node has a label, and many conflict...
  let legalBranchLabels;
  // Check has some branch labels, and remove 'aa' ones.
  // Check if the clicked branch is currently in view
  // Determines whether to zoom into the clade or zoom out of it and whether to append or remove a clades label from the URL query
  const isTargetBranchInView = (getIdxOfInViewRootNode(d.n) === d.n.arrayIdx);
  if (d.n.branch_attrs &&
    d.n.branch_attrs.labels !== undefined) {
    legalBranchLabels = Object.keys(d.n.branch_attrs.labels).filter((label) => label !== "aa");
  }
  // If has some, then could be clade label - but sort first
  if (legalBranchLabels && legalBranchLabels.length) {
    const availableBranchLabels = this.props.tree.availableBranchLabels;
    // sort the possible branch labels by the order of those available on the tree
    legalBranchLabels.sort((a, b) =>
      availableBranchLabels.indexOf(a) - availableBranchLabels.indexOf(b)
    );
    // then use the first!
    const key = legalBranchLabels[0];
    cladeSelected = isTargetBranchInView ? "" : `${key}:${d.n.branch_attrs.labels[key]}`;
  }
  /* Clicking on a branch means we want to zoom into the clade defined by that branch
  _except_ when it's the "in-view" root branch, in which case we want to zoom out */
  const arrayIdxToZoomTo = (isTargetBranchInView) ?
    getParentBeyondPolytomy(d.n, this.props.distanceMeasure).arrayIdx :
    d.n.arrayIdx;
  if (d.that.params.orientation[0] === 1) root[0] = arrayIdxToZoomTo;
  else root[1] = arrayIdxToZoomTo;
  this.props.dispatch(updateVisibleTipsAndBranchThicknesses({root, cladeSelected}));
};

/* onBranchLeave called when mouse-off, i.e. anti-hover */
export const onBranchLeave = function onBranchLeave(d) {
  /* Reset the stroke back to what it was before */
  branchStrokeForLeave(d);

  /* Remove the temporal confidence bar unless it's meant to be displayed */
  if (this.props.temporalConfidence.exists && this.props.temporalConfidence.display && !this.props.temporalConfidence.on) {
    const tree = d.that.params.orientation[0] === 1 ? this.state.tree : this.state.treeToo;
    tree.removeConfidence();
  }
  /* Set hovered state to `null`, which will remove the info box */
  if (this.state.hovered) {
    this.setState({hovered: null});
  }
};

export const onTipLeave = function onTipLeave(d) {
  const phylotree = d.that.params.orientation[0] === 1 ?
    this.state.tree :
    this.state.treeToo;
  if (!this.state.selectedTip) {
    phylotree.svg.select(getDomId("#tip", d.n.name))
      .attr("r", (dd) => dd["r"]);
  }
  if (this.state.hovered) {
    this.setState({hovered: null});
  }
};

/* clearSelectedTip when clicking to go away */
export const clearSelectedTip = function clearSelectedTip(d) {
  const phylotree = d.that.params.orientation[0] === 1 ?
    this.state.tree :
    this.state.treeToo;
  phylotree.svg.select(getDomId("#tip", d.n.name))
    .attr("r", (dd) => dd["r"]);
  this.setState({selectedTip: null, hovered: null});
  /* restore the tip visibility! */
  this.props.dispatch(applyFilter("remove", strainSymbol, [d.n.name]));
};
