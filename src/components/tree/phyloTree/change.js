import { timerFlush } from "d3-timer";
import { calcConfidenceWidth } from "./confidence";
import { applyToChildren } from "./helpers";
import { timerStart, timerEnd } from "../../../util/perf";
import { NODE_VISIBLE } from "../../../util/globals";
import { getBranchVisibility, strokeForBranch } from "./renderers";
import { shouldDisplayTemporalConfidence } from "../../../reducers/controls";
import { makeTipLabelFunc } from "./labels";

/* loop through the nodes and update each provided prop with the new value
 * additionally, set d.update -> whether or not the node props changed
 */
const updateNodesWithNewData = (nodes, newNodeProps) => {
  // console.log("update nodes with data for these keys:", Object.keys(newNodeProps));
  // let tmp = 0;
  nodes.forEach((d, i) => {
    d.update = false;
    for (let key in newNodeProps) { // eslint-disable-line
      const val = newNodeProps[key][i];
      if (val !== d[key]) {
        d[key] = val;
        d.update = true;
        // tmp++;
      }
    }
  });
  // console.log("marking ", tmp, " nodes for update");
};


/* svgSetters defines how attrs & styles should be applied to which class (e.g. ".tip").
 * E.g. which node attribute should be used?!?
 * Note that only the relevant functions are called on a transition.
 */
const svgSetters = {
  attrs: {
    ".tip": {
      r: (d) => d.r,
      cx: (d) => d.xTip,
      cy: (d) => d.yTip
    },
    ".branch": {
    },
    ".vaccineCross": {
      d: (d) => d.vaccineCross
    },
    ".conf": {
      d: (d) => d.confLine
    }
  },
  styles: {
    ".tip": {
      fill: (d) => d.fill,
      stroke: (d) => d.tipStroke,
      visibility: (d) => d.visibility === NODE_VISIBLE ? "visible" : "hidden"
    },
    ".conf": {
      stroke: (d) => d.branchStroke,
      "stroke-width": calcConfidenceWidth
    },
    // only allow stroke to be set on individual branches
    ".branch": {
      "stroke-width": (d) => d["stroke-width"] + "px", // style - as per drawBranches()
      stroke: (d) => strokeForBranch(d), // TODO: revisit if we bring back SVG gradients
      cursor: (d) => d.visibility === NODE_VISIBLE ? "pointer" : "default",
      visibility: getBranchVisibility
    }
  }
};


/** createUpdateCall
 * returns a function which can be called as part of a D3 chain in order to modify
 * the SVG elements.
 * svgSetters (see above) are used to actually modify the property on the element,
 * so the given property must also be present there!
 * @param {string} treeElem (e.g. ".tip" or ".branch")
 * @param {list} properties (e.g. ["visibiliy", "stroke-width"])
 * @return {function} used in a d3 selection, i.e. d3.selection().methods().call(X)
 */
const createUpdateCall = (treeElem, properties) => (selection) => {
  // First: the properties to update via d3Selection.attr call
  if (svgSetters.attrs[treeElem]) {
    [...properties].filter((x) => svgSetters.attrs[treeElem][x])
      .forEach((attrName) => {
        // console.log(`applying attr ${attrName} to ${treeElem}`)
        selection.attr(attrName, svgSetters.attrs[treeElem][attrName]);
      });
  }
  // Second: the properties to update via d3Selection.style call
  if (svgSetters.styles[treeElem]) {
    [...properties].filter((x) => svgSetters.styles[treeElem][x])
      .forEach((styleName) => {
        // console.log(`applying style ${styleName} to ${treeElem}`)
        selection.style(styleName, svgSetters.styles[treeElem][styleName]);
      });
  }
};

const genericSelectAndModify = (svg, treeElem, updateCall, transitionTime) => {
  // console.log("general svg update for", treeElem);
  svg.selectAll(treeElem)
    .filter((d) => d.update)
    .transition().duration(transitionTime)
    .call(updateCall);
  if (!transitionTime) {
    /* https://github.com/d3/d3-timer#timerFlush */
    timerFlush();
    // console.log("\t\t--FLUSHING TIMER--");
  }
};

/* use D3 to select and modify elements, such that a given element is only ever modified _once_
 * @elemsToUpdate {set} - the class names to select, e.g. ".tip" or ".branch"
 * @svgPropsToUpdate {set} - the props (styles & attrs) to update. The respective functions are defined above
 * @transitionTime {INT} - in ms. if 0 then no transition (timerFlush is used)
 * @extras {dict} - extra keywords to tell this function to call certain phyloTree update methods. In flux.
 */
export const modifySVG = function modifySVG(elemsToUpdate, svgPropsToUpdate, transitionTime, extras) {
  let updateCall;
  const classesToPotentiallyUpdate = [".tip", ".vaccineDottedLine", ".vaccineCross", ".branch"]; /* order is respected */
  /* treat stem / branch specially, but use these to replace a normal .branch call if that's also to be applied */
  if (elemsToUpdate.has(".branch.S") || elemsToUpdate.has(".branch.T")) {
    const applyBranchPropsAlso = elemsToUpdate.has(".branch");
    if (applyBranchPropsAlso) classesToPotentiallyUpdate.splice(classesToPotentiallyUpdate.indexOf(".branch"), 1);
    const ST = [".S", ".T"];
    ST.forEach((x, STidx) => {
      if (elemsToUpdate.has(`.branch${x}`)) {
        if (applyBranchPropsAlso) {
          updateCall = (selection) => {
            createUpdateCall(".branch", svgPropsToUpdate)(selection); /* the "normal" branch changes to apply */
            selection.attr("d", (d) => d.branch[STidx]); /* change the path (differs between .S and .T) */
          };
        } else {
          updateCall = (selection) => {
            selection.attr("d", (d) => d.branch[STidx]);
          };
        }

        genericSelectAndModify(this.svg, `.branch${x}`, updateCall, transitionTime);
      }
    });
  }

  classesToPotentiallyUpdate.forEach((el) => {
    if (elemsToUpdate.has(el)) {
      updateCall = createUpdateCall(el, svgPropsToUpdate);
      genericSelectAndModify(this.svg, el, updateCall, transitionTime);
    }
  });

  /* special cases not listed in classesToPotentiallyUpdate */
  if (extras.hideTipLabels) {
    this.removeTipLabels();
  } else if (elemsToUpdate.has('.tipLabel')) {
    this.updateTipLabels();
  }
  if (elemsToUpdate.has('.grid')) {
    if (this.grid && this.layout !== "unrooted") this.addGrid();
    else this.hideGrid();
  }
  if (elemsToUpdate.has('.regression')) {
    this.removeRegression();
    if (this.regression) this.drawRegression();
  }

  /* confidence intervals */
  if (extras.removeConfidences && this.confidencesInSVG) {
    this.removeConfidence(); /* do not use a transition time - it's too clunky (too many elements?) */
  } else if (extras.showConfidences && !this.confidencesInSVG) {
    this.drawConfidence(); /* see comment above */
  } else if (elemsToUpdate.has(".conf") && this.confidencesInSVG) {
    if (shouldDisplayTemporalConfidence(true, this.distance, this.layout)) {
      updateCall = createUpdateCall(".conf", svgPropsToUpdate);
      genericSelectAndModify(this.svg, ".conf", updateCall, transitionTime);
    } else {
      this.removeConfidence(); /* see comment above */
    }
  }

  /* background temporal time slice */
  if (extras.timeSliceHasPotentiallyChanged) {
    this.showTemporalSlice();
  }

  /* branch labels */
  if (extras.newBranchLabellingKey) {
    this.removeBranchLabels();
    if (extras.newBranchLabellingKey !== "none") {
      this.drawBranchLabels(extras.newBranchLabellingKey);
    }
  } else if (elemsToUpdate.has('.branchLabel')) {
    this.updateBranchLabels(transitionTime);
  }
};

/* instead of modifying the SVG the "normal" way, this is sometimes too janky (e.g. when we need to move everything)
 * step 1: fade out & remove everything except tips.
 * step 2: when step 1 has finished, move tips across the screen.
 * step 3: when step 2 has finished, redraw everything. No transition here.
 */
export const modifySVGInStages = function modifySVGInStages(elemsToUpdate, svgPropsToUpdate, transitionTimeFadeOut, transitionTimeMoveTips, extras) {
  elemsToUpdate.delete(".tip");
  this.hideGrid();
  let inProgress = 0; /* counter of transitions currently in progress */

  const step3 = () => {
    this.drawBranches();
    if (this.params.showGrid) this.addGrid();
    this.svg.selectAll(".tip").remove();
    this.updateTipLabels();
    this.drawTips();
    if (this.vaccines) this.drawVaccines();
    this.showTemporalSlice();
    if (this.regression) this.drawRegression();
    if (elemsToUpdate.has(".branchLabel")) this.drawBranchLabels(extras.newBranchLabellingKey || this.params.branchLabelKey);
  };

  /* STEP 2: move tips */
  const step2 = () => {
    if (!--inProgress) { /* decrement counter. When hits 0 run block */
      const updateTips = createUpdateCall(".tip", svgPropsToUpdate);
      genericSelectAndModify(this.svg, ".tip", updateTips, transitionTimeMoveTips);
      setTimeout(step3, transitionTimeMoveTips);
    }
  };

  /* STEP 1. remove everything (via opacity) */
  this.confidencesInSVG = false;
  this.svg.selectAll([...elemsToUpdate].join(", "))
    .transition().duration(transitionTimeFadeOut)
    .style("opacity", 0)
    .remove()
    .on("start", () => inProgress++)
    .on("end", step2);
  this.hideTemporalSlice();
  if (!transitionTimeFadeOut) timerFlush();
};


/* the main interface to changing a currently rendered tree.
 * simply call change and tell it what should be changed.
 * try to do a single change() call with as many things as possible in it
 */
export const change = function change({
  /* booleans for what should be changed */
  changeColorBy = false,
  changeVisibility = false,
  changeTipRadii = false,
  changeBranchThickness = false,
  showConfidences = false,
  removeConfidences = false,
  zoomIntoClade = false,
  svgHasChangedDimensions = false,
  animationInProgress = false,
  /* change these things to provided value (unless undefined) */
  newDistance = undefined,
  newLayout = undefined,
  newTreeZoom = undefined,
  updateLayout = undefined, // todo - this seems identical to `newLayout`
  newBranchLabellingKey = undefined,
  newTipLabelKey = undefined,
  /* arrays of data (the same length as nodes) */
  branchStroke = undefined,
  tipStroke = undefined,
  fill = undefined,
  visibility = undefined,
  tipRadii = undefined,
  branchThickness = undefined,
  /* other data */
  scatterVariables = undefined
}) {
  // console.log("\n** phylotree.change() (time since last run:", Date.now() - this.timeLastRenderRequested, "ms) **\n\n");
  timerStart("phylotree.change()");
  const elemsToUpdate = new Set(); /* what needs updating? E.g. ".branch", ".tip" etc */
  const nodePropsToModify = {}; /* which properties (keys) on the nodes should be updated (before the SVG) */
  const svgPropsToUpdate = new Set(); /* which SVG properties shall be changed. E.g. "fill", "stroke" */
  const useModifySVGInStages = newLayout; /* use modifySVGInStages rather than modifySVG. Not used often. */

  /* calculate dt */
  const idealTransitionTime = 500;
  let transitionTime = idealTransitionTime;
  if ((Date.now() - this.timeLastRenderRequested) < idealTransitionTime * 2) {
    transitionTime = 0;
  }

  /* the logic of converting what react is telling us to change
  and what SVG elements, node properties, svg props we actually change */
  if (changeColorBy) {
    /* check that fill & stroke are defined */
    elemsToUpdate.add(".branch").add(".tip").add(".conf");
    svgPropsToUpdate.add("stroke").add("fill");
    nodePropsToModify.branchStroke = branchStroke;
    nodePropsToModify.tipStroke = tipStroke;
    nodePropsToModify.fill = fill;
  }
  if (changeVisibility) {
    /* check that visibility is not undefined */
    /* in the future we also change the branch visibility (after skeleton merge) */
    elemsToUpdate.add(".tip").add(".tipLabel");
    svgPropsToUpdate.add("visibility").add("cursor");
    nodePropsToModify.visibility = visibility;
  }
  if (changeTipRadii) {
    elemsToUpdate.add(".tip");
    svgPropsToUpdate.add("r");
    nodePropsToModify.r = tipRadii;
  }
  if (changeBranchThickness) {
    elemsToUpdate.add(".branch").add(".conf");
    svgPropsToUpdate.add("stroke-width");
    nodePropsToModify["stroke-width"] = branchThickness;
  }
  if (newDistance || newLayout || newTreeZoom || updateLayout || zoomIntoClade || svgHasChangedDimensions) {
    elemsToUpdate.add(".tip").add(".branch.S").add(".branch.T").add(".branch");
    elemsToUpdate.add(".vaccineCross").add(".vaccineDottedLine").add(".conf");
    elemsToUpdate.add('.branchLabel').add('.tipLabel');
    elemsToUpdate.add(".grid").add(".regression");
    svgPropsToUpdate.add("cx").add("cy").add("d").add("opacity")
      .add("visibility");
  }

  /* change the requested properties on the nodes */
  updateNodesWithNewData(this.nodes, nodePropsToModify);

  // recalculate gradients here?
  if (changeColorBy) {
    this.updateColorBy();
  }
  /* some things need to update d.inView and/or d.update. This should be centralised */
  /* TODO: list all functions which modify these */
  if (zoomIntoClade) { /* must happen below updateNodesWithNewData */
    this.nodes.forEach((d) => {
      d.inView = false;
      d.update = true;
    });
    /* if clade is terminal, use the parent as the zoom node */
    this.zoomNode = zoomIntoClade.terminal ? zoomIntoClade.parent : zoomIntoClade;
    applyToChildren(this.zoomNode, (d) => {d.inView = true;});
  }
  if (svgHasChangedDimensions) {
    this.nodes.forEach((d) => {d.update = true;});
  }

  /* run calculations as needed - these update properties on the phylotreeNodes (similar to updateNodesWithNewData) */
  /* distance */
  if (newDistance || updateLayout) this.setDistance(newDistance);
  /* treeZoom */
  if (newTreeZoom || updateLayout) this.setTreeZoom(newTreeZoom);
  /* layout (must run after distance and treeZoom) */
  if (newDistance || newLayout || newTreeZoom || updateLayout) {
    this.setLayout(newLayout || this.layout, scatterVariables);
  }
  /* show confidences - set this param which actually adds the svg paths for
     confidence intervals when mapToScreen() gets called below */
  if (showConfidences) this.params.confidence = true;
  /* mapToScreen */
  if (
    svgPropsToUpdate.has(["stroke-width"]) ||
    newDistance ||
    newLayout ||
    newTreeZoom ||
    updateLayout ||
    zoomIntoClade ||
    svgHasChangedDimensions ||
    showConfidences
  ) {
    this.mapToScreen();
  }
  /* tip label key change -> update callback used */
  if (newTipLabelKey) {
    this.callbacks.tipLabel = makeTipLabelFunc(newTipLabelKey);
    elemsToUpdate.add('.tipLabel'); /* will trigger d3 commands as required */
  }

  /* Finally, actually change the SVG elements themselves */
  const extras = { removeConfidences, showConfidences, newBranchLabellingKey };
  extras.timeSliceHasPotentiallyChanged = changeVisibility || newDistance;
  extras.hideTipLabels = animationInProgress;
  if (useModifySVGInStages) {
    this.modifySVGInStages(elemsToUpdate, svgPropsToUpdate, transitionTime, 1000, extras);
  } else {
    this.modifySVG(elemsToUpdate, svgPropsToUpdate, transitionTime, extras);
  }
  this.timeLastRenderRequested = Date.now();
  timerEnd("phylotree.change()");
};
