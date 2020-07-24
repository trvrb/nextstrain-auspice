import _findIndex from "lodash/findIndex";
import _findLastIndex from "lodash/findLastIndex";
import _max from "lodash/max";
import { line, curveBasis, arc } from "d3-shape";
import { easeLinear } from "d3-ease";
import { demeCountMultiplier, demeCountMinimum } from "../../util/globals";
import { updateTipRadii } from "../../actions/tree";

/* util */

export const pathStringGenerator = line()
  .x((d) => { return d.x; })
  .y((d) => { return d.y; })
  .curve(curveBasis);

export const extractLineSegmentForAnimationEffect = (
  numDateMin,
  numDateMax,
  originCoords,
  destinationCoords,
  originNumDate,
  destinationNumDate,
  visible,
  bezierCurve,
  bezierDates
) => {

  if (visible === "hidden") {
    return [];
  }

  // want to slice out all points that lie between numDateMin and numDateMax
  // and append interpolated start and end points
  // initial data
  // bezierDates = [ 2015.1    2015.2    2015.3    2015.4    2015.5 ]
  // bezierCurve = [ x0,y0     x1,y1     x2,y2     x3,y3     x4,y4  ]
  //
  // scenario A: numDateMin = 2015.25, numDateMax = 2015.45
  // bezierDates = [ 2015.25  2015.3    2015.4  2015.45 ]
  // bezierCurve = [ x12,y12  x2,y2     x3,y3   x34,y34 ]
  // startIndex is 2 in scenario A
  // endIndex is 3 in scenario A
  //
  // scenario B: numDateMin = 2014.5, numDateMax = 2015.45
  // bezierDates = [ 2015.1    2015.2    2015.3    2015.4  2015.45 ]
  // bezierCurve = [ x0,y0     x1,y1     x2,y2     x3,y3   x34,y34 ]
  // startIndex is 0 in scenario B
  // endIndex is 3 in scenario B
  //
  // scenario C: numDateMin = 2015.25, numDateMax = 2015.7
  // bezierDates = [ 2015.25  2015.3    2015.4    2015.5 ]
  // bezierCurve = [ x12,y12  x2,y2     x3,y3     x4,y4  ]
  // startIndex is 2 in scenario C
  // endIndex is 4 in scenario C
  //
  // scenario D: numDateMin = 2015.6, numDateMax = 2015.9
  // bezierDates = [ ]
  // bezierCurve = [ ]
  // startIndex is -1 in scenario D
  // endIndex is 4 in scenario D

  // find start walking forwards from left of array
  const startIndex = _findIndex(bezierDates, (d) => { return d > numDateMin; });

  // find end walking backwards from right of array
  const endIndex = _findLastIndex(bezierDates, (d) => { return d < numDateMax; });

  // startIndex and endIndex is -1 if not found
  // this indicates a slice of time that lies outside the bounds of BCurve
  // return empty array
  if (startIndex === -1 || endIndex === -1) {
    return [];
  }

  // get curve
  // slice takes index at begin
  // slice extracts up to but not including end
  const curve = bezierCurve.slice(startIndex, endIndex + 1);

  // if possible construct and prepend interpolated start
  let newStart;
  if (startIndex > 0) {
    // determine weighting of positions at startIndex and startIndex-1
    const dateDiff = bezierDates[startIndex] - bezierDates[startIndex - 1];
    const weightRight = (numDateMin - bezierDates[startIndex - 1]) / dateDiff;
    const weightLeft = (bezierDates[startIndex] - numDateMin) / dateDiff;
    // construct interpolated new start
    newStart = {
      x: (weightLeft * bezierCurve[startIndex - 1].x) + (weightRight * bezierCurve[startIndex].x),
      y: (weightLeft * bezierCurve[startIndex - 1].y) + (weightRight * bezierCurve[startIndex].y)
    };
    // will break indexing, so wait to prepend
  }

  // if possible construct and prepend interpolated start
  let newEnd;
  if (endIndex < bezierCurve.length - 1) {
    // determine weighting of positions at startIndex and startIndex-1
    const dateDiff = bezierDates[endIndex + 1] - bezierDates[endIndex];
    const weightRight = (numDateMax - bezierDates[endIndex]) / dateDiff;
    const weightLeft = (bezierDates[endIndex + 1] - numDateMax) / dateDiff;
    // construct interpolated new end
    newEnd = {
      x: (weightLeft * bezierCurve[endIndex].x) + (weightRight * bezierCurve[endIndex + 1].x),
      y: (weightLeft * bezierCurve[endIndex].y) + (weightRight * bezierCurve[endIndex + 1].y)
    };
    // will break indexing, so wait to append
  }

  // prepend / append interpolated points if they exist
  if (newStart) {
    curve.unshift(newStart);
  }
  if (newEnd) {
    curve.push(newEnd);
  }
  return curve;
};

export const createArcsFromDemes = (demeData) => {
  const individualArcs = [];
  demeData.forEach((demeInfo) => {
    demeInfo.arcs.forEach((slice) => {
      individualArcs.push(slice);
    });
  });
  return individualArcs;
};

export const drawDemesAndTransmissions = (
  demeData,
  transmissionData,
  g,
  map,
  nodes,
  numDateMin,
  numDateMax,
  pieChart, /* bool */
  geoResolution,
  dispatch
) => {

  // add transmission lines
  const transmissions = g.selectAll("transmissions")
    .data(transmissionData)
    .enter()
    .append("path") /* instead of appending a geodesic path from the leaflet plugin data, we now draw a line directly between two points */
    .attr("d", (d) => {
      return pathStringGenerator(
        extractLineSegmentForAnimationEffect(
          numDateMin,
          numDateMax,
          d.originCoords,
          d.destinationCoords,
          d.originNumDate,
          d.destinationNumDate,
          d.visible,
          d.bezierCurve,
          d.bezierDates
        )
      );
    })
    .attr("fill", "none")
    .attr("stroke-opacity", 0.6)
    .attr("stroke-linecap", "round")
    .attr("stroke", (d) => { return d.color; })
    .attr("stroke-width", 1);

  const visibleTips = nodes[0].tipCount;
  const demeMultiplier =
    demeCountMultiplier /
    Math.sqrt(_max([Math.sqrt(visibleTips * nodes.length), demeCountMinimum]));
  let demes;
  // determine whether to draw pieChart or not (sensible for categorical data)
  if (pieChart) {
    /* each datapoint in `demeData` contains `arcs` which comprise n individual "slices"
     * we need to create an array of all of these slices for d3 to render
     */
    const individualArcs = createArcsFromDemes(demeData);

    /* add `outerRadius` to all slices */
    // TODO - move this to initial arc creation in setupDemeData as it's only ever done once
    individualArcs.forEach((a) => {
      a.outerRadius = Math.sqrt(demeData[a.demeDataIdx].count)*demeMultiplier;
    });

    demes = g.selectAll('demes') // add individual arcs ("slices") to this selection
      .data(individualArcs)
      .enter().append("path")
      .attr("d", (d) => arc()(d))
      /* following calls are (almost) the same for pie charts & circles */
      .style("stroke", "none")
      .style("fill-opacity", 0.65)
      .style("fill", (d) => { return d.color; })
      .style("stroke-opacity", 0.85)
      .style("stroke", (d) => { return d.color; })
      .style("pointer-events", "all")
      .attr("transform", (d) =>
        "translate(" + demeData[d.demeDataIdx].coords.x + "," + demeData[d.demeDataIdx].coords.y + ")"
      )
      .on("mouseover", (d) => { dispatch(updateTipRadii({geoFilter: [geoResolution, demeData[d.demeDataIdx].name]})); })
      .on("mouseout", () => { dispatch(updateTipRadii()); });
  } else {
    demes = g.selectAll("demes") // add deme circles to this selection
      .data(demeData)
      .enter().append("circle")
      .attr("r", (d) => { return demeMultiplier * Math.sqrt(d.count); })
      /* following calls are (almost) the same for pie charts & circles */
      .style("stroke", "none")
      .style("fill-opacity", 0.65)
      .style("fill", (d) => { return d.color; })
      .style("stroke-opacity", 0.85)
      .style("stroke", (d) => { return d.color; })
      .style("pointer-events", "all")
      .attr("transform", (d) => "translate(" + d.coords.x + "," + d.coords.y + ")")
      .on("mouseover", (d) => { dispatch(updateTipRadii({geoFilter: [geoResolution, d.name]})); })
      .on("mouseout", () => { dispatch(updateTipRadii()); });
  }

  return {
    demes,
    transmissions
  };

};

export const updateOnMoveEnd = (demeData, transmissionData, d3elems, numDateMin, numDateMax, pieChart) => {
  /* map has moved or rescaled, make demes and transmissions line up */
  if (!d3elems) { return; }

  /* move the pie charts differently to the color-blended circles */
  if (pieChart) {
    const individualArcs = createArcsFromDemes(demeData);
    d3elems.demes
      .data(individualArcs)
      .attr("transform", (d) =>
        /* copied from above. TODO. */
        "translate(" + demeData[d.demeDataIdx].coords.x + "," + demeData[d.demeDataIdx].coords.y + ")"
      );
  } else {
    d3elems.demes
      .data(demeData)
      .attr("transform", (d) =>
        /* copied from above. TODO. */
        "translate(" + d.coords.x + "," + d.coords.y + ")"
      );
  }

  d3elems.transmissions
    .data(transmissionData)
    .attr("d", (d) => {
      return pathStringGenerator(
        extractLineSegmentForAnimationEffect(
          numDateMin,
          numDateMax,
          d.originCoords,
          d.destinationCoords,
          d.originNumDate,
          d.destinationNumDate,
          d.visible,
          d.bezierCurve,
          d.bezierDates
        )
      );
    }); // other attrs remain the same as they were
};

export const updateVisibility = (
  demeData,
  transmissionData,
  d3elems,
  map,
  nodes,
  numDateMin,
  numDateMax,
  pieChart
) => {

  if (!d3elems) {
    console.error("d3elems is not defined!");
    return;
  }
  const visibleTips = nodes[0].tipCount;
  const demeMultiplier =
    demeCountMultiplier /
    Math.sqrt(_max([Math.sqrt(visibleTips * nodes.length), demeCountMinimum]));

  if (pieChart) {
    const individualArcs = createArcsFromDemes(demeData);
    /* add `outerRadius` to all slices */
    // TODO - move this to initial arc creation in setupDemeData as it's only ever done once
    individualArcs.forEach((a) => {
      a.outerRadius = Math.sqrt(demeData[a.demeDataIdx].count)*demeMultiplier;
    });
    d3elems.demes
      .data(individualArcs)
      .attr("d", (d) => arc()(d))
      .style("fill", (d) => { return d.color; })
      .style("stroke", (d) => { return d.color; });
  } else {
    /* for colour blended circles we just have to update the colours & size (radius) */
    d3elems.demes
      .data(demeData)
      .transition()
      .duration(200)
      .ease(easeLinear)
      .style("stroke", (d) => { return d.count > 0 ? d.color : "white"; })
      .style("fill", (d) => { return d.count > 0 ? d.color : "white"; })
      .attr("r", (d) => { return demeMultiplier * Math.sqrt(d.count); });
  }

  /* update the path and stroke colour of transmission lines */
  d3elems.transmissions
    .data(transmissionData)
    .attr("d", (d) => {
      return pathStringGenerator(
        extractLineSegmentForAnimationEffect(
          numDateMin,
          numDateMax,
          d.originCoords,
          d.destinationCoords,
          d.originNumDate,
          d.destinationNumDate,
          d.visible,
          d.bezierCurve,
          d.bezierDates
        )
      );
    }) /* with the interpolation in the function above pathStringGenerator */
    .attr("stroke", (d) => { return d.color; });
};

/* template for an update helper */
export const updateFoo = (d3elems, latLongs) => {
  d3elems.demes
    .data(latLongs.demes);

  d3elems.transmissions
    .data(latLongs.transmissions);
};

/*
  http://gis.stackexchange.com/questions/49114/d3-geo-path-to-draw-a-path-from-gis-coordinates
  https://bl.ocks.org/mbostock/3916621  // Compute point-interpolators at each distance.
  http://bl.ocks.org/mbostock/5851933 // draw line on map
  https://gist.github.com/mikeatlas/0b69b354a8d713989147 // polyline split if we don't use leaflet
  http://bl.ocks.org/mbostock/5928813
  http://bl.ocks.org/duopixel/4063326 // animate path in
  https://bl.ocks.org/mbostock/1705868 // point along path interpolation
  https://bl.ocks.org/mbostock/1313857 // point along path interpolation
  https://github.com/d3/d3-shape/blob/master/README.md#curves
  https://github.com/d3/d3-shape/blob/master/README.md#lines
*/
