

export const getMapTypesAvailable = ({currentMapDisplayType, currentMapDisplayTypesAvailable, newGeoResolution, geoResolutions}) => {
  const geoResJsonData = geoResolutions.filter((x) => x.key === newGeoResolution)[0];
  const geoAvailable = !!geoResJsonData.demes; // the presense of demes (i.e. lat/long mappings defined)
  const mapDisplayTypesAvailable = ["network"]; // can always display netowrk statemap, even if lat-longs present
  if (geoAvailable) mapDisplayTypesAvailable.push("geo");
  /* If we're going from a resolution with only states to one with geo as well, we switch to geo representation
     If we're going from a resolution with both to another resolution with both, we keep the old selection */
  const mapDisplayType = mapDisplayTypesAvailable.length === 1
    ? mapDisplayTypesAvailable[0]
    : currentMapDisplayTypesAvailable.length === 1 // note: length can be zero (e.g. on load)
      ? "geo"
      : currentMapDisplayType;
  return { mapDisplayType, mapDisplayTypesAvailable };
};
