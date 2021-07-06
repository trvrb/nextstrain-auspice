import React from "react";
import PropTypes from 'prop-types';
import { connect } from "react-redux";
import _throttle from "lodash/throttle";
import { BROWSER_DIMENSIONS, CHANGE_PANEL_LAYOUT, TOGGLE_SIDEBAR } from "../../actions/types";
import { changePage } from "../../actions/navigation";
import { twoColumnBreakpoint, controlsHiddenWidth} from "../../util/globals";

@connect((state) => ({
  displayNarrative: state.narrative.display,
  canTogglePanelLayout: state.controls.canTogglePanelLayout,
  controlDefaults: state.controls.defaults
}))
class Monitor extends React.Component {
  constructor(props) {
    super(props);
    this.throttleHandleByResize =
      _throttle(this.handleResizeByDispatching.bind(this), 500, {
        leading: true,
        trailing: true
      });
  }
  static propTypes = {
    dispatch: PropTypes.func.isRequired
  }
  componentDidMount() {
    /* don't need initial dimensions - they're in the redux store on load */
    window.addEventListener( // future resizes
      "resize",
      /* lodash throttle invokes resize event at most twice per second
      to let redraws catch up. Could also use debounce for 'wait until resize stops' */
      this.throttleHandleByResize
    );

    /* Note that just calling history.pushState() or history.replaceState() won't trigger a popstate event.
    The popstate event will be triggered by doing a browser action such as a click on the back or forward button
    (or calling history.back() or history.forward() in JavaScript). */
    window.addEventListener('popstate', this.onURLChanged);
    // this.onURLChanged();
  }
  componentWillUnmount() {
    window.removeEventListener("resize", this.throttleHandleByResize);  // need to actually remove the _throttle
    this.throttleHandleByResize.cancel;
    window.removeEventListener('popstate', this.onURLChanged);
  }

  onURLChanged = () => this.props.dispatch(changePage());

  handleResizeByDispatching() {
    this.props.dispatch((dispatch, getState) => {
      /* here we decide whether we should change panel layout from full <-> grid
      when crossing the twoColumnBreakpoint */
      const { browserDimensions } = getState();
      const oldBrowserDimensions = browserDimensions.browserDimensions;
      const newBrowserDimensions = {
        width: window.innerWidth,
        height: window.innerHeight,
        docHeight: window.document.body.clientHeight /* background needs docHeight because sidebar creates absolutely positioned container and blocks height 100% */
      };
      dispatch({type: BROWSER_DIMENSIONS, data: newBrowserDimensions});

      /* Should the sidebar toggle open / closed because we've crossed some threshold? */
      /* Do not do this if a default has been set -- this is only set via JSON / URL query & must be obeyed */
      if (!this.props.displayNarrative && !("sidebarOpen" in this.props.controlDefaults)) {
        if (oldBrowserDimensions.width > controlsHiddenWidth && newBrowserDimensions.width < controlsHiddenWidth) {
          dispatch({type: TOGGLE_SIDEBAR, value: false});
        } else if (oldBrowserDimensions.width < controlsHiddenWidth && newBrowserDimensions.width > controlsHiddenWidth) {
          dispatch({type: TOGGLE_SIDEBAR, value: true});
        }
      }

      /* if we are _not_ in narrative mode, then browser resizing may change between grid & full layouts automatically */
      if (!this.props.displayNarrative && this.props.canTogglePanelLayout) {
        if (oldBrowserDimensions.width < twoColumnBreakpoint && newBrowserDimensions.width >= twoColumnBreakpoint) {
          dispatch({type: CHANGE_PANEL_LAYOUT, data: "grid", notInURLState: true});
        } else if (oldBrowserDimensions.width > twoColumnBreakpoint && newBrowserDimensions.width <= twoColumnBreakpoint) {
          dispatch({type: CHANGE_PANEL_LAYOUT, data: "full", notInURLState: true});
        }
      }
    });
  }

  render() {
    return null;
  }
}

export default Monitor;
