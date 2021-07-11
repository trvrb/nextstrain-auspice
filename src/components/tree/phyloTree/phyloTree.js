import { createDefaultParams } from "./defaultParams";
import { createChildrenAndParentsReturnNumTips, setYValues } from "./helpers";
import { change, modifySVG, modifySVGInStages } from "./change";

/* PROTOTYPES */
import * as renderers from "./renderers";
import * as layouts from "./layouts";
import * as grid from "./grid";
import * as confidence from "./confidence";
import * as labels from "./labels";

/* phylogenetic tree drawing function - the actual tree is rendered by the render prototype */
const PhyloTree = function PhyloTree(reduxNodes, id, idxOfInViewRootNode) {
  this.grid = false;
  this.attributes = ['r', 'cx', 'cy', 'id', 'class', 'd'];
  this.params = createDefaultParams();
  this.groups = {};
  /* by storing DOM <g> elements, we can quickly refer to groups here rather than scanning the DOM.
  It also helps preserve the initial order of groups in the DOM as we are not creating new ones upon updates */
  this.id = id; /* super useful when one is trying to debug multiple trees! */
  /* create this.nodes, which is an array of nodes with properties used by phylotree for drawing.
   this.nodes is the same length as reduxNodes such that this.nodes[i] is related to reduxNodes[i]
   Furthermore, these objects are linked:
   -- this.nodes[i].n = reduxNodes[i]
   -- reduxNodes[i].shell = this.nodes[i] */
  this.nodes = reduxNodes.map((d) => {
    const phyloNode = {
      that: this,
      n: d, /* a back link to the redux node */
      x: 0,
      y: 0,
      terminal: (typeof d.children === "undefined"),
      inView: d.inView !== undefined ? d.inView : true /* each node is visible, unless set earlier! */
    };
    d.shell = phyloNode; /* set the link from the redux node to the phylotree node */
    return phyloNode;
  });
  this.numberOfTips = createChildrenAndParentsReturnNumTips(this.nodes);
  setYValues(this.nodes);
  this.zoomNode = this.nodes[idxOfInViewRootNode];
  this.strainToNode = {};
  this.nodes.forEach((phylonode) => {this.strainToNode[phylonode.n.name] = phylonode;});
  /* debounced functions (AFAIK you can't define these as normal prototypes as they need "this") */
  // this.debouncedMapToScreen = _debounce(this.mapToScreen, this.params.mapToScreenDebounceTime,
  //   {leading: false, trailing: true, maxWait: this.params.mapToScreenDebounceTime});
};

/* C H A N G E */
PhyloTree.prototype.change = change;
PhyloTree.prototype.modifySVG = modifySVG;
PhyloTree.prototype.modifySVGInStages = modifySVGInStages;

/* I N I T I A L        R E N D E R       E T C */
PhyloTree.prototype.render = renderers.render;
PhyloTree.prototype.clearSVG = renderers.clearSVG;

/* D R A W I N G    F U N C T I O N S */
PhyloTree.prototype.drawTips = renderers.drawTips;
PhyloTree.prototype.drawBranches = renderers.drawBranches;
PhyloTree.prototype.drawVaccines = renderers.drawVaccines;
PhyloTree.prototype.drawRegression = renderers.drawRegression;
PhyloTree.prototype.removeRegression = renderers.removeRegression;
PhyloTree.prototype.updateColorBy = renderers.updateColorBy;

/* C A L C U L A T E    G E O M E T R I E S  E T C   ( M O D I F I E S    N O D E S ,    N O T    S V G ) */
PhyloTree.prototype.setDistance = layouts.setDistance;
PhyloTree.prototype.setLayout = layouts.setLayout;
PhyloTree.prototype.setTreeZoom = layouts.setTreeZoom;
PhyloTree.prototype.rectangularLayout = layouts.rectangularLayout;
PhyloTree.prototype.scatterplotLayout = layouts.scatterplotLayout;
PhyloTree.prototype.unrootedLayout = layouts.unrootedLayout;
PhyloTree.prototype.radialLayout = layouts.radialLayout;
PhyloTree.prototype.setScales = layouts.setScales;
PhyloTree.prototype.mapToScreen = layouts.mapToScreen;

/* C O N F I D E N C E    I N T E R V A L S */
PhyloTree.prototype.removeConfidence = confidence.removeConfidence;
PhyloTree.prototype.drawConfidence = confidence.drawConfidence;
PhyloTree.prototype.drawSingleCI = confidence.drawSingleCI;

/* L A B E L S    ( T I P ,    B R A N C H ,   C O N F I D E N C E ) */
PhyloTree.prototype.drawBranchLabels = labels.drawBranchLabels;
PhyloTree.prototype.removeBranchLabels = labels.removeBranchLabels;
PhyloTree.prototype.updateBranchLabels = labels.updateBranchLabels;
PhyloTree.prototype.updateTipLabels = labels.updateTipLabels;
PhyloTree.prototype.removeTipLabels = labels.removeTipLabels;

/* G R I D */
PhyloTree.prototype.hideGrid = grid.hideGrid;
PhyloTree.prototype.addGrid = grid.addGrid;
PhyloTree.prototype.showTemporalSlice = grid.showTemporalSlice;
PhyloTree.prototype.hideTemporalSlice = grid.hideTemporalSlice;

export default PhyloTree;
