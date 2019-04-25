import React from "react";

export function rootContainer(container) {
  const ZoroContainer = require("@tmp/ZoroContainer").default;
  return React.createElement(ZoroContainer, null, container);
}
