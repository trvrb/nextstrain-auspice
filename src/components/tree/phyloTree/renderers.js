import { timerStart, timerEnd } from "../../../util/perf";
import { NODE_VISIBLE } from "../../../util/globals";
import { getDomId } from "./helpers";
import { makeRegressionText } from "./regression";
import { getEmphasizedColor } from "../../../util/colorHelpers";
/**
 * @param {d3 selection} svg      -- the svg into which the tree is drawn
 * @param {string} layout         -- the layout to be used, e.g. "rect"
 * @param {string} distance       -- the property used as branch length, e.g. div or num_date
 * @param {object} parameters     -- an object that contains options that will be added to this.params
 * @param {object} callbacks      -- an object with call back function defining mouse behavior
 * @param {array} branchThickness -- array of branch thicknesses (same ordering as tree nodes)
 * @param {array} visibility      -- array of visibility of nodes(same ordering as tree nodes)
 * @param {bool} drawConfidence   -- should confidence intervals be drawn?
 * @param {bool} vaccines         -- should vaccine crosses (and dotted lines if applicable) be drawn?
 * @param {array} branchStroke    -- branch stroke colour for each node (set onto each node)
 * @param {array} tipStroke       -- tip stroke colour for each node (set onto each node)
 * @param {array} tipFill         -- tip fill colour for each node (set onto each node)
 * @param {array|null} tipRadii   -- array of tip radius'
 * @param {array} dateRange
 * @param {object} scatterVariables  -- {x, y} properties to map nodes => scatterplot (only used if layout="scatter")
 * @return {null}
 */
export const render = function render(svg, layout, distance, parameters, callbacks, branchThickness, visibility, drawConfidence, vaccines, branchStroke, tipStroke, tipFill, tipRadii, dateRange, scatterVariables) {
  timerStart("phyloTree render()");
  this.svg = svg;
  this.params = Object.assign(this.params, parameters);
  this.callbacks = callbacks;
  this.vaccines = vaccines ? vaccines.map((d) => d.shell) : undefined;
  this.dateRange = dateRange;

  /* set x, y values & scale them to the screen */
  this.setDistance(distance);
  this.setLayout(layout, scatterVariables);
  this.mapToScreen();

  /* set nodes stroke / fill */
  this.nodes.forEach((d, i) => {
    d.branchStroke = branchStroke[i];
    d.tipStroke = tipStroke[i];
    d.fill = tipFill[i];
    d.visibility = visibility[i];
    d["stroke-width"] = Math.round(branchThickness[i]);
    d.r = tipRadii ? tipRadii[i] : this.params.tipRadius;
  });

  /* draw functions */
  if (this.params.showGrid) {
    this.addGrid();
    this.showTemporalSlice();
  }
  this.drawBranches();
  this.updateTipLabels();
  this.drawTips();
  if (this.params.branchLabelKey) this.drawBranchLabels(this.params.branchLabelKey);
  if (this.vaccines) this.drawVaccines();
  if (this.regression) this.drawRegression();
  this.confidencesInSVG = false;
  if (drawConfidence) this.drawConfidence();

  this.timeLastRenderRequested = Date.now();
  timerEnd("phyloTree render()");
};

/**
 * adds crosses to the vaccines
 * @return {null}
 */
export const drawVaccines = function drawVaccines() {
  if (!this.vaccines || !this.vaccines.length) return;

  if (!("vaccines" in this.groups)) {
    this.groups.vaccines = this.svg.append("g").attr("id", "vaccines");
  }
  this.groups.vaccines
    .selectAll(".vaccineCross")
    .data(this.vaccines)
    .enter()
    .append("path")
    .attr("class", "vaccineCross")
    .attr("d", (d) => d.vaccineCross)
    .style("stroke", "#333")
    .style("stroke-width", 2 * this.params.branchStrokeWidth)
    .style("fill", "none")
    .style("cursor", "pointer")
    .style("pointer-events", "auto")
    .on("mouseover", this.callbacks.onTipHover)
    .on("mouseout", this.callbacks.onTipLeave)
    .on("click", this.callbacks.onTipClick);
};


/**
 * adds all the tip circles to the svg, they have class tip
 * @return {null}
 */
export const drawTips = function drawTips() {
  timerStart("drawTips");
  const params = this.params;

  // Reduce the precision of cx and cy attributes.
  // The xTip and yTip are full precision Javascript floats
  // but when stored in the DOM in decimal text format
  // they bloat the DOM and decimal to hex takes longer.
  // This only matters when the number of tips is in 4 figures.
  // So, need to do a Math.floor()
  // Please test this on a Macbook, Apple does tricks with resolution

  if (!("tips" in this.groups)) {
    this.groups.tips = this.svg.append("g").attr("id", "tips");
  }
  this.groups.tips
    .selectAll(".tip")
    .data(this.nodes.filter((d) => d.terminal))
    .enter()
    .append("circle")
    .attr("class", "tip")
    .attr("id", (d) => getDomId("tip", d.n.name))
    .attr("cx", (d) => Math.floor(d.xTip))
    .attr("cy", (d) => Math.floor(d.yTip))
    .attr("r", (d) => d.r)
    .on("mouseover", this.callbacks.onTipHover)
    .on("mouseout", this.callbacks.onTipLeave)
    .on("click", this.callbacks.onTipClick)

    /* .style("pointer-events", "auto") */
    .style("visibility", (d) => d.visibility === NODE_VISIBLE ? "" : "hidden")

    .style("fill", (d) => d.fill || params.tipFill)
    .style("stroke", (d) => d.tipStroke || params.tipStroke)
    /* .style("stroke-width", () => params.tipStrokeWidth)  don't want branch thicknesses applied */
    .style("cursor", "pointer");

  timerEnd("drawTips");
};

/**
 * given a tree node, decide whether the branch should be rendered
 * This enforces the "hidden" property set on `node.node_attrs.hidden`
 * in the dataset JSON
 * @return {string}
 */
export const getBranchVisibility = (d) => {
  const hiddenSetting = d.n.node_attrs && d.n.node_attrs.hidden;
  if (hiddenSetting &&
    (
      hiddenSetting === "always" ||
      (hiddenSetting === "timetree" && d.that.distance === "num_date") ||
      (hiddenSetting === "divtree" && d.that.distance === "div")
    )
  ) {
    return "hidden";
  }
  return "";   /* the css default is "visible" so just clear this setting */
};

/** Calculate the stroke for a given branch. May return a hex or a `url` referring to
 * a SVG gradient definition
 * @param {obj} d node
 * @param {string} b branch type -- either "T" (tee) or "S" (stem)
 */
export const strokeForBranch = (d, b) => { // eslint-disable-line
  /* Due to errors rendering gradients on SVG branches on some browsers/OSs which would
  cause the branches to not appear, we're falling back to the previous solution which
  doesn't use gradients. The commented code remains & hopefully a solution can be
  found which reinstates gradients!                            James, April 4 2020. */
  return d.branchStroke;
  // const id = `T${d.that.id}_${d.parent.n.arrayIdx}_${d.n.arrayIdx}`;
  // if (d.branchStroke === d.parent.branchStroke || b === "T") {
  //   return d.branchStroke;
  // }
  // return `url(#${id})`;
};

/**
 * adds all branches to the svg, these are paths with class branch, which comprise two groups
 * @return {null}
 */
export const drawBranches = function drawBranches() {
  timerStart("drawBranches");
  const params = this.params;

  /* PART 1: draw the branch Ts (i.e. the bit connecting nodes parent branch ends to child branch beginnings)
  Only rectangular & radial trees have this, so we remove it for clock / unrooted layouts */
  if (!("branchTee" in this.groups)) {
    this.groups.branchTee = this.svg.append("g").attr("id", "branchTee");
  }
  if (this.layout === "clock" || this.layout === "scatter" || this.layout === "unrooted") {
    this.groups.branchTee.selectAll("*").remove();
  } else {
    this.groups.branchTee
      .selectAll('.branch')
      .data(this.nodes.filter((d) => !d.terminal))
      .enter()
      .append("path")
      .attr("class", "branch T")
      .attr("id", (d) => getDomId("branchT", d.n.name))
      .attr("d", (d) => d.branch[1])
      .style("stroke", (d) => d.branchStroke || params.branchStroke)
      .style("stroke-width", (d) => Math.round(d['stroke-width'] || params.branchStrokeWidth))
      .style("fill", "none")
      /* .style("pointer-events", "auto") */
      .on("mouseover", this.callbacks.onBranchHover)
      .on("mouseout", this.callbacks.onBranchLeave)
      .on("click", this.callbacks.onBranchClick);
  }

  /* PART 2: draw the branch stems (i.e. the actual branches) */

  /* PART 2a: Create linear gradient definitions which can be applied to branch stems for which
  the start & end stroke colour is different */
  if (!this.groups.branchGradientDefs) {
    this.groups.branchGradientDefs = this.svg.append("defs");
  }
  this.groups.branchGradientDefs.selectAll("*").remove();
  // TODO -- explore if duplicate <def> elements (e.g. same colours on each end) slow things down
  this.updateColorBy();
  /* PART 2b: Draw the stems */
  if (!("branchStem" in this.groups)) {
    this.groups.branchStem = this.svg.append("g").attr("id", "branchStem");
  }
  this.groups.branchStem
    .selectAll('.branch')
    .data(this.nodes)
    .enter()
    .append("path")
    .attr("class", "branch S")
    .attr("id", (d) => getDomId("branchS", d.n.name))
    .attr("d", (d) => d.branch[0])
    .style("stroke", (d) => {
      if (!d.branchStroke) return params.branchStroke;
      return strokeForBranch(d, "S");
    })
    /* .style("stroke-linecap", "round") */
    .style("stroke-width", (d) => Math.round(d['stroke-width'] || params.branchStrokeWidth))
    .style("visibility", getBranchVisibility)
    .style("cursor", (d) => d.visibility === NODE_VISIBLE ? "pointer" : "default")
    .style("pointer-events", "auto")
    .on("mouseover", this.callbacks.onBranchHover)
    .on("mouseout", this.callbacks.onBranchLeave)
    .on("click", this.callbacks.onBranchClick);

  timerEnd("drawBranches");
};


/**
 * draws the regression line in the svg and adds a text with the rate estimate
 * @return {null}
 */
export const drawRegression = function drawRegression() {
  const leftY = this.yScale(this.regression.intercept + this.xScale.domain()[0] * this.regression.slope);
  const rightY = this.yScale(this.regression.intercept + this.xScale.domain()[1] * this.regression.slope);

  const path = "M " + this.xScale.range()[0].toString() + " " + leftY.toString() +
    " L " + this.xScale.range()[1].toString() + " " + rightY.toString();

  if (!("regression" in this.groups)) {
    this.groups.regression = this.svg.append("g").attr("id", "regression");
  }

  this.groups.regression
    .append("path")
    .attr("d", path)
    .attr("class", "regression")
    .style("fill", "none")
    .style("visibility", "visible")
    .style("stroke", this.params.regressionStroke)
    .style("stroke-width", this.params.regressionWidth);

  /* Compute & draw regression text. Note that the text hasn't been created until now,
  as we need to wait until rendering time when the scales have been calculated */
  this.groups.regression
    .append("text")
    .text(makeRegressionText(this.regression, this.layout, this.yScale))
    .attr("class", "regression")
    .attr("x", this.xScale.range()[1] / 2 - 75)
    .attr("y", this.yScale.range()[0] + 50)
    .style("fill", this.params.regressionStroke)
    .style("font-size", this.params.tickLabelSize + 8)
    .style("font-weight", 400)
    .style("font-family", this.params.fontFamily);
};

export const removeRegression = function removeRegression() {
  if ("regression" in this.groups) {
    this.groups.regression.selectAll("*").remove();
  }
};

/*
 * add and remove elements from tree, initial render
 */
export const clearSVG = function clearSVG() {
  this.svg.selectAll("*").remove();
};


/* Due to errors rendering gradients on SVG branches on some browsers/OSs which would
cause the branches to not appear, we're falling back to the previous solution which
doesn't use gradients. Calls to `updateColorBy` are therefore unnecessary.
                                                                James, April 4 2020. */
export const updateColorBy = function updateColorBy() {};
// export const updateColorBy = function updateColorBy() {
//   // console.log("updating colorBy")
//   this.nodes.forEach((d) => {
//     const a = d.parent.branchStroke;
//     const b = d.branchStroke;
//     const id = `T${this.id}_${d.parent.n.arrayIdx}_${d.n.arrayIdx}`;
//     if (a === b) { // not a gradient // color can be computed from d alone
//       this.svg.select(`#${id}`).remove(); // remove an existing gradient for this node
//       return;
//     }
//     if (!this.svg.select(`#${id}`).empty()) { // there an existing gradient // update its colors
//       // console.log("adjusting " + id + " " + d.parent.branchStroke + "=>" + d.branchStroke);
//       this.svg.select(`#${id}_begin`).attr("stop-color", d.parent.branchStroke);
//       this.svg.select(`#${id}_end`).attr("stop-color", d.branchStroke);

//     } else { // otherwise create a new gradient
//       //  console.log("new gradient " + id + " " + d.parent.branchStroke + "=>" + d.branchStroke);
//       const linearGradient = this.svg.select("defs").append("linearGradient")
//         .attr("id", id);
//       if (d.rot && typeof d.rot === "number") {
//         linearGradient.attr("gradientTransform", "translate(.5,.5) rotate(" + d.rot + ") translate(-.5,-.5)");
//       }
//       linearGradient.append("stop")
//         .attr("id", id + "_begin")
//         .attr("offset", "0")
//         .attr("stop-color", d.parent.branchStroke);
//       linearGradient.append("stop")
//         .attr("id", id + "_end")
//         .attr("offset", "1")
//         .attr("stop-color", d.branchStroke);
//     }
//   });
// };


/** given a node `d` which is being hovered, update it's colour to emphasize
 * that it's being hovered. This updates the SVG element stroke style in-place
 * _or_ updates the SVG gradient def in place.
 * @param {obj} d node
 * @param {string} c1 colour of the parent (start of the branch)
 * @param {string} c2 colour of the node (end of the branch)
 */
const handleBranchHoverColor = (d, c1, c2) => {
  if (!d) { return; }

  const id = `T${d.that.id}_${d.parent.n.arrayIdx}_${d.n.arrayIdx}`;

  /* We want to emphasize the colour of the branch. How we do this depends on how the branch was rendered in the first place! */
  const tel = d.that.svg.select(getDomId("#branchT", d.n.name));

  if (!tel.empty()) { // Some displays don't have S & T parts of the branch
    tel.style("stroke", c2);
  }
  const sel = d.that.svg.select(getDomId("#branchS", d.n.name));
  if (!sel.empty()) {
    if (d.branchStroke === d.parent.branchStroke) {
      sel.style("stroke", c2);
    } else {
      // console.log("going to gradient " + el.attr("id"));
      const begin = d.that.svg.select(`#${id}_begin`);
      if (begin) {
        begin.attr("stop-color", c1);
      }
      const end = d.that.svg.select(`#${id}_end`);
      if (end) {
        end.attr("stop-color", c2);
      }
    }
  }
};

export const branchStrokeForLeave = function branchStrokeForLeave(d) {
  if (!d) { return; }
  handleBranchHoverColor(d, d.parent.branchStroke, d.branchStroke);
};

export const branchStrokeForHover = function branchStrokeForHover(d) {
  if (!d) { return; }
  handleBranchHoverColor(d, getEmphasizedColor(d.parent.branchStroke), getEmphasizedColor(d.branchStroke));
};
