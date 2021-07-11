import { rgb } from "d3-color";
import { calcBranchStrokeCols } from "../../../util/colorHelpers";

export const changePhyloTreeViaPropsComparison = (mainTree, phylotree, oldProps, newProps) => {
  const args = {};
  const newState = {};
  /* do not use oldProps.tree or newTreeRedux */
  const oldTreeRedux = mainTree ? oldProps.tree : oldProps.treeToo;
  const newTreeRedux = mainTree ? newProps.tree : newProps.treeToo;

  /* do any properties on the tree object need to be updated?
  Note that updating properties itself won't trigger any visual changes */
  phylotree.dateRange = [newProps.dateMinNumeric, newProps.dateMaxNumeric];

  /* catch selectedStrain dissapearence seperately to visibility and remove modal */
  if (oldTreeRedux.selectedStrain && !newTreeRedux.selectedStrain) {
    /* TODO change back the tip radius */
    newState.selectedTip = null;
    newState.hovered = null;
  }
  /* colorBy change? */
  if (!!newTreeRedux.nodeColorsVersion &&
      (oldTreeRedux.nodeColorsVersion !== newTreeRedux.nodeColorsVersion ||
      newProps.colorByConfidence !== oldProps.colorByConfidence)) {
    args.changeColorBy = true;
    args.branchStroke = calcBranchStrokeCols(newTreeRedux, newProps.colorByConfidence, newProps.colorBy);
    args.tipStroke = newTreeRedux.nodeColors;
    args.fill = newTreeRedux.nodeColors.map((col) => rgb(col).brighter([0.65]).toString());
  }

  /* visibility */
  if (!!newTreeRedux.visibilityVersion && oldTreeRedux.visibilityVersion !== newTreeRedux.visibilityVersion) {
    args.changeVisibility = true;
    args.visibility = newTreeRedux.visibility;
  }

  /* tip radii */
  if (!!newTreeRedux.tipRadiiVersion && oldTreeRedux.tipRadiiVersion !== newTreeRedux.tipRadiiVersion) {
    args.changeTipRadii = true;
    args.tipRadii = newTreeRedux.tipRadii;
  }

  /* branch thickness (stroke-width) */
  if (oldTreeRedux.branchThicknessVersion !== newTreeRedux.branchThicknessVersion) {
    args.changeBranchThickness = true;
    args.branchThickness = newTreeRedux.branchThickness;
  }

  /* change from timetree to divergence tree */
  if (oldProps.distanceMeasure !== newProps.distanceMeasure) {
    args.newDistance = newProps.distanceMeasure;
  }

  /* change treeZoom behavior */
  if (oldProps.treeZoom !== newProps.treeZoom) {
    args.newTreeZoom = newProps.treeZoom;
    args.updateLayout = true;
  }

  /* change in key used to define branch labels, tip labels */
  if (oldProps.canRenderBranchLabels===true && newProps.canRenderBranchLabels===false) {
    args.newBranchLabellingKey = "none";
  } else if (
    (oldProps.canRenderBranchLabels===false && newProps.canRenderBranchLabels===true) ||
    (oldProps.selectedBranchLabel !== newProps.selectedBranchLabel) ||
    (oldProps.scatterVariables.showBranches===false && newProps.scatterVariables.showBranches===true)
  ) {
    args.newBranchLabellingKey = newProps.selectedBranchLabel;
  }
  if (oldProps.tipLabelKey !== newProps.tipLabelKey) {
    args.newTipLabelKey = newProps.tipLabelKey;
  }

  /* show / remove confidence intervals across the tree */
  if (
    (oldProps.temporalConfidence.display === true && newProps.temporalConfidence.display === false) ||
    (oldProps.temporalConfidence.on === true && newProps.temporalConfidence.on === false)
  ) {
    args.removeConfidences = true;
  } else if (newProps.temporalConfidence.display === true && oldProps.temporalConfidence.on === false && newProps.temporalConfidence.on === true) {
    args.showConfidences = true;
  }

  if ((newProps.layout==="scatter" || newProps.layout==="clock") && (oldProps.scatterVariables!==newProps.scatterVariables)) {
    args.updateLayout = true;
    args.scatterVariables = newProps.scatterVariables;
  }
  if (oldProps.layout !== newProps.layout) {
    args.newLayout = newProps.layout;
  }


  /* zoom to a clade / reset zoom to entire tree */
  if (oldTreeRedux.idxOfInViewRootNode !== newTreeRedux.idxOfInViewRootNode) {
    const rootNode = phylotree.nodes[newTreeRedux.idxOfInViewRootNode];
    args.zoomIntoClade = rootNode;
    newState.selectedBranch = newTreeRedux.idxOfInViewRootNode === 0 ? null : rootNode;
    newState.selectedTip = null;
    newState.hovered = null;
    if (newProps.layout === "unrooted") {
      args.updateLayout = true;
    }
  }

  if (oldProps.width !== newProps.width || oldProps.height !== newProps.height) {
    args.svgHasChangedDimensions = true;
  }
  if (mainTree && oldProps.showTreeToo !== newProps.showTreeToo) {
    args.svgHasChangedDimensions = true;
  }

  const change = Object.keys(args).length;
  if (change) {
    args.animationInProgress = newProps.animationPlayPauseButton === "Pause";
    // console.log('\n\n** ', phylotree.id, 'changePhyloTreeViaPropsComparison **', args);
    phylotree.change(args);
  }
  return [Object.keys(newState).length ? newState : false, change];
};
