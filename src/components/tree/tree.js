import React from "react";
import { withTranslation } from "react-i18next";
import { updateVisibleTipsAndBranchThicknesses } from "../../actions/tree";
import Card from "../framework/card";
import Legend from "./legend/legend";
import PhyloTree from "./phyloTree/phyloTree";
import HoverInfoPanel from "./infoPanels/hover";
import TipClickedPanel from "./infoPanels/click";
import { changePhyloTreeViaPropsComparison } from "./reactD3Interface/change";
import * as callbacks from "./reactD3Interface/callbacks";
import { tabSingle, darkGrey, lightGrey } from "../../globalStyles";
import { renderTree } from "./reactD3Interface/initialRender";
import Tangle from "./tangle";
import { attemptUntangle } from "../../util/globals";
import ErrorBoundary from "../../util/errorBoundry";
import { untangleTreeToo } from "./tangle/untangling";

export const spaceBetweenTrees = 100;

class Tree extends React.Component {
  constructor(props) {
    super(props);
    this.domRefs = {
      mainTree: undefined,
      secondTree: undefined
    };
    this.tangleRef = undefined;
    this.state = {
      hover: null,
      selectedBranch: null,
      selectedTip: null,
      tree: null,
      treeToo: null
    };
    /* bind callbacks */
    this.clearSelectedTip = callbacks.clearSelectedTip.bind(this);
    // this.handleIconClickHOF = callbacks.handleIconClickHOF.bind(this);
    this.redrawTree = () => {
      this.props.dispatch(updateVisibleTipsAndBranchThicknesses({
        root: [0, 0]
      }));
    };
  }
  setUpAndRenderTreeToo(props, newState) {
    /* this.setState(newState) will be run sometime after this returns */
    /* modifies newState in place */
    newState.treeToo = new PhyloTree(props.treeToo.nodes, "RIGHT", props.treeToo.idxOfInViewRootNode);
    if (attemptUntangle) {
      untangleTreeToo(newState.tree, newState.treeToo);
    }
    renderTree(this, false, newState.treeToo, props);
  }
  componentDidMount() {
    if (this.props.tree.loaded) {
      const newState = {};
      newState.tree = new PhyloTree(this.props.tree.nodes, "LEFT", this.props.tree.idxOfInViewRootNode);
      renderTree(this, true, newState.tree, this.props);
      if (this.props.showTreeToo) {
        this.setUpAndRenderTreeToo(this.props, newState); /* modifies newState in place */
      }
      this.setState(newState); /* this will trigger an unneccessary CDU :( */
    }
  }
  componentDidUpdate(prevProps) {
    let newState = {};
    let rightTreeUpdated = false;

    /* potentially change the (main / left hand) tree */
    const [potentialNewState, leftTreeUpdated] = changePhyloTreeViaPropsComparison(true, this.state.tree, prevProps, this.props);
    if (potentialNewState) newState = potentialNewState;

    /* has the 2nd (right hand) tree just been turned on, off or swapped? */
    if (prevProps.showTreeToo !== this.props.showTreeToo) {
      if (!this.props.showTreeToo) { /* turned off -> remove the 2nd tree */
        newState.treeToo = null;
      } else { /* turned on -> render the 2nd tree */
        if (this.state.treeToo) { /* tree has been swapped -> remove the old tree */
          this.state.treeToo.clearSVG();
        }
        newState.tree = this.state.tree; // setUpAndRenderTreeToo needs newState.tree
        this.setUpAndRenderTreeToo(this.props, newState); /* modifies newState in place */
        if (this.tangleRef) this.tangleRef.drawLines();
      }
    } else if (this.state.treeToo) { /* the tree hasn't just been swapped, but it does exist and may need updating */
      let unusedNewState; // eslint-disable-line
      [unusedNewState, rightTreeUpdated] = changePhyloTreeViaPropsComparison(false, this.state.treeToo, prevProps, this.props);
      /* note, we don't incorporate unusedNewState into the state? why not? */
    }

    /* we may need to (imperitively) tell the tangle to redraw */
    if (this.tangleRef && (leftTreeUpdated || rightTreeUpdated)) {
      this.tangleRef.drawLines();
    }
    if (Object.keys(newState).length) this.setState(newState);
  }

  getStyles = () => {
    const activeResetTreeButton = this.props.tree.idxOfInViewRootNode !== 0 ||
      this.props.treeToo.idxOfInViewRootNode !== 0;

    const filteredTree = !!this.props.tree.idxOfFilteredRoot &&
      this.props.tree.idxOfInViewRootNode !== this.props.tree.idxOfFilteredRoot;
    const filteredTreeToo = !!this.props.treeToo.idxOfFilteredRoot &&
      this.props.treeToo.idxOfInViewRootNode !== this.props.treeToo.idxOfFilteredRoot;
    const activeZoomButton = filteredTree || filteredTreeToo;

    return {
      treeButtonsDiv: {
        zIndex: 100,
        position: "absolute",
        right: 5,
        top: 0
      },
      resetTreeButton: {
        zIndex: 100,
        display: "inline-block",
        marginLeft: 4,
        cursor: activeResetTreeButton ? "pointer" : "auto",
        color: activeResetTreeButton ? darkGrey : lightGrey
      },
      zoomToSelectedButton: {
        zIndex: 100,
        dispaly: "inline-block",
        cursor: activeZoomButton ? "pointer" : "auto",
        color: activeZoomButton ? darkGrey : lightGrey,
        pointerEvents: activeZoomButton ? "auto" : "none"
      }
    };
  };

  renderTreeDiv({width, height, mainTree}) {
    return (
      <svg
        id={mainTree ? "MainTree" : "SecondTree"}
        style={{pointerEvents: "auto", strokeLinecap: "round", strokeWidth: "1", stroke: "#000", cursor: "default", userSelect: "none"}}
        width={width}
        height={height}
        ref={(c) => {mainTree ? this.domRefs.mainTree = c : this.domRefs.secondTree = c;}}
      />
    );
  }

  zoomToSelected = () => {
    this.props.dispatch(updateVisibleTipsAndBranchThicknesses({
      root: [this.props.tree.idxOfFilteredRoot, this.props.treeToo.idxOfFilteredRoot]
    }));
  };

  render() {
    const { t } = this.props;
    const styles = this.getStyles();
    const widthPerTree = this.props.showTreeToo ? (this.props.width - spaceBetweenTrees) / 2 : this.props.width;
    return (
      <Card center title={t("Phylogeny")}>
        <ErrorBoundary>
          <Legend width={this.props.width}/>
        </ErrorBoundary>
        <HoverInfoPanel
          hovered={this.state.hovered}
          colorBy={this.props.colorBy}
          colorByConfidence={this.props.colorByConfidence}
          colorScale={this.props.colorScale}
          colorings={this.props.metadata.colorings}
          panelDims={{width: this.props.width, height: this.props.height, spaceBetweenTrees}}
          t={t}
        />
        <TipClickedPanel
          goAwayCallback={this.clearSelectedTip}
          tip={this.state.selectedTip}
          colorings={this.props.metadata.colorings}
          t={t}
        />
        {this.props.showTangle && this.state.tree && this.state.treeToo ? (
          <Tangle
            ref={(r) => {this.tangleRef = r;}}
            width={this.props.width}
            height={this.props.height}
            lookup={this.props.treeToo.tangleTipLookup}
            leftNodes={this.props.tree.nodes}
            rightNodes={this.props.treeToo.nodes}
            colors={this.props.tree.nodeColors}
            cVersion={this.props.tree.nodeColorsVersion}
            vVersion={this.props.tree.visibilityVersion}
            metric={this.props.distanceMeasure}
            spaceBetweenTrees={spaceBetweenTrees}
            leftTreeName={this.props.tree.name}
            rightTreeName={this.props.showTreeToo}
          />
        ) : null }
        {this.renderTreeDiv({width: widthPerTree, height: this.props.height, mainTree: true})}
        {this.props.showTreeToo ? <div id="treeSpacer" style={{width: spaceBetweenTrees}}/> : null}
        {this.props.showTreeToo ?
          this.renderTreeDiv({width: widthPerTree, height: this.props.height, mainTree: false}) :
          null
        }
        {this.props.narrativeMode ? null : (
          <div style={{...styles.treeButtonsDiv}}>
            <button
              style={{...tabSingle, ...styles.zoomToSelectedButton}}
              onClick={this.zoomToSelected}
            >
              {t("Zoom to Selected")}
            </button>
            <button
              style={{...tabSingle, ...styles.resetTreeButton}}
              onClick={this.redrawTree}
            >
              {t("Reset Layout")}
            </button>
          </div>
        )}
      </Card>
    );
  }
}

const WithTranslation = withTranslation()(Tree);
export default WithTranslation;
