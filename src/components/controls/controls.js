import React from "react";
import { useTranslation } from 'react-i18next';

import ColorBy from "./color-by";
import DateRangeInputs from "./date-range-inputs";
import ChooseBranchLabelling from "./choose-branch-labelling";
import ChooseLayout from "./choose-layout";
import ChooseDataset from "./choose-dataset";
import ChooseSecondTree from "./choose-second-tree";
import ChooseMetric from "./choose-metric";
import PanelLayout from "./panel-layout";
import GeoResolution from "./geo-resolution";
import TransmissionLines from './transmission-lines';
import NormalizeFrequencies from "./frequency-normalization";
import MapAnimationControls from "./map-animation";
import PanelToggles from "./panel-toggles";
import SearchStrains from "./search";
import ToggleTangle from "./toggle-tangle";
import ToggleMapDisplayType from "./map-display-type-toggle";
import Language from "./language";
import { SidebarHeader, ControlsContainer } from "./styles";


function Controls({mapOn, frequenciesOn}) {
  const { t } = useTranslation();

  return (
    <ControlsContainer>
      <ChooseDataset />

      <SidebarHeader>{t("sidebar:Date Range")}</SidebarHeader>
      <DateRangeInputs />

      <SidebarHeader>{t("sidebar:Color By")}</SidebarHeader>
      <ColorBy />

      <SidebarHeader>{t("sidebar:Tree Options")}</SidebarHeader>
      <ChooseLayout />
      <ChooseMetric />
      <ChooseBranchLabelling />
      <SearchStrains />
      <ChooseSecondTree />
      <ToggleTangle />

      {mapOn ? (
        <span style={{ marginTop: "15px" }}>
          <SidebarHeader>{t("sidebar:Map Options")}</SidebarHeader>
          <GeoResolution />
          <ToggleMapDisplayType />
          <TransmissionLines />
          <MapAnimationControls />
        </span>
      ) : null}

      {frequenciesOn ? (
        <span style={{ marginTop: "15px" }}>
          <SidebarHeader>{t("sidebar:Frequency Options")}</SidebarHeader>
          <NormalizeFrequencies />
        </span>
      ) : null}

      <span style={{ paddingTop: "10px" }} />
      <SidebarHeader>{t("sidebar:Panel Options")}</SidebarHeader>
      <PanelLayout />
      <PanelToggles />
      <Language />
    </ControlsContainer>
  );
}

export default Controls;
