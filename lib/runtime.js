"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.rootContainer = rootContainer;

var _react = _interopRequireDefault(require("react"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }

function rootContainer(container) {
  var ZoroContainer = require("@tmp/ZoroContainer")["default"];

  return _react["default"].createElement(ZoroContainer, null, container);
}