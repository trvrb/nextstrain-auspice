import React from "react";
import { connect } from "react-redux";
import Select from "react-select/lib/Select";
import { withTranslation } from "react-i18next";
import { getMapTypesAvailable } from "../../util/spatialResolutionHelpers";
import { controlsWidth } from "../../util/globals";
import { CHANGE_GEO_RESOLUTION } from "../../actions/types";
import { analyticsControlsEvent } from "../../util/googleAnalytics";
import { SidebarSubtitle } from "./styles";

@connect((state) => {
  return {
    metadata: state.metadata,
    geoResolution: state.controls.geoResolution,
    mapDisplayType: state.controls.mapDisplayType,
    mapDisplayTypesAvailable: state.controls.mapDisplayTypesAvailable
  };
})
class GeoResolution extends React.Component {
  getGeoResolutionOptions() {
    return this.props.metadata.loaded ?
      this.props.metadata.geoResolutions.map((g) => ({value: g.key, label: g.title || g.key})) :
      [];
  }

  changeGeoResolution(geoResolution) {
    analyticsControlsEvent("change-geo-resolution");
    this.props.dispatch({
      type: CHANGE_GEO_RESOLUTION,
      geoResolution,
      ...getMapTypesAvailable({
        currentMapDisplayType: this.props.mapDisplayType,
        currentMapDisplayTypesAvailable: this.props.mapDisplayTypesAvailable,
        newGeoResolution: geoResolution,
        geoResolutions: this.props.metadata.geoResolutions
      })
    });
  }

  render() {
    const { t } = this.props;
    const geoResolutionOptions = this.getGeoResolutionOptions();
    return (
      <>
        <SidebarSubtitle spaceAbove>
          {t("sidebar:Spatial resolution")}
        </SidebarSubtitle>
        <div style={{marginBottom: 10, width: controlsWidth, fontSize: 14}}>
          <Select
            name="selectGeoResolution"
            id="selectGeoResolution"
            value={this.props.geoResolution}
            options={geoResolutionOptions}
            clearable={false}
            searchable={false}
            multi={false}
            onChange={(opt) => {this.changeGeoResolution(opt.value);}}
          />
        </div>
      </>
    );
  }
}

const WithTranslation = withTranslation()(GeoResolution);
export default WithTranslation;
