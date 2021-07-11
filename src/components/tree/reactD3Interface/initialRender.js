import { select } from "d3-selection";
import 'd3-transition';
import { rgb } from "d3-color";
import { calcBranchStrokeCols } from "../../../util/colorHelpers";
import * as callbacks from "./callbacks";
import { makeTipLabelFunc } from "../phyloTree/labels";

export const renderTree = (that, main, phylotree, props) => {
  const ref = main ? that.domRefs.mainTree : that.domRefs.secondTree;
  const treeState = main ? props.tree : props.treeToo;
  if (!treeState.loaded) {
    console.warn("can't run renderTree (not loaded)");
    return;
  }
  // calculate if branch labels should be rendered
  let renderBranchLabels = props.canRenderBranchLabels;
  if (Object.prototype.hasOwnProperty.call(props.scatterVariables, "showBranches") && props.scatterVariables.showBranches===false) {
    renderBranchLabels=false;
  }
  /* simply the call to phylotree.render */
  phylotree.render(
    select(ref),
    props.layout,
    props.distanceMeasure,
    props.treeZoom,
    { /* parameters (modifies PhyloTree's defaults) */
      grid: true,
      confidence: props.temporalConfidence.display,
      branchLabelKey: renderBranchLabels && props.selectedBranchLabel,
      orientation: main ? [1, 1] : [-1, 1],
      tipLabels: true,
      showTipLabels: true
    },
    { /* callbacks */
      onTipHover: callbacks.onTipHover.bind(that),
      onTipClick: callbacks.onTipClick.bind(that),
      onBranchHover: callbacks.onBranchHover.bind(that),
      onBranchClick: callbacks.onBranchClick.bind(that),
      onBranchLeave: callbacks.onBranchLeave.bind(that),
      onTipLeave: callbacks.onTipLeave.bind(that),
      tipLabel: makeTipLabelFunc(props.tipLabelKey)
    },
    treeState.branchThickness, /* guarenteed to be in redux by now */
    treeState.visibility,
    props.temporalConfidence.on, /* drawConfidence? */
    treeState.vaccines,
    calcBranchStrokeCols(treeState, props.colorByConfidence, props.colorBy),
    treeState.nodeColors,
    treeState.nodeColors.map((col) => rgb(col).brighter([0.65]).toString()),
    treeState.tipRadii, /* might be null */
    [props.dateMinNumeric, props.dateMaxNumeric],
    props.scatterVariables
  );
};
